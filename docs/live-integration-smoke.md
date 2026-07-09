# Live Integration Smoke

The local E2E harness proves the integration contracts without live credentials. Use this smoke test when a deployed Supabase Functions URL and test user are available:

```sh
STRUCTLY_FUNCTIONS_URL="https://PROJECT.supabase.co/functions/v1" \
STRUCTLY_TEST_USER_ID="00000000-0000-0000-0000-000000000000" \
STRUCTLY_TEST_USER_TOKEN="user-access-token" \
npm run test:live
```

To fail when required env is missing:

```sh
npm run test:live -- --require-live
```

## Optional Paths

Location suggestion:

```sh
STRUCTLY_TEST_LOCATION_TRIGGER_ID="location-trigger-id"
```

Code execution request:

```sh
STRUCTLY_TEST_CODE_TRIGGER_ID="code-trigger-id"
```

Approved Daytona execution:

```sh
STRUCTLY_TEST_CODE_RUNNER_TOKEN="backend-runner-token"
STRUCTLY_TEST_DAYTONA_SANDBOX_ID="daytona-sandbox-id"
```

Composio webhook:

```sh
STRUCTLY_TEST_COMPOSIO_TRIGGER_ID="structly-trigger-definition-id"
STRUCTLY_TEST_COMPOSIO_USER_ID="user-id"
STRUCTLY_TEST_COMPOSIO_WEBHOOK_SECRET="composio-webhook-secret-if-configured"
```

Schedule worker:

```sh
STRUCTLY_TEST_SCHEDULE_TRIGGER_ID="schedule-trigger-id"
STRUCTLY_TEST_SCHEDULE_TOKEN="schedule-worker-token"
```

MCP bridge:

```sh
STRUCTLY_TEST_MCP_SERVER_ID="enabled-mcp-source-id-or-source-key"
STRUCTLY_TEST_MCP_TOOL_NAME="optional-approved-tool-name"
STRUCTLY_TEST_MCP_TOOL_ARGUMENTS_JSON='{"receiptId":"receipt-id"}'
```

The MCP smoke expects an enabled `integration_sources` row for the test user with `source_type = 'mcp'`. Its `capabilities` JSON must include a public `serverUrl` and, for tool calls, an `allowedTools` array containing the tool name:

```json
{
  "serverUrl": "https://mcp.example.com/mcp",
  "allowedTools": ["append_receipt"]
}
```

## What It Verifies

- `status-read` accepts the user token and returns backend status.
- `location-suggestions` records a coarse Pixel-style location suggestion when a trigger id is configured.
- `code-execution-bridge` creates an approval-required backend-owned code request when a trigger id is configured.
- `code-execution-runner` runs approved TypeScript code inside the configured Daytona sandbox when runner env is configured.
- `composio-webhook` accepts a signed raw webhook body, persists the integration event, and queues a trigger run when a Structly trigger id is configured.
- `schedule-jobs` accepts only the worker token and queues one idempotent schedule event when schedule env is configured.
- `mcp-bridge` lists tools from an enabled user-owned MCP source, and optionally calls one approved tool when MCP tool env is configured.
