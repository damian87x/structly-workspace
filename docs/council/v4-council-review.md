# Model Council Review — Structly Spec (v4)

**Date:** 04 July 2026
**Council seats:** GPT‑5.5 (via Codex CLI — architecture/feasibility/compliance/unit‑economics lens), Gemini (via Gemini CLI — market/competition/retention/UX lens), Claude Fable 5 (synthesis seat — independent review + fact‑checking).
**Subject:** `docs/spec.md` (Structly v4 — capture → verified spreadsheet, iOS‑first, no OAuth).

## Verdict: PIVOT‑IN‑PLACE (3× PIVOT, 0× GO, 0× KILL)

All three seats agree v4 genuinely fixed the v2/v3 factual errors (Gmail scope inversion, "Composio manages consent," impossible 14‑day launch, lifetime tier, margin‑negative Power tier). None recommend killing it. None recommend building it as written. Unlike v2/v3, the required pivot is **a spec rewrite, not a product change of direction** — the no‑OAuth, deterministic‑template architecture survives intact.

## Where the seats agree

| Finding | GPT‑5.5 | Gemini | Claude |
|---|:---:|:---:|:---:|
| v4 fixes every named v2/v3 council finding without regressing on OAuth/Composio | ✓ | ✓ | ✓ |
| The validation sheet is a **feature, not a moat** — replicable by incumbents quickly | ✓ | ✓ | ✓ |
| "VAT‑ready / verified / trust" language overclaims and creates liability | ✓ | ✓ | ✓ |
| Retention hook (monthly pack) is better than v3 but still unproven for a £6.99 habit | ✓ | ✓ | ✓ |
| 3‑week TestFlight plan is optimistic; a demo is plausible, a credible paid beta is not | ✓ | — | ✓ |

## The two findings that must change the spec

### 1. Making Tax Digital is a regulatory iceberg the spec never mentions (Gemini + Claude, independently)

MTD for Income Tax went live **April 2026** for sole traders/landlords with qualifying income over £50k — the exact launch persona of §3. They are legally required to keep **digital records** and submit **quarterly updates via HMRC‑recognised software**; the first quarterly deadline is **7 August 2026**, one month after this review. A spreadsheet alone is not sufficient without bridging software. VAT‑registered traders have been under MTD VAT (digital links rules) since 2022.

- **Threat:** the persona is being pushed by law into FreeAgent (free with NatWest/Mettle bank accounts), Xero, QuickBooks (£7–£14/mo starter tiers) — all of which already bundle receipt capture *and* MTD filing. Structly's generic `.xlsx` becomes a redundant data‑entry prelude to the tool the user must run anyway, at a similar price to the tools that finish the job.
- **Opportunity:** the same fact is the pivot. Deterministic templates can emit **named, upload‑ready import formats for MTD‑recognised software** (Xero bill/bank CSV, FreeAgent expense CSV, QuickBooks import) with zero OAuth and zero connector work — "we get your paper receipts into your MTD software faster than their own capture app." MTD‑bridging‑compatible digital‑record output is also a legitimate positioning claim a generic spreadsheet is not.

