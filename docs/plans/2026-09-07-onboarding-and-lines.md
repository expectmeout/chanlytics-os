# Onboarding and lines: how a new owner gets a receptionist that answers

Status: plan for review, not code. Written 2026-09-07 after reading the legacy Chanlytics AI portal (`chanlytics-portal-private`, `Chanlytics-v2`), the current Chanlytics OS channel code, and the vendors' 2026 terms.

## 1. The summary

- **One page, real states.** A new owner lands on Setup until the receptionist is answering on at least one line. Every row reads its state from the workspace (channels, registrations, the calendar feed, templates, team). Nothing stores a "done" flag.
- **Three ways to get a line, in this order:** get a new business line from Chanlytics (instant), keep your number (forward calls, text-enable a landline, connect the WhatsApp you already use), or move your number to Chanlytics (a port, 7 to 14 business days). The owner picks once; each path shows its own honest timeline.
- **Chanlytics owns the numbers.** One Twilio subaccount per workspace, numbers bought there, voice handed to Retell over a SIP trunk, SMS on Twilio, WhatsApp registered on the same number through Embedded Signup. One number does calls, texts and WhatsApp. This replaces the legacy portal's three half-paths (bring your own Twilio, "managed, coming soon", Retell purchase with admin approval).
- **Texting is gated by carriers, and the page says so.** Every US business text needs a registration (toll-free verification, or 10DLC brand plus campaign). Calls and WhatsApp work the day the line exists; texts follow when the carriers approve, and the page shows the exact registration state.
- **The phone receptionist is provisioned by the product, not by a script.** An edge endpoint creates the Retell LLM and agent from the voice shell, binds the number, and the converger keeps it current. Today this is `setup_voice.py`, run by hand.
- **The first "aha" is built in.** Once a line exists, the page invites the owner to call it and text it from their own phone, and shows the transcript on Live and the reply in the Inbox.

## 2. What the owner experiences

Take a moving company. The owner signs up, names the business, sets hours and services. Setup shows six rows. The second row asks one question:

> **How should customers reach your receptionist?**
> 1. **Give me a new business line.** A local number in your area code, answering calls today. Texting starts when the carriers approve, usually within a week. You can put it on your website and your trucks.
> 2. **Keep my number.** Forward your calls to the receptionist when you can't pick up. If your number is a landline, we can text-enable it without moving it. If you already use WhatsApp Business on it, connect that too.
> 3. **Move my number to Chanlytics.** Your number becomes the receptionist's line for calls, texts and WhatsApp. Takes 7 to 14 business days; forwarding bridges the wait.

Path 1 is the default and the fastest. The owner picks an area code, the line appears, and the row turns to "Answering calls · texting waits on carriers (started today)". A card under it says "Call it: +1 (917) 555-0100" and, after the call, "Heard it? Open the transcript on Live."

Path 2 splits by what the number is:
- **Calls:** a carrier card with the exact codes (Verizon `*71` + number for busy/no answer, `*72` for all; T-Mobile `**004*number#` for all conditional; AT&T `*92` no answer / `*90` busy) and a "Test: call yourself" verb. When the forwarded test call lands on the line, the row turns green on its own. Twilio passes `ForwardedFrom` on carrier-forwarded calls, though not every carrier includes it, so the fallback is "the call came from your own mobile within the test window".
- **Texts:** if the number is a landline or toll-free, Hosted SMS text-enables it while voice stays with the carrier (a signed authorization, up to one business day for landlines, two to three for toll-free). If it is a mobile, Hosted SMS is not available; the page says so and offers the new line for texting.
- **WhatsApp:** if they already run the WhatsApp Business app on that number, Embedded Signup's coexistence path connects it without losing the app or the history. If not, WhatsApp goes on the new line.

Path 3 opens a port request: a bill from the last 30 days, the authorized name and service address, an electronic letter of authorization. The row shows "Port requested · carriers usually take 7 to 14 business days", then the FOC date when the carrier gives one. Forwarding from path 2 covers the gap.

