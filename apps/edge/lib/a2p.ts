/**
 * Registering a workspace with the carriers, on the edge: the business on
 * record read from its row, the ports the pure saga runs over, and the one
 * place a Twilio credential is used for it.
 *
 * Every call is made as the MASTER account, not the workspace's
 * subaccount: the bundles hang under Chanlytics' own approved primary
 * profile, which is what makes these businesses ours to register.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./workspace/db.js";
import {
  runA2PSaga, smsStateFor, registrationVerdict, LOW_VOLUME_USECASE, deleteCampaignRequest, updateCampaignRequest,
  encodeForm, brandTypeFor, refusalWords, type A2PPorts, type A2PRequest, type A2PState, type BusinessRecord, type CampaignError,
} from "./workspace/channels.js";
import { formatPhoneDisplay, industryOf, businessRecordProblems, registrationPathOf, registrationPreflight } from "./workspace/contracts.js";
import { emitEvent } from "./workspace/db.js";
import { recordNotification } from "./notify.js";
import { lineProviderFromEnv } from "./lines.js";
import { lineAccount, refreshLineToken } from "./sms.js";
import { logger } from "./log.js";

type Db = SupabaseClient<Database>;
type LineRow = Database["public"]["Tables"]["lines"]["Row"];
type RecordRow = Database["public"]["Tables"]["business_records"]["Row"];

/** Chanlytics' own approved primary customer profile; without it nothing may be filed. */
export function primaryProfileSid(): string | null {
  return process.env.TWILIO_PRIMARY_PROFILE_SID || null;
}

/** Where Twilio writes about a bundle: the platform's mailbox, never a customer's. */
export function platformEmail(): string | null {
  return process.env.LEAD_TO || null;
}

export function businessRecordFrom(r: RecordRow): BusinessRecord {
  return {
    legalName: r.legal_name,
    tradeName: r.trade_name,
    ein: r.ein,
    street: r.street,
    streetSecondary: r.street_secondary,
    city: r.city,
    region: r.region,
    postalCode: r.postal_code,
    country: r.country,
    websiteUrl: r.website_url,
    industry: r.industry,
    contactFirstName: r.contact_first_name,
    contactLastName: r.contact_last_name,
    contactEmail: r.contact_email,
    contactPhone: r.contact_phone,
    contactTitle: r.contact_title,
    contactJobPosition: r.contact_job_position,
    businessType: r.business_type,
    companyType: r.company_type,
  };
}

/** The receipts, as the row keeps them. */
export function a2pStateFrom(l: LineRow): A2PState {
  const f = (l.facts && typeof l.facts === "object" && !Array.isArray(l.facts) ? l.facts : {}) as Record<string, unknown>;
  return {
    profileSid: l.profile_sid,
    businessSid: typeof f.a2p_business_sid === "string" ? f.a2p_business_sid : null,
    representativeSid: typeof f.a2p_representative_sid === "string" ? f.a2p_representative_sid : null,
    addressSid: typeof f.a2p_address_sid === "string" ? f.a2p_address_sid : null,
    documentSid: typeof f.a2p_document_sid === "string" ? f.a2p_document_sid : null,
    primaryAssigned: f.a2p_primary_assigned === true,
    profileSubmitted: f.a2p_profile_submitted === true,
    a2pProfileSid: l.a2p_profile_sid,
    brandSid: l.brand_sid,
    campaignSid: l.campaign_sid,
  };
}

/**
 * What the workspace tells a reviewer about the messages it will send.
 *
 * REWRITTEN AFTER TWO REFUSALS, both on the live Chanlytics campaign:
 *
 *   30886  USE_CASE_DESCRIPTION — "invalid campaign description"
 *   30913  MESSAGE_FLOW — "marketing consent was combined with other consents.
 *          Marketing consent must be collected separately."
 *
 * 30913 was earned. The old flow said customers "opt in by messaging the
 * business first, or by sending the words YES OFFERS", and the page that
 * sentence pointed at then promised "offers, news AND appointment reminders"
 * for that one yes. One control, three purposes.
 *
 * Twilio's requirements for this field are specific, and error 30917 spells out
 * what a passing answer contains: for EACH opt-in method, where it happens, what
 * disclosure the consumer sees there, and what action confirms consent. Where
 * there are several methods, all of them go in this one field.
 *
 * So the flow below walks a reviewer through both, separately, naming the
 * keyword that answers each — which is only true because the product now records
 * them as two different answers.
 */
