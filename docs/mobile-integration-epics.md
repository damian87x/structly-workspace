# Mobile Integration Epics

These epics are the post-MVP integration path for Structly. The MVP remains the verified receipt spreadsheet workflow in `docs/spec.md`; these epics define the gated backend/mobile work needed before connectors, triggers, schedules, location suggestions, MCP tools, or code execution become user-facing product surfaces.

Web evidence checked on 2026-07-09:

- Composio trigger events are delivered to a public webhook and signed with `webhook-signature`, `webhook-id`, and `webhook-timestamp`; handlers must verify the raw body with `COMPOSIO_WEBHOOK_SECRET`.
- MCP tools are exposed as named tools with schemas and are invoked through `tools/list` and `tools/call`; Structly must keep this behind a user-owned, approved Streamable HTTP source catalog.
- Expo and Android background work are constrained by system policy. Background location stops when the app is terminated on Android, and Android background location is rate-limited.
- Daytona process/code execution supports sandboxed commands with timeout and environment options, which belongs behind backend approval and runner tokens.

## Epic 1 - Mobile Health And Sync

Mobile shows integration readiness without owning provider secrets.

- Hydrate backend status, connector catalog, trigger definitions, run history, schedule jobs, location suggestions, and code execution summaries through `mobile-sync`.
- Emit foreground and resume device heartbeats with Pixel/Android capability state.
- Show stale/offline states when backend health or worker heartbeats are missing.
- Never include provider API keys, service-role keys, runner tokens, webhook secrets, precise location payloads, or code execution environment secrets in mobile sync responses.

Evidence gate:

- `npm run test:e2e` proves mobile-safe sync shape and local integration flow.
- `npm run test:live` with base live env proves deployed `status-read`, `mobile-sync`, and device heartbeat ingestion.
- `npm run test:pixel -- --require-device --require-install --require-launch` proves the installed Pixel app can launch and declare only foreground location permissions.

## Epic 2 - Trigger Management And Approvals

Users can create, update, pause, resume, delete, approve, and deny backend-owned automation without bypassing policy checks.

- Trigger create/edit/pause/resume/delete goes through authenticated `trigger-actions`.
- Trigger events enter through authenticated `trigger-dispatch` or provider-specific backend ingress.
- External side effects start as `approval_required` trigger runs.
- Mobile can approve or deny only user-owned approval-required runs through `run-actions`.

Evidence gate:

- Edge E2E proves invalid auth, user mismatch rejection, service-role writes, create/pause/resume/delete lifecycle updates, and run approve/deny transitions.
- Live smoke with `STRUCTLY_TEST_TRIGGER_ACTIONS=1` proves deployed trigger lifecycle actions against a throwaway trigger.
- Live smoke with `STRUCTLY_TEST_TRIGGER_DISPATCH_TRIGGER_ID` proves direct dispatch and idempotent run creation.

## Epic 3 - Scheduled Jobs And Recurring Packs

Backend schedules create durable events and trigger runs even when the mobile app is closed.

- Schedule ticks use a dedicated schedule worker token.
- Each schedule event has an idempotency key.
- Mobile can display schedule status and run history but cannot impersonate the schedule worker.
- Recurring receipt pack reminders should prefer backend schedules and local notifications over continuous background execution.

Evidence gate:

- Edge E2E proves user tokens cannot call `schedule-jobs`.
- Live smoke with `STRUCTLY_TEST_SCHEDULE_TOKEN` and `STRUCTLY_TEST_SCHEDULE_TRIGGER_ID` proves deployed schedule tick ingestion.
- Pixel matrix records closed-app behavior instead of assuming it.

## Epic 4 - Location Suggestions

Location is a consented, coarse suggestion input, not a continuous tracking product.

- Request foreground location only when it improves capture or receipt context.
- Round coordinates before persistence and never store precise coordinates in integration event payloads.
- Create suggestions only for active user-scoped location triggers.
- Treat Android killed-app, battery-saver, and background behavior as release evidence, not promises.

Evidence gate:

