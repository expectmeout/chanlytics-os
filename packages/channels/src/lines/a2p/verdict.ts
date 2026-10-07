/**
 * What the carriers answered, in the product's words: a wait told apart from a refusal (isBrandNotReady), why they
 * refused (refusalWords), the line's sms_state (smsStateFor), and the bell a change rings (registrationVerdict).
 */

/**
 * The campaign cannot be filed until the carriers have finished with the
 * brand. That is a WAIT, not a refusal: everything asked for was accepted,
 * and the last step simply cannot run yet. Told apart here so the row says
 * "waiting on carriers" instead of "something went wrong".
 */
export function isBrandNotReady(error: string): boolean {
  return /until Brand is registered|Brand.*Current status:\s*(IN_PROGRESS|PENDING)/i.test(error);
}

/**
 * Why the carriers refused, in their own words -- or null when nothing was
 * refused.
 *
 * THE DEFECT THIS EXISTS FOR. The sweep read `brand.failure_reason` and nothing
 * else, so a refused CAMPAIGN -- which is most of them, and the only kind that
 * can be fixed and resent -- fell through to the generic
 * "the carriers sent the registration back". That sentence is what the owner's
 * row showed, what the bell said, and what the back office had to work from:
 * a rejection with the reason deleted, which is the same thing as no rejection
 * notice at all. Twilio had the answer the whole time, in
 * `compliance[0].errors[]`, one level below where anyone looked -- the same
 * mistake, in the same object, that once left every text held for weeks.
 *
 * The carriers' own description is kept verbatim apart from their standard
 * preamble ("The campaign submission has been reviewed and it was rejected
 * because ..."), which repeats on every error and pushes the substance past
 * where anybody reads. Stripped only when it matches exactly; anything
 * unfamiliar is passed through untouched rather than mangled.
 */
export interface CampaignError {
  description?: string | null;
  error_code?: number | string | null;
  fields?: readonly string[] | null;
}

// The trailing whitespace is \s* rather than a literal space: a description that
// is ONLY the preamble did not match, so the boilerplate this exists to remove
// was the one thing that survived it -- and with a code appended it read as a
// rejection reason that says nothing at all.
const PREAMBLE = /^the campaign submission has been reviewed and (?:it was )?rejected because\s*(?:of\s*)?/i;

export function refusalWords(o: {
  brandFailureReason?: string | null;
  campaignErrors?: readonly CampaignError[] | null;
}): string | null {
  const parts: string[] = [];
  const brand = (o.brandFailureReason ?? "").trim();
  if (brand) parts.push(brand);
  for (const e of o.campaignErrors ?? []) {
    const said = String(e?.description ?? "");
    // A trailing full stop before the code reads as a false sentence end.
    const body = said.replace(PREAMBLE, "").trim().replace(/\.$/, "").trim();
    // Nothing left once the boilerplate is gone: contributing an empty string
    // here would make the whole result a non-null empty string, and every caller
    // uses `?? fallback` -- which an empty string sails straight past.
    if (!body) continue;
    // The code and the field are what a resubmit is aimed at, so they travel
    // with the sentence rather than in a log line nobody opens.
    const tags = [e?.error_code == null ? null : String(e.error_code), ...(e?.fields ?? [])].filter(Boolean);
    parts.push(tags.length ? `${body} (${tags.join(" · ")})` : body);
  }
  if (!parts.length) return null;
  return parts.join("; ");
}

/** Twilio's brand and campaign statuses, in the words `lines.sms_state` uses. */
export type SmsRegistrationState = "registering" | "approved" | "active" | "rejected" | "failed";

export function smsStateFor(o: {
  brandStatus?: string | null;
  campaignStatus?: string | null;
  mock?: boolean;
}): SmsRegistrationState {
  const brand = (o.brandStatus ?? "").toUpperCase();
  const campaign = (o.campaignStatus ?? "").toUpperCase();
  if (brand === "FAILED" || campaign === "FAILED") return "rejected";
  if (brand === "SUSPENDED") return "failed";
  // A verified campaign IS the permission, and the number is already in the
  // Messaging Service, so the line can answer now. Returning "approved" here
  // left every text held for ever: the inbound path only answers on "active",
  // and nothing moved a line from one to the other.
  //
  // Unless it is a REHEARSAL. `active` is not a badge, it is an instruction:
  // the inbound path stops holding texts for a person and the receptionist
  // starts answering them. A campaign filed against the test registry verifies
  // itself within minutes and can carry nothing, so every one of those answers
  // would be rejected by the carriers and the customer would get silence.
  // A verified mock has proved everything a rehearsal can prove, which is what
  // `approved` means.
  if (campaign === "VERIFIED") return o.mock ? "approved" : "active";
  // Two quite different waits were one word. The business being approved is
  // the slow half and the half that can be refused; once it is through, what
  // is left is the campaign, which is days rather than weeks.
  if (brand === "APPROVED") return "approved";
  return "registering";
}

/**
 * What the carriers just decided, in the owner's words — or nothing, when
 * the answer is the same as last hour. The sweep runs hourly; a bell that
 * rang every hour would be noise, and the one that matters would be lost
 * in it.
 */
export function registrationVerdict(
  before: string,
  after: SmsRegistrationState,
  o: { number: string | null; reason?: string | null; mock?: boolean },
): {
  kind: "number" | "alert";
  title: string;
  body: string;
  route: string;
  event: "line.texting_on" | "line.texting_rejected" | "line.texting_approved";
} | null {
  if (before === after) return null;
  const num = o.number ?? "your line";
  const rehearsal = o.mock ? " (this was a test filing, so nothing routes)" : "";
  if (after === "active") {
    return {
      kind: "number",
      title: `Texting is on: ${num}`,
      body: `The carriers approved ${num}, so the receptionist answers texts to it inside your hours${rehearsal}. Customers who text first are answered; offers go only to people who said yes.`,
      route: "admin/integrations",
      event: "line.texting_on",
    };
  }
  if (after === "approved") {
    return {
      kind: "number",
      title: "Your business is approved by the carriers",
      body: `${num} is through the slow half. One last check on the line is left, usually days; nothing is needed from you, and texting switches itself on when it clears.`,
      route: "admin/integrations",
      event: "line.texting_approved",
    };
  }
  // TWO different states, and one of them is not the owner's to fix. `rejected`
  // is a correction request: change something and send it again. `failed` is a
  // SUSPENDED brand (smsStateFor), which no owner can act on -- and telling them
  // to "correct your business on record and file it again" sends somebody to
  // edit a form that will change nothing, twice, before they call us. The rest
  // of the product already says the right thing about `failed` (textingWords:
  // "a person at Chanlytics has it"); this used to be the one place that did
  // not.
  if (after === "rejected") {
    return {
      kind: "alert",
      title: "The carriers sent your texting registration back",
      body: `${o.reason ? `They said: ${o.reason}. ` : ""}Open Connections, correct your business on record, and file it again. Calls and WhatsApp are unaffected.`,
      route: "admin/integrations",
      event: "line.texting_rejected",
    };
  }
  if (after === "failed") {
    return {
      kind: "alert",
      title: "Your texting registration stopped",
      body: `${o.reason ? `The carriers said: ${o.reason}. ` : ""}A person at Chanlytics has it — there is nothing for you to do. Calls and WhatsApp are unaffected.`,
      route: "admin/integrations",
      event: "line.texting_rejected",
    };
  }
  return null;
}
