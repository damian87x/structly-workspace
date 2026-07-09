# Mobile Integration CI

Run the mobile integration gate with:

```sh
npm ci
npm run test:ci
```

`npm run test:ci` delegates to `npm run test:all`, which runs:

- acceptance checks
- OAuth dependency audit
- local integration E2E
- Edge Function handler E2E via `scripts/verify-edge-functions.js`
- Pixel smoke parser self-test via `scripts/verify-pixel-device.js --self-test`

## Manual Release Gate

Before claiming the full mobile integration is release-ready, run:

```sh
npm run test:integration:release
```

This gate runs `test:ci`, `test:live:local`, strict production live smoke with `--require-all-integrations`, and strict Pixel hardware smoke with device, install, foreground location, and launch checks. It is intentionally not part of the default CI path because it requires deployed Supabase Functions credentials and a connected Google Pixel.

## GitHub Actions Template

Adding this workflow requires a GitHub token with `workflow` scope.

```yaml
name: Mobile Integration CI

on:
  pull_request:
    branches:
      - main
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read

jobs:
  test:
    name: Test mobile integration contracts
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Set up Node
        uses: actions/setup-node@v6
        with:
          cache: npm
          node-version: "22"

      - name: Install dependencies
        run: npm ci

      - name: Run acceptance and E2E gates
        run: npm run test:ci
```
