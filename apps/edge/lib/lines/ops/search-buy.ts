/** Ops: search buy. */

import type { Database } from "@chanlytics/db/types";
import type { OpenToCustomersRead } from "@chanlytics/db/workspace";
import { isAreaCode, LINE_COSTS, type LineProviderName } from "@chanlytics/channels/lines";
import {
  isE164,
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
  SPEND_TEXTING,
  changedRecordFields,
  recordFilingOf,
  type BusinessRecordColumn,
  type RecordFiling,
  type RegistrationPath,
  US_AREA_CODE,
  recordOrEmpty,
  isOneOf,
} from "@chanlytics/contracts";
import { lineForClient, type LineProviderChoice } from "../lines.js";
import { factsOf, FILED_NAME_FACT, retryRequestedBy, type LineDbRow } from "../resume.js";
import type { LineReleaseResult } from "../release.js";
import { errorMessage, type DoorAnswer } from "../../shared/admin-door.js";
import type { TenantId } from "@chanlytics/contracts";

type LinesInsert = Database["public"]["Tables"]["lines"]["Insert"];

export type RecordRow = Database["public"]["Tables"]["business_records"]["Row"];

/** The body as the dashboard's /api/v1/lines verbs send it; every field is checked here before it is believed. */
export interface LinesBody {
  op?: string;
  tenant_id?: string;
  area_code?: number | string;
  number?: string;
  line_id?: string;
  /** Who pressed Retry: "owner" from the owner's route, "support" from the back office. */
  by?: string;
  /** The member the dashboard acted for, where its token names none (admin-auth.ts personFor). */
  user_id?: string;
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

export const UNKNOWN_LINE_OP: DoorAnswer = {
  status: 400,
  body: {
    ok: false,
    error: "unknown_op",
    detail: "op must be status, search, buy, retry, release, record, register or registration-status",
  },
};

/** Nothing to fake with and no credentials: the Setup page keeps "we set it up with you". */
export const NO_LINE_PROVIDER: DoorAnswer = {
  status: 503,
  body: {
    ok: false,
    error: "no_line_provider",
    hint: "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN, or LINES_DRY_RUN=1 outside production",
  },
};

/** May this deployment get lines, and with which provider. */
export function lineStatus(choice: LineProviderChoice | null): DoorAnswer {
  return { status: 200, body: { ok: true, ready: !!choice, provider: choice?.name ?? null, costs: LINE_COSTS } };
}

function areaCodeOf(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && US_AREA_CODE.test(v.trim())) return Number(v.trim());
  return null;
}

/* ---------------------------------------------------------------- search */

/** A search is a question to the provider, once the area code is three digits. */
export function planSearch(
  rawAreaCode: unknown,
): { kind: "refuse"; answer: DoorAnswer } | { kind: "search"; areaCode: number } {
  const areaCode = areaCodeOf(rawAreaCode);
  if (!isAreaCode(areaCode)) {
    return {
      kind: "refuse",
      answer: {
        status: 400,
        body: { ok: false, error: "bad_request", detail: "area_code must be three digits, like 305" },
      },
    };
  }
  return { kind: "search", areaCode };
}

