# T8 (#19) — Daily-usable acceptance rollup

Rollup of Epic #11's five success criteria. Per the epic's resource-gated rule,
criteria 1–2 close as **code-complete; off-LAN/on-device evidence-pending** while
their hardware/hosted gates are open — never as "met" on software proof alone.

## Green gates (this checkout, main `ff9ede1`)

- `npm run test:all` — PASS (acceptance + oauth audit + e2e + edge + pixel self-test)
- `npm run test:e2e` — PASS (incl. the new capture→export loop)
- `npm run audit:oauth` — PASS (no Google OAuth deps)
- `npm run test:live:local` — PASS (11 integration paths against local Supabase)

## Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | ≥5 real receipts → valid `.xlsx`, 6 fields correct | **code-complete; on-device pending** | `.xlsx` export shipped (#13, `0dc0cee`) + round-trip test; loop proven headless (#12, `ff9ede1`); real-receipt on-device capture is the remainder (`docs/dogfood/README.md`) |
| 2 | Loop works off home LAN (hosted backend) | **code-complete; off-LAN pending** | Local backend one-shot PASS (`docs/live-integration-smoke.md`); hosted/cellular BLOCKED — `STRUCTLY_FUNCTIONS_URL` unset (T5 #16) |
| 3 | Graceful degradation on unreachable backend | **MET** | T3 (#14, `c5fd6d0`): safe product copy, review queue retained, CSV/xlsx of prior rows still export offline — proven through the production containment path in `verify-acceptance.js` |
| 4 | Epic 8 Pixel permission matrix (grant/deny/foreground-only) | **BLOCKED (recorded)** | `docs/android-pixel-test-plan.md`: no adb/Pixel device (T6 #17) |
| 5 | `test:all` green at every ticket boundary; secret audit clean; no internal vendor names in user copy | **MET** | Green gates above; copy guard extended to ban provider names (T2/T3); OAuth + secret audits clean |

## Remaining to fully close the epic (operator-owned)

1. **On-device dogfood** (T1/#12 → T4/#15): APK fd4bddf8 on an Android phone,
   ≥3 real receipts, log defects.
2. **Hosted Supabase** (T5/#16): provision a hosted project, set
   `STRUCTLY_FUNCTIONS_URL` + test trigger id, run `test:live -- --require-live`,
   capture the off-LAN cellular loop.
3. **iOS preview** (T7/#18): EAS iOS build on the operator's Mac + Apple Developer
   account.
4. **Pixel permissions** (T6/#17): adb-attached Pixel to fill the strict matrix.

Criteria 3 and 5 are met now. Criteria 1, 2, and 4 are code-complete or
BLOCKED-recorded, pending the operator hardware/credentials above.
