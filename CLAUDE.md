# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

MCP server (TypeScript, stdio transport) exposing 40 tools for Myongji University services: LMS, MSI, UCheck, Library. Primarily read-only; write operations (assignment submit/delete, study room/seat reservation) require a two-step approval token flow.

## Commands

```bash
npm install          # install dependencies
npm run check        # type-check only (no emit)
npm run build        # compile to dist/
npm run dev          # dev mode via tsx (hot reload)
npm run start        # production (node dist/index.js)

# Auth CLI
npm run auth:login -- --id ID --password PW
npm run auth:status
npm run auth:logout   # clear sessions only
npm run auth:forget   # clear all auth data
```

No test framework is configured. Validation is done against real services.

## Architecture

```
MCP Client -> src/mcp/server.ts -> src/tools/* -> src/mcp/app-context.ts
                                       |               |
                                       v               v
                                  src/{lms,msi,     src/auth/*
                                  ucheck,library}/*
```

**Layer separation**: `src/tools/` handles MCP registration, Zod schemas, response formatting, course resolution, and approval flow. `src/{service}/` handles HTTP calls, HTML/JSON parsing, and session management. Never mix these layers.

**App context** (`src/mcp/app-context.ts`): Central runtime state — creates all service clients, resolves credentials, tracks last-used course per session, issues/validates write approval tokens (5-min TTL + input fingerprint).

**Course resolver** (`src/tools/course-resolver.ts`): Shared course identification layer used by all LMS tools. Handles `course`/`kjkey` input, latest-semester priority, session context memory, all-semester fallback.

**Write approval flow**: Write tools require `confirm=true` -> server returns approval token -> user re-calls with token in same session -> fingerprint match check -> execute. This applies to LMS assignments and Library reservations.

## Service Patterns

Each service follows: `config.ts` (runtime paths/env) -> `constants.ts` (URLs) -> `client.ts` (HTTP + session) -> `types.ts` -> `services.ts` (parsing) -> `src/tools/<service>.ts` (MCP registration).

- **LMS**: SSO login, HTML parsing (Cheerio), form-based POST. Largest service.
- **MSI**: Chained auth bridge, menu-driven HTML parsing.
- **UCheck**: SSO login, SPA with JSON API calls.
- **Library**: Token-based auth (`Pyxis-Auth-Token` header), JSON REST API. Study rooms and reading room seats use separate service files.

Each service has its own isolated session file (`state/{service}-session.json`). Credentials resolved in order: `MJU_USERNAME`/`MJU_PASSWORD` env vars (Linux/container), then OS keychain (macOS) or Credential Manager (Windows).

## Adding a New Tool

1. Implement parsing/HTTP logic in `src/<service>/services.ts`
2. Define types in `src/<service>/types.ts`
3. Register MCP tool with Zod schema in `src/tools/<service>.ts`
4. Wire into `src/tools/index.ts` if new tool module
5. `npm run check && npm run build`
6. Validate against real service data
7. Update docs in `docs/tool-reference-<service>.md`

## Adding a New Service

Follow the existing pattern: `src/<service>/` with config, constants, client, types, services files. Connect in `app-context.ts`, register in `tools/index.ts`.

## Key Constraints

- **TypeScript strict mode** with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` — handle `undefined` from indexed access, use exact optional types.
- **ESM only** (NodeNext modules) — all local imports must include `.js` extension.
- **Node >= 22** required.
- **Korean commit messages** preferred: `feat: ...`, `fix: ...`, `docs: ...`
- **Never commit**: session files, credentials, HTML snapshots, downloaded files, `.env` with real values.
- **HTTP-first**: Use direct HTTP calls, not browser automation. Playwright only for structure discovery.
- **Real-data validation required** before committing new features — test against actual university services.
- Write tools must always include the approval token flow; never bypass it.
