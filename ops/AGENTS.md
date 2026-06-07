# Project Instructions

## Project Overview

- `ops/` documents and operates a private AI knowledge base deployment inside the single `ai-knowledge-base` repository.
- Production service target: `kb.zero007.chat`, currently based on FastGPT, PostgreSQL + pgvector, MongoDB, Redis, AIProxy, Docker and Caddy.
- `ops/` stores docs, scripts, deployment templates and acceptance fixtures. It must not store secrets or runtime data.
- FastGPT source code lives in `..\fastgpt` relative to this directory.
- FastGPT is now treated as a private derivative baseline. Do not sync upstream FastGPT code unless the user explicitly requests it.

## Commands

| Task | Command |
|------|---------|
| Local prepare | `powershell -ExecutionPolicy Bypass -File .\ops\scripts\local\prepare.ps1` |
| Local start | `powershell -ExecutionPolicy Bypass -File .\ops\scripts\local\start.ps1` |
| Generate fixtures | `powershell -ExecutionPolicy Bypass -File .\ops\scripts\local\generate-fixtures.ps1` |
| Small URL export | `powershell -ExecutionPolicy Bypass -File .\ops\scripts\local\export-sitemap-articles.ps1 -Limit 5 -Overwrite` |
| Full URL export | `powershell -ExecutionPolicy Bypass -File .\ops\scripts\local\export-sitemap-articles.ps1 -Overwrite` |
| Server check | `sudo bash /opt/fastgpt/check-server.sh` |
| Compose config check | `docker compose config` |

## Project Layout

- `ops/README.md`: Main executable project document and current requirements.
- `docs/version-management.md`: Version and branch process.
- `docs/deployment-standard.md`: Production deployment rules.
- `docs/releases/`: Version records.
- `deploy/server/`: Server bootstrap, check scripts and compose override.
- `scripts/local/`: Local prepare/start/fixture/export scripts.
- `tests/fixtures/`: Acceptance materials for knowledge-base import and Q&A checks.
- `runtime/`, `storage/`, `logs/`: Local runtime data, ignored by Git.

## Conventions

- Default to local-only edits. Do not commit, tag, push or deploy unless the user explicitly asks for that action.
- When the user says `发版`, execute the version flow: commit the current relevant local changes, create/update the release record, build the fixed-tag FastGPT image, deploy it to the server, verify the service, and record the result.
- Prefer implementing missing project features in local FastGPT code when feasible. Hide original FastGPT features only when they depend on unavailable paid services, disabled heavy components, external authorization, or unimplemented backend support.
- Do not read, print or commit secrets from `key.md`, `.env`, `.env.local` or any `.env.*` file.
- Model provider, model name, Base URL, API Key and embedding configuration are maintained only in the FastGPT UI, not in repo code or docs.
- Keep deployment configuration in `deploy/server/` synchronized with real server changes when the user explicitly asks for deployment work.
- Versioned deployments must follow `docs/version-management.md` and `docs/deployment-standard.md`.
- For FastGPT custom code changes, work in `fastgpt/` and record the related changes in `ops/docs/releases/` when a deployment/version record is requested.
- Do not expose `/storage` directly through Caddy; original material access must stay behind application authentication.

## Verification

- Documentation-only edits: run `git diff --check`.
- Script edits: run the targeted script with safe/test parameters when possible.
- Deployment config edits: run `docker compose config` locally or on the server context.
- FastGPT app changes: verify in the FastGPT repo with targeted tests/typecheck before any deployment.

## External References

| Need | File |
|------|------|
| Main project scope | `ops/README.md` |
| Version process | `ops/docs/version-management.md` |
| Deployment rules | `ops/docs/deployment-standard.md` |
| Server deployment notes | `ops/deploy/server/README.md` |
| Acceptance fixtures | `ops/tests/fixtures/README.md` |