export function campaignFactsFor(o: {
  businessName: string;
  optInUrl: string;
  privacyUrl: string;
  termsUrl: string;
  /**
   * The workspace's own hosted page, `/b/<slug>`.
   *
   * Filed as the privacy policy when the business has no site of its own, which
   * answers both of the page-shaped refusals this product has actually had:
   * 30919 wanted a page that identifies the business, and 30907 wanted the
   * website on the same domain as the opt-in page. It is on the same domain by
   * construction, and it carries the identity from `business_records` -- the
   * facts the carriers vetted on the brand.
   */
  hostedUrl?: string | null;
  /**
   * The workspace's OWN line, as a person reads it. Used in the sample that
   * shows a message containing a phone number -- which the filing declares it
   * sends, and which therefore has to be a number that message could really
   * contain. The platform's support line standing in for it would be a claim
   * made in the business's name, which is the one thing these samples may not
   * do.
   */
  lineNumber?: string | null;
}) {
  return {
    // What the campaign IS, in the plainest terms, with the separation stated
    // rather than left to be inferred from the flow.
    // THE CLAIM HAS TO BE TRUE, because this is a statement to a regulator about
    // how this product behaves. It used to end "and no customer is enrolled in both
    // by a single action", and the product's own keyword table says otherwise:
    // `OPT_IN_PATTERN` matches YES OFFERS as well as START, deliberately (texting
    // OFFERS is also a way back in from a STOP), so that one message sets both
    // answers. That is defensible -- a customer who explicitly asks for offers has
    // plainly also agreed to be replied to -- but it is not what the sentence said.
    //
    // What 30913 actually forbids is the OTHER direction: a yes to conversation
    // being spent as a yes to marketing. That direction is what the wording now
    // states, and it is the direction the code enforces.
    description: `${o.businessName} uses this number to answer its own customers, to send them reminders about appointments they have booked, and — only for customers who ask for them separately — occasional offers. Every message is written or approved by the business. Conversational and transactional messages go to customers who have asked to hear about their appointments; promotional messages go only to customers who gave a separate, explicit yes to offers. Agreeing to hear about appointments never enrols anyone in promotional messaging: that requires its own opt-in, with its own disclosure, which a customer can decline while keeping everything else.`,

    // THE CLAIM HAS TO BE TRUE, and one half of it was not. This flow used to open
    // by calling the two opt-ins symmetric -- that giving either left the other
    // ungiven -- which this product's own keyword table contradicts:
    // `OPT_IN_PATTERN` matches the promotional keyword as well as the
    // transactional one, deliberately (it is also how somebody returns from a
    // STOP), so asking for offers records both answers. The campaign DESCRIPTION
    // was corrected for exactly this; MESSAGE_FLOW -- the field error 30913 names
    // -- was not, so the untrue half survived in the one place the carriers were
    // reading and refusing.
    //
    // What 30913 forbids is the other direction, and that direction IS absolute
    // here: a yes to conversation is never spent as a yes to marketing. So the
    // flow states that absolutely, and names the one-way implication as the
    // deliberate thing it is rather than denying it.
    messageFlow: [
      `Customers give consent at ${o.optInUrl}, a public page presenting TWO SEPARATE opt-ins, each with its own heading, its own disclosures and its own keyword. Agreeing to the transactional messages NEVER enrols anyone in promotional messaging: that needs its own opt-in, which a customer can decline while keeping everything else.`,
      `(1) TRANSACTIONAL: under the heading "Messages about your visit", the page states that the customer will receive appointment reminders and confirmations from ${o.businessName}, that message frequency varies, that message and data rates may apply, to reply HELP for help and STOP to stop. The customer consents by sending the single word START to the business from their own phone, using the link or button shown there.`,
      `(2) PROMOTIONAL: under a separate heading "Offers and news", the page states that the customer will receive promotional offers and news from ${o.businessName}, a few messages a month, that message and data rates may apply, to reply HELP for help and STOP to stop. It also states in its own words that this opt-in is optional, is not required for the messages above, and is not a condition of any purchase. The customer consents by sending the words YES OFFERS from their own phone.`,
      `Sending the message is the action that confirms consent in each case, and each is recorded against that customer separately, in its own field, with its own timestamp and source. A customer who sends START never receives promotional messages. A customer who sends YES OFFERS is recorded as having consented to promotional messages specifically, and -- having written to the business from their own handset to ask for them -- is recorded as reachable for the transactional messages too; that is the only direction in which one answer implies the other, and it is the direction that adds nothing a customer did not just ask for.`,
      `Customers may also start a conversation by messaging the business directly, which is consent to be answered and to receive messages about their own appointments only.`,
      `Replying STOP at any time ends all messages of both kinds.`,
    ].join(" "),

    // Samples a reviewer reads. They must not state a fact about the business we
    // were never given -- an invented opening time is a claim made in their name.
    //
    // Both declared booleans are now TRUE OF THE SAMPLES. HasEmbeddedLinks and
    // HasEmbeddedPhone have always been sent as "true" while neither sample
    // contained a link or a number, which is exactly the declaration/sample
    // mismatch reviewers reject -- and a plausible half of 30886.
    samples: [
      `Hi, thanks for writing ${o.businessName}. How can we help today?`,
      `Reminder from ${o.businessName}: you have an appointment tomorrow. Reply STOP to opt out.`,
      `${o.businessName}: you can book or change your appointment here: ${o.optInUrl}. Reply STOP to opt out, HELP for help.`,
      o.lineNumber
        ? `${o.businessName}: we tried to reach you. Call us back on ${o.lineNumber} or reply here. Reply STOP to opt out.`
        : `${o.businessName}: we tried to reach you. Reply here and we will pick it up. Reply STOP to opt out.`,
      // The promotional sample, and it names NO offer. An invented discount is a
      // claim made in the business's name, which is the rule this list already
      // held itself to about opening times -- the sample shows the shape of a
      // promotional message and points at the page where the real one lives.
      `Offer from ${o.businessName} for customers who asked for offers — see ${o.optInUrl}. A few messages a month. Msg & data rates may apply. Reply STOP to opt out, HELP for help.`,
    ],

    // NOT correctable after the first filing: Twilio's campaign UPDATE accepts
    // description, message flow, samples, the four booleans and the two URLs,
    // and nothing else. Opt-in, opt-out and help information can only be changed
    // by deleting the campaign and creating a new one, which is a new vetting
    // fee. Get this right the first time, per workspace.
    optInMessage: `${o.businessName}: you're subscribed. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel.`,
    // Single words only, and only ones the receptionist actually honours
    // (contracts CONVERSATION_OPT_IN_PATTERN). The two-word offers phrase lives
    // in the flow above, because a keyword field takes single words.
    optInKeywords: ["START", "UNSTOP", "RESUME"],
    // Their own privacy policy if they have a site; ours-for-them otherwise.
    // Chanlytics' platform policy is the last resort and is the wrong answer for
    // a customer: it identifies US, and 30919 asks who is sending.
    privacyPolicyUrl: o.hostedUrl || o.privacyUrl,
    termsUrl: o.termsUrl,
  };
}

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
      signal: AbortSignal.timeout(20000),
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
  const cleared = await db.from("lines").update({
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
  }).eq("id", line.id).select("*").single();
  if (cleared.error) return { ok: false, error: cleared.error.message };
  return { ok: true, row: cleared.data };
}

