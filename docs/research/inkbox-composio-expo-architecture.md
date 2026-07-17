# Technical Architecture: Inkbox + Composio in the Expo AI Assistant App

## Design principles

- **Composio = the read layer.** Connects to the user's existing accounts (Gmail, Slack, Google Calendar, Outlook, Notion/Linear) via per-user OAuth and delivers triggers/events. It never sends anything to the user.
- **Inkbox = the reach layer.** Gives the assistant its own identity — email address, phone number (SMS + voice), iMessage, public tunnel URL, credential vault. Used only for escalation and the "shield inbox", never for reading the user's accounts.
- **Expo app = the surface.** Onboarding, permissions, priority feed UI, local geofencing, and the app's own push notifications. No secrets, no OAuth tokens, no LLM calls on device.
- **Backend = the brain.** Owns all tokens, receives Composio triggers, runs LLM triage, decides what interrupts the user, and drives the escalation ladder through Inkbox.

```
User's accounts ──▶ Composio ──▶ Backend (triage) ──▶ Expo app (push + digest UI)
(Gmail/Slack/Cal)   OAuth+triggers      │
                                        └──▶ Inkbox (SMS → voice call → shield email)
```

## Components

### 1. Expo app (React Native, Expo SDK, dev build required)

| Concern | Choice | Notes |
|---|---|---|
| Navigation/UI | Expo Router | Priority feed, digest, rules editor, settings |
| Push | `expo-notifications` + Expo Push Service | App's own notifications only; Android 13+ needs `POST_NOTIFICATIONS` runtime permission |
| Geofencing | `expo-location` + `expo-task-manager` | `startGeofencingAsync` for leave/arrive triggers; needs a development build — Expo Go doesn't support background tasks |
| Calendar/contacts context | `expo-calendar`, `expo-contacts` | VIP list built locally; only hashes/IDs of VIP contacts sync to backend |
| Auth to backend | Clerk / Supabase Auth / custom JWT | Session token only — no provider tokens on device |
| Build | EAS Build + config plugins | Needed for background location, notification config, and (later) the Android `NotificationListenerService` native module |

The app never talks to Composio or Inkbox directly. It talks only to your backend API. This keeps API keys server-side and lets you swap providers without an app release.

### 2. Backend (Node/TypeScript)

- **Framework:** Fastify or Hono; deployed on Vercel/Fly/Railway.
- **DB:** Postgres (users, connected accounts, items, rules, escalation state).
- **Queue:** Redis + BullMQ for triage jobs and escalation timers (or Vercel Cron + DB polling to start simpler).
- **LLM triage service:** classify each incoming item as `urgent | needs_response | fyi | newsletter | ignore` with a cheap fast model; escalate borderline cases to a stronger model. Store the classification + one-line summary, not the full body.
- **SDKs:** `@composio/core` (or Composio REST) and the Inkbox TypeScript SDK.

### 3. Composio layer (read)

