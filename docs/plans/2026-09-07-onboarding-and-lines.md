# Onboarding and lines: how a new owner gets a receptionist that answers

Status: plan for review, not code. Version 2, 2026-09-07, after a second review pass. Grounded in the legacy Chanlytics AI portal (`chanlytics-portal-private`, `Chanlytics-v2`), the current Chanlytics OS channel code, and the vendors' 2026 terms (sources at the end).

## 0. What changed in the second pass

- **Provisioning is a saga, not a chain of calls.** Every line has typed state columns per capability, each provisioning step is idempotent and retryable, a failure leaves a row a person can retry, and a dry-run mode makes every paid vendor call a no-op outside production.
- **One "business on record" form feeds every registration.** Toll-free verification, 10DLC, the hosted-SMS authorization and the port authorization all need the same legal name, EIN or sole-proprietor identity, address, website and contact. Collected once, reused everywhere, shown once.
- **A public opt-in page per workspace.** The carriers ask how customers agree to receive texts, and many owners have no website. The product already has the "say yes to offers" code and keyword; a hosted page with the consent wording gives every registration its proof and gives SMS marketing a lawful basis.
- **SMS in two stages.** First the receptionist replies to people who text first (their message is the consent). Marketing by text comes later, with channel-aware broadcasts, quiet hours and the mandatory footer, only to people who said yes by text or on the opt-in page.
- **Conditional forwarding by default** ("you still pick up when you can"), tap-to-dial codes, a verification rule that does not depend on a carrier flag, and a note about the voicemail timer that breaks forwarding for many owners.
- **Transfer to a person already exists.** The voice shell carries a warm transfer to the profile's handoff number; Setup asks for that number instead of the plan inventing a new tool.
- **WhatsApp on a Chanlytics line uses Meta's own registration calls**, with the code captured from our SMS webhook or spoken to us on a voice call, and the VoIP-number risk stated as the first spike.
- **A provider interface** so the numbers vendor is a choice, not a coupling: Twilio first for its ISV tooling, Telnyx later as a cost lever.
- **Setup shows one next action**, keeps "Later" as a preference rather than a done flag, works on a phone, and reuses a readiness sentence with Today's hero.
- **Stalled registrations get a deadman.** Pending longer than usual becomes "taking longer than usual, we are checking" and a platform notification, the way silent threads do today.

## 1. The summary

- **One page, real states.** A new owner lands on Setup until the receptionist answers on at least one line. Every row reads its state from the workspace: channels, the lines ledger, registrations, the calendar feed, templates, team. Nothing stores a "done" flag; "Later" is a preference that hides a row from Today's line and nothing else.
- **Three ways to get a line, in this order:** a new business line from Chanlytics (answering calls the same day), keep your number (forward calls, text-enable a landline, connect the WhatsApp Business app you already use), or move your number to Chanlytics (a port, 7 to 14 business days, forwarding bridges the wait).
- **Chanlytics owns the numbers.** A Twilio subaccount per workspace, the number bought there, voice handed to Retell over a SIP trunk, SMS on Twilio, WhatsApp registered on the same number through Embedded Signup. One number does calls, texts and WhatsApp. Retell's own numbers are not used for new workspaces because their SMS routes to Retell chat agents, outside the receptionist's brain and the Autonomy rules.
- **Texting waits on carriers, and the page says so in the owner's words.** Every US business text needs a registration. Calls and WhatsApp work the day the line exists; texts follow when the carriers approve, and the row shows the exact state and since when.
- **The receptionist provisions itself.** An endpoint creates the Retell LLM and agent from the voice shell, binds the number and stores the agent; the converger keeps it current. Today that is a script run by hand.
- **The first "aha" is built in.** Call it from your phone, then open the transcript on Live. Text it, then open the reply in the Inbox.

## 2. What the owner experiences

Take a moving company. The owner signs up, names the business, sets hours and services, and gives one number: "Where should the receptionist send callers who insist on a person?" (the warm transfer the voice shell already makes). Setup shows the rows with one next action at the top. The line row asks one question:

> **How should customers reach your receptionist?**
> 1. **Give me a new business line.** Pick a local number in your area code. It answers calls today. Texting starts when the carriers approve, usually within a week. Put it on your website and your trucks.
> 2. **Keep my number.** Forward calls you can't pick up to the receptionist. If your number is a landline, we can text-enable it without moving it. If you already use WhatsApp Business on it, connect that too.
> 3. **Move my number to Chanlytics.** Your number becomes the receptionist's line for calls, texts and WhatsApp. 7 to 14 business days; forwarding covers the wait.

