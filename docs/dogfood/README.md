# Dogfood evidence — Epic #11 (daily-usable Structly)

Status ledger for the capture → extract → review → export loop on real hardware.
Software-loop proof is automated; on-device proof is the human-only remainder.

## T1 (#12) — Dogfood the loop on a real phone

**Software loop: PROVEN (automated).**
`scripts/verify-e2e.js` → `verifyCaptureToExportLoop()` (merged `ff9ede1`) drives
capture → extract → review → export end-to-end headless: a stubbed camera image,
an injected deterministic vision client (no live OCR/API), and injected
writeFile/share fakes (no `expo-file-system`). It asserts the extracted row flows
through to both a CSV and a real `.xlsx` (SheetJS round-trip, `gross` typed
numeric). Runs green in `npm run test:e2e` ("Capture-to-export loop E2E passed.").

**On-device dogfood: PENDING (no device in this environment).**
The literal T1 acceptance criterion — ≥3 *real* receipts photographed on a
physical phone through `extract-receipt` — cannot run here: no phone/LAN is
attached to the automated environment. It is not BLOCKED-terminal because the
resource exists on the operator's side:

- Preview APK **fd4bddf8** (profile `preview`, LAN-pinned) is already built
  (`docs/mobile-build-runbook.md`, commit `d9047e7`).
- Backend one-shot is already proven locally: authenticated `extract-receipt`
  returned all six fields exact against the local stack
  (`docs/live-integration-smoke.md`, 2026-07-11).

**Operator action to close T1:** install APK fd4bddf8 on an Android phone on the
same LAN, capture ≥3 real receipts through the loop, and append the log (rows +
observed defects with severity) here. Observed P0/P1 defects feed T4 (#15).

## Related ticket status

- **T5 (#16)** hosted Supabase: local machinery re-verified today
  (`npm run test:live:local` green — 11 integration paths); hosted-cloud + cellular
  off-LAN remains BLOCKED (`docs/live-integration-smoke.md`: `STRUCTLY_FUNCTIONS_URL`
  unset).
- **T6 (#17)** Pixel adb permissions: BLOCKED — no adb/Pixel device
  (`docs/android-pixel-test-plan.md`, 2026-07-11).
- **T7 (#18)** iOS: deferred to the operator's Mac (Apple Developer account).
- **T4 (#15)** defect triage: no defects surfaced by the automated loop; real
  defects await the on-device dogfood above.
