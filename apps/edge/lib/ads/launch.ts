/**
 * Turn on's job (decision 0050, calls 3 to 6 and 11; the Ads plan's 4.7): an ad the owner turned on, made at Meta. It
 * runs as the first work of its account's own job (ad_read), so one account's calls to Meta go one after another and
 * keep Meta's pace for it, and a launch that does not finish in one pass is taken up again by the next.
 *
 * In order, and nothing after a step that stops:
 *
 *   1. The campaign, the ad set, the picture and an ad for each version of the words, each made PAUSED, each make
 *      just after its own dry run (Meta's check, which makes nothing; the ad's asks for Meta's look at the words and the
 *      picture too). Each part is kept as sent before its make goes, and with Meta's id once it answers.
 *   2. The campaign read back whole and compared with what the owner approved: the total (the most the press named),
 *      its end, every part paused, no special kind declared, the number, the area and the words. A difference stops it.
 *   3. While AI is not stopped, every part switched on from the bottom (the ads, the ad set, the campaign), so the last
 *      switch is the one that lets it start; then read back once more, so the page says what Meta says.
 *
 * What it never does. Nothing the owner did not approve is switched on: no stop calls a switch. A make or a switch
 * whose answer never came is never sent again: a make is found by its tagged name and followed until Meta says (past
 * a few minutes unfound, the launch stops), and a switch is followed by the account's read, the page saying "Couldn't
 * confirm it's on" past a few minutes. The one thing sent twice is the picture, which Meta's library keeps once by its
 * bytes. A launch that stops part way removes its campaign, with everything under it; what cannot be removed stays
 * there, named and paused, and the ad says what was left. A disconnect or a sign-out stops a launch at its next step
 * (00666's trigger), and so does AI's stop before any switch. A cancel (its owner's, or a yes taken back on its picture,
 * 00676) stops it at its next step too, and is read fresh before every switch; one that lands after the last switch
 * leaves the ad made and paused at once (ad_launch_keep). Just before the first switch the ad's way in is read again:
 * where AI could no longer answer the chat it opens, nothing is switched on (decision 0050, call 11).
 *
 * `ADS_WRITES`: `live` sends; `sandbox` does everything but the call (Meta's answers are made up here, ids that begin
 * 0000, which Meta never gives); anything else stops a launch before it sends.
 */
import { randomUUID } from "node:crypto";
import {
  callMetaAds,
  metaAdImageRequest,
  metaAdRequest,
  metaAdSetRequest,
  metaAdSwitchRequest,
  metaCampaignReadBackRequest,
  metaCampaignRemoveRequest,
  metaCampaignRequest,
  metaConfirmed,
  metaFoundByNameRequest,
  parseMetaCampaignHeld,
  parseMetaFoundByName,
  parseMetaImageHash,
  parseMetaMadeId,
  parseMetaRefusal,
  parseMetaRemoved,
  type MetaAdsAnswer,
  type MetaCampaignHeld,
  type MetaPartEdge,
  type MetaUsage,
} from "@chanlytics/channels/ads";
import { MIN_MS, SECOND_MS, recordOrEmpty, type AdStopped, type TenantId } from "@chanlytics/contracts";
import {
  isAdLaunchCancelled,
  keepAdLaunch,
  listAdLaunches,
  type AdLaunchRow,
  type AdLaunchStep,
  type AdPartKept,
} from "@chanlytics/db/ads";
import type { Database } from "@chanlytics/db/types";
import { isSendingStopped } from "@chanlytics/db/workspace";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { logger } from "../shared/log.js";
import { checksumOf, readAdPhoto } from "./launch/approval.js";
import { readWayIn } from "./chat/answered.js";
import { approvedOf, launchDiffers, type LaunchApproved, type LaunchMoment } from "./launch/parts.js";
import type { MetaSignIn } from "./meta-facts.js";
import { ADS_USAGE_HOLD_PCT } from "./pace.js";
import { sandboxAnswer, sandboxHeld } from "./launch/sandbox.js";
import { launchNameOf } from "./tag.js";
import type { AdsWrites } from "./tell.js";

