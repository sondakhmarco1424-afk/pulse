# Pulse Development Learning Guide

Last updated: 2026-09-01  
Primary branches: `main` (production) and `develop` (staging)  
Scope: architecture, development history, operational lessons, incident analysis, testing, and deployment

## 1. Purpose of this guide

Pulse grew from a small Go service into a complete real-time cryptocurrency alert platform. This guide records that development process so future work can begin from the lessons already learned instead of repeating the same failures.

The guide deliberately excludes passwords, private keys, Firebase tokens, SSH keys, account identifiers, and temporary EC2 IP addresses. Commands use placeholders where sensitive values would otherwise appear.

Use this document to:

- Understand how a Binance price tick becomes a browser notification.
- Learn why Redis, MySQL, Kafka, Firebase, React, and Docker each exist in the system.
- Reproduce the local and deployment workflows safely.
- Diagnose delayed alerts, missing FCM payloads, Redis outages, and failed deployments.
- Understand the major design changes recorded in Git history.

## 2. What Pulse is

Pulse monitors live Binance 24-hour ticker streams for BTC/USDT, ETH/USDT, BNB/USDT, and SOL/USDT. A user creates an `ABOVE` or `BELOW` price threshold. The Go backend evaluates live prices, performs an atomic MySQL status update, publishes an event to Kafka, and sends a data-only Firebase Cloud Messaging notification to the user's browser topic.

Pulse has two application environments on one EC2 host:

| Environment | Branch | Compose project | Backend | Frontend | Database schema |
| --- | --- | --- | --- | --- | --- |
| Production | `main` | `pulse` | `pulse_app` | `pulse_frontend` | `DB_SCHEMA` |
| Staging | `develop` | `pulse-dev` | `pulse_app_dev` | `pulse_frontend_dev` | `DB_SCHEMA_DEV` |

MySQL, Redis, Kafka, and the Docker network are shared to fit the resource limits of a small EC2 instance. Application containers and database schemas are isolated by environment.

## 3. Current architecture

```text
Binance WebSocket (@ticker streams)
              |
              v
       Go Binance ingester
              |
              +---- SET latest ticker ------------------+
              +---- LPUSH/LTRIM rolling history --------+--> Redis
              +---- PUBLISH binance:<symbol>:ticker ----+
                                                          |
                                                          v
Browser <---- REST history/status API              GoLiveChecker
   |                                                      |
   | POST /alerts/create                                  | evaluates cached pending alerts
   v                                                      v
Go REST API ---- INSERT PENDING alert ----> MySQL ---- atomic TRIGGERED update
                                                          |
                                                          v
                                               Kafka fcm-notifications
                                                          |
                                                          v
                                             Notification consumer
                                                          |
                                                          v
                                                Firebase Admin SDK
                                                          |
                                                          v
                                      FCM topic -> browser service worker
                                                          |
                                +-------------------------+------------------+
                                |                                            |
                                v                                            v
                       Native notification                         React logs/toasts/state
```

### Important accuracy notes

- MySQL access uses `database/sql`, the MySQL driver, and the Bob query builder. It does not currently use GORM.
- Redis stores the latest ticker and a rolling price-history list and transports tick events through Pub/Sub.
- Pending alerts are evaluated from a process-local, mutex-protected Go cache initialized from MySQL. Redis is not the source of truth for alert records.
- MySQL is the durable source of truth for alert state.
- Kafka decouples threshold evaluation from FCM delivery.
- FCM is the real-time browser delivery path; periodic REST synchronization is a fallback, not a replacement for push.

## 4. Repository map

