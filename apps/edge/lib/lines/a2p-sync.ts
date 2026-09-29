/**
 * Where a filing stands: the brand's and the campaign's status read from Twilio as
 * the workspace's subaccount, written to the row, and told to the owner once, on the
 * change. The hourly sweep (api/cron/registrations.ts) and the lines door's
 * `registration-status` (api/admin/lines.ts) call it; the filing itself is
 * a2p-register.ts.
 */
import {
  answerObject,
  smsStateFor,
  registrationVerdict,
  refusalWords,
  twilioRequest,
  type CampaignError,
} from "../packages/channels.js";
import { formatPhoneDisplay, type EdgeErrorCode } from "../packages/contracts.js";
import { emitEvent } from "../packages/db.js";
import { recordNotification } from "../ops/notify.js";
import { lineProviderFromEnv } from "./lines.js";
import { lineAccount, refreshLineToken } from "../sms/sms.js";
import type { Db, LineRow } from "./a2p-register.js";

const SYNC_READ_MS = 15000;

/** Where the carriers stand, as the sync read it; a sync that could not ask says why in `error`, and how in `detail`. */
export type RegistrationSync = {
  ok: boolean;
  smsState: string;
  brand?: string;
  campaign?: string;
  error?: EdgeErrorCode;
  detail?: string;
  told?: boolean;
};

/** One read of the registration as `acct`, the status kept: no answer at all throws, as the bare fetch it replaces did. */
async function readAsTwilio(url: string, acct: { sid: string; token: string }) {
  const r = await twilioRequest(acct, "GET", url, { timeoutMs: SYNC_READ_MS });
  if (r.status === 0) throw new Error(`twilio: ${r.error ?? "no answer"}`);
  return { status: r.status, body: answerObject(r) };
}

/** Ask Twilio where the brand and the campaign stand, and write it to the row. */
export async function syncRegistration(db: Db, line: LineRow): Promise<RegistrationSync> {
  const choice = lineProviderFromEnv();
  if (!choice || choice.name !== "twilio") return { ok: false, smsState: line.sms_state, error: "no_provider" };
  // The STATUS comes back too. It used to be discarded, and that is the whole
  // defect below: a 401 and a brand the carriers are still thinking about
  // produced the same value -- null -- and null means "no answer yet".
  // Both are the workspace's own, so both are read as its subaccount.
  const sub = await lineAccount(db, line).catch(() => null);
  if (!sub) {
    // Recorded, like the two refusals below, and for a second reason: the
    // hourly sweep reads the least-recently-asked lines first, and a row it
    // returns from without touching never moves down the queue. Twenty lines
    // with a lost token would otherwise hold every page for ever and the
    // twenty-first would never be asked about at all.
    await db
      .from("lines")
      .update({ last_error: "could not read the registration: the line has no credentials on file" })
      .eq("id", line.id);
    return { ok: false, smsState: line.sms_state, error: "no_line_credentials" };
  }

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
    brand: line.brand_sid
      ? await readAsTwilio(`https://messaging.twilio.com/v1/a2p/BrandRegistrations/${line.brand_sid}`, acct)
      : null,
    campaign: line.messaging_service_sid
      ? await readAsTwilio(
          `https://messaging.twilio.com/v1/Services/${line.messaging_service_sid}/Compliance/Usa2p`,
          acct,
        )
      : null,
  });
  const refused = (a: { brand: { status: number } | null; campaign: { status: number } | null }) =>
    [a.brand, a.campaign].some((x) => x && (x.status === 401 || x.status === 403));

  let answers = await ask(sub);
  if (refused(answers)) {
    const fresh = await refreshLineToken(db, line);
    if (!fresh.ok) {
      await db
        .from("lines")
        .update({ last_error: `could not read the registration: ${fresh.detail ?? fresh.error}` })
        .eq("id", line.id);
      return { ok: false, smsState: line.sms_state, error: fresh.error, detail: fresh.detail };
    }
    answers = await ask(fresh.account);
    if (refused(answers)) {
      await db
        .from("lines")
        .update({
          last_error:
            "could not read the registration: the provider refused the line's credentials even after a refresh",
        })
        .eq("id", line.id);
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
  const usa2p = Array.isArray(campaign?.compliance)
    ? (campaign.compliance[0] as Record<string, unknown> | undefined)
    : undefined;
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
    ? (refusalWords({
        brandFailureReason: typeof brand?.failure_reason === "string" ? brand.failure_reason : null,
        campaignErrors: Array.isArray(usa2p?.errors) ? (usa2p.errors as CampaignError[]) : null,
      }) ?? "the carriers sent the registration back")
    : null;
  const moved = smsState !== line.sms_state;
  await db
    .from("lines")
    .update({
      sms_state: smsState,
      reg_mock: mock,
      last_error: reason,
      // Only when the state actually MOVED. This sweep runs hourly and wrote it
      // every time, so `state_since` meant "the last hour" rather than "when this
      // wait began" -- and the Setup row reads it to say how long the carriers
      // have had it, which therefore never got past an hour.
      ...(moved ? { state_since: new Date().toISOString() } : {}),
    })
    .eq("id", line.id);

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
    await recordNotification(line.tenant_id, {
      kind: verdict.kind,
      title: verdict.title,
      body: verdict.body,
      route: verdict.route,
      about: { type: "line", id: line.id },
    });
    await emitEvent(db, line.tenant_id, verdict.event, "setup", "line", line.id, {
      e164: line.e164,
      from: line.sms_state,
      to: smsState,
      mock,
    }).catch(() => {});
  }
  return {
    ok: true,
    smsState,
    brand: brandStatus ?? undefined,
    campaign: campaignStatus ?? undefined,
    told: !!verdict,
  };
}