type Db = SupabaseClient<Database>;
type Log = ReturnType<typeof logger>;
/** One request to Meta, as the wire sends it. */
type MetaRequest = Parameters<typeof callMetaAds>[0];

/** No call is started with less than this left of the job: its answer and the write after it end inside it. */
const CALL_ROOM_MS = 25 * SECOND_MS;
/** How long a make whose answer never came is looked for by its name before the launch stops. */
const FOLLOW_MS = 10 * MIN_MS;

/** Whose launches are sent, how, and the time the job has. */
interface Launcher {
  tenantId: TenantId;
  signIn: MetaSignIn;
  writes: AdsWrites;
  account: { id: string; externalId: string; currency: string };
  deadline: number;
}

/** One launch's pass: what it has made, what Meta's last answer said of the pace, and what it called. */
interface Pass {
  db: Db;
  log: Log;
  who: Launcher;
  ad: AdLaunchRow;
  approved: LaunchApproved;
  parts: Map<string, AdPartKept>;
  launch: Record<string, unknown>;
  usage: MetaUsage | null;
  calls: number;
  /** Its owner cancelled it, or a yes taken back did (00676): the launch stops at its next step. */
  cancelled: boolean;
}

/** What stopping a launch needs of its pass: never what was approved, which a stop may not have. */
type Stopping = Omit<Pass, "approved">;

/** What a step came to: Meta's id for it, a stop with why, a wait for a later pass, or Meta's sign-in gone. */
type Step = { id: string } | { stop: AdStopped; said: string | null } | { wait: true } | { revoked: true };

const DRY = { dryRun: true } as const;
const partKey = (kind: AdPartKept["kind"], version: number): string => `${kind}:${version}`;
const hasRoom = (pass: Stopping): boolean =>
  Date.now() <= pass.who.deadline - CALL_ROOM_MS && (pass.usage === null || pass.usage.pct < ADS_USAGE_HOLD_PCT);

/* ------------------------------------------------------------------------------------------- the calls -- */

/** One more call counted on the pass, and Meta's pace as its answer says it. */
function heardFrom(pass: Stopping, answer: MetaAdsAnswer): void {
  pass.calls += 1;
  if (answer.usage !== null) pass.usage = answer.usage;
}

/** One call to Meta for a step: sent once, its pace kept on the pass, and a line for Health. */
async function send(pass: Stopping, at: string, request: MetaRequest): Promise<MetaAdsAnswer> {
  const began = Date.now();
  const answer =
    pass.who.writes === "live" ? await callMetaAds(request) : sandboxAnswer(request, `${pass.ad.id}:${at}`);
  heardFrom(pass, answer);
  const refusal = answer.fault === null ? null : parseMetaRefusal(answer.json);
  pass.log.info("ads_launch_step", {
    ad_id: pass.ad.id,
    at,
    outcome: answer.fault ?? "ok",
    ms: Date.now() - began,
    ...(refusal ? { code: refusal.code, subcode: refusal.subcode, fields: refusal.fields } : {}),
    ...(answer.usage ? { usage_pct: answer.usage.pct } : {}),
  });
  return answer;
}

/** Meta's own words for a refusal, for the owner, in quotes; else what the wire said. */
const metaWordsOf = (answer: MetaAdsAnswer): string | null => parseMetaRefusal(answer.json)?.words ?? answer.said;

/**
 * A step's door: what it made, sent or found kept. Answers `going`, or why the launch stops here: its owner cancelled it
 * meanwhile (00676), or its account was let go (a disconnect).
 */