export function searchAnswer(choice: LineProviderChoice, areaCode: number, numbers: unknown): DoorAnswer {
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
export function spendRefusal(bill: BillingRead, doing: SpendWords): DoorAnswer | null {
  if (bill.error) return { status: 503, body: { ok: false, error: "read_failed", detail: bill.error.message } };
  if (!bill.data) return { status: 402, body: { ok: false, error: "no_billing_record" } };
  const reason = whyCannotSpend(bill.data.mode as BillingMode, bill.data.status as BillingStatus, doing);
  if (reason)
    return { status: 402, body: { ok: false, error: "payment_required", detail: reason, status: bill.data.status } };
  return null;
}

/**
 * Why the filing nobody presses waits (the wiring's second audit, X4-8): the owner's own rules for spending on the
 * carriers, asked for the campaign the hourly registrations sweep files when a brand is approved. Not while the workspace
 * is paused or ended (contracts openToCustomersOf: nobody answers on its behalf, and its pages say it is not taking
 * sign-ups), and not on a plan that may not spend on texting (spendRefusal, the owner's press's own gate). Null: file.
 */
export function sweepFilingHold(
  customersRead: OpenToCustomersRead,
): "paused" | "ended" | "no_billing_record" | "payment_required" | null {
  if (customersRead.open !== "open") return customersRead.open;
  const refused = spendRefusal({ data: customersRead.billing, error: null }, SPEND_TEXTING);
  if (!refused) return null;
  return refused.body.error === "no_billing_record" ? "no_billing_record" : "payment_required";
}

/* ------------------------------------------------------------------- buy */

/** The number asked for, E.164, with the area code off the body or off the number itself. */
export function buyRequest(
  rawNumber: unknown,
  rawAreaCode: unknown,
): { kind: "refuse"; answer: DoorAnswer } | { kind: "buy"; number: string; areaCode: number | null } {
  const number = typeof rawNumber === "string" ? rawNumber.trim() : "";
  if (!isE164(number)) {
    return {
      kind: "refuse",
      answer: {
        status: 400,
        body: { ok: false, error: "bad_request", detail: "number must be E.164, like +13055550100" },
      },
    };
  }
  const areaCode = areaCodeOf(rawAreaCode) ?? (number.startsWith("+1") ? Number(number.slice(2, 5)) : null);
  return { kind: "buy", number, areaCode };
}

/** The workspace's line that is being set up or answers: it holds one (lines_one_live_per_tenant_idx, 00195). */
export function liveLineOf<T extends { voice_state: string }>(rows: T[]): T | undefined {
  return rows.find((l) => l.voice_state === "provisioning" || l.voice_state === "answering");
}

/**
 * One line per workspace in v1: a second buy is refused while one is live, and
 * a failed one is answered with the row to retry rather than a new purchase.
 * Otherwise the row to insert, at the saga's first step.
 */
export function planBuy(options: {
  tenantId: TenantId;
  provider: LineProviderName;
  number: string;
  areaCode: number | null;
  others: LineDbRow[];
  now: Date;
}): { kind: "refuse"; answer: DoorAnswer } | { kind: "provision"; row: LinesInsert } {
  const live = liveLineOf(options.others);
  if (live)
    return {
      kind: "refuse",
      answer: { status: 409, body: { ok: false, error: "line_exists", line: lineForClient(live) } },
    };
  const failed = options.others.find((l) => l.voice_state === "failed");
  if (failed) {
    return {
      kind: "refuse",
      answer: { status: 409, body: { ok: false, error: "line_failed_retry", line: lineForClient(failed) } },
    };
  }
  return {
    kind: "provision",
    row: {
      tenant_id: options.tenantId,
      e164: options.number,
      kind: "chanlytics",
      provider: options.provider,
      area_code: options.areaCode,
      voice_state: "provisioning",
      step: "subaccount",
      state_since: options.now.toISOString(),
    },
  };
}

/**
 * The saga, on the ledger (00109): claimed under a lease within ten seconds,
 * resumed by the heartbeat if a worker dies, tried up to the cap. The page
 * repaints from the row through realtime as each step lands its receipt.
 */
export function provisionJob(
  tenantId: TenantId,
  lineId: string,
  by: "owner" | "support",
  now: Date,
): { tenantId: TenantId; kind: "line_provision"; dueAt: Date; payload: { line_id: string; by: "owner" | "support" } } {
  return { tenantId, kind: "line_provision", dueAt: now, payload: { line_id: lineId, by } };
}

/** Accepted, not done: the saga is scheduled, and the page sees the row's public face. */
export function queuedAnswer(choice: LineProviderChoice, row: LineDbRow): DoorAnswer {
  return { status: 202, body: { ok: true, queued: true, provider: choice.name, line: lineForClient(row) } };
}

/** The ledger refused the job: said as such, with the row it left (the lines sweep picks it up past the deadline). */
export function notScheduledAnswer(error: unknown, row: LineDbRow): DoorAnswer {
  return {
    status: 503,
    body: { ok: false, error: "could_not_queue", detail: errorMessage(error), line: lineForClient(row) },
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
): { kind: "refuse"; answer: DoorAnswer } | { kind: "claim"; by: "owner" | "support" } {
  const refusal = lineRetryRefusal(lineForClient(row), now.getTime());
  if (refusal)
    return {
      kind: "refuse",
      answer: {
        status: 409,
        body: { ok: false, error: "line_not_retryable", detail: refusal, line: lineForClient(row) },
      },
    };
  return { kind: "claim", by: retryRequestedBy(rawBy) };
}

/** The take was somebody else's: the row read a moment ago is already setting up. */
export function retryTakenAnswer(row: LineDbRow): DoorAnswer {
  return {
    status: 409,
    body: {
      ok: false,
      error: "line_retry_taken",
      detail: "somebody restarted this line a moment ago — it is setting up now, and this page updates by itself",
      line: lineForClient(row),
    },
  };
}

/* --------------------------------------------------------------- release */

export function releaseAnswer(lineRelease: LineReleaseResult): DoorAnswer {
  if (!lineRelease.ok)
    return {
      status: lineRelease.status,
      body: { ok: false, error: lineRelease.error, detail: lineRelease.detail, released: lineRelease.released },
    };
  return { status: 200, body: { ok: true, released: lineRelease.released } };
}

/* ---------------------------------------------------------------- record */

/** The business on record, normalised as the path files it, or the refusal when there is no record to read. */
export function planRecord(
  rawRecord: unknown,
  rawPath: unknown,
  tenantId: TenantId,
): { kind: "refuse"; answer: DoorAnswer } | { kind: "keep"; path: RegistrationPath; row: RecordDraft } {
  const second = rawRecord && typeof rawRecord === "object" ? recordOrEmpty(rawRecord) : null;
  if (!second)
    return {
      kind: "refuse",
      answer: { status: 400, body: { ok: false, error: "bad_request", detail: "record is required" } },
    };
  const str = (k: string) => (typeof second[k] === "string" ? second[k].trim() : "");

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
  const request = typeof rawPath === "string" ? rawPath : "";
  const path: RegistrationPath = isOneOf(REGISTRATION_PATHS, request)
    ? request
    : (registrationPathOf({ ein: str("ein") }) ?? "standard");

  // Stored as the path files it: a sole-proprietor record keeps NO tax id, so
  // it reads back on the path it was saved on for ever.
  return { kind: "keep", path, row: businessRecordForPath(recordDraft(str, tenantId), path) };
}

/** The form's fields, trimmed, with the blanks the carriers accept as null or the default. */
function recordDraft(str: (k: string) => string, tenantId: TenantId) {
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
 * in the owner's words, or nothing: the words in `detail`, beside the code the
 * filing's own pre-flight answers for the same record.
 */
export function recordRefusal(row: RecordDraft, path: RegistrationPath, ourNumbers: string[]): DoorAnswer | null {
  const problems = businessRecordProblems(row, path, { ourNumbers });
  const first = Object.values(problems)[0];
  if (!first) return null;
  return {
    status: 400,
    body: {
      ok: false,
      error: path === "sole_proprietor" ? "sole_proprietor_incomplete" : "record_incomplete",
      detail: first,
    },
  };
}

/** A line as the save reads it: where its filing stands, and the name its brand was filed under. */
type RecordSaveLine = Pick<LineDbRow, "sms_state" | "reg_mock" | "brand_sid" | "facts">;

/**
 * What a save of the business on record moved, and what the carriers hold of it (the wiring's second audit, X4-3): the
 * first record kept, the columns that changed (names, never values), where the workspace's filing stands across its
 * lines (null when they could not be read), and the name its brand was filed under, where a filing kept one.
 */
interface RecordSaved {
  first: boolean;
  changed: BusinessRecordColumn[];
  filing: RecordFiling | null;
  filedName: string | null;
}

const filingOfLine = (l: RecordSaveLine) => ({ sms_state: l.sms_state, reg_mock: l.reg_mock, brand: !!l.brand_sid });

export function recordSaved(
  before: RecordRow | null,
  after: RecordRow,
  lines: readonly RecordSaveLine[] | null,
): RecordSaved {
  const named = (lines ?? [])
    .filter((l) => recordFilingOf([filingOfLine(l)]) !== "none")
    .map((l) => factsOf(l)[FILED_NAME_FACT])
    .find((n): n is string => typeof n === "string" && !!n.trim());
  return {
    first: !before,
    changed: before ? changedRecordFields(before, after) : [],
    filing: lines ? recordFilingOf(lines.map(filingOfLine)) : null,
    filedName: named ? named.trim() : null,
  };
}

export function recordAnswer(
  kept: Pick<RecordRow, "legal_name" | "ein" | "updated_at">,
  saved: RecordSaved,
): DoorAnswer {
  return {
    status: 200,
    body: {
      ok: true,
      record: {
        legal_name: kept.legal_name,
        path: registrationPathOf(kept),
        sole_proprietor: !kept.ein,
        updated_at: kept.updated_at,
        // What the save says to the owner (contracts recordSavedOf, recordSavedWords).
        first: saved.first,
        changed: saved.changed,
        filing: saved.filing,
        filed_name: saved.filedName,
      },
    },
  };
}