| Path | Responsibility |
| --- | --- |
| `internal/cmd/main.go` | Loads configuration and starts MySQL, Binance ingestion, the alert checker, Kafka consumer, and Gin server. |
| `internal/repository/binance.go` | Connects to Binance, subscribes to ticker streams, and writes/publishes Redis data. |
| `internal/repository/redis.go` | Redis client configuration, key access, rolling lists, and Pub/Sub. |
| `internal/repository/alerts.go` | MySQL alert persistence and the in-memory pending-alert cache. |
| `internal/service/checker.go` | Redis reconnect loop and live threshold evaluation. |
| `internal/app/kafka.go` | Reusable Kafka producer and consumer implementation. |
| `internal/service/consumer.go` | Consumes notification events from Kafka. |
| `internal/repository/firebase.go` | Initializes and caches the Firebase Admin messaging client. |
| `internal/service/fcm_notification.go` | Resolves user topics, subscribes tokens, and sends data notifications. |
| `internal/router/routers.go` | Gin routes, middleware, CORS, health-related endpoints, and Swagger. |
| `frontend/src/App.tsx` | Live application state, alert CRUD, FCM setup, polling fallback, and UI orchestration. |
| `frontend/src/utils/binance.ts` | Binance REST history and ticker helpers used by charts. |
| `frontend/public/firebase-messaging-sw.js` | Background messages, native notifications, and notification-click navigation. |
| `frontend/src/config.ts` | Runtime-first frontend configuration lookup. |
| `frontend/docker-entrypoint.d/10-runtime-config.sh` | Generates browser runtime configuration when the frontend container starts. |
| `docker-compose-pulse.yml` | Production application and shared infrastructure. |
| `docker-compose-dev.yml` | Staging application using the shared infrastructure network. |
| `.github/workflows/deploy.yml` | Builds immutable images, transfers source state, deploys, checks health, and rolls back. |

## 5. Development history

### Phase 1: backend foundation — 2026-07-17

The initial commits established the Go module, configuration, database connection, Kafka integration, middleware, Redis repository, Firebase repository, Binance connection, controllers, routes, models, alert checker, and tests.

The key architectural decision was to separate responsibilities early:

- Repositories own external data access.
- Services own alert and notification behavior.
- Controllers translate HTTP requests into service calls.
- Background workers ingest prices and evaluate alerts independently of requests.

This made it possible to harden Redis, Kafka, and Firebase later without rewriting the API layer.

### Phase 2: React dashboard and Firebase client — 2026-07-17

The frontend was added as React, Vite, and TypeScript. Reusable components were introduced for ticker cards, charts, alert creation, active thresholds, notification logs, and the header. Firebase client initialization and the messaging service worker completed the browser side of the notification flow.

Application state initially lived mainly in `App.tsx`. That accelerated prototyping but made later lifecycle bugs—service-worker updates, duplicate notifications, and refresh timing—concentrate in one large component.

### Phase 3: notification correctness — 2026-07-22

FCM payloads changed to data-only messages so the application and service worker could consistently control rendering. Duplicate native popups were removed. Binance connection state was exposed so live alert creation could be blocked or explained when ingestion was genuinely unavailable.

Main lesson: foreground FCM handlers and background service workers can both react to one event. Deduplication requires a stable message key and a single owner for native notification rendering.

### Phase 4: AWS, Docker, HTTPS, and CI/CD — 2026-08-05

Pulse moved onto AWS EC2 with Docker Compose and GitHub Actions. This phase included several iterations:

1. Build the application directly on EC2.
2. Increase timeouts after builds exceeded SSH action limits.
3. Reduce Go build concurrency and disable CGO.
4. Experiment with precompiled artifacts.
5. Move toward image-based delivery.
6. Add host Nginx, DuckDNS domains, Certbot certificates, and HTTPS.
7. Correct API proxy path handling and include runtime config files in the backend image.

Building Go and React images on a small instance produced CPU pressure, memory pressure, swap activity, slow SSH banners, and deployment instability. The final direction was to perform expensive builds in GitHub Actions and pull immutable images on EC2.

HTTPS was not cosmetic. Browser FCM and service workers require a secure context, except for the special `localhost` development case.

### Phase 5: environment awareness and guest isolation — 2026-08-06 to 2026-08-07

Notification redirect URLs were made origin-aware so an alert created on localhost, staging, or production opens the correct environment. Guest users stopped sharing one hardcoded identity; each browser now persists a generated guest email in local storage.

Production and staging Compose files were separated. Host Nginx routes the production and staging domains to different frontend/backend ports while both environments reuse the same infrastructure network.