## 3. Facts the plan stands on

| Fact | Detail | Source |
|---|---|---|
| Hosted SMS | US/CA landline and toll-free only; mobile not supported; voice stays with the carrier; landline up to 1 business day, toll-free 2 to 3; electronic LOA, service address, ownership check by phone | Twilio Hosted Numbers FAQ |
| Retell numbers | `create-phone-number` buys local or toll-free through Twilio or Telnyx; SMS on Retell Twilio numbers costs $20/month per number plus $0.01/SMS and routes to Retell chat agents, with A2P handled in Retell's dashboard, 2 to 3 weeks | Retell API and SMS docs |
| Retell import | A Twilio number joins Retell over elastic SIP trunking: termination URI plus credentials or IP allowlist, origination to `sip:sip.retellai.com`; SMS stays on Twilio | Retell Twilio docs |
| WhatsApp coexistence | Embedded Signup with `featureType: "whatsapp_business_app_onboarding"` keeps the WhatsApp Business app alive on the same number; history syncs; the app must be opened every 13 days; no blue badge; new app accounts are not eligible at once | Meta docs, 360dialog |
| WhatsApp numbers | Must receive Meta's code by SMS or voice; IVR numbers fail; some virtual numbers fail the SMS check; landlines take the voice call | Twilio WhatsApp senders docs |
| 10DLC | Brand 1 to 3 days (sole proprietor: minutes, OTP to a mobile, no EIN); campaign 3 to 7 days, weeks when busy; brand $4 to $4.50, campaign vetting $15, $1.50 to $30 a month | Twilio 10DLC docs |
| Toll-free verification | Required before any SMS to US/CA from a toll-free number; since 2026-02-17 a business registration number (EIN) for every business type except sole proprietors; a real website and opt-in wording matter | Twilio toll-free docs and changelog |
| Porting | US local 7 to 14 business days, up to 4 weeks with rejections; bill within 30 days, LOA matching the carrier's name and address; local numbers need 10DLC to text after the port; toll-free ports are manual | Twilio porting docs |
| Forwarding | Verizon `*71`/`*72`; T-Mobile `**61*`/`**67*`/`**62*`/`**004*`; AT&T `*92`/`*90` or the GSM codes; Twilio's voice webhook carries `ForwardedFrom` when the carrier passes it | Carrier guides, Twilio voice docs |

## 4. What exists, and what the old portal taught

**Chanlytics OS today.** WhatsApp through Meta's Embedded Signup end to end (code exchange, number registration with a PIN, WABA subscription, credentials in the vault, templates synced and written). A phone receptionist on Retell with a per-tenant prompt injected at call time, post-call analysis fields, a converger that keeps the live agent equal to the shell. Calendar as an iCal feed. Playbooks, broadcasts, consent, team invites, notifications, exports, rate limits. No SMS channel (the enum exists, nothing behind it). No number provisioning: Melany's number was bought in Retell and bound by `tooling/scripts/setup_voice.py`, run by hand. `tenant_channels` holds one row per channel with `external_id`, `number_e164`, `waba_id`, `status`, `config`, `credentials_ref`.

**The legacy portal (ai.chanlytics.com) and v2.** It offered three number options in one dialog: "Managed by Chanlytics" (disabled, "coming soon"), "Import Number" (bring your own Twilio SID and token, encrypted), and "Purchase Number" through Retell with admin approval. Voice on a Twilio number pointed the voice webhook at Retell. WhatsApp on a Twilio number went through a Meta Business Manager ID and a 3 to 7 day approval, outside Embedded Signup. Inbound SMS went to an n8n chat workflow, not to the product's own brain. SMS was sold as a Retell add-on at $20/month, gated by Stripe. Nothing registered brands or campaigns, so US texting could not have worked past the first test. The v2 audit lists every Twilio endpoint as missing on the server. The onboarding was Welcome → Industry → Business info → Agents → Integrations → Team → Complete, with mockups for integrations rather than live states. The lesson: the shape was right (an owner picks a path, the product provisions), the plumbing behind it was never finished, and it never told the owner what the carriers would do.

