# ⚡ Pulse — High-Throughput Real-Time Crypto Alert Engine

[![Deploy Status](https://github.com/sondakhmarco1424-afk/pulse/actions/workflows/deploy.yml/badge.svg)](https://github.com/sondakhmarco1424-afk/pulse/actions)
![Go Version](https://img.shields.io/badge/Go-1.25%2B-00ADD8?style=flat&logo=go)
![Docker](https://img.shields.io/badge/Docker-Containerized-2496ED?style=flat&logo=docker)
![AWS EC2](https://img.shields.io/badge/AWS-EC2_Deployed-FF9900?style=flat&logo=amazon-aws)
![Apache Kafka](https://img.shields.io/badge/Kafka-Event_Driven-231F20?style=flat&logo=apachekafka)
![Redis](https://img.shields.io/badge/Redis-In_Memory_Cache-DC382D?style=flat&logo=redis)

**Pulse** is an enterprise-grade, event-driven cryptocurrency alerting platform designed to monitor live crypto ticker prices via high-frequency Binance WebSocket streams and dispatch instant sub-second push notifications using **Apache Kafka**, **Redis**, **Go (Gin)**, and **Firebase Cloud Messaging (FCM)**.

---

## 🌐 Live Infrastructure & Demo Links

The application is deployed live on a free-tier AWS EC2 instance (`t3.micro`) using Docker Compose and automated CI/CD:

| Component | URL | Status |
| :--- | :--- | :--- |
| 💻 **React Frontend App** | [https://pulse-crypto.duckdns.org/](https://pulse-crypto.duckdns.org/) | ![Live](https://img.shields.io/badge/Live-Online-brightgreen) |
| 📊 **Kafka Cluster Dashboard** | [http://pulse-crypto.duckdns.org:8080](http://pulse-crypto.duckdns.org:8080) | ![Live](https://img.shields.io/badge/Live-Online-brightgreen) |
| ⚡ **Go REST API & Swagger** | [http://pulse-crypto.duckdns.org:8081/swagger/index.html](http://pulse-crypto.duckdns.org:8081/swagger/index.html) | ![Live](https://img.shields.io/badge/Live-Online-brightgreen) |

---

## 💡 Why I Built This

Having engineered backend systems at **Moladin** where database bottlenecks and lock contentions under high concurrency were daily challenges, I built **Pulse** to showcase how to decouple heavy real-time workloads using modern event-driven design patterns:

1. **Zero Database Polling:** Instead of hammering MySQL with constant price evaluation queries, price streams from Binance WebSockets feed directly into memory.
2. **Asynchronous Notification Pipeline:** Alert triggers produce event messages onto an **Apache Kafka** topic (`fcm-notifications`). Go worker routines consume these events asynchronously to dispatch Firebase notifications without blocking HTTP handlers.
3. **Sub-millisecond Caching:** **Redis** caches active user alert triggers and state to guarantee sub-millisecond evaluation cycles even during high market volatility.
4. **Cloud Production Hardening:** Deployed to AWS EC2 with swap-space kernel tuning (OOM defense), complete Docker Compose orchestration, and automated SSH CI/CD pipelines via GitHub Actions.

---

## 🏗️ System Architecture

```
                                +-----------------------------------+
                                |    Binance Live WebSocket Stream  |
                                +-----------------------------------+
                                                  |
                                                  v
+-------------------+      REST API      +-----------------------------------+
|  React / Vite UI  | -----------------> |         Go API Backend            |
+-------------------+                    |     (Gin Framework / Bob DB)      |
                                         +-----------------------------------+
                                           |              |              |
                           Read/Write DB   |              | Cache State  | Produce Events
                                           v              v              v
                                      +---------+    +---------+   +-------------------+
                                      |  MySQL  |    |  Redis  |   |   Apache Kafka    |
                                      | Database|    |  Cache  |   |(fcm-notifications)|
                                      +---------+    +---------+   +-------------------+
                                                                             |
                                                               Consume Events|
                                                                             v
                                                                   +-------------------+
                                                                   |  Go Worker Engine |
                                                                   +-------------------+
                                                                             |
                                                                             v
                                                                   +-------------------+
                                                                   |  Firebase (FCM)   |
                                                                   | Push Notification |
                                                                   +-------------------+
```

---

## 🛠️ Technical Stack

- **Backend:** Go (Gin, Bob DB ORM, Go-Kafka, Go-Redis)
- **Message Broker:** Apache Kafka (KRaft combined controller mode)
- **Caching & State:** Redis
- **Database:** MySQL 8.0
- **Frontend:** React 19, Vite, TailwindCSS, Firebase Web SDK
- **DevOps & Cloud:** Docker, Docker Compose, AWS EC2 (Ubuntu 24.04), GitHub Actions CI/CD

---

## 🚀 Local Development Setup

### One-Click Windows Setup:
```cmd
.\setup.bat
```

### Manual Setup:
```bash
# 1. Start Infrastructure (MySQL, Redis, Kafka, Go App, React Frontend)
docker compose -f docker-compose-pulse.yml up -d --build

# 2. Access local services:
# - Frontend: http://localhost:3000
# - Kafka UI: http://localhost:8080
# - Go API: http://localhost:8081
```

---

## ⚙️ CI/CD Pipeline

Pushing to `main` or `develop` triggers the GitHub Actions workflow ([.github/workflows/deploy.yml](file:///.github/workflows/deploy.yml)) which automatically:
1. Connects securely via SSH to the AWS EC2 instance.
2. Pulls the latest commit.
3. Silently builds and zero-downtime restarts all containerized services using `docker compose`.
