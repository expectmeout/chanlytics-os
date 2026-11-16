import "server-only";
/**
 * What Ask noticed (D19 of the answers canvas): the signals it already worked out for the model, shown at last, with the room
 * against who said yes (D6), what came of what it did (D21) and the gap that stops an offer (D36). Read by code, no model, on
 * every read, so a notice closes itself when its facts move and costs nothing. One at a time reaches a person (D7).
 *
 * Read with what each notice needs and nothing more, all at once (16 Nov 2026): the signals' parts as narrow as their
 * rules (tools/read/seen.ts), and of the four here, who said yes only where the room has open slots (it is everyone in
 * People, counted), and the sends once, only where a notice says one. On every open of the AI and every business's
 * morning (sweep.ts), so what it reads is what a business of thousands pays each time.
 */
import {
  DAY_MS,
  ASK_FOUND_VIEW,
  channelChoices,
  dayInZone,
  isRested,
  noticeOf,
  noticeRestId,
  noticesInOrder,
  restedOf,
  type AskNotice,
  type AskRested,
  type TenantId,
} from "@chanlytics/contracts";
import { countHeldReviewReplies, listAskActions } from "@chanlytics/db/ask";
import { logAndGoOn } from "@chanlytics/log";
import { load } from "@/server/shared/reader";
import { channelsReady } from "@/server/readers/facts";
import { listBroadcasts } from "@/server/campaigns/broadcasts/broadcasts";
import { getRoom } from "../tools/read/calendar";
import { findOfferedList } from "../tools/read/people/people";
import { seeAll } from "../tools/read/seen";
import { spotsOf } from "../tools/read/signals";
import type { ToolContext } from "../tools/context/tool-defs";

/** How long after a send what came of it is said. */
const RESULT_DAYS = 14;

/** The workspace's sends, read once a read of the notices and only where a notice asks: null where they could not be. */
type Runs = () => Promise<Awaited<ReturnType<typeof listBroadcasts>> | null>;

/** The words of the last offer sent, for the one-press version of "run it again": null where none is known. */
async function lastOfferWords(runsRead: Runs): Promise<string | null> {
  const runs = await runsRead();
  const newest = runs?.broadcasts
    .filter((b) => (b.params ?? []).some((p) => p.kind === "text"))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .at(0);
  const typed = newest?.params?.find((p) => p.kind === "text");
  return typed && typed.kind === "text" ? typed.value : null;
}

/**
 * D6: open slots against who said yes. Only where more said yes than there is room, which is what makes it worth saying: so
 * who said yes (everyone in People, counted) is read only where the room has a slot open.
 */
async function roomAndYes(t: ToolContext, language: string, runsRead: Runs): Promise<AskNotice | null> {
  const room = await getRoom(t).catch(logAndGoOn("notice room", null));
  if (!room || "none" in room || room.open <= 0) return null;
  const yes = await findOfferedList(t, "offers_ok").catch(logAndGoOn("notice lists", undefined));
  if (yes === undefined) return null;
  const count = yes?.count ?? 0;
  if (count <= room.open) return null;
  const words = await lastOfferWords(runsRead);
  return noticeOf("room_and_yes", { open: room.open, yes: count, words }, language, [
    { value: String(room.open), label: language === "es" ? "huecos libres" : "open slots", to: "calendar" },
    {
      value: String(count),
      label: language === "es" ? "dijeron que sí" : "said yes",
      to: yes ? `clients/${yes.list}` : null,
    },
  ]);
}

/** D21: what came of the newest send Ask pressed, in the numbers its page shows. "Since", never "because". */
async function offerResult(t: ToolContext, language: string, runsRead: Runs): Promise<AskNotice | null> {
  const since = new Date(t.now.getTime() - RESULT_DAYS * DAY_MS).toISOString();
  const acted = await listAskActions(t.ctx.supabase, t.tenantId as TenantId, since, 20).catch(
    logAndGoOn("notice actions", []),
  );
  const send = acted.find((a) => (a.kind === "broadcast" || a.kind === "playbook") && a.state === "done");
  if (!send) return null;
  const runs = await runsRead();
  const run = runs?.broadcasts.find(
    (b) => Date.parse(b.created_at) >= Date.parse(send.at) && (b.counts?.sent ?? 0) > 0,
  );
  if (!run) return null;
  return noticeOf(
    "offer_result",
    { name: run.name ?? "", sent: run.counts.sent, replied: run.counts.replied, booked: 0 },
    language,
    [],
  );
}

/** D36: the one gap that stops an offer going at all, as one step. Null where any channel can carry one. */
async function channelGap(t: ToolContext, language: string): Promise<AskNotice | null> {
  const ready = await load(t.rc, channelsReady, undefined).then((r) => r.data, logAndGoOn("notice channels", null));
  if (!ready) return null;
  const offers = channelChoices(ready, "marketing", "ours");
  if (offers.some((o) => o.ok)) return null;
  return noticeOf("channel_gap", { channel: language === "es" ? "El correo" : "Email" }, language);
}

/** D34: review replies already written and waiting for a word, which cost nothing more to look at. */
async function reviewsWritten(t: ToolContext, language: string): Promise<AskNotice | null> {
  const held = await countHeldReviewReplies(t.ctx.supabase, t.tenantId as TenantId).catch(
    logAndGoOn("notice reviews", 0),
  );
  return held > 0 ? noticeOf("reviews_written", { replies: held }, language) : null;
}

/** Every notice this member has not rested, the one most worth acting on first. */
export async function listNotices(t: ToolContext, language: string, rested: AskRested): Promise<AskNotice[]> {
  const today = dayInZone(t.timezone, t.now.getTime()).key;
  let asked: ReturnType<Runs> | null = null;
  const runsRead: Runs = () => (asked ??= listBroadcasts(t.ctx, t.tenantId).catch(logAndGoOn("notice runs", null)));
  const [seen, ...more] = await Promise.all([
    seeAll(t),
    roomAndYes(t, language, runsRead),
    offerResult(t, language, runsRead),
    channelGap(t, language),
    reviewsWritten(t, language),
  ]);
  const fromSpots = spotsOf(seen).flatMap((s) => {
    const n = noticeOf(s.key, s.facts ?? {}, language);
    return n ? [n] : [];
  });
  const all = [...fromSpots, ...more.filter((n): n is AskNotice => n !== null)];
  return noticesInOrder(all, (key) => isRested(rested, noticeRestId(key), today));
}

/** The member's rests, as Today keeps them. */
export const restedOfViews = (views: Record<string, unknown> | null | undefined): AskRested =>
  restedOf(views?.[ASK_FOUND_VIEW]);
