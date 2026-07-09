# Structly Integration Roadmap

Structly's current MVP remains a receipt capture, review, enrichment, and export app. The MVP does not require OAuth connectors, third-party action execution, or model/tool code execution on the device.

This roadmap defines the gated path for backend-owned integrations after the MVP path remains green.

## Phase 0 - Protect The MVP

- Receipt capture, review, context enrichment, and export remain available even when backend integration health is stale or offline.
- Mobile provider secrets are not allowed in `EXPO_PUBLIC_*` values, mobile source, logs, or bundled JavaScript.
- Integration surfaces default to unavailable until the backend reports a configured provider.
- User-facing copy uses product language such as "automation", "connector", "run history", and "worker status".

## Phase 1 - Backend Substrate

The first backend tranche is provider-neutral:

- receipt jobs
- integration events
- trigger definitions and trigger runs
- device and worker heartbeats
- audit logs and dead-letter events
- optional integration source/capability registry

Provider-specific account records are intentionally excluded from this phase. They belong to later Composio or MCP adapter work.

Default runtime is Supabase-only: Postgres, RLS, Storage, Edge Functions, Cron, and Realtime. A separate Node/Fastify service requires a recorded runtime decision with evidence that Edge Functions are not sufficient.

## Phase 2 - Mobile Health And Sync

Mobile owns consent and status display:

- location/calendar capability states
- background-task support reported as best-effort, never guaranteed
- app/device heartbeat emission while foregrounded or resumed
- offline/stale backend states
- trigger and run-history views backed by durable backend state

Backend automation must continue without the mobile app running.

## Phase 3 - Provider Adapters

Composio and MCP are backend adapters:

- Composio events enter through signed backend webhooks.
- Production Composio webhooks must set `COMPOSIO_WEBHOOK_SECRET` and verify the raw-body signature before parsing.
- MCP tools are exposed through a backend bridge and approved catalog.
- MCP bridge calls are authenticated, user-scoped Streamable HTTP JSON-RPC requests for `tools/list` and `tools/call`; mobile never runs stdio/local MCP servers.
- Mobile sees only approved catalogs, statuses, approvals, and histories.
- External side effects require policy checks and, when configured, user approval.

## Phase 4 - Schedules, Location Suggestions, And Code Runs

Scheduled jobs, coarse location suggestions, and sandboxed code execution are backend-owned workflows:

- Schedule ticks enter as durable integration events, then fan out through trigger runs with idempotency keys.
- Location suggestions use coarse coordinates and user consent. They are suggestions for receipt context, not continuous tracking guarantees.
- Receipt capture can send a coarse-only location suggestion from mobile when a synced location trigger is active.
- Daytona-style code execution is represented as an approval-required backend request. Mobile never executes code and never carries sandbox API keys.
- Approved code execution is performed only by a backend runner using a configured Daytona sandbox id and runner token.
- The mobile app sends foreground/resume device heartbeats and hydrates trigger/run history through user-scoped mobile sync.
- Mobile sync also hydrates user-scoped schedule jobs, location suggestions, and code execution request summaries without secret payload fields.
- The mobile app manages trigger create/edit/pause/resume/delete through authenticated, user-scoped backend actions.
- The mobile app can approve or deny approval-required trigger runs before backend side effects continue.
- Pixel/Android validation is a release gate because background work and background location are platform-constrained.

## Release Gates

- `npm test` passes.
- `npm run test:e2e` passes for the local scenario harness.
- `npm run audit:oauth` passes.
- RLS/auth checks prove user isolation.
- Signed webhook, replay, idempotency, and dead-letter paths are tested.
- Schedule tick, location suggestion, MCP bridge, and code-execution request paths are tested.
- Mobile bundle/env audit shows no provider or service-role secrets.
- Real-device checks cover permission grant, denial, revoke, background, killed app, offline, and resume.
