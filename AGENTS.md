# Project Instructions

## Project Overview

- This is the single Git repository for the private AI knowledge base project.
- Production service target: `kb.zero007.chat`, based on FastGPT, PostgreSQL + pgvector, MongoDB, Redis, AIProxy, Docker and Caddy.
- Production server SSH alias: use `ssh sub2api-cf`.
- `ops/` stores deployment docs, release records, server templates, scripts and acceptance fixtures.
- `fastgpt/` stores the private FastGPT derivative source code. Do not sync upstream FastGPT unless the user explicitly requests it.
- `artifacts/` is for local temporary build outputs and must not be committed.

## Commands

| Task | Command |
|------|---------|
| Ops local prepare | `powershell -ExecutionPolicy Bypass -File .\ops\scripts\local\prepare.ps1` |
| Ops local start | `powershell -ExecutionPolicy Bypass -File .\ops\scripts\local\start.ps1` |
| Generate fixtures | `powershell -ExecutionPolicy Bypass -File .\ops\scripts\local\generate-fixtures.ps1` |
| Small URL export | `powershell -ExecutionPolicy Bypass -File .\ops\scripts\local\export-sitemap-articles.ps1 -Limit 5 -Overwrite` |
| FastGPT app test | `cd fastgpt; $env:FASTGPT_TEST_SKIP_MONGO='1'; pnpm --filter @fastgpt/app test test/pageComponents/dashboard/agent/utils/appTemplateParse.test.ts` |
| FastGPT typecheck | `cd fastgpt; pnpm --filter @fastgpt/app typecheck` |

## Layout

- `README.md`: workspace overview.
- `ops/README.md`: main executable project document and current requirements.
- `ops/docs/version-management.md`: version and branch process.
- `ops/docs/deployment-standard.md`: production deployment rules.
- `ops/docs/releases/`: version records.
- `ops/deploy/server/`: server bootstrap, check scripts and compose override.
- `fastgpt/`: FastGPT private derivative source code.
- `artifacts/`: ignored local artifacts such as image tar files.

## Conventions

- Do not commit, tag, push or deploy unless the user explicitly asks.
- When the user says `发版`, execute the version flow: commit relevant local changes, update release record, build fixed-tag FastGPT image, deploy it to the server, verify service, record the result, then push the single repository.
- Do not read, print or commit secrets from `key.md`, `.env`, `.env.local` or any `.env.*` file.
- Model provider, model name, Base URL, API Key and embedding configuration are maintained only in the FastGPT UI, not in repo code or docs.
- Keep deployment configuration in `ops/deploy/server/` synchronized with real server changes when deployment work is requested.
- Do not expose `/storage` directly through Caddy; original material access must stay behind application authentication.
- Do not commit runtime data, `node_modules`, `.next`, coverage, logs, image tar files, or local tool state.

## Verification

- Documentation-only edits: run `git diff --check`.
- Deployment config edits: run `docker compose config` locally or on the server context.
- FastGPT app changes: verify with targeted tests and typecheck from `fastgpt/`.
