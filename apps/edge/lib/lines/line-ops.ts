/**
 * The lines door's ops (api/admin/lines.ts), decided apart from the wire.
 *
 * WHY THIS IS A MODULE AND NOT THE ENDPOINT. The door spends a workspace's
 * money on Chanlytics' own Twilio account -- a number is $1.15 a month for as
 * long as it is held, a registration $19.50 one time and non-refundable, a
 * replaced campaign a second vetting fee -- and every decision about when it
 * may sat in one function of ten ops and a hundred and twenty branches. The
 * house answers this the same way each time: judgeHealth apart from the
 * health route, planSmsIngress apart from the texting door, the call-start
 * plan apart from the voice door. This is the lines door's.
 *
 * NOTHING HERE READS OR WRITES. Each function takes what the door read and
 * returns what to answer, insert or schedule -- an answer is a status and a
 * body, a plan says which -- and the door reads the rows in the order the ops
 * need them, applies the plan and answers. The order of the reads is the
 * door's, because it is part of what the door promises: the spend rule is
 * asked before a row exists, and a filing the pre-flight refuses never
 * reaches the vault.
 */
import type { Database } from "../packages/db.js";
import { isAreaCode, isE164, LINE_COSTS, type LineProviderName } from "../packages/channels.js";
import {
  formatPhoneDisplay,
  whyCannotSpend,
  type SpendWords,
  lineRetryRefusal,
  type BillingMode,
  type BillingStatus,
  businessTypeOf,
  companyTypeOf,
  industryOf,
  businessRecordProblems,
  businessRecordForPath,
  registrationPathOf,
  REGISTRATION_PATHS,
  type RegistrationPath,
} from "../packages/contracts.js";
import { lineForClient, type LineProviderChoice } from "./lines.js";
import { campaignFactsFor, type RegisterResult } from "./a2p.js";
import { retryRequestedBy, type LineDbRow } from "./line-resume.js";
import type { LineReleaseResult } from "./line-release.js";

type LinesInsert = Database["public"]["Tables"]["lines"]["Insert"];
type RecordRow = Database["public"]["Tables"]["business_records"]["Row"];

/** What the door answers: the status and the JSON body. */
export interface LineAnswer {
  status: number;
  body: unknown;
}

/** The body as the dashboard's /api/v1/lines verbs send it; every field is checked here before it is believed. */
export interface LinesBody {
  op?: string;
  tenant_id?: string;
  area_code?: number | string;
  number?: string;
  line_id?: string;
  /** Who pressed Retry: "owner" from the owner's route, "support" from the back office. */
  by?: string;
  /** The business on record, as the form sends it; validated field by field below. */
  record?: unknown;
  /**
   * Which registration the record is for: "standard" or "sole_proprietor".
   *
   * Sent because it cannot be safely inferred -- an empty tax id is both "there
   * is none" and "not typed yet", and one of those answers leads to a filing
   * that cannot be withdrawn. Absent, it is derived from the tax id.
   */
  path?: string;
  /** File against Twilio's free test registry instead of the carriers. */
  mock?: boolean;
  /** Replace a rehearsal filing with a real one. Refused on a real filing. */
  refile?: boolean;
  /** With `refile`: delete a REFUSED campaign and file a new one (a second vetting fee). */
  replace?: boolean;
}

export const UNKNOWN_LINE_OP: LineAnswer = {
  status: 400,
  body: { ok: false, error: "op must be status, search, buy, retry, release, record, register or registration-status" },
};

/** Nothing to fake with and no credentials: the Setup page keeps "we set it up with you". */
export const NO_LINE_PROVIDER: LineAnswer = {
  status: 503,
  body: {
    ok: false,
    error: "no_line_provider",
    hint: "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN, or LINES_DRY_RUN=1 outside production",
  },
};

/** May this deployment get lines, and with which provider. */
export function lineStatus(choice: LineProviderChoice | null): LineAnswer {
  return { status: 200, body: { ok: true, ready: !!choice, provider: choice?.name ?? null, costs: LINE_COSTS } };
}

function areaCodeOf(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && /^\d{3}$/.test(v.trim())) return Number(v.trim());
  return null;
}

/* ---------------------------------------------------------------- search */