**Path 1.** The owner picks from a short list of available numbers (people care about the digits), the line appears, and the row reads "Answering calls · texting waits on carriers, started today". A card says "Call it: +1 (917) 555-0100" and, after the call, "Heard it? Open the transcript."

**Path 2** splits by what the number is:
- **Calls.** A carrier card with tap-to-dial codes. Conditional forwarding is the default: busy or no answer goes to the receptionist, the owner still answers first (Verizon `*71` + number; T-Mobile `**004*` + number + `#`; AT&T `*92` no answer and `*90` busy, or the GSM codes on some plans). "All calls" is one tap away for owners who want the receptionist to take everything. The card also says the one thing that breaks forwarding: the carrier's no-answer timer must ring shorter than voicemail, and how to check. Then "Test it: call your own number from another phone". The row turns green when a call reaches the line from the owner's own mobile inside the test window; Twilio's `ForwardedFrom` marks it too when the carrier passes it, but the rule does not depend on it.
- **Texts.** A landline or toll-free number can be text-enabled in place (Hosted SMS): calls stay with the carrier, an authorization is signed electronically, up to one business day for a landline, two to three for toll-free. A mobile number cannot; the page says so and offers the new line for texting.
- **WhatsApp.** If they already run the WhatsApp Business app on that number, Embedded Signup's coexistence path connects it, keeps the app and syncs the history; the app must be opened every 13 days and new app accounts may not be eligible yet, which the flow reports. If not, WhatsApp goes on the new line.

**Path 3** opens a port: a bill from the last 30 days, the authorized name and service address, an electronic letter of authorization. The row reads "Port requested · carriers usually take 7 to 14 business days", then the confirmed date. Toll-free ports go through the carrier's manual process; the row says "we file this for you" and a platform notification puts it on a person at Chanlytics.

## 3. Facts the plan stands on

| Fact | Detail | Source |
|---|---|---|
| Hosted SMS | US/CA landline and toll-free only; mobile and VoIP not supported; voice stays with the carrier; landline up to 1 business day, toll-free 2 to 3; electronic LOA, physical service address, ownership check by phone with a token | Twilio Hosted Numbers FAQ |
| Retell numbers | `create-phone-number` buys local or toll-free through Twilio or Telnyx; SMS on Retell Twilio numbers costs $20/month plus $0.01/SMS and routes to Retell chat agents, with A2P handled in Retell's dashboard over 2 to 3 weeks | Retell API and SMS docs |
| Retell import | A Twilio number joins Retell over elastic SIP trunking: termination URI with credentials or IP allowlist, origination to `sip:sip.retellai.com`; SMS stays on Twilio; imported numbers work like Retell's own, including the transfer tool | Retell Twilio docs |
| Transfer | Retell's transfer tool does cold, warm and agentic warm transfers on Retell and imported numbers; the voice shell already configures a warm transfer to the profile's handoff number | Retell transfer docs, `voice-shell.ts` |
| WhatsApp coexistence | Embedded Signup with `featureType: "whatsapp_business_app_onboarding"` keeps the app on the number; history syncs; the app must be opened every 13 days; no blue badge; new app accounts are not eligible at once | Meta docs, 360dialog |
| WhatsApp numbers | Must receive Meta's code by SMS or voice; IVR numbers fail; virtual numbers from established providers work but some fail the SMS check and repeated failures can flag a number, so test before committing; landlines take the voice call | Meta and Twilio docs, provider guides |
| 10DLC (ISV) | TrustHub secondary customer profile per customer, then a brand (STANDARD or SOLE_PROPRIETOR), then a campaign; sole proprietor brands need no EIN, verify by OTP to a mobile within 24 hours, approve in minutes; campaigns 3 to 7 days, weeks when busy; brand $4 to $4.50, campaign vetting $15, $1.50 to $30 a month | Twilio ISV onboarding docs |
| Toll-free verification | Required before any SMS to US/CA from a toll-free number; since 2026-02-17 an EIN for every business type except sole proprietors; a live website with opt-in wording and a clear use case decide approval | Twilio toll-free docs and changelog |
| Porting | US local 7 to 14 business days, up to 4 weeks with rejections; bill within 30 days, LOA matching the carrier's name and address; a ported local number needs 10DLC to text; toll-free ports are manual | Twilio porting docs |
| Forwarding | Verizon `*71`/`*72`; T-Mobile `**61*`/`**67*`/`**62*`/`**004*`; AT&T `*92`/`*90` or the GSM codes; Twilio's voice webhook carries `ForwardedFrom` when the carrier passes it, and not every carrier does | Carrier guides, Twilio voice docs |