async function keepStep(pass: Stopping, step: AdLaunchStep): Promise<"going" | "cancelled" | "disconnected"> {
  for (const part of step.objects ?? []) pass.parts.set(partKey(part.kind, part.version), part);
  if (step.launch) Object.assign(pass.launch, step.launch);
  const after = await keepAdLaunch(pass.db, pass.who.tenantId, pass.ad.id, step);
  if (step.status !== undefined) return "going";
  if (after.cancelled) return "cancelled";
  return after.status === "sending" ? "going" : "disconnected";
}

/** A launch its door let go of stops, for the door's reason. */
const letGoFor = (reason: "cancelled" | "disconnected"): Step => ({ stop: reason, said: null });

/** A launch's write went unanswered: when, kept, so it is followed and never sent again. */
const unanswered = (pass: Pass) =>
  keepStep(pass, {
    launch: {
      unknown_at: typeof pass.launch.unknown_at === "string" ? pass.launch.unknown_at : new Date().toISOString(),
    },
  });

/* ------------------------------------------------------------------------------------------- the parts -- */

/** A part to make: its kind and version, its name, where Meta lists it, and its two requests. */
interface PartAsk {
  kind: AdPartKept["kind"];
  version: number;
  name: string;
  /** Where it is looked for by name where its make was never answered; null for the picture, which has no name. */
  edge: MetaPartEdge | null;
  dry: MetaRequest | null;
  make: (key: string) => MetaRequest;
  idOf: (json: unknown) => string | null;
}

/** A part sent earlier and never answered, looked for by its tagged name: found, or followed until FOLLOW_MS. */
async function followPart(pass: Pass, ask: PartAsk & { edge: MetaPartEdge }): Promise<Step> {
  if (!hasRoom(pass)) return { wait: true };
  const { token, appSecret } = pass.who.signIn;
  const where = { accountId: pass.who.account.externalId, edge: ask.edge, name: ask.name };
  const answer = await send(pass, `find_${ask.kind}`, metaFoundByNameRequest(token, appSecret, where));
  if (answer.fault === "revoked") return { revoked: true };
  const id = answer.fault === null ? parseMetaFoundByName(answer.json, ask.name) : null;
  if (id !== null) {
    // Found: Meta made it after all, and the launch goes on from it. Nothing of it is unanswered now.
    const part = { kind: ask.kind, version: ask.version, name: ask.name, state: "made" as const, platform_id: id };
    const kept = await keepStep(pass, { objects: [part], launch: { unknown_at: null } });
    return kept === "going" ? { id } : letGoFor(kept);
  }
  // A make kept as sent whose pass ended before its answer was kept has no moment yet: its following starts now.
  if (typeof pass.launch.unknown_at !== "string") {
    await unanswered(pass);
    return { wait: true };
  }
  return Date.now() - Date.parse(pass.launch.unknown_at) >= FOLLOW_MS
    ? { stop: "unanswered", said: null }
    : { wait: true };
}

/** What a make's answer came to, kept: Meta's id; a wait where it took nothing or never answered; a stop where it said no. */
async function partMadeOf(pass: Pass, ask: PartAsk, answer: MetaAdsAnswer): Promise<Step> {
  const part = { kind: ask.kind, version: ask.version, name: ask.name };
  if (answer.fault === "revoked") return { revoked: true };
  if (answer.fault === "silent") {
    await unanswered(pass);
    return { wait: true };
  }
  const id = answer.fault === null ? ask.idOf(answer.json) : null;
  if (id !== null) {
    const kept = await keepStep(pass, { objects: [{ ...part, state: "made", platform_id: id }] });
    return kept === "going" ? { id } : letGoFor(kept);
  }
  // Meta made nothing: refused, or held this account back. Held back, it is sent on a later pass.
  await keepStep(pass, { objects: [{ ...part, state: "refused" }] });
  if (answer.fault === "slowed") return { wait: true };
  return { stop: "refused", said: metaWordsOf(answer) ?? "Meta did not say what it made." };
}

