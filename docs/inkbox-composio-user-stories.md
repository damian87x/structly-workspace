# User Stories & Feature Prioritization — Expo AI Assistant (Inkbox + Composio)

## Product thesis (one line)

**"Nothing important ever slips past you — and nothing unimportant ever interrupts you."** The moat is not reading email (everyone does that); it's the **escalation ladder** (push → SMS → voice call) and the **shield inbox**. Everything else is table stakes to earn the right to those two.

---

## Personas

| Persona | Description | Core pain |
|---|---|---|
| **P1 — Overwhelmed Operator** ("Ola") | Startup founder / freelancer / contractor juggling Gmail, Slack, calendar across clients | 400+ messages/day; misses the 3 that actually matter; anxiety-checks inbox constantly |
| **P2 — Notification-Blind** ("Nate") | ADHD-profile user who has trained themselves to ignore push notifications entirely | Push is worthless; needs escalating, harder-to-ignore channels for truly critical items |
| **P3 — Privacy Upgrader** ("Priya") | Premium user tired of newsletters, retail spam, and signup addresses polluting her real inbox | Real email address is burned; unsubscribing is whack-a-mole |

---

## Feature impact ranking

Scored on **Reach × Impact × Confidence / Effort** (RICE-lite, 1–5 scales). This is the "what to build and in what order" answer.

| # | Feature | Reach | Impact | Confidence | Effort | Verdict |
|---|---|---|---|---|---|---|
| 1 | **Onboarding activation briefing** ("12 important in 486 messages") | 5 | 5 | 5 | 2 | **Highest ROI in the product.** Determines whether anyone stays past minute 5. Build first. |
| 2 | **LLM triage + urgent-only push** | 5 | 5 | 4 | 3 | The core engine. Everything downstream depends on classification quality. |
| 3 | **Escalation ladder (SMS → voice)** | 3 | 5 | 4 | 3 | **The differentiator.** No mainstream competitor calls you when your flight moves. Premium hero + P2's entire reason to pay. |
| 4 | **Daily/windowed digest** | 5 | 4 | 5 | 2 | The retention loop — the reason to open the app daily. Cheap once triage exists. |
| 5 | **Shield inbox** | 3 | 4 | 4 | 3 | Premium hero #2; visible, quantifiable weekly value ("absorbed 47 emails for you"). Clear upgrade trigger. |
| 6 | **Natural-language rules** ("For calendar conflicts within 1h, call me") | 4 | 4 | 3 | 3 | Turns triage from generic to personal; drives trust in the ladder. Phase 2. |
| 7 | **VIP list from contacts (on-device)** | 4 | 3 | 5 | 1 | Cheap precision boost for triage; privacy story writes itself (hashes only). |
| 8 | Slack triggers | 3 | 3 | 4 | 2 | Extends reach for P1; same pipeline, marginal cost. |
| 9 | Geofenced "don't forget" reminders | 3 | 3 | 3 | 3 | Nice moment of magic, but reminders apps exist. Phase 3. |
| 10 | Inbox actions (archive/unsubscribe/draft) | 4 | 3 | 3 | 4 | Valuable but policy-heavy (Play confirmation rules); phase 2 behind confirmation UI. |
| 11 | Android notification firewall | 2 | 4 | 2 | 5 | High ceiling, high risk (native module, OEM quirks). Phase 4 — don't let it distract. |
| 12 | Vault / credential store | 1 | 2 | 2 | 3 | Cut from roadmap until a concrete use case demands it. **Won't have** for now. |

**Top-3 bets: (1) activation briefing, (2) triage + urgent push, (3) escalation ladder.** The first two get you activation and retention; the third gets you word-of-mouth and a defensible premium tier.

---

## Epic 1 — Onboarding & Activation (P0)

### US-1.1 · First connection
**As** Ola, **I want** to connect my Gmail in under a minute during signup **so that** the assistant can start working before I lose interest.
- **Given** a new user completes app auth, **when** they tap "Connect Gmail," **then** a Composio OAuth flow opens in `expo-web-browser` and returns to the app with a connected state in ≤ 60 s.
- **Given** the OAuth flow fails or is cancelled, **when** the user returns to the app, **then** they see a retry state — never a dead end.
- No provider tokens ever touch the device (session JWT only).

