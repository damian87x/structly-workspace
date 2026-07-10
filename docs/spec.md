# Structly — Corrected Product Spec & Build Plan (v4.1)

**Working name:** Structly
**Owner:** Damian B
**Date:** 04 July 2026 (v4) · 10 July 2026 (v4.1 seat-review corrections)
**Status:** Corrected after Model Council review (Claude Opus 4.8, GPT 5.5, Gemini 3.1 Pro); v4.1 applies the v4 seat-review caveats (GPT-5.5-codex + Gemini seats, both PIVOT-with-fixes — see `docs/council/v4-seat-gpt55-codex.md`, `docs/council/v4-seat-gemini.md`)
**Platforms:** iOS-first (TestFlight → App Store), Android as a fast-follow
**Core principle of this revision:** radical subtraction — ship the one narrow, recurring, trust-sensitive workflow you can own, with the OAuth facts corrected *before* building.

---

## 0. What Changed From v3 (and Why)

The council reviewed v3 and hardened its verdict from v2's "pivot" to two PIVOTs and one KILL, judging v3 "a better demo but a worse MVP." v4 acts on their findings rather than re-litigating them. The corrections:

| v3 mistake | v4 correction | Source of finding |
|---|---|---|
| Free tier = Gmail **drafts** (`gmail.compose` is a **Restricted** scope → triggers CASA) | **No Google OAuth at all in the MVP.** When email ships (Phase 2), use `gmail.send` (**Sensitive**, no CASA), never drafts | [Google Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) |
| "Composio manages consent" | Removed. Composio accelerates the OAuth *flow* but **does not absorb Google verification or CASA** — the app owner does. Composio is out of the MVP entirely | [Composio auth docs](https://docs.composio.dev/docs/authentication) |
| 14-day public launch | **Realistic timeline: ~3-week iOS TestFlight MVP; 6–10 weeks to a verified public launch** once any OAuth scope is added. Android public launch gated by a mandatory 12-tester / 14-day closed test | [Play testing rules](https://support.google.com/googleplay/android-developer/answer/14151465), [Google OAuth FAQ](https://support.google.com/cloud/answer/13463817) |
| Daytona as the Phase-1 "paid hook" | **Daytona demoted to Phase 2.** Launch outputs use deterministic, backend-owned templates — cheaper, faster, more reliable, and no closed-source/EU dependency | Council COGS models; [Daytona closed-source June 2026](https://www.agenticwire.news/article/e2b-vs-daytona) |
| Power tier £17.99 / 500 captures with open analysis | **Removed the margin-negative tier.** Pricing anchored to the £2–£10/mo market with hard usage caps | [SnapTrac](https://apps.apple.com/gb/app/snaptrac-receipt-scanner/id6767394756), [ReceiptsAI](https://receiptsai.com/tools/receipt-scanner) |
| "RegTech-grade" prompt-injection threat model | Dropped the claim. Ships a **minimum-viable security posture** appropriate to a solo MVP; RegTech claims deferred until an actual assessment exists | Council security review |
| "Capture → any output" (8 output types) | **One workflow:** multi-receipt/table capture → verified spreadsheet. Breadth is a Phase-2+ decision, not a launch bet | Council retention/focus finding |

### v4 → v4.1 (seat-review corrections, 10 Jul 2026)

The two v4 seat reviews returned PIVOT-with-fixes. v4.1 applies each finding without changing the strategy:

| v4 defect (seat) | v4.1 correction |
|---|---|
| "Capture" metering ambiguity: Pro could mean 100 jobs × 30 receipts = 3,000 receipts at ~£0.002 each (GPT-5.5) | **Meter per receipt, not per capture-job** — §10 rewritten; conservative caps until COGS measured |
| Golden test pack built Day 13, *after* extraction work (GPT-5.5) | Pack assembled **before** extraction work; it gates Days 5–6 — §11 |
| §9 compliance too thin for App Store + GDPR (GPT-5.5) | §9 expanded: Apple 5.1.1 account deletion, privacy labels, AI-provider disclosure, lawful basis, processor/DPA list, DSAR, retention, breach, transfer basis |
| §15 "Drive/Sheets" could reintroduce restricted-scope creep; Composio option lacked a DPA/residency gate (GPT-5.5) | Phase 3 pinned to **`drive.file` only**; Composio adoption gated on a recorded DPA/subprocessor/EU-residency decision |
| **MTD blind spot**: a generic `.xlsx` is a non-compliant intermediate step — users must re-key into HMRC-recognised software (Gemini) | Export presets are **import-ready for MTD-recognised tools** (Xero/QuickBooks/FreeAgent CSV layouts) in the MVP; Phase 4 targets MTD bridging/recognition — §5, §14, §15 |
| Free FreeAgent (via NatWest/Mettle bank accounts) undercuts £6.99 (Gemini) | Named in §14 risks; positioning sharpened to the pre-accounting "verified pack" step |
| Batch correction of 5–30 receipts on a phone is a UX cliff (Gemini) | Every row carries a source-image reference (already built); flagged-row correction opens the source image alongside the fields — §5, §14 |

---

## 1. One-Line Definition

"Snap a stack of receipts or a table, and Structly gives you back a clean, verified spreadsheet — with every total checked and every source row traceable — ready to share or export."

Not a chatbot, not a super-agent, not a connector platform. A single, reliable **capture → verified spreadsheet** utility for admin-heavy professionals.

---

## 2. The Corrected Strategic Thesis

The council's through-line across v2 and v3: both prior specs aimed rented, undifferentiated infrastructure (Composio + Daytona) at a workflow free incumbents (ChatGPT Advanced Data Analysis, Gemini in Sheets) and purpose-built SaaS (Expensify, Dext) already own — while carrying a launch-blocking compliance error.

v4's defensibility is **not** infrastructure. It is:

1. **Trust and accuracy on financial artifacts** — a visible validation sheet, traceable source rows, confidence flags, and totals reconciliation. This is precisely where a general chatbot is weakest (it hands you a number with no audit trail) and where SnapTrac's "no AI / deterministic parsing" positioning already proves users value trust over cleverness.
2. **Batching + repeat-workflow memory** — the incumbents make you re-prompt each time; Structly remembers your categories, VAT rules, and export format and anchors to a recurring trigger ("monthly VAT-ready pack," "Friday expense close").
3. **A recurring, calendar-anchored habit** — the retention hook v2/v3 lacked.

The bet: win the narrow "trustworthy monthly receipt pack" job first, prove retention and willingness-to-pay, *then* add connectors and a B2B path.

---

## 3. Target User (narrowed)

**Launch persona:** UK sole traders, freelancers, and micro-business owners who compile receipts/expenses on a recurring cadence (monthly VAT prep, quarterly self-assessment, client reimbursement) and currently do it in a manual spreadsheet or a tool they find overkill.

Deferred (Phase 3–4): bookkeepers and finance-ops teams who need connector push (QuickBooks/Xero) and audit trails — the genuine WTP niche, but it demands the reliability and compliance the MVP must first earn.

Explicitly **not** the launch target: the broad "point at anything" consumer, who is already served free by ChatGPT/Gemini.

---

## 4. Scope — In vs. Out (the discipline that protects the timeline)

**In (MVP):**
- Camera + gallery capture of one or many receipts/an itemised table.
- On-device or cloud OCR + a **constrained** extraction step (vendor, date, net, VAT, gross, category).
- Deterministic backend generation of a verified `.xlsx` / `.csv` with a validation sheet.
- Artifact preview + native share/export (share sheet, save to Files, download).
- Local capture history, category memory, and a recurring-pack reminder.
- RevenueCat paywall + quota metering.

**Out (deferred, and to which phase):**
- Any Google/Microsoft OAuth (Gmail, Calendar, Drive) → **Phase 2**, `gmail.send`-first.
- Composio / any connector catalog → **Phase 3**.
- Daytona / AI-generated code execution → **Phase 2**, only for open-ended "analyse any dataset."
- Salesforce / QuickBooks / CRM push → **Phase 4** (the B2B vertical).
- Voice input, chat loop, "any output type" → post-PMF.
- "RegTech-grade" positioning → after a real security assessment.

---

## 5. Core Use Case (single, focused)

**Flagship:** Photograph a stack of 5–30 receipts → Structly extracts each line → produces one `.xlsx` with:
- A **data sheet** (one row per receipt: vendor, date, net, VAT, gross, category, source-image reference).
- A **validation sheet** (extracted-field confidence flags, VAT-math reconciliation, duplicate detection, "needs review" list).
- A **summary sheet** (totals by category, total VAT, period total, ready for VAT return).
→ Preview → user corrects any flagged rows inline → export/share.

**Correction UX (the 30-receipt cliff, addressed):** every row carries its source-image reference, and tapping a flagged row shows the source image *alongside* the editable fields — the user verifies against the actual receipt, never against memory. Correction is triaged (only flagged rows are queued), not a 30-row spreadsheet crawl on a phone.

**Export presets (the MTD reality, addressed):** the pack is an *input* to the user's legally-required MTD-recognised software, so the CSV export ships with **import-ready column presets for Xero, QuickBooks, and FreeAgent** from day one. Structly is positioned as the verification step *before* the books — not a rival system of record — until Phase 4 makes the push direct.

Secondary (same engine): photograph an itemised table → clean `.csv`.

---

## 6. Architecture (v4 — deliberately thin)

```
React Native App (iOS-first; Android fast-follow)
  |-- Capture: camera / gallery (Expo Camera)
  |-- Extraction-result + inline-correction UI
  |-- Artifact viewer (preview / share / save to Files / download)
  |-- RevenueCat paywall + quota meter
  |-- Analytics (PostHog)

Backend (Node.js / Fastify / TypeScript)
  |-- OCR + constrained extraction (vision model -> STRICT JSON schema, no free-form code)
  |-- DETERMINISTIC template engine (openpyxl / exceljs) -> builds .xlsx/.csv
  |     |-- validation pass: VAT math, duplicates, confidence, totals reconciliation
  |-- Supabase Postgres (users, captures, outputs)
  |-- Object storage (generated artifacts, short-lived signed URLs)
  |-- RevenueCat webhooks (entitlements)

External
  |-- Vision/LLM: a cost-appropriate model for extraction ONLY (structured JSON out)
  |-- NO Composio, NO Daytona, NO OAuth in the MVP
```

**Key design decision:** the LLM's only job is **structured extraction into a fixed JSON schema**. It never generates code and never chooses an action. File building is 100% deterministic backend code against fixed templates. This kills the v3 self-verify token cost, removes the margin-negative path, removes the weakest security surface, and produces *more* reliable files.

---

## 7. Data Flow

capture → OCR + constrained extraction (LLM → strict JSON) → deterministic validation + template build (`.xlsx`) → preview + inline correction → user confirms → export/share → local history + category memory update.

No external write actions in the MVP means **no confirmation-of-external-action risk** and **no OAuth verification blocker**.

---

## 8. Minimum-Viable Security Posture (honest, not "RegTech-grade")

The council's core security finding: v3 defended the sandbox while leaving the real exfiltration channel — a poisoned external *action* — protected only by a rubber-stamped confirm dialog. v4 sidesteps this almost entirely by having **no external write actions in the MVP**. The remaining posture:

1. **Treat all extracted text as untrusted data, never instructions.** Structurally delimit OCR output; it feeds a fixed extraction schema, not a planner.
2. **No code generation, no code execution** in the MVP — the entire class of "generated code exfiltrates" risk does not exist yet.
3. **Least data.** Images processed then deleted by default (retain only if the user enables history); artifacts behind short-lived signed URLs.
4. **Golden test pack.** 30–50 known receipts/tables run as a regression suite before every release, so extraction/validation accuracy is measured, not assumed.
5. **Hard caps** on pages/images per job, tokens, file size, and rows — both a cost control and an abuse control.
6. **Audit log** of prompt version, model, token counts, artifact hash, and validation result (for debugging and future compliance, not marketing).

When Phase 2 adds `gmail.send`: add **recipient identity-binding** (the app may only send to the user's own connected address or an address the user typed — never one extracted from a document) as the single highest-leverage control against injection-poisoned payloads.

---

## 9. Privacy & Compliance (accurate)

- **No passwords, no OAuth in MVP.** Nothing to verify, nothing to assess.
- Images/captures deleted after processing unless the user enables history; a **written retention schedule** per data class (images, extracted rows, artifacts, logs) ships with the privacy policy.
- Data export + delete-account controls from day one (GDPR data-subject rights; you are UK/Poland-based).
- No training on user data.
- **When email is added (Phase 2):** ship under Structly's own verified OAuth app using `gmail.send` (Sensitive scope, ~10-business-day verification, **no CASA**). Budget 6 weeks + a CASA assessment (~$540–$4,500/yr) *only* if a Restricted scope (drafts/read/modify) is ever genuinely required — and default to never needing one.
- **EU data residency:** achievable in the MVP because there is no Composio/Daytona dependency; host the backend + storage in an EU region (e.g. Supabase EU, EU object storage) from the start. This keeps the future RegTech B2B door open without an enterprise contract.

**App Store launch requirements (seat finding: these are launch gates, not paperwork-later):**
- **In-app account deletion** (Apple 5.1.1 — mandatory for account-creating apps) — the delete-account control above must be reachable in-app, not via support email.
- **Privacy "nutrition labels"** declaring all data collected *including by third-party SDKs* (photos/user content, financial info, identifiers, diagnostics — Supabase, PostHog, RevenueCat, the vision provider).
- **AI-provider disclosure**: user-facing consent/disclosure that captured images are processed by a third-party AI service (also required by Google Play policy 5.1.1 for the Android follow-up). Product language only — no internal provider names in the UI (see repo copy rule).

**GDPR/UK GDPR posture (named, not implied):**
- **Lawful basis:** contract (Art. 6(1)(b)) for processing captures into artifacts; legitimate interest for product analytics with opt-out.
- **Processor/sub-processor list + DPAs on file:** Supabase (EU), object storage, vision/LLM provider, RevenueCat, PostHog — published in the privacy policy.
- **Cross-border transfers:** if any processor (notably the vision provider) processes outside the UK/EU, rely on SCCs/UK IDTA and say so; prefer EU processing endpoints where offered.
- **DSAR workflow** (export + erasure within statutory deadlines) and a **breach-notification process** (72-hour ICO clock) written down before beta, not after.

---

## 10. Monetization (market-anchored, caps enforced)

The council found market WTP for this workflow is **£2–£10/mo**, and that v3's £17.99/500-capture "analysis" tier was margin-negative. The v4 seat review then caught a metering ambiguity: "100 captures/mo" with 30 receipts/job could be read as 3,000 receipts/month (~£0.002 gross contribution per receipt — margin-negative under any retry/support load). v4.1 closes it:

**Metering rule: the quota unit is the *receipt* (one receipt or table page = one metered unit). A multi-receipt job debits one unit per receipt it contains.** COGS is measured against the golden pack + beta telemetry before any cap is raised; caps below are deliberately conservative and may move up, never silently.

| Tier | Price | Includes | Hard caps |
|---|---|---|---|
| **Free** | £0 | Single-sheet export, watermark on export | **15 receipts/mo**; 5 receipts/job |
| **Pro** | £6.99/mo (or £49/yr) | Validation sheet, category memory, recurring-pack reminder, unwatermarked export, MTD-ready export presets | **300 receipts/mo**; 30 receipts/job; file-size + row caps |
| **Business** (Phase 3+) | TBD after connectors land | Everything in Pro + connector push (Xero/QuickBooks) + audit export | Set at launch of that phase |

- **No lifetime tier** — the council warned it masks a broken product and mismatches usage-based COGS.
- **Monthly-first** (productivity apps are ~77% monthly; annual can hide churn). The £49/yr plan nets only ~£3.47/mo after the 15% commission — keep it, but treat annual-heavy cohorts as a churn-masking signal, and only promote annual after repeat use is proven.
- Deterministic templates keep COGS dominated by a single cheap extraction pass, so Pro margins are healthy at these caps. Every tier has explicit per-receipt and per-job caps so no user can go margin-negative.
- Billing via RevenueCat (free under $2,500 MTR, then 1%).

---

## 11. Realistic Build Plan (iOS-first)

The 14-day public launch is impossible (Android's 12-tester/14-day closed-test gate alone exceeds it, before any OAuth review). This plan targets a **TestFlight beta in ~3 weeks** and a public App Store launch shortly after; Android follows once the closed-test clock has run.

### Week 1 — Capture → extraction → data on screen
- Days 1–2: Expo skeleton, auth (Supabase, email/password — no Google OAuth), navigation, backend repo, EU-region storage. **In parallel: assemble the golden test pack** — 30–50 real receipts/tables with expected JSON, expected `.xlsx` outputs, and pass/fail accuracy thresholds. The pack exists *before* extraction work and gates it (seat finding: building it on Day 13 reverses the quality process).
- Days 3–4: Camera + gallery capture (single + batch), upload, compression, store capture.
- Days 5–6: Vision extraction → strict JSON schema; extraction-result UI with confidence flags. **Exit criterion: golden-pack accuracy thresholds met**, not "demo looks right."

### Week 2 — Deterministic output + correction + paywall
- Days 7–8: Deterministic `.xlsx`/`.csv` template engine (data + validation + summary sheets); VAT math, duplicate detection, totals reconciliation.
- Day 9: Artifact viewer + native share/save-to-Files/download (test on real iOS device — mobile file UX is bug-prone).
- Day 10: Inline correction of flagged rows; category memory.
- Days 11–12: RevenueCat products, entitlement gating, quota metering, restore purchases.

### Week 3 — Trust, polish, beta
- Day 13: Full golden-pack regression run against the release build (the pack itself was built in Week 1); fix any extraction/validation regressions.
- Day 14: Hard caps, audit logging, delete-capture/delete-account, privacy policy.
- Day 15: UX polish — loading, errors, retake, empty states, recurring-pack reminder.
- Days 16–17: TestFlight build, sandbox purchases, PostHog events, landing page.
- Days 18–21: Closed TestFlight beta to 20–50 users; demo video (receipts → verified .xlsx); collect first payments; 5 user interviews.

**Android:** begin the mandatory 12-tester / 14-day closed test in parallel around Week 3 so the gate clears while iOS validates; Android public launch ~4+ weeks after code-complete.

---

## 12. MVP Acceptance Criteria

A user can: install → sign in (email) → photograph a stack of receipts → see extracted rows with confidence flags → correct any flagged row *with the source image shown alongside* → get a verified `.xlsx` (data + validation + summary) → preview → export/share via the native sheet (including an MTD-ready CSV preset) → hit the paywall after the free allowance (15 receipts/mo) → subscribe to Pro and unlock 300 receipts/mo + the validation sheet + category memory. **No OAuth, no external send, no code execution anywhere in this path.** Quotas are metered per receipt, and a multi-receipt job debits one unit per receipt.

---

## 13. Analytics & Success Targets (grounded)

Track: `capture_started`, `capture_completed`, `rows_corrected`, `export_completed`, `paywall_viewed`, `subscribed`, `recurring_pack_reminder_opened`.

- **3-week beta:** 50 installs; ≥60% complete a capture; ≥40% complete an export; ≥5 paying users. Treat "5 of 50 pay" as *keep going*, not *validated* — WTP is confirmed by **repeat use across two billing cycles**, not first purchase.
- **90-day:** 1,000 installs; ~3% first-month free-to-paid (median subscription-app benchmark is ~3 paying subs per 100 installs); the real KPI is **month-2 retention of paying users** and **repeat monthly pack generation**, not raw MRR.
- **Decision gate before Phase 2 (connectors/email):** only invest in OAuth + verification once ≥40% of paying users generate a pack in two consecutive months.

---

## 14. Risks & Mitigations (v4)

| Risk | Mitigation |
|---|---|
| Incumbents (ChatGPT/Gemini) already generate spreadsheets from a photo | Win on **trust**: validation sheet, source-row traceability, VAT reconciliation, repeat-workflow memory — not on novelty |
| Extraction accuracy destroys trust faster than a bad chat reply | Golden test pack + regression gate; inline correction UI; confidence flags surfaced, not hidden |
| Weak retention (episodic scanning) | Anchor to a recurring calendar trigger (monthly VAT / Friday close) + reminders + category memory |
| Margin erosion | Deterministic templates (no self-verify tokens); hard per-job caps; cheap extraction model; no open-ended analysis tier at launch |
| OAuth/CASA blocking launch | **No OAuth in MVP.** Phase 2 uses `gmail.send` (Sensitive, no CASA); Restricted scopes avoided by design |
| EU data residency for future B2B | EU-region hosting from day one; no Composio/Daytona dependency to complicate residency |
| Prompt injection | No external write actions and no code execution in MVP removes the class; identity-bound recipients when email lands |
| **MTD makes a generic spreadsheet a redundant step** (sole traders must file via HMRC-recognised software) | Position as the *verification step before the books*: MTD-ready import presets (Xero/QuickBooks/FreeAgent) in the MVP; Phase 4 targets direct push or MTD bridging-software recognition |
| **Free all-in-one incumbents** (FreeAgent free via NatWest/Mettle; Xero/QuickBooks starter ~£7–£14/mo) | Don't compete as a system of record. Sell the pre-accounting pain: batch capture + visible verification + audit trail, which those suites do poorly; price stays under the starter-plan floor |
| **Batch-correction UX on mobile** (matching 30 physical receipts to 30 rows) | Row↔source-image linking: tapping a flagged row shows the receipt photo next to the fields; only flagged rows enter the correction queue; golden pack measures correction time as a release metric |

---

## 15. Roadmap Beyond MVP (gated on retention)

- **Phase 2 — Delivery + light compute:** `gmail.send` email of the pack (own verified OAuth app, Sensitive scope); Daytona (or E2B, re-evaluated for isolation/EU) *only* for an opt-in "analyse any dataset / custom chart" power feature, behind explicit token/runtime caps.
- **Phase 3 — Connectors:** one non-restricted push path first via direct API or Composio. Google surface is pinned to **`drive.file` only** (non-sensitive, per-file app access — never full `drive`, never Sheets-wide scopes); anything broader reopens restricted review and is out by design. **Composio adoption gate:** before any Composio integration ships, record a decision covering DPA/sub-processor status, EU data-residency tier (their residency is Enterprise/VPC-only), and their May-2026 incident history — and keep it wrapped behind Structly's own adapter interface (already the pattern in the integration substrate) so it stays swappable.
- **Phase 4 — B2B vertical:** the genuine WTP niche — receipts/bills → accountant-ready sheet → **Xero/QuickBooks push with audit trail** for UK bookkeepers and micro-business finance ops. **Destination requirement: MTD.** UK sole traders are legally pushed toward HMRC-recognised software; a generic spreadsheet is an intermediate step. Phase 4 therefore targets either direct push into MTD-recognised tools or Structly itself qualifying as MTD **bridging software** — that is what converts the pack from "data-entry prelude" into the compliance outcome users actually pay for. This is where connectors, EU residency, and (eventually) a real security assessment justify their cost. Sell to 5 design-partner businesses before generalising.
- **Phase 5 — Android power mode (private/B2B only):** unchanged from prior specs — OpenClaw/Termux/ADB automation for private distribution; never in the consumer app.

---

## 16. Launch Wedge (corrected copy)

"Snap your receipts, get a verified spreadsheet. Structly reads every receipt, checks every total, flags anything it's unsure about, and hands you a clean, VAT-ready sheet you can trust — and export anywhere."

Marketing: micro-influencer seeding in UK freelance / small-business / bookkeeping niches; Product Hunt; build-in-public thread. Positioning line: **"connects to nothing, exposes nothing — it just gives you the file, checked."** (A deliberate contrast to connector-heavy agents, echoing the trust angle that already works in this category.)

---

## 17. Final Recommendation

Build the **thin, trustworthy, no-OAuth capture → verified spreadsheet utility** described above. It is genuinely shippable to TestFlight in ~3 weeks (nothing on the critical path requires Google verification, CASA, Composio, or Daytona), its unit economics are safe because outputs are deterministic and capped, and its defensibility is the one thing incumbents don't offer for financial artifacts: **a visible, checkable audit trail plus a remembered recurring workflow.** Prove retention across two billing cycles, then — and only then — spend the compliance and connector budget to climb into the B2B receipts→Xero/QuickBooks vertical, which is where the durable willingness-to-pay actually lives.

The one-line instruction from the whole council: **stop adding architectural layers; subtract down to the single narrow workflow you can own, and get the OAuth facts right before you build.**

---

### Sources (key primary references)
- Google Gmail API scope classifications — [developers.google.com](https://developers.google.com/workspace/gmail/api/auth/scopes)
- Google OAuth verification timelines (Sensitive ~10 days, Restricted ~6 weeks + CASA) — [support.google.com](https://support.google.com/cloud/answer/13463817)
- Google Play closed-testing requirement (12 testers / 14 days) — [support.google.com](https://support.google.com/googleplay/android-developer/answer/14151465)
- Composio authentication (managed vs custom auth) — [docs.composio.dev](https://docs.composio.dev/docs/authentication)
- Daytona moved core closed-source, June 2026 — [agenticwire.news](https://www.agenticwire.news/article/e2b-vs-daytona)
- Market WTP anchors: [SnapTrac](https://apps.apple.com/gb/app/snaptrac-receipt-scanner/id6767394756), [ReceiptsAI](https://receiptsai.com/tools/receipt-scanner)
- Incumbent capability: [Gemini in Google Sheets](https://workspaceupdates.googleblog.com/2026/04/build-and-edit-complex-spreadsheets-with-Gemini-in-Google-Sheets.html), [ChatGPT data analysis](https://www.datastudios.org/post/chatgpt-how-spreadsheets-and-data-analysis-are-handled)
