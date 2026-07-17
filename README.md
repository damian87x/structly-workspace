# Structly

Snap a stack of receipts or a table, and Structly gives you back a clean, verified spreadsheet — with every total checked and every source row traceable — ready to share or export.

iOS-first (React Native / Expo SDK 54), Android fast-follow. No OAuth, no connectors, no code execution in the MVP: capture → constrained LLM extraction → deterministic `.xlsx`/`.csv` build → preview & inline correction → export. Device-signal (location+calendar) permission rationale + unforgeable grant shipped (#20, `6b4bc1b`); Android EAS APK builds; iOS credential-gated (Apple Developer account + real iPhone); hosted/off-LAN backend BLOCKED (evidence-pending).

## Docs

- [`docs/spec.md`](docs/spec.md) — product spec & build plan (v4.1, corrected after Model Council review)
- [`docs/council/`](docs/council) — Model Council reviews of the v2 spec (Claude Opus 4.8, GPT 5.5, Gemini 3.1 Pro, synthesis) that drove the v3→v4 corrections
- [`docs/research/winning-mobile-ai-assistant-app-research.md`](docs/research/winning-mobile-ai-assistant-app-research.md) — deep research: winning mobile AI assistant apps in 2026, noise-reduction features, permission feasibility (iOS/Android/Expo), Reddit demand evidence, competitors, and top-3 feature recommendation
- [`docs/research/inkbox-composio-expo-architecture.md`](docs/research/inkbox-composio-expo-architecture.md) — technical architecture for wiring Composio (read layer) + Inkbox (reach layer: SMS/voice escalation, shield email) into the Expo app

## Status

The MVP is built and passing its local gates: sign-in → receipt capture → structured extraction → review & inline correction → verified `.xlsx`/`.csv` export (CSV is the current in-app default; XLSX with Receipts+Manifest sheets available), implemented as an Expo/React Native app backed by injectable, fake-tested libraries in `src/lib/` (run `npm test`; full gates: `npm run test:all`).

Beyond the MVP, the integration path (worker health, automations, schedules, location suggestions) is code-complete behind evidence gates — see [`docs/integration-roadmap.md`](docs/integration-roadmap.md) and [`docs/mobile-integration-epics.md`](docs/mobile-integration-epics.md). Live-backend and real-device (Pixel) evidence are release gates and are recorded in `docs/live-integration-smoke.md` and `docs/android-pixel-test-plan.md`.