/** One part made: kept already, found again by name, or its dry run then its make, each sent once. */
async function makePart(pass: Pass, ask: PartAsk): Promise<Step> {
  const had = pass.parts.get(partKey(ask.kind, ask.version));
  if (had?.state === "made" && had.platform_id) return { id: had.platform_id };
  if (had?.state === "sent" && ask.edge !== null) return followPart(pass, { ...ask, edge: ask.edge });
  if (!hasRoom(pass)) return { wait: true };
  if (ask.dry !== null) {
    const checked = await send(pass, `${ask.kind}_${ask.version}_dry`, ask.dry);
    if (checked.fault === "revoked") return { revoked: true };
    // A dry run makes nothing, so one that went unanswered or was held back is simply asked again on a later pass.
    if (checked.fault === "silent" || checked.fault === "slowed") return { wait: true };
    if (checked.fault !== null) return { stop: "refused", said: metaWordsOf(checked) };
    if (!hasRoom(pass)) return { wait: true };
  }
  // Kept as sent before it goes: a make whose answer never comes is then known to have gone, and is never sent again.
  const sent = await keepStep(pass, {
    objects: [{ kind: ask.kind, version: ask.version, name: ask.name, state: "sent" }],
  });
  if (sent !== "going") return letGoFor(sent);
  return partMadeOf(pass, ask, await send(pass, `${ask.kind}_${ask.version}`, ask.make(randomUUID())));
}

/**
 * The picture's bytes, read from Files: a photo of this workspace's, as it was approved (the content loop PRD's 3.3:
 * checked again right before the outside act), or null where there is none to send or its bytes are not those approved.
 */
async function pictureBytes(pass: Pass): Promise<Uint8Array | null> {
  const bytes = await readAdPhoto(pass.db, pass.who.tenantId, pass.approved.picture);
  const approved = pass.approved.pictureChecksum;
  return bytes && (approved === null || checksumOf(bytes) === approved) ? bytes : null;
}

/** Every part made, paused, in Meta's order: Meta's ids for them, or how the pass ended. */
async function makeAll(
  pass: Pass,
): Promise<{ campaign: string; set: string; ads: string[] } | Exclude<Step, { id: string }>> {
  const { token, appSecret } = pass.who.signIn;
  const { approved, ad } = pass;
  const accountId = pass.who.account.externalId;
  const name = launchNameOf({ id: ad.id, name: ad.name });
  const campaignAsk = { accountId, name };
  const campaign = await makePart(pass, {
    kind: "campaign",
    version: 0,
    name,
    edge: "campaigns",
    dry: metaCampaignRequest(token, appSecret, campaignAsk, DRY),
    make: (key) => metaCampaignRequest(token, appSecret, campaignAsk, { key }),
    idOf: parseMetaMadeId,
  });
  if (!("id" in campaign)) return campaign;
  const setAsk = {
    accountId,
    campaignId: campaign.id,
    name,
    currency: approved.currency,
    totalMinor: approved.mostMinor,
    endsAt: approved.endsAt,
    pageId: approved.pageId,
    whatsappNumber: approved.whatsapp,
    centre: { address: approved.address },
    miles: approved.miles,
    wide: approved.area ?? undefined,
    instagram: false,
  };
  const set = await makePart(pass, {
    kind: "set",
    version: 0,
    name,
    edge: "adsets",
    dry: metaAdSetRequest(token, appSecret, setAsk, DRY),
    make: (key) => metaAdSetRequest(token, appSecret, setAsk, { key }),
    idOf: parseMetaMadeId,
  });
  if (!("id" in set)) return set;
  const hash = await pictureHash(pass, name);
  if (!("id" in hash)) return hash;
  const ads: string[] = [];
  for (const [nth, version] of approved.versions.entries()) {
    const adName = launchNameOf({ id: ad.id, name: ad.name }, { at: nth + 1, of: approved.versions.length });
    const creative = {
      name: adName,
      pageId: approved.pageId,
      instagramUserId: null,
      text: version.text,
      headline: version.headline,
      picture: { kind: "image" as const, hash: hash.id },
    };
    const adAsk = { accountId, setId: set.id, name: adName, creative };
    const built = await makePart(pass, {
      kind: "ad",
      version: nth + 1,
      name: adName,
      edge: "ads",
      dry: metaAdRequest(token, appSecret, adAsk, DRY),
      make: (key) => metaAdRequest(token, appSecret, adAsk, { key }),
      idOf: parseMetaMadeId,
    });
    if (!("id" in built)) return built;
    ads.push(built.id);
  }
  return { campaign: campaign.id, set: set.id, ads };
}