Main lesson: environment-specific behavior should come from the request origin and runtime configuration, not compiled URLs.

### Phase 6: configuration and runtime resilience — 2026-08-26

Hardcoded configuration moved into `.env`, `.env.example`, Compose interpolation, and frontend runtime configuration. Required secrets fail closed when missing.

Redis behavior was hardened:

- Connection timeouts and retries became environment-driven.
- `GoLiveChecker` pings before subscribing.
- Closed Pub/Sub channels trigger exponential reconnection.
- The checker no longer dies permanently after a Redis or container outage.

Binance behavior was corrected in two directions:

- Alert creation no longer depends on the browser's own WebSocket when the backend live stream is healthy.
- Historical charts again use Binance REST interval data while live ticker streams supply current telemetry.

The deployment pipeline also evolved:

- GitHub Actions builds backend and frontend images.
- Images are tagged with the exact commit SHA and stored in GHCR.
- A Git bundle updates EC2 even when direct GitHub access is unreliable.
- EC2 uses `--no-build` and verifies the running image tags.
- Production and staging use explicit Compose project names to prevent cross-project container removal.

### Phase 7: Firebase credential and delayed-alert incident — 2026-08-31 to 2026-09-01

#### Symptoms

- Thresholds were marked triggered in the backend.
- No FCM payload appeared in the browser.
- No native notification arrived.
- The UI showed the trigger only after navigating away and returning.

#### Evidence

Backend logs showed that the complete pre-FCM pipeline worked:

1. The alert was created.
2. `GoLiveChecker` triggered it.
3. MySQL accepted the atomic status update.
4. Kafka received the notification event.
5. Firebase subscription and send operations failed with a missing-project error.

On EC2, the original service-account file was mode `0600` and owned by one numeric Linux user. The backend image ran as another non-root numeric user. Docker's direct bind mount preserved the host ownership and mode, so the container could stat the path but could not read the JSON.

#### Why it worked without a GitHub push

The immediate repair changed the existing host file's owner to the backend runtime UID while keeping mode `0600`. A bind mount references the same host inode, so the running container observed the ownership change immediately. Firebase initialization had failed without caching a client; the next request retried initialization and succeeded. No image rebuild, code push, or restart was necessary.

#### Why the UI updated only after navigation

In live mode, the frontend expected an FCM event to call `fetchAlerts()`. Its other synchronization hooks ran on focus, visibility changes, and browser history traversal. Once FCM failed, changing pages was the next event that fetched the MySQL-backed state.

#### Permanent solution

The permanent design does not make the backend match arbitrary host ownership and does not widen the host file to world-readable:

1. The ignored service-account JSON remains on the host with strict permissions.
2. A one-shot Compose service starts as root with no network.
3. It receives only the source file and a Docker-managed credential volume.
4. It drops all capabilities except those required to read and transfer ownership.
5. It validates a non-root runtime UID/GID and restricts the target path to the configured secret directory.
6. It atomically installs a mode-`0400` copy owned by the Pulse runtime user.
7. It exits successfully.
8. The long-running backend starts as the configured non-root user and mounts only the read-only managed volume.

This works whether the source file is owned by `ubuntu`, the Pulse UID, or another deployment owner. The backend never runs as root and never receives a writable secret mount.

#### Application-level safeguards added

- Live pages poll alert state every three seconds while visible, so a temporary push failure cannot freeze the threshold display.
- Concurrent alert fetches are suppressed.
- A backend `null` alert list is normalized to an empty array, and the backend now returns `[]` for no results.
- The frontend checks the FCM subscription HTTP response instead of silently accepting a 500.
- Raw FCM registration tokens are no longer logged in the browser console.
- The backend rejects Firebase topic subscriptions with zero successful tokens.
- Firebase credential resolution verifies that the selected file is readable and reports a clear error.
- Notification permission instructions now refer to the current site instead of incorrectly saying `localhost` on remote domains.

## 6. End-to-end behavior

### Market-data ingestion

