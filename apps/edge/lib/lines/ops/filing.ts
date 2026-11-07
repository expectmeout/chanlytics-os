/** Ops: filing. */

import { formatPhoneDisplay } from "@chanlytics/contracts";
import { lineForClient } from "../lines.js";
import { campaignFactsFor } from "../a2p-campaign-facts.js";
import type { RegisterResult } from "../a2p-register.js";
import type { RefileOutcome } from "../a2p-refile.js";
import type { RegistrationSync } from "../a2p-sync.js";
import { type LineDbRow } from "../resume.js";
import { type DoorAnswer } from "../../shared/admin-door.js";
import { type LinesBody, type RecordRow } from "./search-buy.js";

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
  | { kind: "refuse"; answer: DoorAnswer }
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
export function planFiling(options: {
  row: LineDbRow;
  record: RecordRow;
  workspaceName: string;
  /** The workspace's active texting rows, of either kind. */
  saysYes: unknown[];
  flags: FilingFlags;
  pages: FilingPages;
}): FilingPlan {
  const { row, flags } = options;
  const check: FilingCheck = {
    record: options.record,
    workspaceName: options.workspaceName,
    hasOptInNumber: options.saysYes.length > 0 || !!row.e164,
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
      businessName: options.workspaceName,
      legalName: check.record.legal_name,
      about: check.record.about,
      lineNumber: formatPhoneDisplay(row.e164),
      ...options.pages,
    });
    return { kind: "resubmit", facts, check };
  }
  return { kind: "file", check, takeOff: flags.rejected ? "replace" : "unfile", mock: flags.mock };
}

/** A filing that stands, a refusal without a refile, a rehearsal without one: each says what it is and what to send. */
function refileRefusal(row: LineDbRow, flags: FilingFlags): DoorAnswer | null {
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

/** A refile door's word, decided: refused, or the row to go on from. */
type RefileVerdict = { kind: "refuse"; answer: DoorAnswer } | { kind: "ready"; row: LineDbRow };

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
    return {
      kind: "refuse",
      answer: { status: 502, body: { ok: false, error: again.error ?? "resubmit_failed", detail: again.detail } },
    };
  }
  return { kind: "ready", row: again.row };
}

/** Back with the carriers, under the same receipts; what the page sees is the row as it reads after. */
export function resubmittedAnswer(row: LineDbRow, after: LineDbRow | null): DoorAnswer {
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
    return {
      kind: "refuse",
      answer: {
        status: 503,
        body: {
          ok: false,
          error: off.error ?? (takeOff === "replace" ? "replace_failed" : "unfile_failed"),
          detail: off.detail,
        },
      },
    };
  }
  return { kind: "ready", row: off.row };
}

/** Same distinction as the refile path: a record the pre-flight refused is a 409 about this workspace, not a 502 about the carriers. */
export function filingAnswer(result: RegisterResult, mock: boolean, after: LineDbRow | null): DoorAnswer {
  const status = result.ok ? 200 : result.problems?.length ? 409 : 502;
  return { status, body: { ...result, mock, line: after ? lineForClient(after) : null } };
}

/* ---------------------------------------------------- registration-status */

/**
 * The campaign could not be filed while the carriers still had the brand.
 * Now that they are through with it, file it -- this is what makes "waiting
 * on carriers" finish by itself.
 */
export function campaignHeldFor(registrationSync: RegistrationSync, row: LineDbRow): boolean {
  return registrationSync.ok && registrationSync.brand === "APPROVED" && !row.campaign_sid;
}

export function syncAnswer(registrationSync: RegistrationSync): DoorAnswer {
  return { status: registrationSync.ok ? 200 : 502, body: registrationSync };
}

export function heldCampaignAnswer(registrationSync: RegistrationSync, filed: RegisterResult): DoorAnswer {
  return {
    status: 200,
    body: {
      ...registrationSync,
      campaign_filed: filed.ok,
      campaign_sid: filed.state.campaignSid,
      ...(filed.ok ? {} : { step: filed.step, error: filed.error, detail: filed.detail }),
    },
  };
}