### US-1.2 · Instant briefing (the activation moment)
**As** Ola, **I want** to see a triaged summary of my last 48 hours of mail immediately after connecting **so that** I feel the value before granting any further permissions.
- **Given** a freshly connected Gmail account, **when** backfill completes, **then** the app shows "N important items in M messages" with the N items listed, within 90 s of connection.
- **Given** backfill is still running, **when** the user waits, **then** a progressive count is shown (not a spinner).
- **P0 metric:** % of connected users who view the briefing (target > 90%).

### US-1.3 · Permission sequencing
**As** Nate, **I want** to be asked for notification permission only after I've seen the briefing **so that** I understand why the app needs it.
- **Given** the briefing has been viewed, **when** the app requests notifications, **then** the request is preceded by a one-line rationale ("So we can ping you only for the urgent ones").
- Location and contacts are requested later, in context (first VIP setup / first geofence), never in onboarding.

---

## Epic 2 — Triage Engine & Priority Push (P0)

### US-2.1 · Automatic classification
**As** Ola, **I want** every incoming email/Slack message classified as urgent / needs-response / FYI / newsletter / ignore **so that** only genuinely urgent items interrupt me.
- **Given** a Composio trigger arrives, **when** the triage worker runs, **then** an `item` row exists with classification + one-line summary within 30 s (p95), and the raw body is purged post-classification.
- **Given** the cheap model's confidence is below threshold, **when** classification is borderline, **then** the item escalates to the stronger model before a push decision.

### US-2.2 · Urgent-only interruptions
**As** Nate, **I want** push notifications only for urgent items **so that** push regains meaning for me.
- **Given** an item classified `urgent`, **when** it's outside quiet hours, **then** an Expo push fires immediately with the one-line summary.
- **Given** quiet hours are active, **when** an urgent item arrives, **then** it's held unless a user rule explicitly overrides ("VIP client → always").
- **P0 metric:** false-interrupt rate (user marks a push "not urgent") < 10%.

### US-2.3 · VIP precision (on-device)
**As** Ola, **I want** to mark VIP contacts from my phone's address book **so that** their messages are never buried.
- **Given** contacts permission granted, **when** the user selects VIPs, **then** only hashes/IDs sync to the backend — never the address book itself.
- **Given** a message from a VIP, **when** triaged, **then** minimum classification is `needs_response`.

---

## Epic 3 — Digest (P0)

### US-3.1 · Windowed digest
**As** Ola, **I want** non-urgent items batched into 2–3 daily digests **so that** I check the app on my schedule, not the inbox's.
- **Given** items classified below `urgent`, **when** a digest window closes, **then** one push + in-app feed groups them by classification, VIP-first.
- **Given** an empty window, **when** it closes, **then** no notification is sent (silence is a feature).

### US-3.2 · Acknowledge & clear
**As** Nate, **I want** to swipe items done in the feed **so that** the assistant learns what I actually cared about.
- **Given** an item is opened/dismissed, **when** the app reports back, **then** state moves to `acknowledged` and any pending escalation timer is cancelled.

---

## Epic 4 — Escalation Ladder (P1, the differentiator)

### US-4.1 · SMS escalation
**As** Nate, **I want** an SMS from my assistant if I ignore an urgent push for N minutes **so that** high-severity items physically reach me.
- **Given** an `urgent` item with severity ≥ high and no acknowledgement after N min, **when** the BullMQ timer fires, **then** one SMS is sent from the assistant's Inkbox number with the summary and a deep link.
- **Given** the item is acknowledged before the timer, **when** the timer fires, **then** no SMS is sent (idempotent cancellation — test this hard).

### US-4.2 · Voice-call escalation
**As** Nate, **I want** a phone call for truly critical items ("flight moved," "invoice due today") **so that** nothing catastrophic slips through even if I ignore everything else.
- **Given** severity = critical and no acknowledgement M min after SMS, **when** the escalation fires, **then** an Inkbox voice call reads the item via TTS and offers "press 1 to acknowledge."
- **Given** the call is answered and acknowledged, **then** the item state updates and the ladder terminates.
- Hard cap: max 1 call per item, max K calls/day per user; Inkbox overage spend limit set in console.

### US-4.3 · Per-rule ladder configuration
**As** Ola, **I want** to define escalation per rule ("calendar conflicts within 1h → call me") **so that** the ladder matches my life, not a default.
- **Given** a natural-language rule, **when** saved, **then** it compiles to `compiled_rule_json`, shows the user a plain-English readback for confirmation, and is testable via a "simulate" button.