/** The picture in the account's library: its hash, kept as its id. A video is not sent from here yet. */
async function pictureHash(pass: Pass, name: string): Promise<Step> {
  const had = pass.parts.get(partKey("picture", 0));
  if (had?.state === "made" && had.platform_id) return { id: had.platform_id };
  if (pass.approved.pictureKind !== "photo") return { stop: "picture", said: null };
  const bytes = await pictureBytes(pass);
  if (!bytes) return { stop: "picture", said: null };
  const { token, appSecret } = pass.who.signIn;
  const accountId = pass.who.account.externalId;
  return makePart(pass, {
    kind: "picture",
    version: 0,
    name,
    edge: null,
    dry: null,
    make: () => metaAdImageRequest(token, appSecret, accountId, bytes),
    idOf: (json) => {
      try {
        return parseMetaImageHash(json);
      } catch {
        // No hash in the answer: Meta kept no picture, said as a refusal.
        return null;
      }
    },
  });
}

/* ------------------------------------------------------------------------------ read back, switch, stop -- */

/** The campaign read back whole: what Meta holds, or how the pass ended. */
async function campaignReadBack(
  pass: Pass,
  built: { campaign: string; set: string; ads: string[] },
  moment: LaunchMoment,
): Promise<MetaCampaignHeld | Exclude<Step, { id: string }>> {
  if (!hasRoom(pass)) return { wait: true };
  const { token, appSecret } = pass.who.signIn;
  const answer = await send(pass, `read_back_${moment}`, metaCampaignReadBackRequest(token, appSecret, built.campaign));
  if (answer.fault === "revoked") return { revoked: true };
  if (answer.fault !== null) return { wait: true };
  if (pass.who.writes !== "live")
    return sandboxHeld({ ad: pass.ad, approved: pass.approved, accountId: pass.who.account.externalId }, built, moment);
  try {
    return parseMetaCampaignHeld(answer.json, pass.approved.currency);
  } catch {
    // An answer that is not a campaign is read again on a later pass: nothing is compared against it.
    return { wait: true };
  }
}

/**
 * What stops the next switch, read fresh before each one: no room left in this pass; AI stopped, since nobody would answer
 * the people it brings (0050, call 11); a cancel its owner pressed meanwhile, so none goes after they said stop; and, just
 * before the first, a way in that closed since the press, of the exact number the ad names (call 11). Null: switch it.
 */
async function checkBeforeSwitch(pass: Pass, first: boolean): Promise<Step | null> {
  if (!hasRoom(pass)) return { wait: true };
  if (await isSendingStopped(pass.db, pass.who.tenantId)) return { stop: "ai_stopped", said: null };
  if (await isAdLaunchCancelled(pass.db, pass.who.tenantId, pass.ad.id)) return { stop: "cancelled", said: null };
  if (first && (await readWayIn(pass.db, pass.who.tenantId, pass.approved.whatsapp)) !== "open")
    return { stop: "way_in", said: null };
  return null;
}