/**
 * Is this filing ready to reach the carriers?
 *
 * ONE DECIDER, extracted because there are TWO functions in this file that send a
 * filing out and only one of them was asking. `registerLine` ran these checks;
 * `resubmitRejectedCampaign` did not -- and a rejected campaign is the case the
 * back office's refile door exists for, described in its own doc as "the single
 * most common A2P support action there is". So support pressed Refile on a
 * campaign the carriers had sent back for a name mismatch, the same mismatch went
 * out again unchecked, and the same rejection arrived a week later. The contract's
 * button even says "Correct the business on record first -- this sends what is
 * there now"; nothing verified that anyone had.
 *
 * Hoisting the call into the route would have fixed the one path that was broken.
 * Both senders calling it THEMSELVES fixes the shape: a future third caller
 * cannot reintroduce the gap by being written in the wrong order, and the
 * invariant becomes "every function that talks to the carriers asks first" rather
 * than "every route remembers to".
 *
 * A DECIDER, not an enforcer: it returns the owner's sentences and writes
 * nothing. What a refusal MEANS for the row differs by path -- a first filing has
 * sent nothing, so `needs_record` is the truth about it; a refile's row is
 * carrying the CARRIERS' verdict and their reason, and overwriting that with our
 * own pre-check would erase the only record of what they actually said.
 */