/** A search is a question to the provider, once the area code is three digits. */
export function planSearch(
  rawAreaCode: unknown,
): { kind: "refuse"; answer: LineAnswer } | { kind: "search"; areaCode: number } {
  const areaCode = areaCodeOf(rawAreaCode);
  if (!isAreaCode(areaCode)) {
    return {
      kind: "refuse",
      answer: { status: 400, body: { ok: false, error: "area_code must be three digits, like 305" } },
    };
  }
  return { kind: "search", areaCode };
}

export function searchAnswer(choice: LineProviderChoice, areaCode: number, numbers: unknown): LineAnswer {
  return {
    status: 200,
    body: {
      ok: true,
      provider: choice.name,
      area_code: areaCode,
      cost_month_usd: LINE_COSTS.local_number_month_usd,
      numbers,
    },
  };
}

/* ------------------------------------------------------------- the spend rule */

/** The billing row as the door read it: PostgREST's envelope, no more. */
interface BillingRead {
  data: { mode: string; status: string } | null;
  error: { message: string } | null;
}

/**
 * THE SAME RULE, ON THIS SIDE OF THE WIRE.
 *
 * The dashboard checks it before forwarding, and the door is reachable with
 * the diagnostic key alone, so it must not take the caller's word for whether
 * the workspace may spend. Both ops that land a charge on Chanlytics' Twilio
 * account ask it: a number is $1.15 a month for as long as it is held, a
 * registration is $19.50 one time and non-refundable.
 *
 * `refile` was exempted wholesale, on the premise that it corrects a filing
 * already paid for. That is true of exactly ONE of its three paths. A refile
 * of a REHEARSAL files the workspace's first real brand and campaign
 * ($19.50, non-refundable), and `refile` with `replace` deletes the refused
 * campaign and files a new one (a second vetting fee, about $15); only the
 * in-place resubmit of a rejected campaign is the free edit the premise
 * describes. So the gate is not a question about a flag any more -- it is
 * asked where the ROW says what the filing will actually be (filingFlags).
 */
export function spendRefusal(bill: BillingRead, doing: SpendWords): LineAnswer | null {
  if (bill.error) return { status: 503, body: { ok: false, error: bill.error.message } };
  if (!bill.data) return { status: 402, body: { ok: false, error: "no_billing_record" } };
  const why = whyCannotSpend(bill.data.mode as BillingMode, bill.data.status as BillingStatus, doing);
  if (why)
    return { status: 402, body: { ok: false, error: "payment_required", detail: why, status: bill.data.status } };
  return null;
}

/* ------------------------------------------------------------------- buy */

/** The number asked for, E.164, with the area code off the body or off the number itself. */
export function buyRequest(
  rawNumber: unknown,
  rawAreaCode: unknown,
): { kind: "refuse"; answer: LineAnswer } | { kind: "buy"; number: string; areaCode: number | null } {
  const number = typeof rawNumber === "string" ? rawNumber.trim() : "";
  if (!isE164(number)) {
    return {
      kind: "refuse",
      answer: { status: 400, body: { ok: false, error: "number must be E.164, like +13055550100" } },
    };
  }
  const areaCode = areaCodeOf(rawAreaCode) ?? (number.startsWith("+1") ? Number(number.slice(2, 5)) : null);
  return { kind: "buy", number, areaCode };
}

/**
 * One line per workspace in v1: a second buy is refused while one is live, and
 * a failed one is answered with the row to retry rather than a new purchase.
 * Otherwise the row to insert, at the saga's first step.
 */
export function planBuy(o: {
  tenantId: string;
  provider: LineProviderName;
  number: string;
  areaCode: number | null;
  others: LineDbRow[];
  now: Date;
}): { kind: "refuse"; answer: LineAnswer } | { kind: "provision"; row: LinesInsert } {
  const live = o.others.find((l) => l.voice_state === "provisioning" || l.voice_state === "answering");
  if (live)
    return {
      kind: "refuse",
      answer: { status: 409, body: { ok: false, error: "line_exists", line: lineForClient(live) } },
    };
  const failed = o.others.find((l) => l.voice_state === "failed");
  if (failed) {
    return {
      kind: "refuse",
      answer: { status: 409, body: { ok: false, error: "line_failed_retry", line: lineForClient(failed) } },
    };
  }
  return {
    kind: "provision",
    row: {
      tenant_id: o.tenantId,
      e164: o.number,
      kind: "chanlytics",
      provider: o.provider,
      area_code: o.areaCode,
      voice_state: "provisioning",
      step: "subaccount",
      state_since: o.now.toISOString(),
    },
  };
}

