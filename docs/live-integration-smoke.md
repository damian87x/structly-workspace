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

Schedule worker:

```sh
STRUCTLY_TEST_SCHEDULE_TRIGGER_ID="schedule-trigger-id"
STRUCTLY_TEST_SCHEDULE_TOKEN="schedule-worker-token"
```

## What It Verifies

- `status-read` accepts the user token and returns backend status.
- `location-suggestions` records a coarse Pixel-style location suggestion when a trigger id is configured.
- `code-execution-bridge` creates an approval-required backend-owned code request when a trigger id is configured.
- `schedule-jobs` accepts only the worker token and queues one idempotent schedule event when schedule env is configured.