## 4. What exists, and what the old portal taught

**Chanlytics OS today.** WhatsApp through Meta's Embedded Signup end to end (code exchange, number registration with a PIN, WABA subscription, credentials in the vault, templates synced and written). A phone receptionist on Retell with the tenant's prompt injected at call time, a warm transfer to the profile's handoff number, post-call analysis fields, and a converger that keeps the live agent equal to the shell. A calendar as an iCal feed. Playbooks, broadcasts, consent with a keyword and a QR code, team invites, notifications, exports, rate limits, an `idempotency_keys` table, realtime repaints for watched tables. No SMS channel (the enum exists, nothing behind it). No number provisioning: Melany's number was bought in Retell and bound by `tooling/scripts/setup_voice.py`, run by hand. `tenant_channels` holds one row per channel with `external_id`, `number_e164`, `waba_id`, `status`, `config`, `credentials_ref`.

**The legacy portal (ai.chanlytics.com) and v2.** Three number options in one dialog: "Managed by Chanlytics" (disabled, "coming soon"), "Import Number" (bring your own Twilio SID and token, encrypted), and "Purchase Number" through Retell with admin approval. Voice on a Twilio number pointed the voice webhook at Retell. WhatsApp on a Twilio number went through a Meta Business Manager ID and a 3 to 7 day approval, outside Embedded Signup. Inbound SMS went to an n8n workflow, not the product's brain. SMS was sold as a Retell add-on at $20/month, gated by Stripe. Nothing registered brands or campaigns, so US texting could not have worked past a first test. The v2 audit lists every Twilio endpoint as missing on the server. The onboarding ran Welcome → Industry → Business info → Agents → Integrations → Team → Complete with mockups for the integrations. Two things were right and are kept: the owner picks a path and the product provisions; a failed provisioning shows a status and a retry. Two were missing and are the point of this plan: the carrier registrations, and telling the owner what the carriers will do.

## 5. Architecture

**A provider interface.** `packages/channels/src/lines.ts` declares `LineProvider`: search numbers, buy, release, create the voice trunk, set messaging webhooks, order hosted SMS, request a port, file registrations, verify a webhook signature. `twilio.ts` implements it first. Telnyx can implement it later as a cost lever without touching the product. A `dry` implementation returns fake SIDs and is the provider outside production (`LINES_DRY_RUN=1`), the way the old v2 kept paid vendors behind flags.

**Lines.** The Twilio master account holds one subaccount per workspace: isolation, per-tenant usage, one place to suspend or release everything. Buying a line is a saga of idempotent steps, each recorded on the row before the next runs: create the subaccount, buy the number, create the elastic SIP trunk (a credential list, a termination URI, origination to Retell), import the number into Retell, bind the tenant's agent, create the messaging service, write the `voice` and `sms` channel rows. A step that fails leaves `voice_state` or `sms_state` at `failed` with `last_error`, a "Retry" verb, and a platform notification; retrying resumes at the failed step because every step checks its own effect before acting. Subaccount and trunk credentials go to the vault through `put_channel_credentials`.

**Voice.** `admin/voice-provision` does what the script does: create the Retell LLM and agent from `voice-shell` with the tenant's webhook URL, events, analysis fields and the warm transfer to the handoff number, bind the number, store the agent id on the `voice` channel row. `voice-converge` already keeps a live agent equal to the shell; provisioning is the first converge. Melany's Retell-owned number stays as it is.