/**
 * The saga, on the ledger (00109): claimed under a lease within ten seconds,
 * resumed by the heartbeat if a worker dies, tried up to the cap. The page
 * repaints from the row through realtime as each step lands its receipt.
 */
export function provisionJob(
  tenantId: string,
  lineId: string,
  by: "owner" | "support",
  now: Date,
): { tenantId: string; kind: "line_provision"; dueAt: Date; payload: { line_id: string; by: "owner" | "support" } } {
  return { tenantId, kind: "line_provision", dueAt: now, payload: { line_id: lineId, by } };
}

/** Accepted, not done: the saga is scheduled, and the page sees the row's public face. */
export function queuedAnswer(choice: LineProviderChoice, row: LineDbRow): LineAnswer {
  return { status: 202, body: { ok: true, queued: true, provider: choice.name, line: lineForClient(row) } };
}

/** The ledger refused the job: said as such, with the row it left (the lines sweep picks it up past the deadline). */
export function notScheduledAnswer(e: unknown, row: LineDbRow): LineAnswer {
  return {
    status: 503,
    body: { ok: false, error: e instanceof Error ? e.message : String(e), line: lineForClient(row) },
  };
}

/* ----------------------------------------------------------------- retry */

/**
 * The rule is `lineRetryRefusal`, in contracts beside the deadline it reads.
 * A line still SETTING UP past that deadline is retryable, and the guard that
 * used to live in the door inline was the reason it was not: the saga's worst
 * case is about three times its own 60-second lambda ceiling, so a slow
 * afternoon at the provider kills it mid-run, and a killed run never reaches
 * the `catch` that would have written `failed`. Safe to resume because the
 * saga reads its own receipts -- `nextLineStep` derives the plan from the
 * SIDs already on the row, so nothing is repeated.
 */
export function planRetry(
  row: LineDbRow,
  rawBy: unknown,
  now: Date,
): { kind: "refuse"; answer: LineAnswer } | { kind: "claim"; by: "owner" | "support" } {
  const refusal = lineRetryRefusal(lineForClient(row), now.getTime());
  if (refusal)
    return { kind: "refuse", answer: { status: 409, body: { ok: false, error: refusal, line: lineForClient(row) } } };
  return { kind: "claim", by: retryRequestedBy(rawBy) };
}

/** The take was somebody else's: the row read a moment ago is already setting up. */
export function retryTakenAnswer(row: LineDbRow): LineAnswer {
  return {
    status: 409,
    body: {
      ok: false,
      error: "somebody restarted this line a moment ago — it is setting up now, and this page updates by itself",
      line: lineForClient(row),
    },
  };
}

/* --------------------------------------------------------------- release */

export function releaseAnswer(r: LineReleaseResult): LineAnswer {
  if (!r.ok) return { status: r.status, body: { ok: false, error: r.error, released: r.released } };
  return { status: 200, body: { ok: true, released: r.released } };
}

/* ---------------------------------------------------------------- record */

/** The business on record, normalised as the path files it, or the refusal when there is no record to read. */
export function planRecord(
  rawRecord: unknown,
  rawPath: unknown,
  tenantId: string,
): { kind: "refuse"; answer: LineAnswer } | { kind: "keep"; path: RegistrationPath; row: RecordDraft } {
  const b = rawRecord && typeof rawRecord === "object" ? (rawRecord as Record<string, unknown>) : null;
  if (!b) return { kind: "refuse", answer: { status: 400, body: { ok: false, error: "record is required" } } };
  const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string).trim() : "");

  // WHICH registration this record is for. Taken from the caller when it says,
  // derived from the tax id when it does not.
  //
  // It has to be said rather than inferred, because an absent tax id means two
  // different things -- "this business has none" and "the owner did not type
  // it" -- and inferring the first from the second files the SOLE-PROPRIETOR
  // brand, which allows one number and about one message a second and cannot
  // be withdrawn. Derivation is the fallback for a caller that predates the
  // field, and it is exact for a record that has already been saved: see
  // registrationPathOf in contracts for the invariant that makes it so.
  const asked = typeof rawPath === "string" ? rawPath : "";
  const path: RegistrationPath = (REGISTRATION_PATHS as readonly string[]).includes(asked)
    ? (asked as RegistrationPath)
    : (registrationPathOf({ ein: str("ein") }) ?? "standard");

  // Stored as the path files it: a sole-proprietor record keeps NO tax id, so
  // it reads back on the path it was saved on for ever.
  return { kind: "keep", path, row: businessRecordForPath(recordDraft(str, tenantId), path) };
}