export async function filingProblems(db: Db, line: LineRow, o: {
  record: RecordRow;
  /** What the CAMPAIGN will state. Not the record's name, which is what the brand states. */
  workspaceName: string;
  /** Whether a customer has any way to say yes yet. Defaults to true: a caller that never looked it up must not block a filing on it. */
  hasOptInNumber?: boolean;
}): Promise<string[]> {
  // WHICH registration, and is the record complete FOR IT. The same validator the
  // form and the dashboard route use, on the row as it is stored:
  // `business_records` is already the DTO's shape, so there is nothing to map and
  // nothing to drift. This replaced a second, channels-side list of what a sole
  // proprietor needs -- two lists answering one question, which is how a form
  // comes to accept what the filing then refuses.
  const path = registrationPathOf(o.record) ?? "standard";
  // The numbers this workspace was given by us, so the check can tell an owner's
  // handset from the line we answer on their behalf.
  const ours = await db.from("lines").select("e164").eq("tenant_id", line.tenant_id);
  const ourNumbers = (ours.data ?? []).map((r) => r.e164).filter((n): n is string => !!n);
  const problems = Object.values(businessRecordProblems(o.record, path, { ourNumbers }));

  // And the things a REVIEWER will check, which a complete record does not
  // guarantee. The name check is the one that bit this product: the campaign
  // states the WORKSPACE'S name and the brand registers the RECORD'S, and a live
  // campaign went to the carriers describing a business called "Billing probe".
  for (const p of registrationPreflight({
    workspaceName: o.workspaceName,
    legalName: o.record.legal_name,
    tradeName: o.record.trade_name,
    street: o.record.street,
    city: o.record.city,
    websiteUrl: o.record.website_url,
    hasOptInNumber: o.hasOptInNumber ?? true,
  })) {
    problems.push(`${p.what} ${p.fix}`);
  }
  return problems;
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
    signal: AbortSignal.timeout(20000),
  }).catch(() => null);
  if (!r || !r.ok) {
    const detail = r ? (await r.text().catch(() => "")).slice(0, 200) : "no answer";
    L.error("a2p.campaign_resubmit_refused", { status: r?.status ?? 0, detail });
    return { ok: false, error: `the campaign could not be resubmitted (HTTP ${r?.status ?? 0}) ${detail}` };
  }
  L.info("a2p.campaign_resubmitted", { campaign: line.campaign_sid });

  const cleared = await db.from("lines").update({
    sms_state: "registering",
    reg_step: null,
    last_error: null,
    state_since: new Date().toISOString(),
  }).eq("id", line.id).select("*").single();
  if (cleared.error) return { ok: false, error: cleared.error.message };
  return { ok: true, row: cleared.data };
}

