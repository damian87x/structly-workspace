# T8 (#19) — Daily-usable acceptance rollup

Rollup of Epic #11's five success criteria. Per the epic's resource-gated rule,
criteria 1–2 close as **code-complete; evidence-pending** while their
hardware/hosted gates are open — never as "met" on software proof alone.

## What #19 does / does not close

Docs trued-up on this checkout (`6b4bc1b` base + this rollup). **#19 the ticket
STAYS OPEN, its T1–T7-terminal AC UNMET (T1 in-progress, T4 pending), closing
only when T1 completes + T4 resolves or the owner re-scopes #19 to docs-only.**
Epic #11 closure stays gated on (a) T1 owner-dogfood evidence (in progress) and
(b) the operator-BLOCKED items T5 #16 / T6 #17 / T7 #18.

## Green gates (this checkout, main `6b4bc1b`, dated 2026-07-16)

Honest-scope qualifiers — these are not full physical/live proofs:

- `npm run test:all` — PASS (acceptance + oauth audit + e2e; pixel path is `--self-test` = **parser only, not a device**)
- `npm run test:e2e` — PASS (capture→export loop = **stub camera + deterministic vision + fake writes**; edge E2E = **source in a VM with injected env/fetch**)
- `npm run audit:oauth` — PASS (no Google OAuth deps)
- `npm run test:live:local` — PASS (**local Supabase mocks**, 11 integration paths — not hosted/cellular)

## Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | ≥5 real receipts → valid `.xlsx`, 6 fields correct | **code-complete; on-device evidence-pending** | Headless loop + typed XLSX proven (`ff9ede1`, `0dc0cee`); ≥5 **physical-phone** receipts NOT yet — owner dogfood in progress on SDK 54, no committed artifact |
| 2 | Loop works off home LAN (hosted backend) | **code-complete; off-LAN evidence-pending — BLOCKED (T5 #16)** | Local backend one-shot PASS (`docs/live-integration-smoke.md`); hosted/cellular unproven — no hosted Supabase |
| 3 | Graceful degradation on unreachable backend | **MET** | T3 (#14, `c5fd6d0`): safe product copy, review queue retained, CSV/xlsx of prior rows still export offline — proven through the production containment path in `verify-acceptance.js` |
| 4 | Epic 8 Pixel permission matrix (grant/deny/foreground-only) | **BLOCKED (T6 #17)** | `docs/android-pixel-test-plan.md`: no adb/Pixel. #20 (`6b4bc1b`) hardens software grant/rationale authority; the real Pixel grant/deny/foreground matrix still needs adb |
| 5 | `test:all` green; secret audit clean; no internal vendor names in user copy | **MET on this checkout** | Green gates above + clean user-facing vendor scan. Historical every-boundary proof is a reviewer audit, not re-proven this run |

## T1–T7 artifact ledger (honest states, 2026-07-16)

| Ticket | State | Artifact / note |
|--------|-------|-----------------|
| T1 #12 | **OPEN / in-progress** | Owner on-device dogfood underway on SDK 54; evidence-pending. Explicitly **NOT done**, **NOT BLOCKED**. Headless software loop: `ff9ede1` |
| T2 #13 | DONE | `.xlsx` export: `0dc0cee` |
| T3 #14 | DONE | Flaky-network containment: `c5fd6d0` |
| T4 #15 | **OPEN / pending-on-T1** | Triages T1 defects; cannot run until T1 produces them |
| T5 #16 | **BLOCKED** — no hosted Supabase | `docs/live-integration-smoke.md` |
| T6 #17 | **BLOCKED** — no adb/Pixel | `docs/android-pixel-test-plan.md` |
| T7 #18 | **BLOCKED: no Apple Developer account** | Gate = Apple Developer credentials + a real iPhone (not the operator's Mac alone) |
| #6 | merged | Rationale-first device signals: `82b5d95` |
| #7 | merged | Schema-versioned CSV ZIP + xlsx Manifest: `994548f` |
| #8 | merged | Location vendor/category suggestions: `a1cb838` |
| #9 | merged | EXIF GPS from gallery: `ce33b29` |
| #20 | code merged `6b4bc1b` | Unforgeable location+calendar grant. **Issue close + owner-waiver comment are owner-pending** (do not claim the issue closed) |

## Remaining to fully close the epic (operator-owned)

1. **On-device dogfood** (T1/#12 → T4/#15): SDK 54 via **Expo Go over LAN** (or EAS `preview` APK) on an Android phone; sign in with seeded **`demo@structly.app` / `structly-demo-1`**; capture **≥5** real receipts; log defects.
2. **Hosted Supabase** (T5/#16): provision hosted project, deploy functions/secrets/JWT settings, set `EXPO_PUBLIC_STRUCTLY_FUNCTIONS_URL`, run live off-LAN cellular proof.
3. **iOS preview** (T7/#18): EAS iOS build — **Apple Developer credentials + a real iPhone** (Mac alone is not the gate).
4. **Pixel permissions** (T6/#17): adb-attached Pixel to fill the strict matrix.

Criteria 3 and 5 are MET with cited evidence. Criteria 1, 2, and 4 remain
code-complete/evidence-pending or BLOCKED — never marked MET on software alone.