/** Every part switched on from the bottom, each once: the ads, the ad set, the campaign. How the pass ended, or done. */
async function switchAll(pass: Pass, built: { campaign: string; set: string; ads: string[] }): Promise<Step | null> {
  const done = new Set(Array.isArray(pass.launch.switched) ? pass.launch.switched.map(String) : []);
  const order = [
    ...built.ads.map((id, nth) => ({ key: `ad:${nth + 1}`, id })),
    { key: "set", id: built.set },
    { key: "campaign", id: built.campaign },
  ];
  const { token, appSecret } = pass.who.signIn;
  for (const part of order) {
    if (done.has(part.key)) continue;
    const held = await checkBeforeSwitch(pass, done.size === 0);
    if (held) return held;
    const answer = await send(pass, `switch_${part.key}`, metaAdSwitchRequest(token, appSecret, part.id, "ACTIVE"));
    if (answer.fault === "revoked") return { revoked: true };
    if (answer.fault === "slowed") return { wait: true };
    if (answer.fault !== null && answer.fault !== "silent") return { stop: "refused", said: metaWordsOf(answer) };
    // Unanswered, it went or it did not: it is never sent again, and the account's read says which.
    if (answer.fault === "silent" || !metaConfirmed(answer.json)) await unanswered(pass);
    done.add(part.key);
    const kept = await keepStep(pass, { launch: { step: "switch", switched: [...done] } });
    // The last switch went before its cancel was seen: the ad is made and paused at once (ad_launch_keep), so its own
    // pause, followed at Meta's pace, stops it, never a removal that may not land while it runs.
    if (kept === "cancelled" && part.key === "campaign") return null;
    if (kept !== "going") return letGoFor(kept);
  }
  return null;
}

/**
 * A launch that stops part way: its campaign removed, with everything under it, else every part it made left at Meta,
 * named and paused; and the ad failed, with why and Meta's own words. Nothing is switched on.
 */
async function stopLaunch(pass: Stopping, stop: { stop: AdStopped; said: string | null }): Promise<void> {
  const parts = [...pass.parts.values()].filter((part) => part.state === "made" || part.state === "sent");
  const campaign = pass.parts.get(partKey("campaign", 0));
  // A launch the account let go of sends nothing more: its sign-in is no longer Chanlytics' to use.
  const mayRemove = pass.who.writes !== "off" && stop.stop !== "disconnected" && stop.stop !== "signed_out";
  let removed = false;
  if (campaign?.state === "made" && campaign.platform_id && mayRemove) {
    const { token, appSecret } = pass.who.signIn;
    const answer = await send(pass, "remove", metaCampaignRemoveRequest(token, appSecret, campaign.platform_id));
    removed = answer.fault === null && (pass.who.writes !== "live" || parseMetaRemoved(answer.json));
  }
  // The picture stays in the account's library either way: it is no part of an ad, and shows nowhere.
  const objects = parts
    .filter((part) => part.kind !== "picture")
    .map((part) => ({ ...part, state: removed ? ("removed" as const) : ("left" as const) }));
  await keepAdLaunch(pass.db, pass.who.tenantId, pass.ad.id, {
    objects,
    status: "failed",
    launch: { stopped: stop.stop, said: stop.said, step: "stopped" },
  });
  pass.log.info("ads_launch_done", {
    ad_id: pass.ad.id,
    outcome: "stopped",
    why: stop.stop,
    removed,
    calls: pass.calls,
  });
}

/** A launch whose every part is on: the ad made, with Meta's ids and Meta's word for it once read back again. */
async function finishLaunch(pass: Pass, built: { campaign: string; set: string; ads: string[] }): Promise<void> {
  const held = await campaignReadBack(pass, built, "switched");
  const read = "id" in held && "sets" in held ? held : null;
  // Meta's best word for any version (fold.ts reads the same way); none where the read back did not come.
  const word = read?.ads.map((one) => one.state).find((state) => state === "ACTIVE") ?? read?.ads[0]?.state ?? null;
  const confirmed =
    read !== null &&
    launchDiffers(pass.approved, read, { moment: "switched", adIds: built.ads }).every(
      (one) => !one.endsWith("switch"),
    );
  const [first] = built.ads;
  await keepAdLaunch(pass.db, pass.who.tenantId, pass.ad.id, {
    status: "made",
    campaign_id: built.campaign,
    set_id: built.set,
    ...(first ? { platform_ad_id: first } : {}),
    platform_state: word,
    launch: { step: "done", ...(confirmed ? { unknown_at: null } : {}) },
  });
  pass.log.info("ads_launch_done", { ad_id: pass.ad.id, outcome: "made", confirmed, calls: pass.calls });
}