export interface RegisterResult {
  ok: boolean;
  /** Not a refusal: the carriers have not finished with the brand yet. */
  pending?: boolean;
  step?: string;
  error?: string;
  /**
   * What is wrong and what to do about it, in the OWNER'S words, when the
   * pre-flight refused. Returned as well as stored on the row: an error TOKEN was
   * all the owner used to get -- the dashboard passed `record_incomplete` through
   * and the bridge printed it verbatim -- while the sentences that would have told
   * them sat in the database being read by nothing but the back office.
   */
  problems?: string[];
  state: A2PState;
  smsState: string;
}

/**
 * Run the registration for one line. `mock` uses Twilio's free test
 * registry: nothing is charged, nothing routes, and it expires in thirty
 * days — which is how this path is walked before a customer pays.
 */
export async function registerLine(db: Db, o: {
  line: LineRow;
  record: RecordRow;
  workspaceName: string;
  optInUrl: string;
  privacyUrl: string;
  termsUrl: string;
  /** The workspace's own hosted page, `/b/<slug>`: its website and privacy policy when it has none. */
  hostedUrl?: string | null;
  /**
   * Whether a customer has any way to say yes yet.
   *
   * The message flow tells the carriers customers opt in by texting this
   * business. Absent a number, the opt-in page says the business is not set up
   * to take sign-ups — so the flow would describe something that does not
   * happen. Defaults to true so a caller that does not know does not block a
   * filing on a fact it never looked up.
   */
  hasOptInNumber?: boolean;
  mock: boolean;
  statusCallback?: string;
}): Promise<RegisterResult> {
  const choice = lineProviderFromEnv();
  const primary = primaryProfileSid();
  const email = platformEmail();
  const state = a2pStateFrom(o.line);
  if (!choice || choice.name !== "twilio") return { ok: false, error: "no_provider", state, smsState: o.line.sms_state };
  if (!primary) return { ok: false, error: "no_primary_profile", state, smsState: o.line.sms_state };
  if (!email) return { ok: false, error: "no_platform_mailbox", state, smsState: o.line.sms_state };
  if (!o.line.messaging_service_sid) return { ok: false, error: "no_messaging_service", state, smsState: o.line.sms_state };
  // Checked before a single call is made, because on a real filing an incomplete
  // record is a fee spent on a rejection that arrives days later. The decision
  // itself lives in `filingProblems` above, which the refile path asks too -- so
  // the check cannot be skipped by reaching the carriers through the other door.
  const path = registrationPathOf(o.record) ?? "standard";
  const problems = await filingProblems(db, o.line, {
    record: o.record,
    workspaceName: o.workspaceName,
    hasOptInNumber: o.hasOptInNumber,
  });

  if (problems.length) {
    // NOTHING HAS BEEN SENT, so `needs_record` is the truth about this row and the
    // sentences are what the owner has to act on. They are RETURNED as well as
    // stored: the row is read by a page that reloads, and the person who just
    // pressed the button is owed the answer now rather than an error token.
    await db.from("lines").update({
      sms_state: "needs_record",
      last_error: problems.join(" "),
      state_since: new Date().toISOString(),
    }).eq("id", o.line.id);
    return {
      ok: false,
      error: path === "sole_proprietor" ? "sole_proprietor_incomplete" : "record_incomplete",
      problems,
      state, smsState: "needs_record",
    };
  }

  const L = logger({ tenant_id: o.line.tenant_id, line_id: o.line.id });
  // A business with no website of its own files the page we publish for it. The
  // substitution happens HERE, once, rather than in each request builder: the
  // brand, the campaign and the profile must all name the same URL, and three
  // places deciding that separately is three places to disagree.
  const base = businessRecordFrom(o.record);
  const record = base.websiteUrl?.trim() ? base : { ...base, websiteUrl: o.hostedUrl ?? base.websiteUrl };

  // Everything is filed as the WORKSPACE'S OWN subaccount, per Twilio's ISV
  // guide; our primary profile is referenced by sid, never moved.
  const sub = await lineAccount(db, o.line).catch(() => null);
  if (!sub) return { ok: false, error: "no_line_credentials", state, smsState: o.line.sms_state };
  const send = async (req: A2PRequest) => {
    const acct = sub;
    const r = await fetch(req.url, {
      method: req.method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${acct.sid}:${acct.token}`).toString("base64")}`,
        ...(req.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: req.form ? encodeForm(req.form) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const text = await r.text();
    let body: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(text) as unknown;
      body = parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch { body = text ? { text: text.slice(0, 300) } : null; }
    return { status: r.status, body };
  };

  // Each receipt lands on the row before the next call runs.
  const FACT_OF: Partial<Record<keyof A2PState, string>> = {
    businessSid: "a2p_business_sid",
    representativeSid: "a2p_representative_sid",
    addressSid: "a2p_address_sid",
    documentSid: "a2p_document_sid",
    primaryAssigned: "a2p_primary_assigned",
    profileSubmitted: "a2p_profile_submitted",
  };
  const COLUMN_OF: Partial<Record<keyof A2PState, string>> = {
    profileSid: "profile_sid",
    a2pProfileSid: "a2p_profile_sid",
    brandSid: "brand_sid",
    campaignSid: "campaign_sid",
  };
  let facts = (o.line.facts && typeof o.line.facts === "object" && !Array.isArray(o.line.facts) ? { ...(o.line.facts as Record<string, unknown>) } : {}) as Record<string, unknown>;

  const ports: A2PPorts = {
    send,
    accountSid: sub.sid,
    primaryProfileSid: primary,
    email,
    ...(o.statusCallback ? { statusCallback: o.statusCallback } : {}),
    workspace: { name: o.workspaceName },
    record,
    // Twilio's vertical enum. The sole-proprietor end user asks for it by
    // name; the standard path carries it inside the business end user.
    industry: industryOf(record.industry),
    campaign: campaignFactsFor({ businessName: o.workspaceName, optInUrl: o.optInUrl, privacyUrl: o.privacyUrl, termsUrl: o.termsUrl, hostedUrl: o.hostedUrl, lineNumber: formatPhoneDisplay(o.line.e164) }),
    messagingServiceSid: o.line.messaging_service_sid,
    useCase: LOW_VOLUME_USECASE,
    mock: o.mock,
    // Tied to the use case above, deliberately: everything this product files
    // is LOW_VOLUME, and secondary vetting only buys throughput a low-volume
    // campaign cannot use. It is the expensive half of a registration -- $46
    // for the first real one, against $4 for the brand itself -- so a caller
    // that ever files something bigger should turn it back on with its eyes
    // open rather than inherit it by silence.
    skipVetting: true,
    async save(patch) {
      const row: Record<string, unknown> = {};
      let touchedFacts = false;
      for (const [k, v] of Object.entries(patch)) {
        const col = COLUMN_OF[k as keyof A2PState];
        if (col) { row[col] = v; continue; }
        const fact = FACT_OF[k as keyof A2PState];
        if (fact) { facts[fact] = v; touchedFacts = true; }
      }
      if (touchedFacts) row.facts = facts;
      const { error } = await db.from("lines").update(row as Database["public"]["Tables"]["lines"]["Update"]).eq("id", o.line.id);
      if (error) throw new Error(`keeping the registration's receipt: ${error.message}`);
    },
  };

  // reg_sole_prop is written HERE, with reg_mock, and never derived later: an
  // owner who incorporates and types their new tax id would otherwise read
  // back as a standard brand while the carriers still hold the narrow one --
  // promising throughput the line does not have.
  await db.from("lines").update({
    sms_state: "registering",
    reg_mock: o.mock,
    reg_sole_prop: brandTypeFor(record) === "SOLE_PROPRIETOR",
    last_error: null,
    state_since: new Date().toISOString(),
  }).eq("id", o.line.id);
  const result = await runA2PSaga(state, ports);
  // A campaign that cannot be filed until the carriers finish with the brand
  // is a WAIT: everything asked for was accepted. The row says "waiting on
  // carriers", carries no error, and the next status check files it.
  const waiting = !result.ok && result.pending;
  const smsState = result.ok || waiting ? "registering" : "failed";
  await db.from("lines").update({
    sms_state: smsState,
    reg_step: result.ok ? null : result.step,
    last_error: result.ok || waiting ? null : result.error,
    state_since: new Date().toISOString(),
  }).eq("id", o.line.id);
  if (result.ok) L.info("a2p_filed", { mock: o.mock, brand: result.state.brandSid, campaign: result.state.campaignSid });
  else if (waiting) L.info("a2p_waiting_on_brand", { brand: result.state.brandSid });
  else L.error("a2p_failed", { step: result.step, error: result.error });
  return result.ok
    ? { ok: true, state: result.state, smsState }
    : { ok: false, pending: result.pending, step: result.step, error: result.error, state: result.state, smsState };
}

/** Ask Twilio where the brand and the campaign stand, and write it to the row. */
export async function syncRegistration(db: Db, line: LineRow): Promise<{ ok: boolean; smsState: string; brand?: string; campaign?: string; error?: string; told?: boolean }> {
  const choice = lineProviderFromEnv();
  if (!choice || choice.name !== "twilio") return { ok: false, smsState: line.sms_state, error: "no_provider" };
  const basic = (a: { sid: string; token: string }) => `Basic ${Buffer.from(`${a.sid}:${a.token}`).toString("base64")}`;
  // The STATUS comes back too. It used to be discarded, and that is the whole
  // defect below: a 401 and a brand the carriers are still thinking about
  // produced the same value -- null -- and null means "no answer yet".
  const read = async (url: string, acct: { sid: string; token: string }) => {
    const r = await fetch(url, { headers: { Authorization: basic(acct) }, signal: AbortSignal.timeout(15000) });
    return { status: r.status, body: (await r.json().catch(() => null)) as Record<string, unknown> | null };
  };
  // Both are the workspace's own, so both are read as its subaccount.
  const sub = await lineAccount(db, line).catch(() => null);
  if (!sub) return { ok: false, smsState: line.sms_state, error: "no_line_credentials" };

  // One attempt, then heal, then one more.
  //
  // A subaccount token rotated in the provider's console leaves our copy dead,
  // and every read here answers 401 for ever. The platform can re-read the
  // token as the parent, so it does that once rather than reporting a state it
  // could not actually see. Anything still refused is reported AS a refusal:
  // "we could not ask" is a different fact from "they have not answered", and
  // conflating the two is how a registration sits still for a week looking
  // exactly like one that is progressing.
  const ask = async (acct: { sid: string; token: string }) => ({
    brand: line.brand_sid ? await read(`https://messaging.twilio.com/v1/a2p/BrandRegistrations/${line.brand_sid}`, acct) : null,
    campaign: line.messaging_service_sid ? await read(`https://messaging.twilio.com/v1/Services/${line.messaging_service_sid}/Compliance/Usa2p`, acct) : null,
  });
  const refused = (a: { brand: { status: number } | null; campaign: { status: number } | null }) =>
    [a.brand, a.campaign].some((x) => x && (x.status === 401 || x.status === 403));

  let answers = await ask(sub);
  if (refused(answers)) {
    const fresh = await refreshLineToken(db, line);
    if (!fresh.ok || !fresh.account) {
      await db.from("lines").update({ last_error: `could not read the registration: ${fresh.error ?? "the provider refused our credentials"}` }).eq("id", line.id);
      return { ok: false, smsState: line.sms_state, error: fresh.error ?? "provider_unauthorized" };
    }
    answers = await ask(fresh.account);
    if (refused(answers)) {
      await db.from("lines").update({ last_error: "could not read the registration: the provider refused the line's credentials even after a refresh" }).eq("id", line.id);
      return { ok: false, smsState: line.sms_state, error: "provider_unauthorized" };
    }
  }
  const brand = answers.brand?.body ?? null;
  const campaign = answers.campaign?.body ?? null;
  const brandStatus = typeof brand?.status === "string" ? brand.status : null;
  // THE CAMPAIGN IS IN A LIST. `GET /Services/{MG}/Compliance/Usa2p` answers
  // `{compliance: [ {campaign_status, mock, ...} ], meta}` -- there is no
  // top-level campaign_status, so reading one gave null on every tick since
  // this was written. Verified against the live API on 2026-09-09:
  //
  //   top-level keys: compliance, meta
  //   b.campaign_status                 undefined
  //   b.compliance[0].campaign_status   "VERIFIED"
  //
  // Which means no line could ever reach `active`, so the inbound path held
  // every text for a person for ever -- the exact failure the comment on
  // smsStateFor's VERIFIED branch says it was written to end. A field read one
  // level too high does not fail; it reads as "the carriers have not answered",
  // which is indistinguishable from a slow week.
  const usa2p = Array.isArray(campaign?.compliance) ? (campaign.compliance[0] as Record<string, unknown> | undefined) : undefined;
  const campaignStatus = typeof usa2p?.campaign_status === "string" ? usa2p.campaign_status : null;
  // Twilio says whether the filing it holds is a rehearsal, so it -- not our
  // column -- is the authority on it. A refile that made the campaign real is
  // recorded here without anyone having to remember to write it.
  const mock = typeof usa2p?.mock === "boolean" ? usa2p.mock : line.reg_mock;
  const smsState = smsStateFor({ brandStatus, campaignStatus, mock });
  // Both sides of the filing can be refused, and until now only one was read:
  // the brand's `failure_reason`. A campaign's reasons live in
  // `compliance[0].errors[]` -- one level below where the old code looked, the
  // same place the campaign's STATUS was once missed -- so every campaign
  // rejection stored the generic fallback and the actual causes were dropped.
  //
  // BOTH refusing states, not just `rejected`. smsStateFor maps a SUSPENDED
  // brand to `failed`, and the first version computed the reason only for
  // `rejected` -- so a suspension read its failure_reason, threw it away, and
  // then wrote last_error: null over whatever was there. The one state where
  // the carriers explain themselves at most length was the one that recorded
  // nothing.
  const refusing = smsState === "rejected" || smsState === "failed";
  const reason = refusing
    ? refusalWords({
        brandFailureReason: typeof brand?.failure_reason === "string" ? brand.failure_reason : null,
        campaignErrors: Array.isArray(usa2p?.errors) ? (usa2p.errors as CampaignError[]) : null,
      }) ?? "the carriers sent the registration back"
    : null;
  const moved = smsState !== line.sms_state;
  await db.from("lines").update({
    sms_state: smsState,
    reg_mock: mock,
    last_error: reason,
    // Only when the state actually MOVED. This sweep runs hourly and wrote it
    // every time, so `state_since` meant "the last hour" rather than "when this
    // wait began" -- and the Setup row reads it to say how long the carriers
    // have had it, which therefore never got past an hour.
    ...(moved ? { state_since: new Date().toISOString() } : {}),
  }).eq("id", line.id);

  // The carriers answering is the whole point of the wait, so the owner is
  // told — once, on the change. The sweep runs hourly; a bell every hour
  // would bury the one that matters.
  // `mock`, not `line.reg_mock`: the value read from Twilio a few lines above is
  // the authority, and the column is what it was BEFORE this sync. Passing the
  // stale one announced a refile that had just become real as "this was a test
  // filing, so nothing routes" -- telling an owner their working texting does
  // not work, in the one message that exists to tell them it does.
  const verdict = registrationVerdict(line.sms_state, smsState, {
    number: formatPhoneDisplay(line.e164) ?? line.e164,
    reason,
    mock,
  });
  if (verdict) {
    await recordNotification(line.tenant_id, { kind: verdict.kind, title: verdict.title, body: verdict.body, route: verdict.route, about: { type: "line", id: line.id } });
    await emitEvent(db, line.tenant_id, verdict.event, "setup", "line", line.id, { e164: line.e164, from: line.sms_state, to: smsState, mock }).catch(() => {});
  }
  return { ok: true, smsState, brand: brandStatus ?? undefined, campaign: campaignStatus ?? undefined, told: !!verdict };
}
