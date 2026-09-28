/**
 * Correcting a line already filed with the carriers: a rehearsal taken off for a
 * real filing, a rejected campaign resubmitted in place (free), and a rejected
 * campaign replaced (a new vetting fee). Each asks the pre-flight in
 * a2p-register.ts before anything at the carrier is touched.
 */
import { deleteCampaignRequest, updateCampaignRequest, encodeForm } from "../packages/channels.js";
import { lineAccount } from "../sms/sms.js";
import { logger } from "../log.js";
import { filingProblems, TWILIO_TIMEOUT_MS, type Db, type LineRow, type RecordRow } from "./a2p-register.js";

/**
 * Take a REHEARSAL off a line so a real filing can replace it.
 *
 * A brand filed with `Mock: true` goes to Twilio's free test registry: it
 * reports itself approved, delivers nothing, and expires in thirty days. It is
 * the right way to walk this path before a customer pays, and the wrong thing
 * to leave behind afterwards -- a line carrying one looks registered from every
 * angle while every text it receives is held for a person.
 *
 * What comes off, and what does not. The campaign is DELETED at Twilio because
 * a Messaging Service holds exactly one. The brand is NOT, because Twilio does
 * not allow it -- see the note on a2p_profile_sid below, which is the whole
 * reason this function has to throw away one more receipt than it looks like it
 * should. The TrustHub customer profile, the business, the representative, the
 * address and the document all STAY: only the brand ever carried Mock, so those
 * receipts are real, and the saga skips every step it still holds one for.
 *
 * Never called for a real filing -- that one was paid for and vetted, and the
 * caller refuses the whole operation before reaching here.
 */
export async function unfileMockRegistration(
  db: Db,
  line: LineRow,
  /**
   * What the REAL filing that replaces the rehearsal must pass. Required, and
   * asked before anything is deleted: this takes the rehearsal off at the carrier,
   * and taking it off for a filing the pre-flight then refuses leaves the line with
   * neither. #314 said "every path through op:register passes the pre-flight"; on
   * this path the rehearsal was already gone by the time it did.
   */
  check: { record: RecordRow; workspaceName: string; hasOptInNumber?: boolean },
): Promise<{ ok: boolean; error?: string; problems?: string[]; row?: LineRow }> {
  const L = logger({ tenant_id: line.tenant_id, line_id: line.id });
  const problems = await filingProblems(db, line, check);
  if (problems.length) {
    L.warn("a2p_unfile_refused", { problems: problems.length });
    return { ok: false, error: "record_incomplete", problems };
  }
  if (line.messaging_service_sid && line.campaign_sid) {
    const sub = await lineAccount(db, line).catch(() => null);
    if (!sub) return { ok: false, error: "no_line_credentials" };
    const req = deleteCampaignRequest(line.messaging_service_sid, line.campaign_sid);
    const r = await fetch(req.url, {
      method: req.method,
      headers: { Authorization: `Basic ${Buffer.from(`${sub.sid}:${sub.token}`).toString("base64")}` },
      signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
    }).catch(() => null);
    const gone = !!r && (r.ok || r.status === 404);
    L.info("a2p.mock_campaign_deleted", { status: r?.status ?? 0, ok: gone });
    // NOT best effort. A campaign left on the service makes the real POST fail
    // one step later with a message about the wrong thing, and the row by then
    // says nothing is filed. 404 is the state we were asking for; anything else
    // stops here, with the row untouched and the reason on the caller.
    if (!gone) return { ok: false, error: `the mock campaign would not come off (HTTP ${r?.status ?? 0})` };
  }
  // `single()` is the row count: a write that changed nothing errors here
  // rather than returning a success the caller would file on top of.
  const cleared = await db
    .from("lines")
    .update({
      brand_sid: null,
      campaign_sid: null,
      // The MOCK BRAND CANNOT BE DELETED. Twilio answers 405/20004 on
      // DELETE /v1/a2p/BrandRegistrations/{sid} -- brands are permanent, mock or
      // not -- and it then refuses a second brand for the same (customer profile,
      // messaging profile) pair with "Duplicate Brand can not be saved" (20409).
      // So the pair has to change, and the cheap half to change is the messaging
      // profile: clearing this resumes the saga at `a2p_profile`, which creates a
      // fresh bundle, re-attaches the SAME customer profile and company-type end
      // user to it, and submits it. Nothing that cost anything is redone -- the
      // business, the representative, the address and the document all stay on
      // the customer profile, which is the expensive half.
      //
      // Without this the refile was refused at the brand step every time, and the
      // row was left saying nothing was filed while Twilio still held a mock
      // brand and campaign. Found by running it.
      a2p_profile_sid: null,
      reg_mock: false,
      reg_step: null,
      sms_state: "registering",
      last_error: null,
      state_since: new Date().toISOString(),
    })
    .eq("id", line.id)
    .select("*")
    .single();
  if (cleared.error) return { ok: false, error: cleared.error.message };
  return { ok: true, row: cleared.data };
}