## 5. Architecture

**Lines.** A Twilio master account holds one subaccount per workspace (isolation, per-tenant usage, credentials in the vault through `put_channel_credentials`). Buying a line: search by area code, buy, create the workspace's elastic SIP trunk (termination URI with a credential list, origination to Retell), import the number into Retell with `import-phone-number`, bind the tenant's agent, write `tenant_channels` rows for `voice` and `sms`, and a `phone_lines` ledger row. Melany's Retell-owned number stays as it is; new workspaces get Twilio-owned lines. Retell's own numbers are not used for new workspaces because their SMS routes to Retell chat agents rather than to the receptionist's brain and policies.

**Voice.** `admin/voice-provision` does what the script does: create the Retell LLM and agent from `voice-shell` with the tenant's webhook URL, events and analysis fields, bind the number, store the agent id on the `voice` channel row. `voice-converge` already keeps a live agent equal to the shell; provisioning becomes the first converge.

**SMS.** A new `sms` channel on the same conversation and message model as WhatsApp: Twilio's messaging webhook lands in an `inbound/sms` handler that reuses the WhatsApp pipeline (ingest, standing, policies, rate limits, holding messages, escalation), minus the 24-hour window and templates. Outbound goes through a Messaging Service per workspace. STOP/HELP/START are handled by Twilio's advanced opt-out and mirrored to consent. Quiet hours follow the workspace's hours. Until the registration is approved, inbound texts are received and shown in the Inbox as "waiting on carriers", the receptionist does not reply, and the owner sees the count.