1. `main.go` starts the Binance repository in a reconnecting goroutine.
2. The repository subscribes to four `@ticker` streams.
3. Every valid tick is stored at `binance:<SYMBOL>:ticker`.
4. The same JSON is pushed into `binance:<SYMBOL>:history` and trimmed to 100 entries.
5. The tick is published on `binance:<SYMBOL>:ticker`.
6. `GoLiveChecker` and WebSocket clients consume those Pub/Sub messages.

The backend forces IPv4 first to avoid hosts with broken IPv6 routing, then tries the default dialer as a fallback.

### Alert creation

1. The browser sends requester, symbol, price, direction, and origin.
2. The service validates email, symbol, direction, numeric price, and Binance availability.
3. The repository prevents another pending alert for the same requester and symbol.
4. MySQL stores a `PENDING` alert.
5. The in-memory cache receives the new pending alert.

Guest identities are generated per browser and persisted in local storage, preventing unrelated users from sharing alert state or FCM topics.

### Threshold evaluation

1. `GoLiveChecker` subscribes to `binance:*:ticker`.
2. It reconnects with bounded exponential backoff after Redis failures.
3. A tick is decoded and its latest price parsed.
4. Cached pending alerts for the symbol are evaluated.
5. MySQL updates `PENDING -> TRIGGERED` only when the row is still pending.
6. `RowsAffected == 1` is the concurrency gate that permits one notification event.
7. The triggered entry is removed from the pending cache.

### Notification delivery

1. The checker serializes an `AlertsKafkaPayload`.
2. The reusable Kafka producer writes to the configured notification topic.
3. The notification consumer reads with the configured consumer group.
4. The Firebase service resolves a deterministic topic from the requester's email.
5. Firebase sends a data payload with title, body, symbol, price, and origin.
6. Foreground messages update React directly.
7. Background messages are handled by the service worker, which renders the native notification and broadcasts the payload to open windows.
8. Clicking the notification focuses or opens the correct origin and symbol.

### Frontend synchronization

The frontend now has multiple complementary synchronization paths:

- FCM foreground callback: immediate payload log, toast, sound, and alert fetch.
- Service-worker message: background payload forwarded to open application windows.
- Focus/visibility/history events: refresh after returning to the page.
- Visible-page polling: REST refresh every three seconds as a fallback.

Only FCM creates a true push payload. Polling makes state accurate when push is unavailable; it does not fabricate an FCM delivery.

## 7. Configuration model

The root `.env` is the operational source for Compose. It is ignored by Git. `.env.example` defines the required names and safe defaults.

Configuration layers are:

1. `.env` values are passed explicitly with `docker compose --env-file .env`.
2. Compose validates required values and supplies container environment variables.
3. Go's YAML configuration expands environment placeholders into typed structs.
4. The frontend container generates `/runtime-config.js` at startup.
5. `configValue()` prefers browser runtime config and falls back to Vite build config.

Never place these in Git:

- Firebase Admin service-account JSON
- Database passwords
- Redis password
- SSH private keys
- GitHub or GHCR tokens
- FCM registration tokens

Firebase web identifiers are not server private keys, but Pulse still supplies them through runtime configuration so images remain environment-independent.

## 8. Local development workflow

### Prepare configuration

```bash
cp .env.example .env
```

Fill every required blank value locally. Place the Firebase Admin JSON at the ignored path selected by `FIREBASE_SERVICE_ACCOUNT_HOST_PATH`.

Validate before starting containers:

```bash
docker compose --env-file .env -f docker-compose-pulse.yml config --quiet
docker compose --env-file .env -f docker-compose-dev.yml config --quiet
```

### Start production-shaped local services

```bash
docker compose --project-name pulse --env-file .env -f docker-compose-pulse.yml up -d --build
```

### Start staging application services

The staging file expects the shared infrastructure network and services to exist:

```bash
docker compose --project-name pulse-dev --env-file .env -f docker-compose-dev.yml up -d --build
```

### Run validation

```bash
go test ./...
cd frontend
npm run lint
npm run build
```

The frontend may warn about a large JavaScript chunk. That is currently a performance warning, not a failed build.

