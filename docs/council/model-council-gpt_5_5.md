# GPT spec review: Mobile AI Task Assistant / CueMate-LensAgent

## Verdict

**Recommendation: pivot the MVP, not the company.** The broad product is technically possible if it stays inside explicit camera/upload input plus OAuth/API actions, but the current spec underestimates Google OAuth/CASA, overstates “store-safe,” overstates Apple Intelligence EU lockout, and makes Composio a single point of product, security, quota, and compliance failure. The change I would make is: **ship one narrow, high-frequency workflow first — “scan appointment/letter → editable Gmail draft or Google Calendar event” — using no restricted Gmail scope, no Salesforce, no Drive-wide access, no multi-connector promise, and no B2B/RegTech positioning until Composio data residency and Google verification are proven.**

My go/pivot/kill call is **pivot-to-wedge**: build a 10-day prototype for a narrow workflow, but do not launch the 3-connector freemium product or sell “1,000+ business tools” until OAuth verification, scope design, token failure handling, and vendor exit paths are resolved.

---

## 1. Platform and legal feasibility

### What the spec gets right

The spec is right that an iOS third-party app cannot be a general cross-app super-agent: Apple says all third-party apps on iOS/iPadOS/visionOS are sandboxed, sandboxing is designed to prevent apps from gathering or modifying information stored by other apps, and third-party apps must use services explicitly provided by the OS if they need information outside their own container ([Apple Platform Security](https://support.apple.com/guide/security/security-of-runtime-process-sec15bfe098e/web)). Apple’s file-system guidance also says an iOS app is generally prohibited from accessing or creating files outside its container except through public system interfaces such as Contacts or Music frameworks ([Apple File System Programming Guide](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemOverview/FileSystemOverview.html)).

The spec is also right that Google Play has become hostile to general Accessibility-based agents: Google Play’s AccessibilityService policy says “any use of the Accessibility API that enables an app to autonomously initiate, plan, and execute actions or decisions is strictly prohibited,” except for verified accessibility tools whose core purpose is disability assistance ([Google Play AccessibilityService API policy](https://support.google.com/googleplay/android-developer/answer/10964491)). Google’s same policy explicitly says general assistants, automation tools, antivirus software, password managers, launchers, cleaners, and monitoring apps are not accessibility tools ([Google Play AccessibilityService API policy](https://support.google.com/googleplay/android-developer/answer/10964491)).

The Composio/API direction is therefore the correct architectural direction: OAuth/API calls are much more defensible than Accessibility, overlays, or attempts to observe other apps’ screens.

### What is wrong or overstated

**“Apple Intelligence is frozen out of the EU” is outdated/overbroad.** Apple’s current support page says most Apple Intelligence features are available for European Union residents with iOS 18.4/iPadOS 18.4 or later and macOS Sequoia 15.1 or later, while feature availability varies by platform, language, and region ([Apple Support](https://support.apple.com/en-gb/121115)). The newer EU restriction is narrower: Apple says **Siri AI** will not ship in the EU with iOS 27/iPadOS 27, EU users will still get Siri AI on macOS 27 and visionOS 27, and Apple has no current timeline for Siri AI on EU iPhone/iPad ([Apple Newsroom](https://www.apple.com/newsroom/2026/06/due-to-dma-siri-ai-delayed-in-eu-for-ios-27-and-ipados-27/)).

**The Android “Jan 28 2026” and “Android 17” claims need correction.** The official Google Play AccessibilityService page contains the autonomous-action prohibition, but the official text I found cites the Accessibility declaration requirement from November 3, 2021 and does not show a January 28, 2026 effective date ([Google Play AccessibilityService API policy](https://support.google.com/googleplay/android-developer/answer/10964491)). Google’s Advanced Protection help says Advanced Protection restricts accessibility services to verified accessibility tools and mentions the “Apps that checked for Device protection” feature on **Android 16**, not Android 17 ([Android Help](https://support.google.com/android/answer/16339980?hl=en)).

**“Everything runs through approved APIs, so it is App Store and Play Store safe” is too strong.** Apple requires privacy-policy disclosure of what data is collected, how it is used, all third parties receiving user data, retention/deletion policies, user consent, data minimization, account deletion, and a way to revoke social credentials from within the app ([Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/#privacy)). Google Play requires transparent disclosure of access/collection/use/sharing, secure handling, privacy policy, Data Safety accuracy, account deletion inside and outside the app, and responsibility for third-party code and SDK practices ([Google Play User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311)).

The safer formulation is: **front-door APIs avoid the Accessibility/sandbox rejection path, but store approval still depends on least-privilege scopes, truthful permissions, privacy disclosures, third-party AI disclosure, account deletion, and non-misleading marketing.**

### Platform risk rating

| Claim | Review | Risk |
|---|---:|---:|
| iOS cannot read/control arbitrary apps | Correct | Low |
| Android Accessibility autonomous agents blocked on Play | Correct in substance | Low |
| Jan 28 2026 Play policy date | Not verified in official page | Medium |
| Android 17 Advanced Protection blocks non-accessibility apps | Official page says Android 16; “17” appears wrong | Medium |
| Apple Intelligence frozen out of EU | Overbroad; Siri AI iOS/iPadOS delay is the current issue | Medium |
| API connector app is automatically store-safe | Overstated | High |

---

## 2. Composio dependency risk

Composio is not merely an integration helper in this spec; it becomes the product’s action substrate, auth broker, quota manager, token vault, trigger delivery layer, audit log source, and de facto enterprise compliance answer. Composio’s docs say it provides “1000+ pre-authenticated toolkits,” per-user auth, OAuth/API keys/tokens scoped to each user, and automatic token refresh ([Composio docs](https://docs.composio.dev/)). Composio’s pricing page shows $0/month for 20k tool calls, $29/month for 200k tool calls plus $0.299 per 1k overage, $229/month for 2M tool calls plus $0.249 per 1k overage, and enterprise with custom user accounts, dedicated SLA/SOC 2, custom volume, and VPC/on-prem options ([Composio pricing](https://composio.dev/pricing)).

The raw Composio usage bill is not the problem at MVP scale. If a paid user does 100 scans/month and each scan uses 3 tool calls, that is 300 calls/user/month; 500 active Pro users would be about 150k calls/month, which fits the $29 plan before overages. The real risk is that every failed refresh, provider outage, schema mismatch, shared-quota limit, or vendor incident becomes your user-visible product failure.

Composio’s own custom-auth docs are a red flag for the spec’s “Composio manages consent” shortcut. Composio says its default OAuth app shares quota across all users, has approved scopes that may limit permissions, and exists because OAuth approvals take time; Composio recommends using your own developer app for most production cases because it gives dedicated quota and more granular scope control ([Composio custom auth configs](https://docs.composio.dev/docs/auth-configuration/custom-auth-configs)). That means Composio can accelerate a demo, but it does **not** remove the need to solve Google OAuth verification for a serious branded consumer app.

The security/reliability history also matters. Composio disclosed a May 2026 security incident involving unauthorized access to internal systems, likely access to an auxiliary cache with 5,241 API keys, about 0.3% of active connections leaked, mandatory developer API-key rotation, and customer recommendations to revoke connected account tokens and API keys ([Composio May 2026 incident](https://composio.dev/blog/composio-may-2026-security-incident)). Composio’s status page also shows a July 2026 Gmail trigger regression affecting a subset of `GMAIL_NEW_GMAIL_MESSAGE` triggers and a June 2026 major outage with elevated authentication errors affecting the platform, v3 API, tool execution, Tool Router sessions, tool search, and sandbox for 18 minutes ([Composio status](https://status.composio.dev/), [Composio auth incident](https://status.composio.dev/default/cmqfrexm90d5s2ik788efksz5)). A six-hour May 2026 outage stopped all outgoing webhook/trigger delivery because secret-rotation mitigation severed inter-service communication between trigger and delivery services ([Composio trigger outage](https://status.composio.dev/cmpgk6vx700grpcn90phoc7rm)).

For a UK/Poland RegTech-adjacent builder, the data-residency story is not yet proven on the public pages. Composio’s enterprise page says customers can run Composio on their own cloud for full control over data residency, network boundaries, and compliance requirements ([Composio Enterprise](https://composio.dev/enterprise)). Composio’s public privacy page did not explicitly state data hosting locations, subprocessors, GDPR terms, or DPA details in the content retrieved, although it says Google user data is not used for ads, not sold/shared with third parties, and not used to build or improve AI/ML models ([Composio privacy](https://composio.dev/privacy)).

### Dependency risk table

| Risk | Why it matters | Severity | Mitigation before launch |
|---|---|---:|---|
| Vendor lock-in | ProposedAction objects, tool names, auth references, logs, retries, and failure semantics become Composio-shaped | High | Build an internal `ActionProvider` interface and keep provider-specific schemas behind adapters |
| Shared OAuth quota/default app | Composio default OAuth shares quota and may have limited approved scopes | High | Use custom OAuth for Google before public launch or restrict beta to Composio default limitations |
| Security incident blast radius | Composio had a recent incident affecting API keys/connections | High | Add provider revocation UX, audit export, incident runbook, and kill-switch per connector |
| EU data residency | Public privacy page did not state hosting locations/DPA/subprocessors | High for B2B | Require DPA, subprocessors, region, SCC/IDTA, and VPC/on-prem quote before RegTech pilots |
| Token refresh failures | Token failures become “the app is broken” | Medium | Build `connected_account.expired` handling, reconnect UX, and provider-specific retry taxonomy |
| Rate limits | Default OAuth/shared quota can degrade unpredictably | Medium | Own OAuth apps for Google/Salesforce and log per-provider quota errors separately |

---

## 3. Google OAuth sensitive/restricted scopes and CASA reality

This is the largest execution gap in the spec. Gmail is the trap: Google classifies `gmail.send` as **sensitive**, but `gmail.compose` as **restricted**, and `gmail.compose` is the scope that lets an app manage drafts and send emails ([Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)). Google also classifies `gmail.readonly` and `gmail.modify` as restricted, so reading mail or broad mailbox modification triggers the restricted-scope path ([Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)).

Calendar is easier but still not free: scopes such as `calendar.events`, `calendar.events.owned`, `calendar.app.created`, and full `calendar` are sensitive scopes ([Google Calendar API auth](https://developers.google.com/workspace/calendar/api/auth)). Drive can be designed safely if you use `drive.file`, which Google marks non-sensitive and recommends for per-file app access, but full `drive` is restricted ([Google Drive API auth](https://developers.google.com/drive/api/guides/api-specific-auth)).

Google’s OAuth FAQ estimates sensitive-scope verification at **10 business days** and restricted-scope verification at **6 weeks**, with estimates not guaranteed and dependent on developer responsiveness ([Google OAuth FAQ](https://support.google.com/cloud/answer/13463817?hl=en-uk)). Unverified apps requesting sensitive or restricted scopes are capped at **100 new users over the lifetime of the project**, and Google sign-in can eventually be disabled once the cap is exhausted ([Google OAuth FAQ](https://support.google.com/cloud/answer/13463817?hl=en-uk)).

Restricted scopes add CASA/security assessment. Google says apps requesting restricted scopes must undergo an annual security assessment that verifies secure data handling and deletion upon request, and the security assessment is the final step after other verification requirements are complete ([Google Security Assessment](https://support.google.com/cloud/answer/13465431?hl=en)). Google’s annual recertification page says restricted-scope apps must complete a security assessment every 12 months and that the annual CASA reassessment is a comprehensive test of the app regardless of changes ([Google Annual Recertification](https://support.google.com/cloud/answer/13463816?hl=en)). Google says it does not charge the developer directly, but CASA authorized independent assessors perform the assessment and the cost is agreed between the developer and assessor; annual reassessment scope and cost are then handled with empanelled assessors ([Google OAuth FAQ](https://support.google.com/cloud/answer/13463817?hl=en-uk)).

The spec’s phrase “drafts/create-only where possible” does not automatically avoid restricted-scope friction. `gmail.compose`, the obvious draft-management scope, is restricted, while `gmail.addons.current.action.compose` is non-sensitive but is for managing drafts/sending emails when interacting with a Gmail add-on, not a general native mobile app workflow ([Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)). If the MVP creates a `mailto:` link, exports text to the system share sheet, or creates a draft inside the user’s local Gmail app via user-initiated handoff, it may avoid Gmail restricted scopes; if it creates Gmail drafts through the Gmail API, it likely does not.

**Practical implication:** a public MVP with Gmail drafts + Calendar + Drive + Salesforce is not a 14-day launch; it is either a demo using Composio’s default app and shared constraints, or a production OAuth/CASA program measured in weeks to months.

---

## 4. Product-market fit and differentiation

“Camera → action agent” is a useful user experience, but it is not a durable moat by itself. Apple’s Visual Intelligence already lets supported iPhones interact with text, identify places with the camera, turn a poster into a calendar event, ask ChatGPT, and search Google and supported apps ([Apple Support](https://support.apple.com/en-gb/121115)). Gemini Apps can summarize Gmail, create Google Calendar events, search Google Photos/Samsung Gallery, send messages on Android through default apps or WhatsApp, and control Android utilities such as alarms and settings, with availability varying by device, location, language, and activity settings ([Gemini Apps Help](https://support.google.com/gemini/answer/13695044?hl=en)). ChatGPT Apps already support write actions and default confirmation for important actions such as sending/editing emails, appointments, invitations, uploading files, moving files, making purchases, or changing permissions ([OpenAI Help](https://help.openai.com/en/articles/11487775-connectors-in-chatgpt)).

Google’s Magic Cue is also moving toward the same user promise. Android Authority reports Magic Cue uses AI to proactively suggest information or actions based on what is on screen, is Pixel 10-exclusive in the reported implementation, and Google plans third-party app support with examples like Snapchat; the report also says Magic Cue is not powered directly by the Gemini app and processes information on-device in that demo context ([Android Authority](https://www.androidauthority.com/google-pixel-10-magic-cue-third-party-apps-preview-3675330/)).

The spec’s “action-first, not chat-first” line is good positioning, but not a moat. The real moat, if any, would be one of these:

1. **Workflow ownership:** templates, validation, and repeat workflows for a specific buyer, such as “rental property letters → landlord email + Drive folder + reminder.”
2. **Trust and auditability:** immutable action logs, confidence thresholds, before/after diffs, and undo/revoke flows for regulated teams.
3. **Distribution into a vertical:** accountants, estate agents, clinics, or field teams with repeated document capture needs.
4. **Scope minimization and privacy UX:** visibly safer than ChatGPT/Gemini because it asks for narrower permissions and deletes images by default.

The broad “scan anything → act in 1,000+ apps” pitch is weaker than the narrow “every Monday I process five supplier bills into one exact system” pitch.

---

## 5. Scope realism of the 2-week plan

The 14-day plan is unrealistic for a solo developer if the goal is a stable beta with iOS + Android, backend, camera, vision, action planner, Composio, Gmail, Calendar, Salesforce, RevenueCat, privacy controls, analytics, OAuth testing, TestFlight, Play internal testing, and paid conversion. The critical path is not coding the happy path; it is permissions, auth edge cases, review artifacts, and failure handling.

### Likely slippage points

| Workstream | Spec allocation | Realistic solo estimate | Why it slips |
|---|---:|---:|---|
| Camera + upload + scan storage | 1 day | 2-3 days | Permissions, image compression, retry, upload progress, deletion semantics |
| Vision extraction | 1 day | 2-4 days | Prompting, field confidence, date/time ambiguity, receipts vs letters vs appointment cards |
| Action planner | 1 day | 3-5 days | Tool schema constraints, edit UI, hallucination containment, deterministic validation |
| Composio connect + first action | 2 days | 4-7 days | OAuth callbacks, mobile webviews, token expiry, provider-specific errors |
| Gmail production readiness | 1 day | weeks if own OAuth | `gmail.compose` is restricted and triggers annual security assessment if used ([Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [Google Security Assessment](https://support.google.com/cloud/answer/13465431?hl=en)) |
| Calendar | 1 day | 2-4 days | Sensitive-scope verification for production and edge cases for timezone/reminders ([Google Calendar API auth](https://developers.google.com/workspace/calendar/api/auth), [Google OAuth FAQ](https://support.google.com/cloud/answer/13463817?hl=en-uk)) |
| Salesforce | 1 day | 4-10 days | Org-specific objects, field mappings, sandbox vs production, admin consent, CRM data correctness |
| RevenueCat | 1 day | 2-4 days | Store products, entitlements, sandbox purchase quirks, restore, edge cases |
| Privacy/deletion | 1 day | 3-5 days | Apple/Google account deletion, retention, third-party deletion propagation, privacy labels ([Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/#privacy), [Google Play User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311)) |

A credible solo plan is **2 weeks to a controlled demo**, **4-6 weeks to a narrow public beta**, and **8-12+ weeks to a production-quality multi-connector app with Google verification moving in parallel**.

---

## 6. Monetization, retention, and funnel realism

The proposed prices — £6.99/month for 100 scans and £14.99/month for 500 scans/all connectors — are plausible only if the product saves repeated admin work, not if it feels like a novelty scanner. The free tier of 5 scans/month is reasonable as a taste, but “draft-only” may undercut the core action promise if the user still has to finish everything manually.

The 3-5% free-to-paid target is ambitious for freemium but not absurd. RevenueCat’s 2026 benchmark says freemium apps have a median D35 download-to-paid conversion of **2.1%** and top quartile above **4.5%**, while hard-paywall apps have a **10.7%** median ([RevenueCat State of Subscription Apps 2026](https://www.revenuecat.com/state-of-subscription-apps/)). RevenueCat also reports App Store median D35 conversion of **2.6%** versus Google Play **0.9%**, so the spec’s cross-platform plan should not assume Android install volume converts into subscription revenue ([RevenueCat State of Subscription Apps 2026](https://www.revenuecat.com/state-of-subscription-apps/)).

The 2-week beta target of 50 installs, 60% scan completion, 30% account connection, and 5 paying users implies a **10% install-to-paid conversion** in a tiny warm cohort. That is possible with founder-led beta users, but it is not evidence of scalable WTP unless those users pay after the novelty wears off and repeat workflows show up in logs.

The retention story is currently thin. Receipts, appointment cards, bills, and letters are intermittent; the best retention mechanism is not “history” but **scheduled recurring capture workflows** with templates, reminders, and downstream systems that become costly to abandon. If the app does not own a weekly/monthly workflow, it will behave like a utility: useful, praised, and forgotten.

### Unit-economics lens

At £6.99/month, after app-store fees and taxes, the product likely has limited room for high support burden, repeated LLM calls, and connector failures. Composio call costs are manageable at small scale, but support costs are the hidden killer: every failed Gmail/Calendar/Salesforce action requires debugging across the user’s app, your backend, Composio, Google/Salesforce, OAuth scopes, and possibly Workspace admin policy.

The pricing should be anchored to **workflow value**, not scans. “100 scans” is a vendor-cost framing; “20 completed admin tasks/month” or “unlimited appointment capture + accountant pack” maps better to user value.

---

## 7. Most important change

**Replace the broad connector agent MVP with a scope-minimized wedge:**

> **MVP v1:** scan an appointment card, event poster, or letter; extract fields; show confidence; let the user edit; create a calendar event through a sensitive-only Calendar scope or export via native calendar intent; generate an email draft text locally/in-app without Gmail API draft creation; optionally hand off through the native share sheet/mail compose UI.

This change avoids the Gmail restricted-scope/CASA trap, reduces Composio dependency, makes the 2-week prototype closer to reality, and creates a measurable value loop: scan → corrected fields → event/reminder/email text → repeat.

Salesforce, Drive upload, Gmail API drafts, and RegTech/B2B should be phase 2 only after one workflow shows retention and the Google OAuth path is understood.

---

## Final call

**Go:** build a narrow prototype because camera-first action workflows are useful and feasible under platform rules.

**Pivot:** narrow the launch to one or two actions and remove “1,000+ connectors,” Salesforce, Drive-wide access, and Gmail API drafts from the public MVP.

**Do not proceed as written:** the current spec’s 14-day, 3-connector, freemium, production-style launch assumes away Google verification, Composio operational risk, privacy-review artifacts, and a crowded competitive landscape.