**Registrations.** Chanlytics registers with The Campaign Registry as an ISV through Twilio. Each workspace gets a brand (sole proprietor when there is no EIN, with the OTP to the owner's mobile) and one customer-care/mixed campaign, or a toll-free verification when the line is toll-free. Status arrives by Twilio status callbacks and lands on the `phone_lines` row; the Setup row and a `setup` notification say what changed.

**WhatsApp on a Chanlytics line.** Embedded Signup as today. Meta sends the verification code to the line; the SMS webhook recognizes Meta's six-digit code and shows it inline ("Your code: 123 456"). If the SMS check fails, the page offers the voice call: for ten minutes the line's voice webhook dials the owner's mobile so they hear the code. Coexistence is a second button on the WhatsApp row for owners who already run the Business app on their own number.

**Keep my number.** Forwarding needs no provisioning: the carrier card, then a test window in which a call from the owner's own mobile, or one carrying `ForwardedFrom`, marks the row verified. Hosted SMS is a Twilio hosted-number order with the LOA link and status callbacks. A port is a Twilio port-in request with the bill upload and LOA; toll-free ports go through support and the row says "we file this with the carrier for you".

## 6. The Setup page

**Route and placement.** `setup` under Settings. While any required row is open, signing in lands on Setup and Today carries one line: "Setup · 3 of 6 done — texting waits on carriers, usually 1 to 5 days". When the receptionist answers on at least one line, Setup is reachable from Settings only.

**The rows,** each in the attention row grammar People and Today already share: a sentence, a state line, one verb, details that expand inline.

| Row | Reads | States | Verb |
|---|---|---|---|
| Business facts | tenant config | Not started · Ready | Edit in Workspace |
| A line for calls and texts | phone_lines, tenant_channels, registrations | Choose a path · Number ready · Forwarding: test it / verified · Texting: registration pending (state, since when) / approved / rejected (why, resubmit) · Hosted SMS: LOA sent / active · Port: requested / FOC date / done | Get a line · Test it · Sign the authorization · Upload the bill |
| WhatsApp | tenant_channels `whatsapp`, WABA quality, display name review, templates | Not connected · Connecting (code shown) · Connected · Name under review · Starters awaiting Meta | Connect · Add the starters |
| Phone receptionist | voice channel, agent convergence | We set it up · Answering · Drift (converge) | Call it |
| Calendar | feed state | None · Unreadable · Readable | Paste the feed |
| Team and alerts | memberships, notification settings | Only you · Alerts go to … | Invite · Set alerts |

**States** are four words everywhere: Not started · Waiting on you · Waiting on carriers (or Meta, or us) · Ready. "Waiting on us" is real: toll-free ports and a failed provisioning create a platform notification and the row says a person at Chanlytics has it.

**Copy rules.** Say what will happen and when, in the owner's words. "Texting starts when the carriers approve your line, usually within a week" beats "10DLC campaign pending". The exact registration vocabulary lives in the expanded details for anyone who wants it. No trade words.

**The aha.** As soon as a line answers: a card "Try your receptionist" with the number, "Call it from your phone", and after the call, "Open the transcript". After a text: "Open the reply in the Inbox". This is the moment the owner understands the product; the page keeps it above the remaining rows.

## 7. Data and code

- `phone_lines` (migration): `tenant_id`, `e164`, `kind` (chanlytics · hosted · ported · forwarded), `provider`, `twilio_subaccount_sid`, `twilio_sid`, `retell_number_id`, `sip_trunk_sid`, `messaging_service_sid`, `capabilities` jsonb, `sms_registration` jsonb (kind, brand, campaign, tfv, statuses, since), `hosted_order` jsonb, `port` jsonb, `forwarding` jsonb (source, mode, verified_at), timestamps. `tenant_channels` stays the runtime routing table.
- Contracts: `setupSteps(inputs)` → rows with state, sentence, verb; tested with a truth table. `packages/channels/src/twilio.ts` (numbers, subaccounts, trunks, messaging services, hosted orders, port-ins, registrations, webhook signature). `voice-provision` in channels, reusing the shell.
- Edge: `admin/lines/*` (buy, import, register, hosted, port), `inbound/sms`, `twilio/status` (registration, hosted, port callbacks), `admin/voice-provision`.
- Dashboard: `/api/v1/setup` gathers inputs; `/api/v1/lines` verbs; the legacy page `setup.jsx` composes rows through the bridge like the day module.
- Secrets: Twilio master SID/token in the vault, subaccount tokens per workspace, the SIP credential list per workspace.

## 8. Costs to show the owner

| Item | Cost | Note |
|---|---|---|
| Local number | about $1.15/month | Twilio |
| Toll-free number | about $2.15/month | Twilio |
| SMS | about $0.0083 per segment plus carrier fees | plus $1.50 to $30/month for the campaign |
| Brand and campaign vetting | $4 to $4.50 once, $15 per campaign vetting | sole proprietors $4 |
| Hosted SMS | Twilio's hosted-number fee | small monthly |
| Porting | free at Twilio | the old carrier may charge |
| Voice | Retell per minute plus telephony | as today |

Billing is not built. The plan states costs so the page can say them; charging is a later decision.

## 9. Risks and what to verify first

1. **Meta's code to a Twilio number.** Some virtual numbers fail the SMS check. Spike: register a fresh Twilio number with WhatsApp through our Embedded Signup and see whether the SMS arrives; the voice fallback is the safety net.
2. **`ForwardedFrom` over SIP.** Twilio has it on the voice webhook; whether Retell surfaces it after the SIP import is unknown. Spike: forward a test call and read Retell's call metadata. The fallback verification (a call from the owner's own mobile in the test window) works either way.
3. **Toll-free versus local as the default.** Toll-free text-enables faster and needs no EIN for sole proprietors, but a moving company wants a local number. Recommendation: local by default, toll-free offered as "texts sooner", and 10DLC started in the background the moment the line exists.
4. **ISV registration.** Chanlytics needs its own TCR/ISV standing through Twilio before any workspace's brand can be filed. This is a one-time task for you, and it gates every texting timeline in this plan.
5. **SMS consent wording.** Toll-free verification and 10DLC both ask how customers opt in. The receptionist replies to people who texted first, which is consent by their own message; the opt-in language on the website and the QR card should say so.
6. **Melany's Retell-owned number.** Leave it. Migrating it to a Twilio-owned line is a later, separate port.

