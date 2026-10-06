# Connect WhatsApp says what Meta will ask, and the number says what Meta holds

Ruben, 6 Oct 2026, after connecting the Chanlytics workspace's own Twilio number to WhatsApp: "agreed please continue a
comprehensive well done best practice complete job" — the four Connections suggestions from the same conversation, as
one change. Coexistence (a number that stays on the WhatsApp Business app) is its own later project.

## What happened, and what it showed

- Meta's sign-up window asked for the number, texted a code to it, and Ruben could not see where the code went. The
  number is a Chanlytics line on Twilio, so the text reached our inbound door like any customer's.
- **Production, 6 Oct 12:08 and 12:34 UTC:** Meta sent "Your WhatsApp code: 353-343 / Don't share this code with
  others" from +1 833 624 1791 and again from +1 240 348 6504 (ordinary long codes, one toll-free, no short code). Both
  became people and conversations, and **the receptionist texted Meta back both times** ("Looks like that verification
  code came to us by mistake…"). A sender-based filter would not have caught either; the words must be read.
- The success screen asked for a payment method. Meta's Tech Provider documentation: unless the business works with a
  Solution Partner, "the customer must first attach a payment method to their WABA before they can begin messaging".
  Chanlytics is a Tech Provider. Nothing in Chanlytics said so before or after.
- A new business portfolio starts at a messaging limit of 250 (Meta, messaging limits): unique people a business may
  start a conversation with in 24 hours, outside a customer service window, shared by every number in the portfolio;
  verification or volume raises it. Nothing in Chanlytics says this either.

## The four parts

### 1. Before the window: what Meta will ask (contracts words, the WhatsApp row)

When the WhatsApp row offers Connect, it shows four short notes under its sentence:

1. Meta asks you to sign in with Facebook and choose or create your business.
2. Meta texts a code to the number. On a Chanlytics number it shows on the Texting row here, so choose Text message,
   not Phone call (a call would be answered by the receptionist). Without a Chanlytics line: have the phone at hand.
3. Meta charges your business for the messages it starts, like reminders and campaigns: add a payment method when it
   asks, or WhatsApp will not send.
4. A new business on Meta can start conversations with 250 people a day until it is verified with Meta; replies to
   customers who write first are not limited.

Every sentence comes from contracts (`setup/connections.ts`), as the rows' do. A `notes: string[]` joins
`ConnectionRow` (empty for every other row) and `row.tsx` draws it under the sentence, in the row's own hint style.

### 2. A code sent to the line is kept by Twilio and shown to the owner (no storage of ours)

- **One rule** recognises a one-time code in a text: `oneTimeCodeOf(body)` beside the STOP words in
  `packages/channels/src/lines/sms.ts` (the house's other classification of an inbound text). It answers
  `{ code, from }` or null. Conservative: a body of at most 320 characters holding a 4 to 8 digit code (a dash or a
  space inside allowed) AND one of: "Your <Name> code" (with an optional verification/security/confirmation/login/
  sign-in/access/one-time word), "<code> is your <Name> … code", "don't/do not/never share this/the/your/it", or a
  leading "<#>". `from` is the name it read ("WhatsApp", "Google", "Instagram"), else null. A customer's "my door code
  is 4512" is not a code; Meta's two texts above are; tests hold both kinds, from the real bodies.
- **The door does not answer it.** `planSmsIngress` gains the verdict `{ kind: "code", routed, from }` after the
  signature and routing are proven; `receiveInboundText` logs `sms_code_skipped` (the name it read, never the code)
  and answers empty TwiML 200. No person, no conversation, no message row, no reply, no consent read.
- **The owner reads it from Twilio, on demand.** The texts are already Twilio's record; Chanlytics never stores a
  one-time code. The lines provider gains `recentTexts(acct, to, sinceMs)` (Twilio `GET Messages.json?To=…` newest
  first, a page of 20; the dry provider answers what a test planted). An edge admin door
  `GET /api/admin/lines/codes` (signed admin token, the dashboard its sole caller, as `whatsapp/connect`) reads the
  workspace's own Chanlytics line (provider twilio or dry; a carrier line has no texts of ours) and answers the codes
  `oneTimeCodeOf` finds in the last 15 minutes: `{ code, from, at }`, newest first, at most 3. The dashboard route
  `GET /api/v1/lines/codes` is **owner only** (`route()` policy), never cached, rate class of a read.
- **Where it shows.** The Texting row (the line's) carries one note per recent code: "Code from WhatsApp: 788-963 ·
  2 minutes ago". Below them: "Codes sent to this line are never answered and never become people." The page reads
  the route once when Connections opens (owners only) and every 3 seconds while Meta's sign-up window is open.

### 3. What Meta holds about the number: one reading, kept, shown

- **The reading** (`apps/edge/lib/whatsapp/meta-graph.ts`): `numberStanding(token, phoneNumberId, wabaId)` asks
  `/{phone}?fields=health_status,name_status,verified_name` and
  `/{waba}?fields=business_verification_status,whatsapp_business_manager_messaging_limit`, and answers
  `NumberStanding` (contracts): `can_send` ("AVAILABLE" | "LIMITED" | "BLOCKED"), `problems` (each entity's errors:
  `entity`, `code`, `said` = Meta's error_description, `fix` = possible_solution), `notes` (additional_info strings),
  `name`, `name_status`, `verification`, `limit`. Unknown words are kept as Meta said them; nothing is guessed.
- **Kept** in `tenant_channels.config.standing` (+ `standing_read_at`) through a database door, migration **00328**
  `channel_keep_standing(p_tenant_id, p_channel_id, p_standing jsonb)`, modelled on `channel_keep_quality` (00315):
  merges with `||` in one statement, writes the event `channel.standing { from, to }` when `can_send` changed (no
  `from` on the first read), answers `first | changed | same | gone`. `security definer`, service role only, its
  comment says whose door it is.
- **Read when:** at connection (after registration, best effort: a failed read never fails the connection); by the
  six-hourly channel-quality sweep beside the quality (same token, same pacing, same outcomes counted); and when an
  owner opens Connections and the kept standing is missing, or not AVAILABLE and read more than 10 minutes ago
  (`POST /api/v1/channels/whatsapp/standing` → edge `POST /api/admin/whatsapp/standing`, owner only, rate-limited),
  so a fixed payment method shows as fixed without waiting six hours.
- **Told** when it turns BLOCKED (`changed` to BLOCKED, or `first` and BLOCKED): one owner alert on the path
  `waba-events.ts` uses for a restricted account (`notify`, kind "number", route Connections), in words:
  "WhatsApp can't send from <number>: <Meta's first problem>. <Meta's fix>." Not repeated while it stays BLOCKED.
- **Shown** on the WhatsApp row (contracts `whatsappRow`, pure, from the ChannelDto's new `standing`):
  - BLOCKED: state `attention`, "Needs attention", sentence "Meta: <first problem said>", notes: its fix, any
    further problem.
  - LIMITED: the row stays On; notes carry Meta's notes ("Your display name has not been approved yet…").
  - Display name in review / declined: a note ("Meta is reviewing the display name “X”; until then customers see the
    number." / "Meta declined the display name “X” — change it in WhatsApp Manager.").
  - Not verified (any verification but "verified"): "Your business isn't verified with Meta: you can start
    conversations with up to 250 people a day. Replies to customers who write first are not limited." Verified with a
    tier: the tier in words ("up to 1,000 people a day" … "no daily limit").
  - Nothing read yet: as today (quality and last message).
  The channels reader passes `standing` (and `standing_read_at`) to the DTO; members see it, as they see quality.

### 4. The receptionist never answers an automated code

Part 2's door verdict. Also the mistaken people from 6 Oct (the two Meta senders in the Chanlytics workspace) are
Ruben's to delete or keep; nothing here deletes data.

### 5. A sign-up that finishes at Meta reaches Chanlytics, or the owner is told how to finish it

**What production showed, 6 Oct (dashboard and edge logs, workspace `chanlytics`):** the first sign-up opened at 12:07
UTC (`GET channels/whatsapp/signup`), Meta texted the code at 12:08, and **the Connections page loaded again at 12:11**
(two more signup reads) while Meta's window was still open: Ruben was looking for the code. Meta finished at 12:48
(its `account_update` notices arrived) but no `POST channels/whatsapp/connect` was ever made: the reload had taken the
page's listener and the SDK's login callback with it, so the one-time code had nowhere to go. The second sign-up
(13:35 to 13:43) kept its page and connected (`wa_connected` at 13:43:22, registration `registered`). A reloaded page
cannot get the code back (it rides the SDK's own callback), so the fix is to keep the page and to say what to do:

- **The code shows on the page** (part 2), so nobody leaves it to find one, and the pre-flight notes gain: "Keep this
  page open until Meta's window closes."
- **A sign-up left behind is named.** `waConnect.start()` writes `chanlytics.whatsapp.signup` (the time it began) to
  sessionStorage, try/catch as the house writes storage, and clears it when the sign-up ends either way (connected,
  cancelled, failed). When Connections opens with that mark under an hour old and no WhatsApp channel, the WhatsApp row
  carries a note (contracts words, the page passes `signupLeftOpenAt`): "A WhatsApp sign-up was started here and did
  not come back to Chanlytics — if you finished it in Meta's window, press Connect WhatsApp again and choose the
  WhatsApp account Meta already made." The mark is cleared when the row is next connected.

### 6. Meta's partner notices are routed by the account they name

Every sign-up sends `account_update` notices (`PARTNER_ADDED` and its kin) addressed to the **partner's** business
portfolio (`entry.id` = RJ Capital LLC's portfolio, 490218995810625), with the customer's WhatsApp account in
`value.waba_info.waba_id` (Meta, webhooks reference: account_update). `handleWabaChange` routes by `entry.id` only, so
all twelve of 6 Oct were logged as `waba_unroutable` errors and dropped. Fix in `apps/edge/lib/whatsapp/waba-events.ts`:
route by `value.waba_info.waba_id` when it is present, else by the entry's id; a partner notice for a WhatsApp account
no workspace holds (a sign-up that never reached Chanlytics, as at 12:48) is logged at info as
`wa_signup_finished_unclaimed` with the WABA id and the event, not as an error, and kept nowhere. `waba_unroutable`
stays for a change about an account we should hold and cannot find. Tests over the real shape (an entry id that is a
portfolio, `waba_info` naming a held WABA, and one naming an unknown WABA).

## Not in this change

Coexistence (the WhatsApp Business app path); Meta's `phone_number_name_update` webhook (the sweep and the Connections
check cover the name); a code in a call (the notes steer to Text message); storing codes.

## Rules this keeps

One rule per fact (`oneTimeCodeOf`, the standing words, `numberStanding`); words from contracts; the edge reads the
environment and logs through its own modules (`sms_code_skipped`, `wa_standing_read_failed`, new names in
`LOG_EVENTS`); tables only in `packages/db`; every route declares its policy; the event kind joins `EVENT_KINDS` and
the Activity words; dists rebuilt; a migration numbered above the ledger head and recorded; tests execute the code
they prove (the door over the in-memory database, the rule over real bodies, the SQL door on the throwaway stack).
