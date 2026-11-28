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
 * there, named and paused, and the ad says what was left.
 *
 * Every step is kept before the next is asked of Meta, a switch as a make: each is kept as going before it goes. A run
 * that dies with a switch out asks Meta what it holds before it sends anything: on there, the switch went, and is never
 * sent again; paused there, Meta never took it. And once the campaign's switch, the one that lets the ad start, is out
 * or done, no stop says the ad couldn't finish with its parts left paused unless Meta confirmed its campaign removed: it
 * is kept as the ad it is, Meta's word for it owed, so its account's read says what stands, its page says it couldn't
 * confirm it's on, and its Pause reaches its campaign. A disconnect or a sign-out stops a launch at its next step
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
  metaAdImageRequest,
  metaAdRequest,
  metaAdSetRequest,
  metaCampaignRemoveRequest,
  metaCampaignRequest,
  metaFoundByNameRequest,
  parseMetaFoundByName,
  parseMetaImageHash,
  parseMetaMadeId,
  parseMetaRemoved,
  type MetaAdsAnswer,
  type MetaPartEdge,
  type MetaUsage,
} from "@chanlytics/channels/ads";
import { MIN_MS, recordOrEmpty, type AdStopped } from "@chanlytics/contracts";
import { keepAdLaunch, listAdLaunches, type AdPartKept } from "@chanlytics/db/ads";
import { checksumOf, readAdPhoto } from "./launch/approval.js";
import { approvedOf, launchDiffers, type LaunchApproved } from "./launch/parts.js";
import {
  campaignReadBack,
  hasRoom,
  keepStep,
  letGoFor,
  mayBeOn,
  metaWordsOf,
  partKey,
  send,
  unanswered,
  type Db,
  type Launcher,
  type Log,
  type MetaRequest,
  type Pass,
  type Step,
  type Stopping,
} from "./launch/pass.js";
import { switchAll } from "./launch/switches.js";
import { launchNameOf } from "./tag.js";

/** How long a make whose answer never came is looked for by its name before the launch stops. */
const FOLLOW_MS = 10 * MIN_MS;

const DRY = { dryRun: true } as const;

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

/* --------------------------------------------------------------------------------------------- stop, finish -- */

/**
 * A launch stopped once its campaign's switch was out or done, whose campaign Meta did not confirm removed: the ad may be
 * running, so it is never kept as one that couldn't finish with its parts left paused. It is kept as the ad it is, with
 * Meta's ids and Meta's word for it owed: its account's read says what stands, its page says it couldn't confirm it's on,
 * its Pause reaches its campaign, and one its owner cancelled is paused at once (ad_launch_keep). False where Meta's ids
 * for it are not all held, which no launch this far along is without.
 */
async function keepMaybeOn(pass: Stopping, why: AdStopped): Promise<boolean> {
  const idOf = (kind: AdPartKept["kind"], version: number): string | null => {
    const part = pass.parts.get(partKey(kind, version));
    return part?.state === "made" && part.platform_id ? part.platform_id : null;
  };
  const [campaign, set, first] = [idOf("campaign", 0), idOf("set", 0), idOf("ad", 1)];
  if (campaign === null || set === null || first === null) return false;
  await keepAdLaunch(pass.db, pass.who.tenantId, pass.ad.id, {
    status: "made",
    campaign_id: campaign,
    set_id: set,
    platform_ad_id: first,
    launch: {
      step: "done",
      switching: null,
      unknown_at: typeof pass.launch.unknown_at === "string" ? pass.launch.unknown_at : new Date().toISOString(),
    },
  });
  pass.log.info("ads_launch_done", { ad_id: pass.ad.id, outcome: "made", confirmed: false, why, calls: pass.calls });
  return true;
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
  // Its campaign's switch is out or done, and Meta did not confirm the campaign gone: the ad may be running.
  if (!removed && mayBeOn(pass) && (await keepMaybeOn(pass, stop.stop))) return;
  // The picture stays in the account's library either way: it is no part of an ad, and shows nowhere.
  const objects = parts
    .filter((part) => part.kind !== "picture")
    .map((part) => ({ ...part, state: removed ? ("removed" as const) : ("left" as const) }));
  await keepAdLaunch(pass.db, pass.who.tenantId, pass.ad.id, {
    objects,
    status: "failed",
    // A switch kept as going that Meta took nothing of, or whose campaign is gone, is no longer out.
    launch: {
      stopped: stop.stop,
      said: stop.said,
      step: "stopped",
      ...(pass.launch.switching ? { switching: null } : {}),
    },
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