## 9. Deployment workflow

For both `main` and `develop`, GitHub Actions performs the expensive work away from EC2:

1. Check out the complete repository history.
2. Resolve immutable GHCR image names from the repository and commit SHA.
3. Build and push the Linux/AMD64 backend image.
4. Build and push the Linux/AMD64 frontend image.
5. Read EC2's current branch revision.
6. Verify that revision is an ancestor of the requested commit.
7. Create and upload a Git bundle containing only the missing branch history.
8. Fast-forward EC2 to the exact expected SHA.
9. Validate `.env` and the selected Compose file.
10. Pull the exact images.
11. Start with `--no-build` so EC2 never compiles the application.
12. Wait for backend and frontend health checks.
13. Verify that running image tags equal the requested SHA.
14. Roll back to the previous image set when startup or health validation fails.

### Why sequential commits on `develop` matter

Small, focused commits make failures attributable:

1. Push an infrastructure fix.
2. Wait for staging deployment and health checks.
3. Test the behavior.
4. Push the application fallback separately.
5. Test again before merging to `main`.

This is slower than pushing an unrelated bundle of changes, but it makes rollback and diagnosis substantially safer.

## 10. Incident troubleshooting matrix

| Symptom | Most likely layer | Checks |
| --- | --- | --- |
| Prices are zero and backend status is disconnected | Binance ingestion | Backend logs, `/api/v1/binance/status`, configured WebSocket URL, outbound network. |
| Charts have only a few points | Binance REST history/frontend | Browser network requests, configured REST base URL, selected interval. |
| Alert stays pending despite crossing | Redis/checker/cache | Redis ping, checker subscription log, ticker symbol and latest-price field, pending cache initialization. |
| Alert is triggered in MySQL but no Kafka event | Checker/producer | Atomic update logs, Kafka broker reachability, configured topic. |
| Kafka receives event but no FCM payload | Firebase Admin | Credential installer completion, managed file ownership/mode, project configuration, send error. |
| FCM subscribe returns 500 | Firebase Admin or token | Backend error, readable credential, Firebase project match, web token validity. |
| UI updates only after page switching | Push delivery/frontend sync | FCM console/service-worker logs, subscription response, visible-page polling requests. |
| Browser says notifications are blocked | Browser site permissions | HTTPS origin, address-bar site settings, `Notification.permission`, service-worker registration. |
| Deploy stops because `.env` is missing | EC2 runtime configuration | Create `~/Pulse/.env` from `.env.example`; do not commit it. |
| Compose reports a missing variable | `.env` completeness | Add the named value; rerun `config --quiet`. |
| Push rejects workflow changes | GitHub authentication scope | Reauthorize Git Credential Manager or use a token allowed to update workflows. |
| SSH times out during deployment | EC2/network/resource pressure | EC2 status checks, security group port 22, DNS A record, current public IP, CPU/memory/swap. |
| Dev deployment removes production containers | Compose project collision | Always use project names `pulse` and `pulse-dev`; inspect Compose labels. |

## 11. Safe operational checks