### US-4.4 · One trusted contact + SMS opt-in
**As** Nate, **I want** all SMS/calls to come from a single saved number ("My Assistant") **so that** I never dismiss them as spam.
- **Given** first escalation setup, **when** the user opts in, **then** the app offers a one-tap "save contact" card with the Inkbox number **and** instructs the user to text `START` to it — Inkbox requires recipient opt-in via `START` before the agent can message them ([Inkbox phone docs](https://inkbox.ai/docs/capabilities/phone)). Escalation SMS is not armed until the opt-in is confirmed via the consent registry.
- **Given** the user has not texted `START`, **when** an escalation would fire, **then** the ladder falls back to email + repeated push, and the app nags the user to complete SMS opt-in.

### US-4.5 · Trigger-loss safety net
**As** Ola, **I want** the assistant to catch items even if a webhook is missed **so that** "nothing slips through" stays true.
- **Given** Composio triggers can regress (two `GMAIL_NEW_GMAIL_MESSAGE` delivery incidents on their [status page](https://status.composio.dev/history/1) in July 2026 alone), **when** the backend runs, **then** a periodic reconciliation poll (e.g. every 15 min) fetches recent messages and back-fills anything the webhook missed.
- This is cheap insurance for the product's core promise — treat it as P0-adjacent, not optional hardening.

---

## Epic 5 — Shield Inbox (P1, premium)

### US-5.1 · Dedicated shield address
**As** Priya, **I want** a personal `priya-assistant@domain.com` address on upgrade **so that** newsletters and signups never touch my real inbox.
- **Given** a premium upgrade, **when** provisioning completes, **then** an Inkbox mailbox identity exists and the address is copyable from the app within 60 s.

### US-5.2 · Shield mail flows into the same digest
**As** Priya, **I want** shield-inbox mail triaged into my digest (never as interruptions) **so that** I still see anything genuinely useful.
- **Given** mail arrives at the shield address, **when** the Inkbox webhook fires, **then** it enters the same triage pipeline with a `max classification = fyi` cap.

### US-5.3 · Weekly absorption report
**As** Priya, **I want** a weekly "your shield inbox absorbed 47 emails" summary **so that** I can see the value I'm paying for.
- **Given** a week of shield activity, **when** the report generates, **then** it shows count absorbed, top senders, and anything surfaced to digest.
- **P1 metric:** shield users' month-2 retention vs. non-shield premium (expect meaningfully higher — this is the paywall proof).

---

## Epic 6 — Contextual Reminders (P2)

### US-6.1 · Geofenced local reminders
**As** Ola, **I want** "when I leave the office, remind me X" **so that** location-bound tasks fire at the right moment, even offline.
- **Given** a registered geofence, **when** a leave/arrive event fires, **then** a local notification shows without any network round-trip.
- Requires dev build (`expo-location` + `expo-task-manager`); document that Expo Go won't work.

### US-6.2 · Escalating location reminders
**As** Nate, **I want** critical location reminders to join the escalation ladder **so that** ignoring the local push still gets me an SMS.
- **Given** a location reminder marked critical and unacknowledged after N min, **when** connectivity exists, **then** the standard SMS step fires.

---

## Epic 7 — Inbox Actions (P2, phase 2)

### US-7.1 · Confirmed actions
**As** Ola, **I want** one-tap archive / label / unsubscribe from the digest **so that** triage becomes cleanup, not just awareness.
- **Given** any action that modifies or sends on the user's behalf, **when** tapped, **then** an explicit in-app confirmation is required before execution (Play/App Store policy — non-negotiable).
- **Given** a drafted reply, **when** shown, **then** it is editable and never auto-sends.

---

## Verification notes (re-checked against live sources, July 17, 2026)

The original doc was directionally accurate; these are the confirmed facts and the deltas that change design decisions:

**Confirmed ✓**
- Inkbox is YC S26; identities bundle email, tunnel, contacts, and vault on every plan ([YC profile](https://www.ycombinator.com/companies/inkbox), [inkbox.ai/pricing](https://inkbox.ai/pricing)).
- Developer plan: $25/mo, 15 identities, 3 phone-enabled; each phone identity includes 300 SMS/MMS **and 30 call minutes**/mo; overage $0.03/SMS and $0.03/call-minute ([pricing](https://inkbox.ai/pricing)).
- iMessage unique-recipient caps per org/month: 2 (Free), 5 (Hobbyist), 15 (Developer) — confirms treating iMessage as a niche channel ([pricing](https://inkbox.ai/pricing)).
- Composio: per-user OAuth via Connect Link, tokens never touch your code ([Composio guide](https://composio.dev/content/per-user-oauth-for-ai-agents)); `GMAIL_NEW_GMAIL_MESSAGE` trigger + webhook subscriptions with signing secrets and lifecycle events like `connected_account.expired` ([Composio docs](https://docs.composio.dev/reference/api-reference/webhook-subscriptions)).

**Deltas that change the design ⚠**
1. **SMS requires recipient `START` opt-in.** Inkbox agents cannot text a number until it has texted `START` to one of your numbers ([phone docs](https://inkbox.ai/docs/capabilities/phone)). US-4.4 updated: opt-in is now part of escalation onboarding, with an email fallback until confirmed.
2. **Phone numbers are US-centric.** Docs describe 10DLC (a US carrier regime) and third-party comparisons state US-only numbers ([Dial comparison](https://getdial.ai/compare/dial-vs-inkbox)); no published support for UK numbers or international SMS. For a UK-first user base, plan the `ReachProvider` Twilio/Vonage fallback from Phase 2, not "later."
3. **Default 10DLC campaign caps sends at 100 recipients per rolling 24h** across your numbers; your own campaign ($20/mo) lifts it ([phone docs](https://inkbox.ai/docs/capabilities/phone)). Fine for beta, a real ceiling at scale.
4. **Shield inbox is identity-capped.** Developer = 15 identities total, so per-user shield mailboxes support ~a dozen premium users before an Enterprise conversation. Custom domains cost $4/mo each ([domain docs](https://inkbox.ai/docs/capabilities/email/custom-email-domains)).
5. **Composio Gmail trigger had two delivery regressions in early July 2026** ([status page](https://status.composio.dev/history/1)). New story US-4.5 adds a reconciliation poll as a safety net.
6. **Voice is bring-your-own-agent**: Inkbox opens a WebSocket to a URL you host (STT/TTS managed by default, opt-out via headers) — so US-4.2 requires a live voice-agent endpoint on your backend, not just an API call ([phone docs](https://inkbox.ai/docs/capabilities/phone)).

## Won't have (v1) — say it out loud

- **Vault/credential store** — no concrete use case yet; pure complexity.
- **iMessage channel** — per-org unique-recipient caps (verified: 2/5/15 per month on Free/Hobbyist/Developer) make it a demo, not a channel. Revisit at Enterprise pricing.
- **Silent autonomous actions** — trust architecture requires explicit confirmation for anything that sends/deletes (consistent with your Hermes trust principles).
- **iOS notification firewall** — platform doesn't allow it; don't imply parity with the Android phase-4 feature.
- **Per-user phone identities on free tier** — economics don't work below premium; free tier = email + push only.

---

## Success metrics (top of funnel → moat)

| Stage | Metric | Target |
|---|---|---|
| Activation | Connect → briefing viewed | > 90% |
| Activation | Signup → Gmail connected | > 60% |
| Trust | False-interrupt rate on urgent pushes | < 10% |
| Retention | D7 app-open (digest habit) | > 40% |
| Differentiator | % urgent items acknowledged before SMS step | 60–80% (too high = SMS unneeded; too low = triage broken) |
| Premium | Shield-inbox attach rate among premium | > 50% |
| Premium | Escalation rule created within first week (premium) | > 70% |
| Safety | Escalation cost per user per month | Below Inkbox included quota (300 SMS/identity) |

---

## Sequencing recommendation (mapped to your build phases)

- **Phase 1 = Epics 1–3** (US-1.1→3.2). Ship the activation briefing before anything else — it's the cheapest, highest-leverage item on the board.
- **Phase 2 = Epic 4 (SMS only) + US-4.3 rules + US-4.5 reconciliation poll + Slack trigger.** Ship SMS escalation before voice; it proves the ladder mechanic at 1/10th the complexity. Build the `ReachProvider` abstraction with a Twilio/Vonage adapter stub now — Inkbox numbers are US-centric and your first users are UK-based.
- **Phase 3 = Voice call (US-4.2) + Epic 5 + Epic 6.** Voice + shield inbox launch together as the premium tier story.
- **Phase 4 = Epic 7 actions + Android firewall.** Only after the ladder and shield have paying users.