/**
 * Correct a campaign the carriers sent back, and send it again. Free.
 *
 * This replaced a delete-and-refile, which was the expensive way round and I
 * had to be asked "why do we have to spend another $15?" to go and check.
 * Twilio's own guidance:
 *
 *   "A vetting fee is assessed only once per Campaign. So if a Campaign is
 *    rejected its important to resubmit it rather than deleting and recreating
 *    a new campaign."
 *
 * So the QE resource stays and its three text fields are rewritten in place.
 * Nothing is charged, the brand is untouched, and a rejection can be answered
 * as many times as it takes -- which matters, because the corrections are
 * usually a line of copy and a reviewer only tells you one round at a time.
 *
 * The row goes back to `registering`: it is with the carriers again.
 */
export async function resubmitRejectedCampaign(
  db: Db,
  line: LineRow,
  // The five fields Twilio's update actually accepts. The narrower type this
  // used to take silently DROPPED the other four the caller had already
  // computed -- optInMessage, optInKeywords, privacyPolicyUrl, termsUrl -- with
  // no compile error and no log line, so the next person to fix a rejection
  // about the privacy URL would have edited the composer, redeployed, refiled,
  // and seen nothing change at Twilio. Two of those four ARE editable and now
  // travel; the other two are not editable by anyone and are named as such in
  // updateCampaignRequest.
  facts: { description: string; messageFlow: string; samples: string[]; privacyPolicyUrl: string; termsUrl: string },
  /**
   * What `filingProblems` needs to answer "is this ready to go out". Required, not
   * optional: this function used to send whatever it was handed, which is how a
   * rejection came to be answered with the fault that caused it.
   */
  check: { record: RecordRow; workspaceName: string; hasOptInNumber?: boolean },
): Promise<{ ok: boolean; error?: string; problems?: string[]; row?: LineRow }> {
  const L = logger({ tenant_id: line.tenant_id, line_id: line.id });
  if (!line.messaging_service_sid || !line.campaign_sid) return { ok: false, error: "no_campaign_to_resubmit" };

  // THE SAME CHECK THE FIRST FILING MAKES, before this one leaves. The row is NOT
  // touched: it is carrying the carriers' verdict and their words, and replacing
  // those with our own pre-check would destroy the only record of what they said
  // -- while a resubmit that goes out with a known fault costs another week.
  const problems = await filingProblems(db, line, check);
  if (problems.length) {
    L.warn("a2p_refile_refused", { problems: problems.length });
    return { ok: false, error: "record_incomplete", problems };
  }

  const sub = await lineAccount(db, line).catch(() => null);
  if (!sub) return { ok: false, error: "no_line_credentials" };

  const req = updateCampaignRequest(line.messaging_service_sid, line.campaign_sid, {
    description: facts.description,
    messageFlow: facts.messageFlow,
    samples: facts.samples,
    privacyPolicyUrl: facts.privacyPolicyUrl,
    termsUrl: facts.termsUrl,
  });
  const r = await fetch(req.url, {
    method: req.method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${sub.sid}:${sub.token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: encodeForm(req.form ?? {}),
    signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
  }).catch(() => null);
  if (!r || !r.ok) {
    const detail = r ? (await r.text().catch(() => "")).slice(0, 200) : "no answer";
    L.error("a2p.campaign_resubmit_refused", { status: r?.status ?? 0, detail });
    return { ok: false, error: `the campaign could not be resubmitted (HTTP ${r?.status ?? 0}) ${detail}` };
  }
  L.info("a2p.campaign_resubmitted", { campaign: line.campaign_sid });

  const cleared = await db
    .from("lines")
    .update({
      sms_state: "registering",
      reg_step: null,
      last_error: null,
      state_since: new Date().toISOString(),
    })
    .eq("id", line.id)
    .select("*")
    .single();
  if (cleared.error) return { ok: false, error: cleared.error.message };
  return { ok: true, row: cleared.data };
}

/**
 * Replace a campaign the carriers refused for something no edit can reach.
 *
 * The free path above rewrites the nine fields Twilio's update accepts. The
 * opt-in message and its keywords are not among them -- "cannot be edited under
 * any circumstances" -- and the live Chanlytics campaign was refused a THIRD
 * time, on the rewritten description and flow, while its confirmation still
 * read "You're subscribed to offers and news from Billing probe": the
 * appointment keyword confirming a promotional subscription, under a name the
 * workspace dropped. So the campaign comes OFF the Messaging Service (the
 * instance DELETE, which answers 204) and the saga files a new one from
 * today's facts. The brand stays: it was approved on its own, it cannot be
 * deleted anyway, and it is the expensive half. The saga resumes at `campaign`,
 * which is the step that costs -- a new campaign is a new vetting fee, about
 * $15 -- so support asks for this by name, told what it spends.
 *
 * Only for a REJECTED filing: a campaign that stands was paid for and vetted,
 * and the route refuses before reaching here. The pre-flight runs first, before
 * anything at the carrier is touched, for the same reason it does on the
 * rehearsal path: taking a filing off for a replacement that is then refused
 * leaves the line with neither.
 */
export async function replaceRejectedCampaign(
  db: Db,
  line: LineRow,
  check: { record: RecordRow; workspaceName: string; hasOptInNumber?: boolean },
): Promise<{ ok: boolean; error?: string; problems?: string[]; row?: LineRow }> {
  const L = logger({ tenant_id: line.tenant_id, line_id: line.id });
  if (line.sms_state !== "rejected") return { ok: false, error: "not_rejected" };
  const problems = await filingProblems(db, line, check);
  if (problems.length) {
    L.warn("a2p_replace_refused", { problems: problems.length });
    return { ok: false, error: "record_incomplete", problems };
  }
  if (line.messaging_service_sid && line.campaign_sid) {
    const sub = await lineAccount(db, line).catch(() => null);
    if (!sub) return { ok: false, error: "no_line_credentials" };
    const req = deleteCampaignRequest(line.messaging_service_sid, line.campaign_sid);
    const r = await fetch(req.url, {
      method: req.method,
      headers: { Authorization: `Basic ${Buffer.from(`${sub.sid}:${sub.token}`).toString("base64")}` },
      signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
    }).catch(() => null);
    const gone = !!r && (r.ok || r.status === 404);
    L.info("a2p.rejected_campaign_deleted", { status: r?.status ?? 0, ok: gone, campaign: line.campaign_sid });
    // A campaign left on the service makes the new POST fail one step later
    // with a message about the wrong thing. 404 is the state asked for.
    if (!gone) return { ok: false, error: `the rejected campaign would not come off (HTTP ${r?.status ?? 0})` };
  }
  // `single()` is the row count: a write that changed nothing errors here
  // rather than returning a success the caller would file on top of. The
  // brand and the messaging profile stay; only the campaign's receipt goes.
  const cleared = await db
    .from("lines")
    .update({
      campaign_sid: null,
      reg_step: null,
      sms_state: "registering",
      last_error: null,
      state_since: new Date().toISOString(),
    })
    .eq("id", line.id)
    .select("*")
    .single();
  if (cleared.error) return { ok: false, error: cleared.error.message };
  return { ok: true, row: cleared.data };
}