/**
 * One launch, as far as it goes in this pass, with the pass it went on (what it called, and Meta's pace after). A row
 * that holds less than a whole approval is never sent: it stops as it is.
 */
async function runOne(
  base: Stopping,
  approved: LaunchApproved | null,
): Promise<{ came: "done" | "waits" | "revoked"; pass: Stopping }> {
  if (approved === null) {
    await stopLaunch(base, { stop: "business", said: null });
    return { came: "done", pass: base };
  }
  const pass: Pass = { ...base, approved };
  return { came: await advanceLaunch(pass), pass };
}

/** One launch taken as far as it goes in this pass. Where it waits, the account's job takes it up again soon. */
async function advanceLaunch(pass: Pass): Promise<"done" | "waits" | "revoked"> {
  if (pass.who.writes === "off") {
    await stopLaunch(pass, { stop: "off", said: null });
    return "done";
  }
  // Cancelled before this pass took it up: nothing more is made, and what was made is removed.
  if (pass.cancelled) {
    await stopLaunch(pass, { stop: "cancelled", said: null });
    return "done";
  }
  const built = await makeAll(pass);
  if ("revoked" in built) return "revoked";
  if ("wait" in built) return "waits";
  if ("stop" in built) {
    await stopLaunch(pass, built);
    return "done";
  }
  if (pass.launch.step !== "switch") {
    const held = await campaignReadBack(pass, built, "made");
    if ("revoked" in held) return "revoked";
    if ("wait" in held) return "waits";
    if ("stop" in held) {
      await stopLaunch(pass, held);
      return "done";
    }
    const differs = launchDiffers(pass.approved, held, { moment: "made", adIds: built.ads });
    if (differs.length > 0) {
      pass.log.info("ads_launch_differs", { ad_id: pass.ad.id, differs });
      await stopLaunch(pass, { stop: "differs", said: null });
      return "done";
    }
  }
  const switched = await switchAll(pass, built);
  if (switched === null) {
    await finishLaunch(pass, built);
    return "done";
  }
  if ("revoked" in switched) return "revoked";
  if ("wait" in switched) return "waits";
  if ("stop" in switched) await stopLaunch(pass, switched);
  return "done";
}

/** What one turn of an account's launches came to, for the job's line and its read after. */
interface LaunchesRan {
  /** Launches taken up, and of them, the ones that still wait for a later pass. */
  ran: number;
  waiting: number;
  calls: number;
  usage: MetaUsage | null;
  /** Meta no longer takes the sign-in: the account is to be marked, and its read ends. */
  revoked: boolean;
}

/** Every launch of an account still on its way, taken as far as each goes, one after another, before its read. */
export async function runLaunches(db: Db, log: Log, launcher: Launcher): Promise<LaunchesRan> {
  const out: LaunchesRan = { ran: 0, waiting: 0, calls: 0, usage: null, revoked: false };
  for (const ad of await listAdLaunches(db, launcher.tenantId, launcher.account.id)) {
    const approved = approvedOf(ad.approved);
    const parts = new Map(ad.objects.map((part) => [partKey(part.kind, part.version), part]));
    const base: Stopping = {
      db,
      log,
      who: launcher,
      ad,
      parts,
      launch: { ...recordOrEmpty(ad.launch) },
      usage: out.usage,
      calls: 0,
      cancelled: recordOrEmpty(ad.launch).cancel != null,
    };
    out.ran += 1;
    const { came, pass } = await runOne(base, approved);
    out.calls += pass.calls;
    out.usage = pass.usage;
    if (came === "revoked") return { ...out, revoked: true };
    if (came === "waits") out.waiting += 1;
    if (!hasRoom(pass)) break;
  }
  return out;
}