- Local E2E proves coarse rounding and absence of `preciseLocation`.
- Live smoke with `STRUCTLY_TEST_LOCATION_TRIGGER_ID` proves deployed suggestion and trigger-run creation.
- Pixel smoke strict modes prove foreground location granted and denied states.

## Epic 5 - Composio Trigger Ingestion

Composio is a backend adapter, not a mobile SDK surface.

- Store Composio webhook secret only on the backend.
- Verify the raw webhook body before parsing.
- Persist signed events as integration events with idempotency keys.
- Queue trigger runs only when the payload maps to a Structly trigger id.
- Keep Composio names out of customer-facing copy unless a connector settings screen has a reason to show the provider name.

Evidence gate:

- Edge E2E proves missing or invalid webhook secrets reject without persistence.
- Live smoke with `STRUCTLY_TEST_COMPOSIO_WEBHOOK_SECRET`, `STRUCTLY_TEST_COMPOSIO_TRIGGER_ID`, and `STRUCTLY_TEST_COMPOSIO_USER_ID` proves signed webhook ingestion and trigger queueing.

## Epic 6 - MCP Approved Tools

MCP is a backend bridge to approved remote tools, not arbitrary mobile tool execution.

- Only enabled user-owned `integration_sources` with `source_type = 'mcp'` can be listed or called.
- Only HTTPS Streamable HTTP endpoints are allowed.
- Localhost, private IPs, mismatched server URLs, unsupported transports, and unapproved tools are rejected before any remote call.
- Mobile sees catalogs, approvals, and history, not raw server secrets or arbitrary URLs.

Evidence gate:

- Edge E2E proves auth, user mismatch, transport, host, server mismatch, and allow-list failures.
- Live smoke with `STRUCTLY_TEST_MCP_SERVER_ID` proves tool listing.
- Live smoke with `STRUCTLY_TEST_MCP_TOOL_NAME` and `STRUCTLY_TEST_MCP_TOOL_ARGUMENTS_JSON` proves one approved tool call.

## Epic 7 - Daytona Code Execution

Code execution is backend-owned, approval-gated, and sandboxed.

- Mobile may request a code run but never executes code locally.
- Request payloads strip secret environment keys before persistence.
- Approved runs are executed by `code-execution-runner` with a runner token and configured Daytona sandbox id.
- Results update backend request state and run history.

Evidence gate:

- Local E2E proves mobile execution is false and secret environment values are stripped.
- Edge E2E proves user-scoped request creation, approval-required runs, runner-token rejection for user tokens, Daytona call shape, and status updates.
- Live smoke with `STRUCTLY_TEST_CODE_TRIGGER_ID`, `STRUCTLY_TEST_CODE_RUNNER_TOKEN`, and `STRUCTLY_TEST_DAYTONA_SANDBOX_ID` proves deployed request plus approved sandbox execution.

## Epic 8 - Pixel Release Gate

Android behavior must be measured on a real Google Pixel before release claims.

- Verify app install, launch, foreground location permissions, and absence of background location permission.
- Record grant, denial, revoke, battery-saver, killed-app, offline, and resume behavior.
- Record whether backend worker heartbeat remains fresh while the app is closed.
- Do not claim killed-app or background location behavior from local Node tests.

Evidence gate:

- `npm run test:pixel -- --require-device --require-install --require-location-granted --require-launch`
- `npm run test:pixel -- --require-device --require-install --require-location-denied`
- Manual matrix in `docs/android-pixel-test-plan.md` completed with date, device model, Android version, and observed outcome.

## Sources

- Composio receiving events: https://docs.composio.dev/docs/setting-up-triggers/subscribing-to-events
- Composio triggers: https://docs.composio.dev/docs/triggers
- MCP tools specification: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- Expo Location: https://docs.expo.dev/versions/latest/sdk/location/
- Expo BackgroundTask: https://docs.expo.dev/versions/latest/sdk/background-task/
- Android background location access: https://developer.android.com/develop/sensors-and-location/location/background
- Android background location limits: https://developer.android.com/about/versions/oreo/background-location-limits
- Daytona process/code execution: https://www.daytona.io/docs/en/process-code-execution/