/** The form's fields, trimmed, with the blanks the carriers accept as null or the default. */
function recordDraft(str: (k: string) => string, tenantId: string) {
  return {
    tenant_id: tenantId,
    legal_name: str("legal_name"),
    trade_name: str("trade_name") || null,
    ein: str("ein") || null,
    street: str("street"),
    street_secondary: str("street_secondary") || null,
    city: str("city"),
    region: str("region"),
    postal_code: str("postal_code"),
    country: str("country") || "US",
    website_url: str("website_url"),
    industry: industryOf(str("industry")),
    about: str("about").split(/\s+/).join(" "),
    business_type: businessTypeOf(str("business_type")),
    company_type: companyTypeOf(str("company_type")),
    contact_first_name: str("contact_first_name"),
    contact_last_name: str("contact_last_name"),
    contact_email: str("contact_email"),
    contact_phone: str("contact_phone"),
    contact_title: str("contact_title") || "Owner",
    contact_job_position: str("contact_job_position") || "Director",
  };
}

/** The row `planRecord` keeps: the form's fields, normalised, with the workspace on it. */
type RecordDraft = ReturnType<typeof recordDraft>;

/**
 * The same validator the form ran and the dashboard route ran, on the
 * normalised row rather than the raw body. Three callers, one list of what
 * each registration needs -- this door used to keep its own, and a list that
 * required a website of a sole proprietor whose filing never sends one is a
 * door that refuses a customer for a field nobody reads. The first problem,
 * in the owner's words, or nothing.
 */
export function recordRefusal(row: RecordDraft, path: RegistrationPath, ourNumbers: string[]): LineAnswer | null {
  const problems = businessRecordProblems(row, path, { ourNumbers });
  const first = Object.values(problems)[0];
  return first ? { status: 400, body: { ok: false, error: first } } : null;
}

export function recordAnswer(kept: Pick<RecordRow, "legal_name" | "ein" | "updated_at">): LineAnswer {
  return {
    status: 200,
    body: {
      ok: true,
      record: {
        legal_name: kept.legal_name,
        path: registrationPathOf(kept),
        sole_proprietor: !kept.ein,
        updated_at: kept.updated_at,
      },
    },
  };
}

/* -------------------------------------------------------------- register */

/** The pages a filing names, on this deployment's dashboard, for one workspace. */
export interface FilingPages {
  optInUrl: string;
  hostedUrl: string;
  privacyUrl: string;
  termsUrl: string;
}

export function filingPages(origin: string, slug: string): FilingPages {
  return {
    optInUrl: `${origin}/yes/${slug}`,
    hostedUrl: `${origin}/b/${slug}`,
    privacyUrl: `${origin}/privacy`,
    termsUrl: `${origin}/terms`,
  };
}

/** What this filing will BE, read off the row and the flags, before anything is read for it. */
interface FilingFlags {
  refile: boolean;
  /** A NEW campaign for a refused one, asked for by name: a second vetting fee, so never implied by `refile` alone. */
  replace: boolean;
  /** A brand and a campaign are on file. */
  onFile: boolean;
  /** The carriers sent the campaign back. */
  rejected: boolean;
  /**
   * The one path that is free: a campaign already on file that the carriers
   * SENT BACK, corrected in place. Twilio assesses the vetting fee once per
   * campaign, at its first decision, so editing that same resource costs
   * nothing -- which is why the back office offers it on a rejected line with
   * no price beside it (contracts/platform.ts), and why a workspace whose card
   * lapsed mid-review must still be able to answer the carriers. Everything
   * else that reaches a filing spends: a first filing, a rehearsal taken off
   * and made real, and a refused campaign deleted and replaced.
   */
  correctingInPlace: boolean;
  /** Never the default: a real filing costs the workspace money. A refile is always real. */
  mock: boolean;
}

