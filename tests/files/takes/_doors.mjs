/**
 * 00643's SQL as the takes' tests model it (the footage sources plan's P3): the doors a take knocks on, the day's
 * budgets and the hand-out, over tables in memory. Pure: it imports nothing of the edge, so the sync's world
 * (tests/files/sources/_world.mjs) can stand the same doors beside its own for a test of the whole road.
 *
 * The SQL itself is proved on a real database by the-take-rules.db.test.mjs and
 * found-media-meets-a-watched-folder.db.test.mjs; a rule changed there is changed here.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { randomUUID } from "node:crypto";

const LA = "America/Los_Angeles";

/** The day Google counts an instant in, as 00643 does: the date in Pacific time. */
export const pacificDay = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: LA }).format(new Date(ms));

/** When the Pacific day after an instant's begins. */
export function nextPacificDay(ms) {
  const day = pacificDay(ms);
  let at = ms;
  // A day is at most 25 hours: step a quarter hour at a time to the first instant of the next one.
  while (pacificDay(at) === day) at += 15 * 60 * 1000;
  let back = at;
  while (pacificDay(back - 60 * 1000) !== day) back -= 60 * 1000;
  return new Date(back - (back % (60 * 1000)));
}

/** How long a take's hold on its room counts, with nothing written to its item meanwhile (00654 video_seconds_held). */
const HOLD_MS = 10 * 60 * 1000;

/** Whether a file counts toward the Library's cap: a watched clip whose copy is away or lost does not (00654, D16). */
export const countsAsFile = (f) => !f.removed_at && !["away", "lost"].includes(f.copy_state ?? "here");

/**
 * The seconds that count toward a workspace's sixty minutes, as 00654 video_seconds_toward_cap sums them: videos
 * whose copy is here, going or returning, and what its takes hold between their judging and their row.
 */
export function videoSecondsOf(tables, nowMs, tenantId) {
  const kept = tables.files
    .filter((f) => f.tenant_id === tenantId && countsAsFile(f) && f.kind === "video" && f.media_status !== "failed")
    .reduce((sum, f) => sum + Number(f.seconds ?? 0), 0);
  const held = (tables.source_items ?? [])
    .filter(
      (i) =>
        i.tenant_id === tenantId &&
        i.state === "taking" &&
        i.kind === "video" &&
        !i.file_id &&
        i.held_seconds != null &&
        Date.parse(i.updated_at) > nowMs - HOLD_MS,
    )
    .reduce((sum, i) => sum + Number(i.held_seconds), 0);
  return kept + held;
}

/**
 * The doors over `tables`, read through `w`: its clock (`nowMs`), what it keeps of each knock (`asked`, `handOuts`,
 * `unitWrites`) and a case's switches (`doorThrows`, `doorCallsLong`, `kindPaused`, `handOutFails`), each read as a door is
 * knocked on.
 */
