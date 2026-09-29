/**
 * Registering a workspace with the carriers, on the edge: the business on
 * record read from its row, the ports the pure saga runs over, and the one
 * place a Twilio credential is used for it.
 *
 * Every call is made as the MASTER account, not the workspace's
 * subaccount: the bundles hang under Chanlytics' own approved primary
 * profile, which is what makes these businesses ours to register.
 *
 * This module holds the filing itself: the row types the A2P modules share, the
 * pre-flight every door to the carriers asks (`filingProblems`), and `registerLine`.
 * Its neighbours: the campaign's words in a2p-campaign-facts.ts, the corrections
 * of a filed line in a2p-refile.ts, and the status read in a2p-sync.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import {
  answerObject,
  runA2PSaga,
  LOW_VOLUME_USECASE,
  encodeForm,
  brandTypeFor,
  twilioRequest,
  type A2PPorts,
  type A2PRequest,
  type A2PResult,
  type A2PState,
  type BusinessRecord,
  type ProviderAccount,
} from "../packages/channels.js";
import {
  formatPhoneDisplay,
  industryOf,
  businessRecordProblems,
  registrationPathOf,
  registrationPreflight,
  type EdgeErrorCode,
} from "../packages/contracts.js";
import { platformTo } from "../ops/notify.js";
import { lineProviderFromEnv } from "./lines.js";
import { lineAccount } from "../sms/sms.js";
import { logger } from "../log.js";
import { env } from "../env.js";
import { campaignFactsFor } from "./a2p-campaign-facts.js";

export type Db = SupabaseClient<Database>;
export type LineRow = Database["public"]["Tables"]["lines"]["Row"];
export type RecordRow = Database["public"]["Tables"]["business_records"]["Row"];
export const TWILIO_TIMEOUT_MS = 20000;

/** Chanlytics' own approved primary customer profile; without it nothing may be filed. */
export function primaryProfileSid(): string | null {
  return env.TWILIO_PRIMARY_PROFILE_SID || null;
}

/** Where Twilio writes about a bundle: the platform's mailbox, never a customer's. */
/** Twilio's contact for the filing: one address, the first of LEAD_TO when there are several. */
function platformEmail(): string | null {
  return platformTo()[0] ?? null;
}

function businessRecordFrom(r: RecordRow): BusinessRecord {
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
function a2pStateFrom(l: LineRow): A2PState {
  const f = (l.facts && typeof l.facts === "object" && !Array.isArray(l.facts) ? l.facts : {}) as Record<
    string,
    unknown
  >;
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
export async function filingProblems(
  db: Db,
  line: LineRow,
  o: {
    record: RecordRow;
    /** What the CAMPAIGN will state. Not the record's name, which is what the brand states. */
    workspaceName: string;
    /** Whether a customer has any way to say yes yet. Defaults to true: a caller that never looked it up must not block a filing on it. */
    hasOptInNumber?: boolean;
  },
): Promise<string[]> {
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
    about: o.record.about,
    hasOptInNumber: o.hasOptInNumber ?? true,
  })) {
    problems.push(`${p.what} ${p.fix}`);
  }
  return problems;
}