export function filingFlags(body: Pick<LinesBody, "refile" | "replace" | "mock">, row: LineDbRow): FilingFlags {
  const refile = body.refile === true;
  const replace = body.replace === true;
  const onFile = !!row.brand_sid && !!row.campaign_sid;
  const rejected = row.sms_state === "rejected";
  return {
    refile,
    replace,
    onFile,
    rejected,
    correctingInPlace: refile && onFile && rejected && !replace,
    mock: !refile && body.mock === true,
  };
}

/** What the pre-flight checks a filing against: the record, the name the CAMPAIGN states, and whether anyone can say yes. */
interface FilingCheck {
  record: RecordRow;
  workspaceName: string;
  hasOptInNumber: boolean;
}

export type FilingPlan =
  | { kind: "refuse"; answer: LineAnswer }
  /** The rejected campaign, corrected in place: the same resource, edited, as the subaccount. */
  | { kind: "resubmit"; facts: ReturnType<typeof campaignFactsFor>; check: FilingCheck }
  /** A filing, after what comes off first: the refused campaign for a replacement, the rehearsal for a real one, or nothing. */
  | { kind: "file"; check: FilingCheck; takeOff: "replace" | "unfile" | null; mock: boolean };

/**
 * The filing, decided over the row, the record and whether a customer has
 * anywhere to say yes -- read above the branch, because BOTH ways out state
 * it to the carriers, a first filing and a resubmitted one.
 *
 * A REAL filing is final here: it cost the workspace money, the carriers
 * vetted it, and re-filing would buy a second one. A MOCK filing is a
 * rehearsal against Twilio's test registry -- free, routes nothing, gone in
 * thirty days -- and the only way out of one used to be a 409 with no next
 * step. A campaign the carriers SENT BACK is the exception, and it has to
 * be: a rejection is a correction request, and refusing to re-send one means
 * a workspace whose filing was refused for a fixable reason can never text at
 * all. The brand is kept: it was approved on its own, separately, and is the
 * expensive half. Only the campaign is replaced, which is what the carriers
 * actually refused.
 */
export function planFiling(o: {
  row: LineDbRow;
  record: RecordRow;
  workspaceName: string;
  /** The workspace's active texting rows, of either kind. */
  saysYes: unknown[];
  flags: FilingFlags;
  pages: FilingPages;
}): FilingPlan {
  const { row, flags } = o;
  const check: FilingCheck = {
    record: o.record,
    workspaceName: o.workspaceName,
    hasOptInNumber: o.saysYes.length > 0 || !!row.e164,
  };
  if (!flags.onFile) return { kind: "file", check, takeOff: null, mock: flags.mock };
  const refusal = refileRefusal(row, flags);
  if (refusal) return { kind: "refuse", answer: refusal };
  if (flags.rejected && !flags.replace) {
    // CORRECTED IN PLACE, not replaced: an edit of the same QE resource costs
    // nothing while a replacement is a fresh $15. The workspace's own name,
    // from the read the request already made: a rejection is answered after
    // the facts were corrected, and those corrections are what has to reach
    // the carriers.
    const facts = campaignFactsFor({
      businessName: o.workspaceName,
      legalName: check.record.legal_name,
      about: check.record.about,
      lineNumber: formatPhoneDisplay(row.e164),
      ...o.pages,
    });
    return { kind: "resubmit", facts, check };
  }
  return { kind: "file", check, takeOff: flags.rejected ? "replace" : "unfile", mock: flags.mock };
}