## 10. The order of work

Each is one PR unless marked; each ships with a truth table and an e2e on prod.

1. **Setup page, real states for what exists** — contracts `setupSteps`, `/api/v1/setup`, the page, the Today line. Voice shows "we set it up with you" until step 3. (2 PRs)
2. **Voice provisioning endpoint** — the script becomes `admin/voice-provision`; Setup's phone row gets its verb. (1 PR)
3. **Lines v1: get a new line** — `phone_lines` migration, the Twilio client, subaccount plus number plus SIP trunk plus Retell import, the chooser and the number card, the "call it" aha. (3 PRs)
4. **Keep my number: forwarding** — carrier cards, the test window, verification by `ForwardedFrom` or the owner's own call. (1 PR)
5. **SMS channel** — inbound and outbound on the conversation model, the brain pipeline reused, STOP/HELP, quiet hours, "waiting on carriers" holding. (3 PRs)
6. **Registrations** — ISV brand and campaign filing, toll-free verification, status callbacks, the Setup states and notifications. (2 PRs)
7. **Hosted SMS and porting** — orders, LOA links, bill upload, status. (2 PRs)
8. **WhatsApp on a Chanlytics line** — code capture from the SMS webhook, the voice fallback, the coexistence button. (1 PR)

Steps 1 and 2 need no vendor accounts. Step 3 needs the Twilio master account and Retell's SIP setup. Step 6 needs Chanlytics' ISV standing.

## 11. Decisions for you

1. Twilio-owned lines per workspace (recommended) versus Retell-purchased numbers with Retell's SMS add-on (cheaper to build, but texts bypass our brain and policies).
2. Local number by default with 10DLC in the background (recommended) versus toll-free by default (texts sooner, less local).
3. Whether Setup is the landing page until a line answers (recommended) or a Settings pane only.
4. Whether to file Chanlytics' ISV registration now, since every texting timeline waits on it.
5. Whether costs are shown on the page before billing exists (recommended: yes, as facts).

## Sources

- Twilio Hosted Numbers FAQ: https://www.twilio.com/docs/phone-numbers/hosted-numbers
- Retell, connect Twilio via elastic SIP trunking: https://docs.retellai.com/deploy/twilio
- Retell, create phone number: https://docs.retellai.com/api-references/create-phone-number
- Retell, SMS on numbers: https://docs.retellai.com/deploy/enable-sms
- Meta, onboard WhatsApp Business app users (coexistence): https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/
- 360dialog, coexistence: https://docs.360dialog.com/docs/resources/phone-numbers/coexistence
- Twilio, WhatsApp senders and number compatibility: https://www.twilio.com/docs/whatsapp/register-senders-using-api and https://help.twilio.com/articles/360026678054
- Twilio, sole proprietor 10DLC: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/direct-sole-proprietor-registration-overview
- Twilio, toll-free verification onboarding and the 2026 EIN change: https://www.twilio.com/docs/messaging/compliance/toll-free/console-onboarding and https://www.twilio.com/en-us/changelog/business-registration-numbers-required-for-toll-free-messaging-p
- Twilio, port-in timelines: https://support.twilio.com/hc/en-us/articles/223179468-How-long-does-it-take-to-port-a-US-number-to-Twilio
- Twilio, voice request parameters (`ForwardedFrom`): https://www.twilio.com/docs/voice/twiml#request-parameters
- Carrier forwarding codes: https://vettedcalls.com/guides/conditional-call-forwarding-by-carrier and https://bubblyphone.com/hub/call-forwarding-codes
- 10DLC fees and timelines, 2026: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/direct-sole-proprietor-registration-overview-new%20experience and https://www.tychron.com/the-campaign-registry/