export function takeDoors(tables, w) {
  for (const name of ["files", "files_let_go", "source_items", "source_days", "jobs", "media_sources"])
    tables[name] ??= [];
  const live = (tenantId, fingerprint) =>
    tables.files.find((f) => f.tenant_id === tenantId && f.fingerprint === fingerprint && !f.removed_at);
  const wasLetGo = (tenantId, fingerprint) =>
    tables.files_let_go.some((g) => g.tenant_id === tenantId && g.fingerprint === fingerprint);
  const kept = (tenantId) => tables.files.filter((f) => f.tenant_id === tenantId && countsAsFile(f));
  const videoSeconds = (tenantId) => videoSecondsOf(tables, w.nowMs, tenantId);
  const dayRow = () => {
    const day = pacificDay(w.nowMs);
    let row = tables.source_days.find((d) => d.day === day);
    if (!row) tables.source_days.push((row = { day, bytes: 0, takes: 0, units: 0 }));
    return row;
  };
  const mediaWord = (mediaRef, word, seconds = null) => {
    const row = tables.files.find((f) => f.media_ref === mediaRef);
    if (!row) return { fate: "unknown" };
    const named = { tenant_id: row.tenant_id, file_id: row.id, made: false };
    if (row.removed_at) return { fate: word === "ready" ? "gone" : "repeated", ...named };
    // A copy coming back (00654): here again and nothing else, or away again where it could not be prepared. The row
    // was found by this copy's own id, so an earlier attempt's word never reaches here.
    if (row.copy_state === "returning" && row.media_ref === mediaRef) {
      if (word === "ready")
        Object.assign(row, { copy_state: "here", copy_why: null, copy_used_at: new Date(w.nowMs).toISOString() });
      else Object.assign(row, { copy_state: "away", copy_why: "failed", media_ref: null });
      return { fate: word === "ready" ? "returned" : "unreturned", ...named };
    }
    if (["ready", "failed"].includes(row.media_status)) return { fate: "repeated", ...named };
    // A video whose road never said its length, judged by it as the platform says it: too long, or no room.
    if (word === "ready" && row.seconds === null && seconds !== null && row.source !== "upload") {
      const why = seconds > 600 ? "long" : videoSeconds(row.tenant_id) + seconds > 3600 ? "minutes" : null;
      if (why) {
        Object.assign(row, {
          removed_at: new Date(w.nowMs).toISOString(),
          seconds,
          media_error: why === "long" ? "too_long" : "no_room",
        });
        return { fate: "passed", why, ...named };
      }
    }
    row.media_status = word;
    if (word === "ready" && seconds !== null) row.seconds = seconds;
    return { fate: word, ...named };
  };
  /** A clip on its way at the video platform: the one file a take left `taking` is not put back for. */
  const onItsWay = (fileId) =>
    tables.files.some((f) => f.id === fileId && !f.removed_at && ["uploading", "processing"].includes(f.media_status));

  return {
    // 00551 and 00630, as a take meets the door: asked again, a twin, what was let go, room, then the row.
    file_found: (a) => {
      w.asked.push({ door: "file_found", ...a });
      if (w.doorThrows) throw new Error(w.doorThrows);
      if (tables.files.some((f) => f.id === a.p_id)) return { fate: "kept", file_id: a.p_id };
      const twin = live(a.p_tenant_id, a.p_fingerprint);
      if (twin) return { fate: "here", file_id: twin.id };
      if (a.p_source !== "upload" && wasLetGo(a.p_tenant_id, a.p_fingerprint)) return { fate: "here", file_id: null };
      if (kept(a.p_tenant_id).length >= 1000) return { fate: "full", file_id: null };
      tables.files.push({
        id: a.p_id,
        tenant_id: a.p_tenant_id,
        kind: "image",
        status: a.p_status,
        source: a.p_source,
        source_ref: a.p_source_ref,
        name: a.p_name,
        mime: a.p_mime,
        bytes: a.p_bytes,
        fingerprint: a.p_fingerprint,
        width: a.p_width,
        height: a.p_height,
        look_status: "waiting",
        media_ref: null,
        media_status: null,
        removed_at: null,
      });
      tables.jobs.push({
        id: randomUUID(),
        tenant_id: a.p_tenant_id,
        kind: "file_look",
        payload: { file_id: a.p_id },
      });
      return { fate: "kept", file_id: a.p_id };
    },
    // 00643's order: asked again, a twin, what was let go, the Library's cap, the videos' room, then (with a copy
    // named) the row and its origin in one write.
    file_video_sourced: (a) => {
      w.asked.push({ door: "file_video_sourced", ...a });
      if (w.doorThrows) throw new Error(w.doorThrows);
      // 00654: what this take held at an earlier judging is let go of first, so it is never counted against itself.
      const taking = tables.source_items.find((i) => i.tenant_id === a.p_tenant_id && i.id === a.p_item_id);
      if (taking) taking.held_seconds = null;
      const held = tables.files.find((f) => f.tenant_id === a.p_tenant_id && f.id === a.p_id);
      if (held) return { fate: "kept", file_id: a.p_id, media_ref: held.media_ref };
      const twin = live(a.p_tenant_id, a.p_fingerprint);
      if (twin) return { fate: "here", file_id: twin.id };
      if (wasLetGo(a.p_tenant_id, a.p_fingerprint)) return { fate: "let_go", file_id: null };
      if (kept(a.p_tenant_id).length >= 1000) return { fate: "full", file_id: null };
      // 00643 file_video_room, the one check a found video's door asks too: long, minutes or room.
      if (w.doorCallsLong || (a.p_seconds !== null && a.p_seconds > 600)) return { fate: "long", file_id: null };
      const used = videoSeconds(a.p_tenant_id);
      if ((a.p_seconds === null && used >= 3600) || used + Number(a.p_seconds ?? 0) > 3600)
        return { fate: "minutes", file_id: null };
      if (a.p_media_ref === null) {
        // Judged to fit: its room is held until its row is written (00654, the review's finding 9).
        if (taking?.state === "taking")
          Object.assign(taking, {
            held_seconds: Number(a.p_seconds ?? 0),
            updated_at: new Date(w.nowMs).toISOString(),
          });
        return { fate: "room", file_id: null };
      }
      tables.files.push({
        id: a.p_id,
        tenant_id: a.p_tenant_id,
        kind: "video",
        status: "filed",
        source: "drive",
        source_ref: null,
        name: a.p_name,
        mime: a.p_mime,
        bytes: a.p_bytes,
        seconds: a.p_seconds,
        fingerprint: a.p_fingerprint,
        media_ref: a.p_media_ref,
        media_status: "uploading",
        look_status: "waiting",
        copy_state: "here",
        copy_why: null,
        removed_at: null,
      });
      const item = tables.source_items.find((i) => i.tenant_id === a.p_tenant_id && i.id === a.p_item_id);
      if (item) item.file_id = a.p_id;
      return { fate: "kept", file_id: a.p_id, media_ref: a.p_media_ref };
    },
    // 00643: the platform's day and the workspace's, a day as Google counts one.
    source_take_spend: (a) => {
      const item = tables.source_items.find((i) => i.tenant_id === a.p_tenant_id && i.id === a.p_item_id);
      if (!item) return { fate: "unknown" };
      const day = pacificDay(w.nowMs);
      const until = nextPacificDay(w.nowMs).toISOString();
      const spent = dayRow();
      const today = (i) => i.taken_at && pacificDay(Date.parse(i.taken_at)) === day;
      if (spent.units + a.p_units > a.p_units_max) return { fate: "wait", binds: "units", until };
      if (spent.bytes + a.p_bytes > a.p_platform_bytes_max) return { fate: "wait", binds: "platform_bytes", until };
      if (!today(item)) {
        const mine = tables.source_items.filter((i) => i.tenant_id === a.p_tenant_id && today(i));
        if (mine.length + 1 > a.p_workspace_takes_max) return { fate: "wait", binds: "workspace_takes", until };
        if (mine.reduce((sum, i) => sum + Number(i.bytes ?? 0), 0) + a.p_bytes > a.p_workspace_bytes_max)
          return { fate: "wait", binds: "workspace_bytes", until };
        item.taken_at = new Date(w.nowMs).toISOString();
        item.bytes = a.p_bytes;
      }
      spent.bytes += a.p_bytes;
      spent.takes += 1;
      return { fate: "go" };
    },
    source_units_spend: (a) => {
      w.unitWrites.push(a.p_units);
      const spent = dayRow();
      spent.units += a.p_units;
      return spent.units;
    },
    // 00556's two doors, as the video platform's word meets them: found by the copy's id, moved once.
    file_media_ready: (a) => mediaWord(a.p_media_ref, "ready", a.p_seconds ?? null),
    file_media_failed: (a) => mediaWord(a.p_media_ref, "failed"),
    // 00643: what waits and is due, of a folder still being read, moved to taking and given its job in one write.
    // For one workspace or for all, while a workspace has fewer than so many in flight and the video platform is
    // preparing fewer than so many clips. A paused kind is handed nothing.
    source_takes_hand_out: (a) => {
      w.handOuts.push(a);
      // A case's switch: the database not answering one workspace's hand-out (the clock's own still answers).
      if (w.handOutFails && a.p_tenant_id) throw new Error(w.handOutFails);
      if (w.kindPaused) return 0;
      const mine = (i) => !a.p_tenant_id || i.tenant_id === a.p_tenant_id;
      const reading = new Set(
        tables.media_sources.filter((s) => ["setting_up", "watching"].includes(s.state)).map((s) => s.id),
      );
      // A take that never ended waits again, marked lost: one with no file, or with one that is not a clip on its
      // way (an item that was in, left and came back still holds the file it had).
      for (const item of tables.source_items)
        if (
          mine(item) &&
          item.state === "taking" &&
          (!item.file_id || !onItsWay(item.file_id)) &&
          Date.parse(item.updated_at) < w.nowMs - a.p_stale_seconds * 1000
        )
          Object.assign(item, { state: "waiting", why: "lost", take_after: null });
      const taking = tables.source_items.filter((i) => i.state === "taking");
      const flying = (tenantId) => taking.filter((i) => i.tenant_id === tenantId).length;
      const videosRoom = Math.max(a.p_videos_max, 0) - taking.filter((i) => i.kind === "video").length;
      const come = (iso) => !iso || Date.parse(iso) <= w.nowMs;
      const due = tables.source_items
        .filter(
          (i) =>
            mine(i) &&
            i.state === "waiting" &&
            ["image", "video"].includes(i.kind) &&
            come(i.take_after) &&
            // A video its provider has not measured waits for its length as long as the sync says (00641).
            come(i.length_until) &&
            reading.has(i.source_id),
        )
        .sort((x, y) => String(y.modified_at).localeCompare(String(x.modified_at)) || x.id.localeCompare(y.id));
      const places = new Map();
      const candidates = [];
      for (const item of due) {
        const place = (places.get(item.tenant_id) ?? 0) + 1;
        places.set(item.tenant_id, place);
        if (place <= Math.max(a.p_in_flight, 1) - flying(item.tenant_id)) candidates.push(item);
      }
      let handed = 0;
      let videos = 0;
      for (const item of a.p_tenant_id ? candidates : candidates.slice(0, Math.max(a.p_limit, 1))) {
        if (item.kind === "video" && ++videos > videosRoom) continue;
        Object.assign(item, {
          state: "taking",
          why: item.why === "lost" ? "lost" : null,
          take_after: null,
          updated_at: new Date(w.nowMs).toISOString(),
        });
        tables.jobs.push({
          id: randomUUID(),
          tenant_id: item.tenant_id,
          kind: "source_take",
          state: "scheduled",
          due_at: new Date(w.nowMs).toISOString(),
          payload: { item_id: item.id, try: String(item.take_tries ?? 0) },
        });
        handed += 1;
      }
      return handed;
    },
  };
}
