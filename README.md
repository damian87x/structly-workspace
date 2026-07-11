# Structly

Snap a stack of receipts or a table, and Structly gives you back a clean, verified spreadsheet — with every total checked and every source row traceable — ready to share or export.

iOS-first (React Native / Expo), Android fast-follow. No OAuth, no connectors, no code execution in the MVP: capture → constrained LLM extraction → deterministic `.xlsx`/`.csv` build → preview & inline correction → export.

## Docs

- [`docs/spec.md`](docs/spec.md) — product spec & build plan (v4, corrected after Model Council review)
- [`docs/council/`](docs/council) — Model Council reviews of the v2 spec (Claude Opus 4.8, GPT 5.5, Gemini 3.1 Pro, synthesis) that drove the v3→v4 corrections

## Status

The MVP is built and passing its local gates: sign-in → receipt capture → structured extraction → review & inline correction → verified CSV export, implemented as an Expo/React Native app backed by injectable, fake-tested libraries in `src/lib/` (run `npm test`).

Beyond the MVP, the integration path (worker health, automations, schedules, location suggestions) is code-complete behind evidence gates — see [`docs/integration-roadmap.md`](docs/integration-roadmap.md) and [`docs/mobile-integration-epics.md`](docs/mobile-integration-epics.md). Live-backend and real-device (Pixel) evidence are release gates and are recorded in `docs/live-integration-smoke.md` and `docs/android-pixel-test-plan.md`.