- One **Composio connected account per user per app** (Gmail, Slack, Google Calendar first). Composio handles OAuth, token refresh, and per-user sessions.
- **Onboarding flow:** app requests connection → backend asks Composio for an OAuth redirect URL → app opens it in `expo-web-browser` → callback lands on backend → connected account stored against the user.
- **Triggers:** subscribe to `gmail.message.new`, Slack mention/DM events, calendar changes. Composio delivers them to a webhook endpoint on the backend.
- **Reads:** on trigger, fetch the minimal payload (subject, sender, snippet, thread metadata) via Composio tool calls; run triage; discard raw content after classification where possible.
- **Actions (phase 2):** archive, label, unsubscribe, draft reply — always behind explicit in-app confirmation (Google Play requires user confirmation before sending messages on the user's behalf).

### 4. Inkbox layer (reach)

- **Identity strategy:**
  - **One org-level "system" identity** for transactional assistant email (free tier users) — cheapest, fine for digest-by-email.
  - **One phone-enabled identity per premium cohort or per premium user** for SMS/voice escalation. Plans are identity-based (Developer: 15 identities, 3 phone-enabled, $25/mo), so per-user identities only make sense for a paid tier; at consumer scale this becomes an Enterprise conversation or a Twilio fallback.
  - **Shield inbox (premium):** provision a dedicated mailbox identity per user (`damian-assistant@yourdomain.com` with a verified custom domain) so newsletters/signups never touch the user's real inbox.
- **Channels used:**
  - **Mail API** — send digests; receive shield-inbox mail; webhook on new message → triage pipeline (same pipeline as Composio items).
  - **SMS** — escalation step 2. $0.03/msg overage; 300 SMS included per phone-enabled identity.
  - **Voice call** — escalation step 3 for truly critical items ("your flight moved", "invoice overdue today"). Real-time audio streaming lets you drive it with a TTS/voice agent.
  - **iMessage** — user texts "connect @agent" to opt in. Caution: unique-recipient caps are per org per month (15 on Developer), so treat iMessage as a niche premium channel, prefer SMS.
  - **Tunnel** — each identity has a stable public URL (`your-agent.inkboxwire.com`). Useful in dev to receive Composio + Inkbox webhooks without ngrok; in production point webhooks at your real backend domain instead.
  - **Vault** — optional store for per-user secrets the agent needs (e.g. TOTP for a service the assistant manages); zero-knowledge, client-side encrypted.

## Key flows

### A. Onboarding (first 5 minutes = activation)

1. Sign up → app auth → backend creates user.
2. "Connect Gmail" → Composio OAuth link → connected account.
3. Backend backfills last 48h of mail, triages, and returns the first briefing: "12 important items in 486 messages."
4. Only then ask for notification permission, then (later, in context) location/contacts.

### B. Ingest → triage → notify

1. Composio trigger (`gmail.message.new`, Slack mention) hits `POST /webhooks/composio`.
2. Verify signature → enqueue triage job.
3. Worker fetches minimal content via Composio, calls LLM classifier, applies user rules (VIPs, quiet hours, current calendar state from cached context).
4. Writes `item` row; if `urgent` → Expo push immediately; else batched into next digest window.

### C. Escalation ladder (the differentiator)

```
urgent item → Expo push
   └─ unacknowledged after N min AND severity ≥ high → Inkbox SMS
        └─ unacknowledged after M min AND severity = critical → Inkbox voice call
```

- Acknowledgement = notification tapped / item opened in app (app reports back to backend, cancels the escalation timer in BullMQ).
- User-configurable per rule: "For calendar conflicts within 1h, call me."
- All escalation messages sent from the assistant's Inkbox number, so the user saves one contact ("My Assistant") and trusts the channel.

### D. Shield email (premium)

1. Provision Inkbox mailbox identity for the user on upgrade.
2. User gives the shield address to newsletters/retailers.
3. Inkbox mail webhook → same triage pipeline → appears only in digest, never as an interruption.
4. Weekly "here's what your shield inbox absorbed" summary — a visible, quantified value moment.

### E. Contextual "don't forget" (mostly on-device)

1. Geofences registered locally via `expo-location`; leave/arrive events fire local notifications offline.
2. On event, app optionally pings backend for context ("leaving work → any personal urgent items held back?") and shows a location-scoped digest.
3. Critical location reminders can opt into the escalation ladder (SMS if the local notification is ignored — covers the "I ignore push" ADHD case).

## Data model (core tables)

- `users` (id, tier, quiet_hours, escalation_prefs)
- `connected_accounts` (user_id, provider, composio_account_id, status)
- `inkbox_identities` (user_id nullable for org identity, identity_id, handle, mailbox, phone, capabilities)
- `items` (user_id, source, external_id, classification, summary, urgency, state: new/notified/acknowledged/archived)
- `rules` (user_id, natural_language_text, compiled_rule_json, enabled)
- `escalations` (item_id, step, channel, sent_at, acknowledged_at)

## Security & privacy guardrails

- Provider tokens live only in Composio; Inkbox API key and LLM keys only on backend; nothing sensitive in the app bundle.
- Store classifications/summaries/metadata, not full message bodies; purge raw payloads after triage.
- Explicit confirmation before any send/archive/unsubscribe action (App Store + Play policy requirement).
- Per-identity Inkbox whitelist/blacklist so only your backend and the user can reach the agent's channels.
- Set an Inkbox overage spend limit in the console so a bug can't burn SMS/call credit.
- Disclose model providers and offer data deletion (delete user → tear down Inkbox identity, revoke Composio accounts).

## Cost & fallback notes

- Prototype entirely on free tiers: Composio dev tier + Inkbox Free (3 identities, no phone) — email digest + shield inbox works day one.
- Beta with voice: Inkbox Developer $25/mo (3 phone-enabled identities shared across beta users).
- Keep an abstraction (`ReachProvider` interface with `sendEmail/sendSms/placeCall`) so Inkbox can be swapped for Twilio/Postmark if pricing or availability (UK numbers) becomes a blocker — Inkbox is a young YC S26 startup.

## Build phases

1. **Phase 1 (2–3 weeks):** Expo app + backend + Composio Gmail/Calendar + LLM triage + Expo push digest. Activation moment in onboarding.
2. **Phase 2:** Slack trigger, natural-language rules compiler, Inkbox org identity for email digests + SMS escalation.
3. **Phase 3:** Geofencing reminders, shield inbox, voice-call escalation as the premium hero feature.
4. **Phase 4 (Android-first):** `NotificationListenerService` native module for the on-device notification firewall.