Sources: [GOV.UK — MTD for ITSA](https://www.gov.uk/government/publications/extension-of-making-tax-digital-for-income-tax-self-assessment-to-sole-traders-and-landlords/making-tax-digital-for-income-tax-self-assessment-for-sole-traders-and-landlords), [MoneySavingExpert — MTD](https://www.moneysavingexpert.com/family/making-tax-digital/), [Sage — MTD for sole traders](https://www.sage.com/en-gb/blog/self-assessment-ending-making-tax-digital-sole-traders/)

### 2. "Capture" metering quietly re‑creates the margin‑negative tier v4 deleted (GPT‑5.5)

§10 sells Pro as "100 captures/mo" with a "30 receipts/job" cap. If a capture is a *job*, Pro is really **3,000 receipt extractions for £6.99** — ≈£0.002 gross contribution per receipt after the ~15% store fee (≈£5.94 net; the £49/yr plan nets ≈£3.47/mo). One model‑tier upgrade, retry pass, or reprocessing loop makes the tier margin‑negative — the exact failure v4 claims to have removed. Meter **per receipt page**, with every page debiting quota.

## Remaining defects (fix in the spec rewrite)

1. **Internal contradiction — traceability vs deletion (Claude).** §5 promises "every source row traceable" with a source‑image reference in the data sheet; §8/§9 delete images after processing by default. The flagship trust claim breaks unless source images (or at least thumbnails embedded in the pack) are retained for paying users by default.
2. **Validation ≠ verification (Claude).** VAT‑math reconciliation only catches *internally inconsistent* misreads. A receipt whose gross and VAT are both misread consistently passes every check. The golden pack must measure true per‑field accuracy against ground truth, and copy must say "checked for consistency," not "verified."
3. **Golden pack sequenced backwards (GPT‑5.5).** §11 builds it Day 13, after extraction work. It must exist *first* — fixture images, expected JSON, expected `.xlsx`, per‑field accuracy thresholds — and act as the release gate.
4. **Spreadsheet‑injection surface (GPT‑5.5).** Untrusted OCR text written into `.xlsx`/`.csv` cells can carry formula/hyperlink injection (`=HYPERLINK`, `=cmd|`, leading `= + - @`). §8 needs explicit escaping/quoting of all extracted strings.
5. **§9 compliance is a bullet list, not a program (GPT‑5.5).** Needs: lawful basis, processor/sub‑processor list with DPAs (Supabase, storage, AI provider, PostHog, RevenueCat), retention schedule, DSAR/breach workflow, cross‑border transfer basis for the vision‑model call, Apple privacy‑label mapping.
6. **Mobile UX of the core loop is the hardest unbuilt thing (Gemini).** Reconciling 30 physical receipts against 30 rows on a phone, and previewing a 3‑sheet workbook on mobile, can each kill the product alone. Needs tap‑row→see‑source‑image linking as a first‑class design, and honest acceptance that heavy correction may migrate to desktop.
7. **Timeline (GPT‑5.5 + Claude).** Keep 3 weeks only by descoping: the Week‑2 template‑engine allocation (Days 7–8) is understated for data+validation+summary+traceability; either extend to ~4 weeks or cut the summary sheet from the beta.

## Where the seats disagree

- **How central MTD‑software export should be:** Gemini says make the named‑software export *the* primary output and demote generic `.xlsx`; GPT‑5.5 (which weighted economics over market) didn't require it; Claude recommends shipping both — generic `.xlsx` plus 1–2 named import formats (FreeAgent + Xero) — since they share the deterministic engine and the marginal cost is a template each.
- **Severity of the trust moat critique:** Gemini calls the validation sheet "replicable in one prompt"; Claude notes a *product* that does it by default with source images, category memory, and a golden‑pack accuracy record is more durable than a prompt — but agrees it's a head start measured in months, not a moat.

## The single most important change (unified)

> **Rewrite the product contract:** "Snap your receipts → get an upload‑ready pack for your MTD software (FreeAgent/Xero) *and* a checked spreadsheet — 100 receipt **pages**/month on Pro, every page metered, export framed as review‑required bookkeeping prep (not tax advice, not 'verified'), released only when the golden pack passes explicit per‑field accuracy thresholds."

One sentence, five fixes: the MTD dead‑end, the metering hole, the liability language, the backwards quality gate, and the pricing story (£6.99 now buys the *end* of a legally mandatory workflow, not a spreadsheet).

## Action checklist for spec v5

- [ ] Add an MTD section: persona's legal obligations, quarterly cadence, bridging compatibility, named‑software export formats (FreeAgent, Xero) as MVP outputs
- [ ] §10: meter per receipt page; Pro = 100 pages/mo; re‑check COGS at chosen vision model's real prices
- [ ] §11: golden pack moved to Week 1 Day 1–2, with per‑field accuracy thresholds as release gate; extend timeline or cut summary sheet
- [ ] §5/§16: replace "verified / VAT‑ready / trust" with "checked / review‑required / MTD‑software‑ready"; add not‑tax‑advice disclaimer
- [ ] §8: add CSV/xlsx formula‑injection escaping; adversarial fixtures in golden pack
- [ ] §8/§9: resolve image‑deletion vs source‑traceability contradiction (retain sources for Pro by default, or embed thumbnails)
- [ ] §9: expand into a real GDPR program (lawful basis, DPA/sub‑processor table, DSAR, transfers, Apple privacy labels)
- [ ] §5: design the row↔source‑image correction UX before building; prototype 30‑receipt batch flow on a real device
