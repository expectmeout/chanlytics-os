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
  runA2PSaga, smsStateFor, registrationVerdict, LOW_VOLUME_USECASE, deleteCampaignRequest,
  encodeForm, soleProprietorUnsupported, type A2PPorts, type A2PRequest, type A2PState, type BusinessRecord,
} from "./workspace/channels.js";
import { formatPhoneDisplay } from "./workspace/contracts.js";
import { emitEvent } from "./workspace/db.js";
import { recordNotification } from "./notify.js";
import { lineProviderFromEnv } from "./lines.js";
import { lineAccount } from "./sms.js";
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

/** What the workspace tells a reviewer about the messages it will send. */
export function campaignFactsFor(o: { businessName: string; optInUrl: string; privacyUrl: string; termsUrl: string }) {
  return {
    description: `${o.businessName} answers its own customers and sends them appointment reminders and occasional offers. Messages are written or approved by the business; a customer starts every conversation or asks for offers first.`,
    messageFlow: `Customers opt in by messaging the business first, or by sending the words YES OFFERS from the business's public sign-up page at ${o.optInUrl}, which states the message frequency, that rates may apply, and how to stop.`,
    // Samples a reviewer reads. They must not state a fact about the
    // business we were never given — an invented opening time is a claim
    // made in their name.
    samples: [
      `Hi, thanks for writing ${o.businessName}. How can we help today?`,
      `Reminder from ${o.businessName}: you have an appointment tomorrow. Reply STOP to opt out.`,
    ],
    optInMessage: `You're subscribed to offers and news from ${o.businessName}. Msg&data rates may apply. Reply STOP to opt out, HELP for help.`,
    // Single words only, and only ones the receptionist actually honours
    // (contracts OPT_IN_PATTERN). The two-word phrase lives in the flow above.
    optInKeywords: ["START", "UNSTOP", "RESUME"],
    privacyPolicyUrl: o.privacyUrl,
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
 * Two things come off, and only two. The campaign is DELETED at Twilio because
 * a Messaging Service holds exactly one and the real POST would be refused
 * while the mock is there; the brand and campaign sids come off the row. The
 * TrustHub profile, the business, the representative, the address and the
 * document all STAY: only the brand ever carried Mock, so those receipts are
 * real, and the saga skips every step it still holds one for.
 *
 * Never called for a real filing -- that one was paid for and vetted, and the
 * caller refuses the whole operation before reaching here.
 */
export async function unfileMockRegistration(db: Db, line: LineRow): Promise<{ ok: boolean; error?: string; row?: LineRow }> {
  const L = logger({ tenant_id: line.tenant_id, line_id: line.id });
  if (line.messaging_service_sid) {
    const sub = await lineAccount(db, line).catch(() => null);
    if (!sub) return { ok: false, error: "no_line_credentials" };
    const req = deleteCampaignRequest(line.messaging_service_sid);
    // Best effort by design: a campaign that is already gone is the state we
    // were asking for, and Twilio answers 404 for it.
    const r = await fetch(req.url, {
      method: req.method,
      headers: { Authorization: `Basic ${Buffer.from(`${sub.sid}:${sub.token}`).toString("base64")}` },
      signal: AbortSignal.timeout(20000),
    }).catch(() => null);
    L.info("a2p.mock_campaign_deleted", { status: r?.status ?? 0, ok: !r || r.ok || r.status === 404 });
  }
  // `single()` is the row count: a write that changed nothing errors here
  // rather than returning a success the caller would file on top of.
  const cleared = await db.from("lines").update({
    brand_sid: null,
    campaign_sid: null,
    reg_mock: false,
    reg_step: null,
    sms_state: "registering",
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
  // Refused before anything is created: on a real filing this would be a fee
  // spent on a registration the carriers reject.
  if (soleProprietorUnsupported(businessRecordFrom(o.record))) {
    await db.from("lines").update({
      sms_state: "failed",
      last_error: "Texting for a business without a tax id needs a different registration, which Chanlytics has not built yet. A person at Chanlytics has this.",
      state_since: new Date().toISOString(),
    }).eq("id", o.line.id);
    return { ok: false, error: "sole_proprietor_unsupported", state, smsState: "failed" };
  }

  const L = logger({ tenant_id: o.line.tenant_id, line_id: o.line.id });
  const record = businessRecordFrom(o.record);

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
    campaign: campaignFactsFor({ businessName: o.workspaceName, optInUrl: o.optInUrl, privacyUrl: o.privacyUrl, termsUrl: o.termsUrl }),
    messagingServiceSid: o.line.messaging_service_sid,
    useCase: LOW_VOLUME_USECASE,
    mock: o.mock,
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

  await db.from("lines").update({ sms_state: "registering", reg_mock: o.mock, last_error: null, state_since: new Date().toISOString() }).eq("id", o.line.id);
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
  const read = async (url: string, acct: { sid: string; token: string }) => {
    const r = await fetch(url, { headers: { Authorization: basic(acct) }, signal: AbortSignal.timeout(15000) });
    return (await r.json().catch(() => null)) as Record<string, unknown> | null;
  };
  // Both are the workspace's own, so both are read as its subaccount.
  const sub = await lineAccount(db, line).catch(() => null);
  const brand = line.brand_sid && sub ? await read(`https://messaging.twilio.com/v1/a2p/BrandRegistrations/${line.brand_sid}`, sub) : null;
  const campaign = line.messaging_service_sid && sub ? await read(`https://messaging.twilio.com/v1/Services/${line.messaging_service_sid}/Compliance/Usa2p`, sub) : null;
  const brandStatus = typeof brand?.status === "string" ? brand.status : null;
  const campaignStatus = typeof campaign?.campaign_status === "string" ? campaign.campaign_status : null;
  const smsState = smsStateFor({ brandStatus, campaignStatus });
  const failure = typeof brand?.failure_reason === "string" ? brand.failure_reason : null;
  const reason = smsState === "rejected" ? failure ?? "the carriers sent the registration back" : null;
  await db.from("lines").update({
    sms_state: smsState,
    last_error: reason,
    state_since: new Date().toISOString(),
  }).eq("id", line.id);

  // The carriers answering is the whole point of the wait, so the owner is
  // told — once, on the change. The sweep runs hourly; a bell every hour
  // would bury the one that matters.
  const verdict = registrationVerdict(line.sms_state, smsState, {
    number: formatPhoneDisplay(line.e164) ?? line.e164,
    reason,
    mock: line.reg_mock,
  });
  if (verdict) {
    await recordNotification(line.tenant_id, { kind: verdict.kind, title: verdict.title, body: verdict.body, route: verdict.route, about: { type: "line", id: line.id } });
    await emitEvent(db, line.tenant_id, verdict.event, "setup", "line", line.id, { e164: line.e164, from: line.sms_state, to: smsState, mock: line.reg_mock }).catch(() => {});
  }
  return { ok: true, smsState, brand: brandStatus ?? undefined, campaign: campaignStatus ?? undefined, told: !!verdict };
}
