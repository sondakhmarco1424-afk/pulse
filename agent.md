# Agent Working Notes

## Objective

Keep the alert pipeline reliable after AWS or container restarts, with Redis recovery, environment-driven configuration, and no committed runtime secrets or deployment-specific endpoints.

## Working Guidelines

- Inspect the existing application, deployment, and AWS-related configuration before changing behavior.
- Preserve user changes and avoid destructive commands.
- Do not expose credentials, tokens, private keys, or sensitive environment values in logs or reports.
- Prefer evidence from application logs, service status, network checks, and reproducible tests over assumptions.
- Keep changes narrowly scoped to the alert-request failure.
- Run relevant tests or safe validation checks after any implementation change.
- Document the cause, affected components, changes made, and any remaining deployment steps.