These commands reveal state without printing secrets:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
docker logs --since 10m pulse_app_dev
docker exec pulse_app_dev id
docker exec pulse_app_dev stat -c '%u:%g %a %n' /run/secrets/firebase-service-account.json
docker exec pulse_redis redis-cli ping
docker compose --project-name pulse-dev --env-file .env -f docker-compose-dev.yml config --quiet
```

Do not print `.env`, the Firebase JSON, private keys, Docker registry auth files, or FCM registration tokens into CI logs or support messages.

## 12. Design lessons

### Event-driven does not remove the need for durable state

Redis Pub/Sub and Kafka move events efficiently, but MySQL remains the durable record of alert status. The atomic update makes event emission idempotent at the alert-transition boundary.

### Reconnection must be a loop, not a startup feature

A connection that succeeds at boot can still fail later. Binance and Redis workers therefore need retry loops, bounded backoff, explicit channel-closure handling, and context-aware shutdown.

### Push and state synchronization solve different problems

FCM delivers an immediate event. REST polling reconciles current state. A robust UI uses both without pretending a poll is a push notification.

### Numeric file ownership crosses the container boundary

Linux permissions use numeric UID/GID values. A username on the host and a username in a container are unrelated unless their numeric IDs and permissions align. Directly bind-mounting a mode-`0600` secret into a different non-root UID is expected to fail.

### Small instances should pull artifacts, not build them

Compilation is bursty and memory intensive. Immutable images built in CI reduce EC2 CPU pressure, deployment duration, SSH instability, and rollback complexity.

### Runtime configuration keeps images reusable

The same frontend image can serve localhost, staging, or production when startup generates runtime config. Environment URLs and Firebase web identifiers should not be baked into the JavaScript bundle unnecessarily.

### Health means more than a running process

Compose health checks verify HTTP behavior, and the deployment verifies image identity. Future health work should also distinguish partial dependency degradation—such as a healthy API with unavailable FCM—from complete process failure.

## 13. Known tradeoffs and next improvements

- `App.tsx` owns many unrelated concerns. Extract alert synchronization, market data, and FCM into dedicated hooks.
- The production bundle is large. Route-level or feature-level code splitting would reduce initial download cost.
- Firebase delivery lacks a deterministic integration test using a controlled test project/token.
- The Kafka notification topic and consumer group are shared across environments. Explicit environment-specific topics/groups would improve staging isolation.
- Redis and Kafka are single-instance services on one EC2 host; this is cost-efficient but not highly available.
- CORS currently permits all origins. Production should use an environment-driven allowlist.
- Gin is forced into debug mode in `main.go`; production should select mode from `APP_ENV`.
- Firestore initialization checks can produce permission noise even when the alert pipeline itself does not need Firestore.
- More repository and checker tests should cover empty query results, duplicate trigger races, Redis reconnection, and Kafka/FCM error propagation.
- A deployment smoke test should verify FCM credential readability and Firebase project initialization before declaring the release healthy.

## 14. Release checklist

Before pushing:

- [ ] `git diff --check` passes.
- [ ] No secret or environment file is staged.
- [ ] Both Compose files pass `config --quiet`.
- [ ] `go test ./...` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] Changes are separated into focused commits.

After staging deployment:

- [ ] GitHub Actions reports success.
- [ ] EC2 is at the expected commit SHA.
- [ ] Backend and frontend containers are healthy.
- [ ] The Firebase secret initializer exited with code 0.
- [ ] The backend runs as a non-root UID.
- [ ] The managed credential is readable by the backend and mode `0400`.
- [ ] Binance status is connected.
- [ ] Creating an alert returns 201.
- [ ] A threshold crossing changes state without navigation.
- [ ] Kafka receives the event.
- [ ] FCM payload log and browser notification receive the event.
- [ ] Production containers remain untouched by staging deployment.

## 15. Selected Git milestones

| Commit | Learning milestone |
| --- | --- |
| `cf6b6dc` | Initial project repository. |
| `14b846f` | Binance WebSocket, Redis, and Firebase repositories. |
| `800d00b` | Live checker and Kafka notification consumer. |
| `e1963f2` | Integrated React application behavior. |
| `168a7eb` | Data-only FCM payloads. |
| `f7d8438` | First AWS deployment workflow. |
| `0562c5c` | HTTPS with Let's Encrypt. |
| `060e891` | Origin-aware notifications and guest isolation. |
| `b7d390d` | Dual production/staging Compose deployment. |
| `0e2215f` | Environment-driven container configuration. |
| `07e4fa4` | Redis reconnection resilience. |
| `89ea097` | Restored historical chart data. |
| `5410eb0` | Frontend runtime configuration. |
| `13fb130` | CI-built immutable images and EC2 pull deployment. |
| `aa8f9d1` | Isolated Compose project identities. |
| `881dfa5` | Secure Firebase credential installation independent of host ownership. |
| `555485e` | Observable FCM failures and visible-page alert-state synchronization. |

The exact history remains available through `git log --reverse --oneline`. This guide groups the commits by engineering lesson so it remains useful as the project continues to evolve.