export interface RegisterResult {
  ok: boolean;
  /** Not a refusal: the carriers have not finished with the brand yet. */
  pending?: boolean;
  step?: string;
  error?: EdgeErrorCode;
  /** What the carrier said when the filing stopped, as the row's `last_error` keeps it. */
  detail?: string;
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
export async function registerLine(
  db: Db,
  o: {
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
  },
): Promise<RegisterResult> {
  const state = a2pStateFrom(o.line);
  const ready = filingPrerequisites(o.line, state);
  if (!ready.ok) return ready;
  const refused = await preflightRefusal(db, o, state);
  if (refused) return refused;
  const record = recordAsFiled(o);

  // Everything is filed as the WORKSPACE'S OWN subaccount, per Twilio's ISV
  // guide; our primary profile is referenced by sid, never moved.
  const sub = await lineAccount(db, o.line).catch(() => null);
  if (!sub) return { ok: false, error: "no_line_credentials", state, smsState: o.line.sms_state };
  const ports = filingPorts(db, o, { ...ready, sub, record });
  return settleFiling(db, o, await runFiling(db, o, state, ports));
}

/** What `registerLine` is asked to file, as its callers pass it. */
type Filing = Parameters<typeof registerLine>[1];

/**
 * What the platform needs before anything is filed: Twilio as the line provider, our own approved primary profile, a
 * mailbox for Twilio to write to, and the line's Messaging Service. A refusal here has read and written nothing.
 */
function filingPrerequisites(
  line: LineRow,
  state: A2PState,
):
  | { ok: false; error: EdgeErrorCode; state: A2PState; smsState: string }
  | { ok: true; primary: string; email: string; messagingServiceSid: string } {
  const choice = lineProviderFromEnv();
  const primary = primaryProfileSid();
  const email = platformEmail();
  if (!choice || choice.name !== "twilio") return { ok: false, error: "no_provider", state, smsState: line.sms_state };
  if (!primary) return { ok: false, error: "no_primary_profile", state, smsState: line.sms_state };
  if (!email) return { ok: false, error: "no_platform_mailbox", state, smsState: line.sms_state };
  if (!line.messaging_service_sid) return { ok: false, error: "no_messaging_service", state, smsState: line.sms_state };
  return { ok: true, primary, email, messagingServiceSid: line.messaging_service_sid };
}

/** The pre-flight: null when the filing may go ahead, else the refusal, with the row set to `needs_record`. */
async function preflightRefusal(db: Db, o: Filing, state: A2PState): Promise<RegisterResult | null> {
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
  if (!problems.length) return null;

  // NOTHING HAS BEEN SENT, so `needs_record` is the truth about this row and the
  // sentences are what the owner has to act on. They are RETURNED as well as
  // stored: the row is read by a page that reloads, and the person who just
  // pressed the button is owed the answer now rather than an error token.
  await db
    .from("lines")
    .update({
      sms_state: "needs_record",
      last_error: problems.join(" "),
      state_since: new Date().toISOString(),
    })
    .eq("id", o.line.id);
  return {
    ok: false,
    error: path === "sole_proprietor" ? "sole_proprietor_incomplete" : "record_incomplete",
    problems,
    state,
    smsState: "needs_record",
  };
}

/** The business on record as every request of this filing states it. */
function recordAsFiled(o: Filing): BusinessRecord {
  // A business with no website of its own files the page we publish for it. The
  // substitution happens HERE, once, rather than in each request builder: the
  // brand, the campaign and the profile must all name the same URL, and three
  // places deciding that separately is three places to disagree.
  const base = businessRecordFrom(o.record);
  const record = base.websiteUrl?.trim() ? base : { ...base, websiteUrl: o.hostedUrl ?? base.websiteUrl };
  return record;
}

/** The saga's one way to Twilio: a request made as the subaccount, and what Twilio answered, parsed once. */
function subaccountSend(sub: ProviderAccount): A2PPorts["send"] {
  const send = async (req: A2PRequest) => {
    const r = await twilioRequest(sub, req.method, req.url, {
      ...(req.form ? { form: encodeForm(req.form) } : {}),
      timeoutMs: TWILIO_TIMEOUT_MS,
    });
    // No answer at all throws, as the bare fetch it replaces did: the saga records the step as failed and tries it again.
    if (r.status === 0) throw new Error(`twilio: ${r.error ?? "no answer"}`);
    const body = answerObject(r) ?? (r.json === null && r.text ? { text: r.text.slice(0, 300) } : null);
    return { status: r.status, body };
  };
  return send;
}

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

/** The saga's save: each receipt to its column, or into the row's facts, of which this filing keeps its own copy. */
function receiptSaver(db: Db, line: LineRow): A2PPorts["save"] {
  const facts = (
    line.facts && typeof line.facts === "object" && !Array.isArray(line.facts)
      ? { ...(line.facts as Record<string, unknown>) }
      : {}
  ) as Record<string, unknown>;

  return async (patch) => {
    const row: Record<string, unknown> = {};
    let touchedFacts = false;
    for (const [k, v] of Object.entries(patch)) {
      const col = COLUMN_OF[k as keyof A2PState];
      if (col) {
        row[col] = v;
        continue;
      }
      const fact = FACT_OF[k as keyof A2PState];
      if (fact) {
        facts[fact] = v;
        touchedFacts = true;
      }
    }
    if (touchedFacts) row.facts = facts;
    const { error } = await db
      .from("lines")
      .update(row as Database["public"]["Tables"]["lines"]["Update"])
      .eq("id", line.id);
    if (error) throw new Error(`keeping the registration's receipt: ${error.message}`);
  };
}

/** What the saga runs over: the subaccount's send, the business and the campaign's words, and the receipts' save. */
function filingPorts(
  db: Db,
  o: Filing,
  f: { sub: ProviderAccount; record: BusinessRecord; primary: string; email: string; messagingServiceSid: string },
): A2PPorts {
  const { sub, record, primary, email } = f;
  const ports: A2PPorts = {
    send: subaccountSend(sub),
    accountSid: sub.sid,
    primaryProfileSid: primary,
    email,
    ...(o.statusCallback ? { statusCallback: o.statusCallback } : {}),
    workspace: { name: o.workspaceName },
    record,
    // Twilio's vertical enum. The sole-proprietor end user asks for it by
    // name; the standard path carries it inside the business end user.
    industry: industryOf(record.industry),
    campaign: campaignFactsFor({
      businessName: o.workspaceName,
      legalName: o.record.legal_name,
      about: o.record.about,
      optInUrl: o.optInUrl,
      privacyUrl: o.privacyUrl,
      termsUrl: o.termsUrl,
      hostedUrl: o.hostedUrl,
      lineNumber: formatPhoneDisplay(o.line.e164),
    }),
    messagingServiceSid: f.messagingServiceSid,
    useCase: LOW_VOLUME_USECASE,
    mock: o.mock,
    // Tied to the use case above, deliberately: everything this product files
    // is LOW_VOLUME, and secondary vetting only buys throughput a low-volume
    // campaign cannot use. It is the expensive half of a registration -- $46
    // for the first real one, against $4 for the brand itself -- so a caller
    // that ever files something bigger should turn it back on with its eyes
    // open rather than inherit it by silence.
    skipVetting: true,
    save: receiptSaver(db, o.line),
  };
  return ports;
}

/** The filing itself: the row says `registering`, and which registration, before the saga's first call. */
async function runFiling(db: Db, o: Filing, state: A2PState, ports: A2PPorts): Promise<A2PResult> {
  const record = ports.record;
  // reg_sole_prop is written HERE, with reg_mock, and never derived later: an
  // owner who incorporates and types their new tax id would otherwise read
  // back as a standard brand while the carriers still hold the narrow one --
  // promising throughput the line does not have.
  await db
    .from("lines")
    .update({
      sms_state: "registering",
      reg_mock: o.mock,
      reg_sole_prop: brandTypeFor(record) === "SOLE_PROPRIETOR",
      last_error: null,
      state_since: new Date().toISOString(),
    })
    .eq("id", o.line.id);
  const result = await runA2PSaga(state, ports);
  return result;
}

/** Where the filing ended, written to the row and the log, and answered. */
async function settleFiling(db: Db, o: Filing, result: A2PResult): Promise<RegisterResult> {
  const L = logger({ tenant_id: o.line.tenant_id, line_id: o.line.id });
  // A campaign that cannot be filed until the carriers finish with the brand
  // is a WAIT: everything asked for was accepted. The row says "waiting on
  // carriers", carries no error, and the next status check files it.
  const waiting = !result.ok && result.pending;
  const smsState = result.ok || waiting ? "registering" : "failed";
  await db
    .from("lines")
    .update({
      sms_state: smsState,
      reg_step: result.ok ? null : result.step,
      last_error: result.ok || waiting ? null : result.error,
      state_since: new Date().toISOString(),
    })
    .eq("id", o.line.id);
  if (result.ok)
    L.info("a2p_filed", { mock: o.mock, brand: result.state.brandSid, campaign: result.state.campaignSid });
  else if (waiting) L.info("a2p_waiting_on_brand", { brand: result.state.brandSid });
  else L.error("a2p_failed", { step: result.step, error: result.error });
  return result.ok ? { ok: true, state: result.state, smsState } : stoppedFiling(result, smsState);
}

/**
 * A filing the saga stopped: where, and the carrier's words in `detail` (the row keeps them as its last_error). A
 * campaign waiting on the brand is not a refusal, and its code says so.
 */
function stoppedFiling(result: Extract<A2PResult, { ok: false }>, smsState: string): RegisterResult {
  return {
    ok: false,
    pending: result.pending,
    step: result.step,
    error: result.pending ? "registration_pending" : "register_failed",
    detail: result.error,
    state: result.state,
    smsState,
  };
}