**SMS, stage one: the receptionist replies.** A new `sms` channel on the same conversation and message model as WhatsApp. The provider's messaging webhook lands in `inbound/sms`, which reuses the WhatsApp pipeline: ingest, standing, the Autonomy rules, rate limits, holding messages, escalation. No 24-hour window and no templates; instead the TCPA's quiet hours (the workspace's hours, and never before 8 AM or after 9 PM local), STOP/HELP/START handled by the provider's opt-out and mirrored to consent, and the receptionist's first reply to a new number carrying "Msg&data rates may apply, reply STOP to opt out" once. A person who texts first has asked to be answered; that is the consent for a reply. Until the registration is approved, inbound texts are received and shown in the Inbox as "waiting on carriers", the receptionist does not reply, and Setup shows the count.

**SMS, stage two: marketing.** Broadcasts and playbooks become channel-aware: a WhatsApp send is a template, an SMS send is free text with the footer, and either reaches only people whose yes was recorded for that channel (a keyword by text, or the opt-in page). This is a later step; nothing in stage one sends marketing by SMS.

**Registrations.** Chanlytics registers as an ISV with The Campaign Registry through Twilio. Each workspace gets a TrustHub secondary customer profile from its "business on record", then a brand (sole proprietor when there is no EIN, with the OTP the owner answers on their mobile within 24 hours, shown as a real Setup state), then one "Low Volume Mixed" campaign attached to the messaging service; or a toll-free verification when the line is toll-free. Status arrives by the provider's callbacks and lands on the row; the Setup row and a `setup` notification say what changed. A pending registration older than its usual window becomes "taking longer than usual, we are checking" and a platform notification, the same deadman rule silent threads have.

**The opt-in page.** `/{workspace}/yes` (public, unauthenticated, rate-limited): the business name, one sentence of what texts they will get and how often, the consent wording the carriers look for, the keyword and the QR the product already makes. The registration forms point at it; the receptionist can send it; the QR card on Broadcasts links to it.

**WhatsApp on a Chanlytics line.** Embedded Signup as today. For the verification code, the flow prefers Meta's registration calls on the number we own: request the code by SMS, read it from our SMS webhook (Meta's six-digit code from Meta's sender) and show it inline; if the SMS does not arrive, request it by voice and either read the spoken digits with the provider's speech capture on that call or dial the owner's mobile for ten minutes so they hear it. Virtual numbers sometimes fail Meta's check and repeated failures can flag a number, so this is spike one, and the fallback for a workspace whose line fails is WhatsApp on the owner's own mobile through the coexistence path. Coexistence is a second button on the WhatsApp row.

**Keep my number.** Forwarding needs no provisioning: the carrier card, then a test window in which a call from the owner's own mobile marks the row verified (`ForwardedFrom` is a bonus). Hosted SMS is a provider hosted-number order with the authorization link and callbacks. A port is a port-in request with the bill and the authorization; while the API path is unbuilt, the row reads "we file this for you" and creates a platform notification, so the product is honest before it is automated.

**Security and hygiene.** Provider webhooks are signature-checked (Twilio's `X-Twilio-Signature`, as the old portal did) and rate-limited with the existing buckets. Provisioning verbs are owner-only. Numbers are released and registrations withdrawn when a workspace is deleted; the erase flow gains a line leg. Structured logs carry the tenant and the step. The trade-neutral guard applies to every word on the page.

## 6. The Setup page

**Route and placement.** `setup` under Settings. While any required row is open, an owner signing in lands on Setup (operators and viewers land on Today); Today carries one line with the next action: "Setup · texting waits on carriers, usually 1 to 5 days · Sign the authorization". When the receptionist answers on at least one line, Setup is reachable from Settings only. The page works at phone width: owners onboard on their phones, the forwarding codes are `tel:` links, and the QR is one tap.

**One readiness sentence,** made in contracts and reused by Today's hero standing: "Your receptionist answers calls on +1 (917) 555-0100. Texting waits on carriers. WhatsApp is not connected." Every word in it is a state.

**The rows,** in dependency order, each in the attention row grammar People and Today share: a sentence, a state line, one verb, details that expand inline.

| Row | Reads | States | Verb |
|---|---|---|---|
| Business facts | tenant config | Not started · Ready | Edit in Workspace |
| A person to hand off to | the handoff number in the profile | Not set · Set | Add a number |
| A line for calls and texts | lines, channels, registrations | Choose a path · Number ready · Forwarding: test it / verified · Texting: business on record needed / OTP waiting on you / registration pending since … / approved / rejected (why, resubmit) · Hosted SMS: authorization sent to … / active · Port: requested / date / done · Waiting on us | Get a line · Test it · Sign · Upload the bill · Retry |
| Phone receptionist | voice channel, convergence | Provisioning · Answering · Failed (retry) · Drift (converge) | Call it |
| WhatsApp | `whatsapp` channel, quality, display name, starters | Not connected · Connecting (code shown) · Connected · Name under review · Starters waiting on Meta · Coexistence | Connect · Connect the app you use · Add the starters |
| Calendar | feed state | None · Unreadable · Readable | Paste the feed |
| Team and alerts | memberships, notification settings | Only you · Alerts go to … | Invite · Set alerts |

**States** are four words everywhere: Not started · Waiting on you · Waiting on carriers (or Meta, or us) · Ready. "Waiting on us" is real: a toll-free port, a failed saga step, a stalled registration each create a platform notification, and the row says a person at Chanlytics has it.

**Copy rules.** Say what will happen and when, in the owner's words, with "since" on every wait. "Texting starts when the carriers approve your line, usually within a week" beats "10DLC campaign pending". The registration vocabulary lives in the expanded details. No trade words; the guard checks.

**The aha.** As soon as a line answers: a card "Try your receptionist" with the number, "Call it from your phone", and after the call, "Open the transcript". After a text, "Open the reply in the Inbox". The page keeps this card above the remaining rows.

## 7. Data and code

- **`lines`** (migration): `tenant_id`, `e164`, `kind` (chanlytics · hosted · ported · forwarded), `provider`, provider ids (`subaccount_sid`, `number_sid`, `trunk_sid`, `messaging_service_sid`, `retell_number_id`), typed state columns with CHECKs — `voice_state` (none · provisioning · answering · failed), `sms_state` (none · needs_record · otp_waiting · registering · approved · rejected · hosting · active · failed), `whatsapp_state` (none · connecting · connected · coexistence · failed), `port_state` (none · requested · scheduled · done · rejected), `forwarding_state` (none · instructed · verified) — plus `last_error`, `state_since`, and a small `facts` jsonb for provider details. `tenant_channels` stays the runtime routing table. Realtime `WATCHED` gains `lines`, so a callback repaints Setup.
- **`business_record`** on tenant config: legal name, entity type or sole proprietor, EIN, address, website, contact name and email, the opt-in page URL. One form, every registration.
- **Contracts:** `setupSteps(inputs)` → rows with state, sentence, verb, and the readiness sentence, tested with a truth table; `lineStanding(line)` for the line row's words.
- **Channels:** `LineProvider` and `twilio.ts`, `dry.ts`; `voice-provision` beside the shell.
- **Edge:** `admin/lines/*` (buy, import, register, host, port, retry), `inbound/sms`, `provider/status` (registration, hosted, port callbacks), `admin/voice-provision`, `yes/[workspace]` for the opt-in page.
- **Dashboard:** `/api/v1/setup` gathers inputs; `/api/v1/lines` verbs; the legacy page `setup.jsx` composes rows through the bridge like the day module; the Today line and the hero sentence read the same contracts function.
- **Secrets:** the Twilio master SID and token in the vault, subaccount tokens and trunk credentials per workspace through `put_channel_credentials`, Retell as today.
- **Tests:** truth tables for the states and the readiness sentence; the saga with the dry provider (each step idempotent, a failure resumes at the step); webhook signature tests; an e2e on prod against a staging subaccount that releases what it buys.

## 8. Costs to show the owner

| Item | Cost | Note |
|---|---|---|
| Local number | about $1.15/month | Twilio |
| Toll-free number | about $2.15/month | Twilio |
| SMS | about $0.0083 per segment plus carrier fees | plus $1.50 to $30/month for the campaign |
| Brand and campaign vetting | $4 to $4.50 once, $15 per campaign vetting | sole proprietors $4 |
| Hosted SMS | a small monthly hosting fee | Twilio |
| Porting | free at Twilio | the old carrier may charge |
| Calls | Retell per minute plus the trunk's per-minute rate | as today, plus SIP |

Billing is not built. The page states costs as facts so nothing surprises the owner later; charging is a separate decision.

## 9. Risks, and what to verify first

1. **Meta's code to a Twilio number** (spike one). Register a fresh line with WhatsApp through our Embedded Signup and see whether the SMS arrives; try the voice path; count failures, because repeated failures can flag a number. The fallback is WhatsApp on the owner's own mobile through coexistence.
2. **`ForwardedFrom` over the SIP hop** (spike two). Whether Retell surfaces it after import is unknown; the verification rule does not depend on it, so this only decides how sure the green check is.
3. **Local versus toll-free as the default.** Toll-free text-enables faster and needs no EIN for a sole proprietor, but a moving company wants a local number. Recommended: local by default with 10DLC started the moment the line exists, toll-free offered as "texts sooner".
4. **Chanlytics' own ISV standing** through Twilio gates every texting timeline. A one-time task for you.
5. **Consent wording.** The opt-in page and the first reply's footer carry it; the registration forms point at the page. Legal review of the two sentences is cheap and worth it.
6. **The voicemail timer.** Conditional forwarding fails silently when the carrier's voicemail picks up first; the card explains it, and the test window catches it.
7. **Melany's Retell-owned number.** Leave it; migrating it to a Twilio-owned line is a later, separate port.

## 10. The order of work

Each item is one PR unless marked; each ships with a truth table, the dry provider where a vendor is involved, and an e2e on prod.

0. **The two spikes** — a day, no product code.
1. **Setup page, real states for what exists** — `setupSteps`, the readiness sentence, `/api/v1/setup`, the page, the Today line and hero. The line row offers only "we set it up with you" until step 3. (2 PRs)
2. **Voice provisioning** — `admin/voice-provision`, the handoff-number row, "Call it". (1 PR)
3. **Lines v1: get a new line** — the `lines` migration, `LineProvider` with `twilio.ts` and `dry.ts`, the saga with retry, the chooser and the number picker, the aha card. (3 PRs)
4. **Keep my number: forwarding** — carrier cards, `tel:` codes, the test window and verification. (1 PR)
5. **SMS stage one** — the channel on the conversation model, the pipeline reused, STOP/HELP, quiet hours, the footer, "waiting on carriers" holding. (3 PRs)
6. **Registrations** — business on record, the opt-in page, ISV profile → brand (with the OTP state) → campaign, toll-free verification, callbacks, the deadman. (3 PRs)
7. **Hosted SMS and porting** — "we file it for you" first, then the API path with authorization links, bill upload and status. (2 PRs)
8. **WhatsApp on a Chanlytics line** — code capture from the SMS webhook, the voice path, the coexistence button. (1 PR)
9. **SMS stage two** — channel-aware broadcasts and playbooks, consent per channel. (2 PRs)

Steps 0 to 2 need no vendor accounts. Step 3 needs the Twilio master account and Retell's SIP setup. Step 6 needs Chanlytics' ISV standing.

## 11. Decisions for you

1. Twilio-owned lines per workspace behind a provider interface (recommended) versus Retell-purchased numbers with Retell's SMS add-on (cheaper to build; texts bypass our brain and the Autonomy rules).
2. Local number by default with 10DLC in the background (recommended) versus toll-free by default (texts sooner, less local).
3. Setup as the owner's landing page until a line answers (recommended) versus a Settings pane only.
4. Whether to file Chanlytics' ISV registration now; every texting timeline waits on it.
5. Whether to show line costs on the page before billing exists (recommended: yes, as facts).
6. Whether the opt-in page is hosted under Chanlytics' domain for every workspace (recommended) or only offered to owners without a website.

## Sources

- Twilio Hosted Numbers FAQ: https://www.twilio.com/docs/phone-numbers/hosted-numbers
- Retell, connect Twilio via elastic SIP trunking: https://docs.retellai.com/deploy/twilio
- Retell, create phone number: https://docs.retellai.com/api-references/create-phone-number
- Retell, SMS on numbers: https://docs.retellai.com/deploy/enable-sms
- Retell, transfer call tool: https://docs.retellai.com/build/single-multi-prompt/transfer-call
- Meta, onboard WhatsApp Business app users (coexistence): https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/
- Meta, register a business phone number: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration
- 360dialog, coexistence: https://docs.360dialog.com/docs/resources/phone-numbers/coexistence
- Twilio, WhatsApp senders and number compatibility: https://www.twilio.com/docs/whatsapp/register-senders-using-api and https://help.twilio.com/articles/360026678054
- Twilio, ISV 10DLC onboarding and sole proprietor walkthrough: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv and https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv-api-sole-prop-new
- Twilio, TrustHub secondary customer profile: https://www.twilio.com/docs/trust-hub/trusthub-rest-api/api-create-secondary-customer-profile
- Twilio, toll-free verification onboarding and the 2026 EIN change: https://www.twilio.com/docs/messaging/compliance/toll-free/console-onboarding and https://www.twilio.com/en-us/changelog/business-registration-numbers-required-for-toll-free-messaging-p
- Twilio, port-in timelines: https://support.twilio.com/hc/en-us/articles/223179468-How-long-does-it-take-to-port-a-US-number-to-Twilio
- Twilio, voice request parameters (`ForwardedFrom`): https://www.twilio.com/docs/voice/twiml#request-parameters
- Carrier forwarding codes: https://vettedcalls.com/guides/conditional-call-forwarding-by-carrier and https://bubblyphone.com/hub/call-forwarding-codes
- 10DLC fees and timelines, 2026: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/direct-sole-proprietor-registration-overview-new%20experience and https://www.tychron.com/the-campaign-registry/