/** A filing that stands, a refusal without a refile, a rehearsal without one: each says what it is and what to send. */
function refileRefusal(row: LineDbRow, flags: FilingFlags): LineAnswer | null {
  const sids = { brand_sid: row.brand_sid, campaign_sid: row.campaign_sid };
  if (!row.reg_mock && !flags.rejected)
    return { status: 409, body: { ok: false, error: "already_registered", ...sids } };
  if (flags.rejected && !flags.refile) {
    return {
      status: 409,
      body: {
        ok: false,
        error: "campaign_rejected",
        hint: "the carriers sent this campaign back; correct what they named, then send refile: true to resubmit it (an edit, so no second vetting fee) -- or refile: true with replace: true to delete it and file a new one, when what they named cannot be edited (a second vetting fee)",
        reason: row.last_error,
        ...sids,
      },
    };
  }
  if (!flags.refile) {
    return {
      status: 409,
      body: {
        ok: false,
        error: "mock_registration",
        hint: "this line is registered against Twilio's test registry, which routes nothing; send refile: true to file a real one",
        ...sids,
      },
    };
  }
  return null;
}

/** What a2p's refile doors answer: a pre-flight refusal in the owner's sentences, a failure, or the row as it now reads. */
interface RefileOutcome {
  ok: boolean;
  error?: string;
  problems?: string[];
  row?: LineDbRow;
}

/** A refile door's word, decided: refused, or the row to go on from. */
type RefileVerdict = { kind: "refuse"; answer: LineAnswer } | { kind: "ready"; row: LineDbRow };

/**
 * A pre-flight refusal is a 409 and carries the sentences: it is a fact about
 * this workspace that a person can act on, not a provider outage. A 502 is
 * what it used to answer for both, which told support to try again -- the
 * one thing that cannot help.
 */
export function resubmitVerdict(again: RefileOutcome): RefileVerdict {
  if (again.problems?.length) {
    return {
      kind: "refuse",
      answer: { status: 409, body: { ok: false, error: again.error ?? "record_incomplete", problems: again.problems } },
    };
  }
  if (!again.ok || !again.row) {
    return { kind: "refuse", answer: { status: 502, body: { ok: false, error: again.error ?? "resubmit_failed" } } };
  }
  return { kind: "ready", row: again.row };
}

/** Back with the carriers, under the same receipts; what the page sees is the row as it reads after. */
export function resubmittedAnswer(row: LineDbRow, after: LineDbRow | null): LineAnswer {
  return {
    status: 200,
    body: { ok: true, resubmitted: true, smsState: row.sms_state, line: after ? lineForClient(after) : null },
  };
}

/** What came off before the new filing: refused by the pre-flight, refused by the carrier, or the row as it now reads. */
export function takeOffVerdict(off: RefileOutcome, takeOff: "replace" | "unfile"): RefileVerdict {
  if (off.problems?.length) {
    return {
      kind: "refuse",
      answer: { status: 409, body: { ok: false, error: off.error ?? "record_incomplete", problems: off.problems } },
    };
  }
  if (!off.ok || !off.row) {
    const error = off.error ?? (takeOff === "replace" ? "replace_failed" : "unfile_failed");
    return { kind: "refuse", answer: { status: 503, body: { ok: false, error } } };
  }
  return { kind: "ready", row: off.row };
}

/** Same distinction as the refile path: a record the pre-flight refused is a 409 about this workspace, not a 502 about the carriers. */
export function filingAnswer(result: RegisterResult, mock: boolean, after: LineDbRow | null): LineAnswer {
  const status = result.ok ? 200 : result.problems?.length ? 409 : 502;
  return { status, body: { ...result, mock, line: after ? lineForClient(after) : null } };
}

/* ---------------------------------------------------- registration-status */

/** Where the carriers stand, as syncRegistration reads it. */
interface RegistrationSync {
  ok: boolean;
  smsState: string;
  brand?: string;
  campaign?: string;
  error?: string;
  told?: boolean;
}

/**
 * The campaign could not be filed while the carriers still had the brand.
 * Now that they are through with it, file it -- this is what makes "waiting
 * on carriers" finish by itself.
 */
export function campaignHeldFor(r: RegistrationSync, row: LineDbRow): boolean {
  return r.ok && r.brand === "APPROVED" && !row.campaign_sid;
}

export function syncAnswer(r: RegistrationSync): LineAnswer {
  return { status: r.ok ? 200 : 502, body: r };
}

export function heldCampaignAnswer(r: RegistrationSync, filed: RegisterResult): LineAnswer {
  return {
    status: 200,
    body: {
      ...r,
      campaign_filed: filed.ok,
      campaign_sid: filed.state.campaignSid,
      ...(filed.ok ? {} : { step: filed.step, error: filed.error }),
    },
  };
}
