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

**On-device dogfood: OPEN / in-progress (evidence-pending).**
Owner dogfood is underway on the **SDK 54** build. This is **not** "done" (no
committed ≥5-receipt artifact) and **not** "BLOCKED" (nothing blocks the owner
from running it). The literal T1 acceptance criterion — **≥5** *real* receipts
photographed on a physical phone through `extract-receipt` — has no committed
artifact yet:

- Current path: **Expo Go over LAN** on SDK 54 (or EAS `preview` APK). See
  `docs/mobile-build-runbook.md`. (Stale APK id `fd4bddf8` is superseded.)
- Sign-in: seeded **`demo@structly.app` / `structly-demo-1`**
  (`supabase/seed.sql`, `.env.example`) — not ephemeral test accounts.
- Backend one-shot already proven locally: authenticated `extract-receipt`
  returned all six fields exact against the local stack
  (`docs/live-integration-smoke.md`, 2026-07-11).

**Operator action to close T1:** install/run the SDK 54 app (Expo Go over LAN or
EAS preview APK) on an Android phone on the same LAN, sign in with the seeded
demo account, capture ≥5 real receipts through the loop, and append the log
(rows + observed defects with severity) here. Observed P0/P1 defects feed T4 (#15).

## Related ticket status

- **T4 (#15)** defect triage: **OPEN / pending-on-T1** — no on-device defects yet;
  cannot close until T1 produces a defect log (or a clean ≥5-receipt pass).
- **T5 (#16)** hosted Supabase: local machinery re-verified
  (`npm run test:live:local` green — 11 integration paths); hosted-cloud + cellular
  off-LAN remains **BLOCKED** (`docs/live-integration-smoke.md`:
  `STRUCTLY_FUNCTIONS_URL` unset).
- **T6 (#17)** Pixel adb permissions: **BLOCKED** — no adb/Pixel device
  (`docs/android-pixel-test-plan.md`).
- **T7 (#18)** iOS: **BLOCKED: no Apple Developer account.** Gate is Apple
  Developer credentials + a real iPhone (the operator's Mac alone is not the gate).
- **#20** code merged at `6b4bc1b` (unforgeable location+calendar grant); issue
  close + owner-waiver comment are owner-pending — do not claim the issue closed.
- **#19** docs truth-up: trues-up this ledger; ticket **stays OPEN** until T1
  completes + T4 resolves (or owner re-scopes #19 to docs-only). Epic #11 closure
  gated on T1 evidence + operator-BLOCKED T5/T6/T7.
