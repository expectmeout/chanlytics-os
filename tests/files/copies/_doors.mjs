/**
 * 00654's SQL as the copies' tests model it (the footage sources plan's P4, "Availability"): where a copy stands by
 * its origins, the letting go, a return's door and the seven-day cleanup, over tables in memory; and 00695's shelf
 * beside them (the archive plan's B2): a made video's copy on Chanlytics' own shelf, begun with its job, checked, put
 * back, and counted among what can give a copy back. Pure: it imports
 * nothing of the edge. The takes' doors (tests/files/takes/_doors.mjs) stand beside these in one world, and count
 * room the same way.
 *
 * The SQL itself is proved on a real database by the-copy-rules.db.test.mjs; a rule changed there is changed here.
 * What only the database does is not modelled: the trigger that settles a copy as its origin moves (a test here
 * settles through the door, which asks the same function).
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { randomUUID } from "node:crypto";
import { nextPacificDay, pacificDay, videoSecondsOf } from "../takes/_doors.mjs";

const CAP_SECONDS = 60 * 60;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** The states of a shelf copy that hold room on the shelf: there, or on its way there (00729 file_shelf_seconds). */
const HOLDS_ROOM = ["saving", "saved", "checked"];
const RETURNABLE = ["in", "taking", "waiting", "listed"];
const TOMBSTONES = ["gone", "outside", "no_access"];

/** The doors over `tables`, read through `w`: its clock (`nowMs`) and what it keeps of each knock (`asked`). */
export function copyDoors(tables, w) {
  for (const name of [
    "files",
    "files_let_go",
    "source_items",
    "source_days",
    "jobs",
    "media_sources",
    "posts",
    "pieces",
    "events",
    "file_archives",
    "file_archive_parts",
  ])
    tables[name] ??= [];
  const now = () => new Date(w.nowMs).toISOString();
  const fileOf = (tenantId, id) => tables.files.find((f) => f.tenant_id === tenantId && f.id === id);
  const originsOf = (tenantId, fileId) =>
    tables.source_items.filter((i) => i.tenant_id === tenantId && i.file_id === fileId);
  // file_copy_origin: an item that holds the file and that its provider still shows, the one that is in first.
  const originOf = (tenantId, fileId) =>
    originsOf(tenantId, fileId)
      .filter((i) => RETURNABLE.includes(i.state))
      .sort((a, b) => Number(b.state === "in") - Number(a.state === "in"))[0] ?? null;
  // A file's shelf copy and its video's piece (00695): one a file at most.
  const shelfOf = (tenantId, fileId) =>
    tables.file_archives.find((a) => a.tenant_id === tenantId && a.file_id === fileId && a.origin === "shelf") ?? null;
  const pieceOf = (shelf) =>
    tables.file_archive_parts.find((p) => p.archive_id === shelf.id && p.part === "video") ?? null;
  // file_copy_shelved: a shelf copy that is checked, its video's piece too. A saved or a picked copy never counts.
  const shelved = (tenantId, fileId) => {
    const shelf = shelfOf(tenantId, fileId);
    return Boolean(shelf && shelf.state === "checked" && pieceOf(shelf)?.state === "checked");
  };
  // A copy on its way to the shelf, or one the shelf only refused: its own file is still there to put it from.
  const shelfMayYet = (tenantId, fileId) => {
    const shelf = shelfOf(tenantId, fileId);
    return Boolean(
      shelf && (["saving", "saved"].includes(shelf.state) || (shelf.state === "failed" && shelf.why === "refused")),
    );
  };
  // file_copy_standing: null where the shelf or an origin can give it back, else why none can.
  const standingOf = (tenantId, fileId) => {
    if (shelved(tenantId, fileId) || shelfMayYet(tenantId, fileId)) return null;
    if (originOf(tenantId, fileId)) return null;
    const stone = originsOf(tenantId, fileId)
      .filter((i) => TOMBSTONES.includes(i.state))
      .sort((a, b) => String(b.gone_at ?? "").localeCompare(String(a.gone_at ?? "")))[0];
    if (!stone) return "no_origin";
    if (stone.state === "no_access") return stone.why === "not_found" ? "not_found" : "no_access";
    return stone.state;
  };
  const free = (tenantId) => CAP_SECONDS - videoSecondsOf(tables, w.nowMs, tenantId);
  const usedAt = (f) => Date.parse(f.copy_used_at ?? f.ready_at ?? f.created_at);
  const named = (plan, fileId) => JSON.stringify(plan ?? null).includes(fileId);
  // file_copy_comes_back (F1): its item is in, under a folder being read or stopped, whose account reads.
  const reading = () =>
    new Set(
      tables.media_sources
        .filter(
          (s) =>
            ["setting_up", "watching", "stopped"].includes(s.state) &&
            (tables.source_connections ?? []).some((c) => c.id === s.connection_id && c.health === "ok"),
        )
        .map((s) => s.id),
    );
  /**
   * A copy that could ever be let go: here, playable, and something can give it back: a watched clip its owner did
   * not upload that can come back, or a video with a checked copy on the shelf (00695).
   */
  const mayEverGo = (f, tenantId) =>
    f.tenant_id === tenantId &&
    f.kind === "video" &&
    !f.removed_at &&
    (f.copy_state ?? "here") === "here" &&
    f.media_status === "ready" &&
    f.media_ref &&
    ((f.source === "drive" &&
      !f.owner_uploaded &&
      originsOf(f.tenant_id, f.id).some((i) => i.state === "in" && reading().has(i.source_id))) ||
      shelved(f.tenant_id, f.id));
  const makingNames = (f) =>
    tables.pieces.some((p) => p.tenant_id === f.tenant_id && p.status === "making" && named(p.plan, f.id));
  /** file_was_used: a post of it, a video made or being made that names it, a file made from it. */
  const wasUsed = (tenantId, fileId) =>
    tables.posts.some((p) => p.tenant_id === tenantId && p.file_id === fileId) ||
    tables.pieces.some(
      (p) => p.tenant_id === tenantId && ["making", "made"].includes(p.status) && named(p.plan, fileId),
    ) ||
    tables.files.some(
      (m) => m.tenant_id === tenantId && m.id !== fileId && !m.removed_at && m.made && named(m.made, fileId),
    );
  /** The file goes as a twin does: removed, its purge on the ledger, and why on the Activity log. */
  const removeFile = (file, why) => {
    Object.assign(file, { removed_at: now(), updated_at: now() });
    tables.jobs.push({
      id: randomUUID(),
      tenant_id: file.tenant_id,
      kind: "file_purge",
      state: "scheduled",
      due_at: now(),
      payload: { file_id: file.id, why: "remove" },
    });
    tables.events.push({ tenant_id: file.tenant_id, kind: "file.removed", data: { file_id: file.id, why } });
  };
  /** A job on the ledger held once a file while one waits or runs, as a door writes one (job_kinds.once_parts). */
  const writeJobOnce = (kind, tenantId, fileId) => {
    const live = tables.jobs.some(
      (j) =>
        j.kind === kind &&
        j.tenant_id === tenantId &&
        j.payload?.file_id === fileId &&
        ["scheduled", "fired"].includes(j.state),
    );
    if (live) return false;
    tables.jobs.push({
      id: randomUUID(),
      tenant_id: tenantId,
      kind,
      state: "scheduled",
      due_at: now(),
      payload: { file_id: fileId },
    });
    return true;
  };
  /** The shelf's job on the ledger (job_kinds: file_shelve). */
  const writeShelveJob = (tenantId, fileId) => writeJobOnce("file_shelve", tenantId, fileId);
  /**
   * file_shelf_seconds (00729): the shelf's room, counted once. The lengths of a workspace's files, still there, whose
   * shelf copy is saving, saved or checked. file_shelf_begin, file_shelf_again and file_shelf_owed all read this.
   */
  const shelfSeconds = (tenantId) =>
    tables.file_archives
      .filter((x) => x.tenant_id === tenantId && x.origin === "shelf" && HOLDS_ROOM.includes(x.state))
      .map((x) => fileOf(x.tenant_id, x.file_id))
      .filter((f) => f && !f.removed_at)
      .reduce((sum, f) => sum + Number(f.seconds ?? 0), 0);
  /** A copy that is away or lost, set to what its origins now say: what file_copy_settle writes. */
  const settleRow = (tenantId, fileId) => {
    const row = fileOf(tenantId, fileId);
    if (!row) return null;
    const lost = standingOf(tenantId, fileId);
    if ((row.copy_state === "away" && lost) || (row.copy_state === "lost" && lost !== row.copy_why))
      Object.assign(row, { copy_state: lost ? "lost" : "away", copy_why: lost, updated_at: now() });
    return row;
  };
  /** Held by its own road (an upload, a found road, its owner's upload of it) rather than only by a folder. */
  const heldByItsRoad = (file) => file.source !== "drive" || file.owner_uploaded === true;
  const dayRow = () => {
    const day = pacificDay(w.nowMs);
    let row = tables.source_days.find((d) => d.day === day);
    if (!row) tables.source_days.push((row = { day, bytes: 0, takes: 0, units: 0, returns: 0 }));
    row.returns ??= 0;
    return row;
  };

  return {
    file_copy_settle: (a) => {
      w.asked.push({ door: "file_copy_settle", ...a });
      const row = settleRow(a.p_tenant_id, a.p_file_id);
      if (!row) return { copy_state: null };
      return {
        copy_state: row.copy_state ?? "here",
        copy_why: row.copy_why ?? null,
        item_id: originOf(a.p_tenant_id, a.p_file_id)?.id ?? null,
        shelf: shelved(a.p_tenant_id, a.p_file_id),
      };
    },
    // By room (p_seconds) the least recently used first, as many as free what is short and none where all would not;
    // by age each one unused since p_unused_before. Only what can come back, and nothing a video being made names.
    file_copies_let_go: (a) => {
      w.asked.push({ door: "file_copies_let_go", ...a });
      const short = a.p_seconds === null ? null : a.p_seconds - free(a.p_tenant_id);
      if (short !== null && short <= 0) return [];
      const eligible = tables.files
        .filter(
          (f) =>
            mayEverGo(f, a.p_tenant_id) &&
            (["done", "refused"].includes(f.look_status) || Date.parse(f.created_at) < w.nowMs - WEEK_MS) &&
            usedAt(f) < Date.parse(a.p_rested_before) &&
            !makingNames(f),
        )
        .sort((x, y) => usedAt(x) - usedAt(y) || x.id.localeCompare(y.id));
      const all = eligible.reduce((sum, f) => sum + Number(f.seconds ?? 0), 0);
      let before = 0;
      const going = [];
      for (const [place, f] of eligible.entries()) {
        const chosen =
          short !== null
            ? all >= short && before < short
            : a.p_unused_before !== null && usedAt(f) < Date.parse(a.p_unused_before);
        before += Number(f.seconds ?? 0);
        if (!chosen || place >= Math.max(a.p_limit, 1)) continue;
        Object.assign(f, { copy_state: "going", copy_why: null, updated_at: now() });
        going.push({ id: f.id, media_ref: f.media_ref, seconds: f.seconds ?? null });
      }
      return going;
    },
    // The copies that may not go yet but could: resting ones by the end of their rest, held ones a rest from now.
    file_copies_free_at: (a) => {
      w.asked.push({ door: "file_copies_free_at", ...a });
      const rest = a.p_rest_seconds * 1000;
      const times = tables.files
        .filter((f) => mayEverGo(f, a.p_tenant_id))
        .flatMap((f) => {
          const resting = usedAt(f) >= w.nowMs - rest;
          const held =
            (!["done", "refused"].includes(f.look_status) && Date.parse(f.created_at) >= w.nowMs - WEEK_MS) ||
            makingNames(f);
          if (resting) return [usedAt(f) + rest];
          return held ? [w.nowMs + rest] : [];
        });
      return times.length ? new Date(Math.min(...times)).toISOString() : null;
    },
    file_copy_gone: (a) => {
      const row = fileOf(a.p_tenant_id, a.p_id);
      if (!row || row.copy_state !== "going") return false;
      const lost = standingOf(a.p_tenant_id, a.p_id);
      Object.assign(row, { copy_state: lost ? "lost" : "away", copy_why: lost, media_ref: null, updated_at: now() });
      for (const item of tables.source_items)
        if (item.tenant_id === a.p_tenant_id && item.state === "waiting" && item.why === "room") item.take_after = null;
      return true;
    },
    file_copy_return_begin: (a) => {
      w.asked.push({ door: "file_copy_return_begin", ...a });
      const row = fileOf(a.p_tenant_id, a.p_id);
      if (!row || row.removed_at || row.kind !== "video") return { fate: "none" };
      const state = row.copy_state ?? "here";
      if (state === "here" || state === "going") return { fate: state };
      const fresh = Date.parse(row.updated_at) >= w.nowMs - a.p_stale_seconds * 1000;
      if (state === "returning" && (row.media_ref || fresh)) return { fate: "returning" };
      const lost = standingOf(a.p_tenant_id, a.p_id);
      if (lost) {
        Object.assign(row, { copy_state: "lost", copy_why: lost, media_ref: null, updated_at: now() });
        return { fate: "lost", why: lost };
      }
      if (state !== "returning") {
        const seconds = row.seconds === null || row.seconds === undefined ? null : Number(row.seconds);
        if ((seconds === null && free(a.p_tenant_id) <= 0) || Number(seconds ?? 0) > free(a.p_tenant_id)) {
          Object.assign(row, { copy_state: "away", copy_why: "room", updated_at: now() });
          return { fate: "room", seconds };
        }
        const day = pacificDay(w.nowMs);
        const today = tables.files.filter(
          (f) =>
            f.tenant_id === a.p_tenant_id && f.copy_returned_at && pacificDay(Date.parse(f.copy_returned_at)) === day,
        ).length;
        // From the shelf (00695): nothing of a provider's day is asked or written; the workspace's own returns bind.
        const spent = shelved(a.p_tenant_id, a.p_id) ? null : dayRow();
        const binds =
          spent && spent.units + a.p_units > a.p_units_max
            ? "units"
            : spent && spent.bytes + Number(row.bytes ?? 0) > a.p_platform_bytes_max
              ? "platform_bytes"
              : today + 1 > a.p_workspace_returns_max
                ? "workspace_returns"
                : null;
        if (binds) {
          Object.assign(row, { copy_state: "away", copy_why: "budget", updated_at: now() });
          return { fate: "wait", binds, until: nextPacificDay(w.nowMs).toISOString() };
        }
        if (spent) {
          spent.bytes += Number(row.bytes ?? 0);
          spent.returns += 1;
        }
        row.copy_returned_at = now();
      }
      Object.assign(row, { copy_state: "returning", copy_why: null, media_ref: null, updated_at: now() });
      return { fate: "go" };
    },
    file_copy_returning: (a) => {
      const row = fileOf(a.p_tenant_id, a.p_id);
      if (!row || row.removed_at || row.copy_state !== "returning" || row.media_ref) return false;
      Object.assign(row, { media_ref: a.p_media_ref, updated_at: now() });
      return true;
    },
    file_copy_return_failed: (a) => {
      const row = fileOf(a.p_tenant_id, a.p_id);
      if (!row || row.copy_state !== "returning" || (row.media_ref ?? null) !== (a.p_media_ref ?? null)) return false;
      Object.assign(row, { copy_state: "away", copy_why: a.p_why, media_ref: null, updated_at: now() });
      return true;
    },
    // A removed file's row goes once its bytes have (00551), and its copies' rows with it (00686's cascade).
    file_purged: (a) => {
      w.asked.push({ door: "file_purged", ...a });
      const at = tables.files.findIndex((f) => f.tenant_id === a.p_tenant_id && f.id === a.p_id && f.removed_at);
      if (at < 0) return null;
      tables.files.splice(at, 1);
      const gone = new Set(tables.file_archives.filter((x) => x.file_id === a.p_id).map((x) => x.id));
      tables.file_archives = tables.file_archives.filter((x) => !gone.has(x.id));
      tables.file_archive_parts = tables.file_archive_parts.filter((x) => !gone.has(x.archive_id));
      return null;
    },
    // A copy marked going is here again (00695): its shelf copy was not what it should be, so nothing was deleted.
    file_copy_kept: (a) => {
      w.asked.push({ door: "file_copy_kept", ...a });
      const row = fileOf(a.p_tenant_id, a.p_id);
      if (!row || row.copy_state !== "going" || !row.media_ref) return false;
      Object.assign(row, { copy_state: "here", copy_why: null, updated_at: now() });
      return true;
    },
    file_copy_shelved: (a) => shelved(a.p_tenant_id, a.p_file_id),
    // A made video's shelf copy begun with its job, in one step, within the shelf's room.
    file_shelf_begin: (a) => {
      w.asked.push({ door: "file_shelf_begin", ...a });
      const file = fileOf(a.p_tenant_id, a.p_file_id);
      if (!file || file.removed_at || file.kind !== "video" || file.source !== "made") return { fate: "none" };
      const held = shelfOf(a.p_tenant_id, a.p_file_id);
      if (held) return { fate: "kept", state: held.state };
      if (shelfSeconds(a.p_tenant_id) + Number(file.seconds ?? 0) > a.p_seconds_max) return { fate: "full" };
      const id = randomUUID();
      tables.file_archives.push({
        id,
        tenant_id: a.p_tenant_id,
        file_id: file.id,
        origin: "shelf",
        state: "saving",
        why: null,
        checked_at: null,
        updated_at: now(),
      });
      tables.file_archive_parts.push({
        id: randomUUID(),
        tenant_id: a.p_tenant_id,
        archive_id: id,
        part: "video",
        shelf_key: `${a.p_tenant_id}/${file.id}/video`,
        bytes: a.p_bytes,
        sha256: a.p_sha256,
        state: "saving",
        checked_at: null,
      });
      writeShelveJob(a.p_tenant_id, file.id);
      return { fate: "begun" };
    },
    // What the shelf holds against what was sent: checked where both are the same, a mismatch where not.
    file_shelf_checked: (a) => {
      w.asked.push({ door: "file_shelf_checked", ...a });
      const shelf = shelfOf(a.p_tenant_id, a.p_file_id);
      const piece = shelf ? pieceOf(shelf) : null;
      if (!shelf || !piece) return "none";
      const same =
        a.p_bytes !== null &&
        Number(a.p_bytes) === Number(piece.bytes) &&
        a.p_sha256 !== null &&
        a.p_sha256 === piece.sha256;
      if (shelf.state === "checked") return same ? "checked" : "none";
      if (!["saving", "saved"].includes(shelf.state)) return "none";
      const state = same ? "checked" : "failed";
      Object.assign(piece, { state, checked_at: same ? now() : null });
      Object.assign(shelf, {
        state,
        why: same ? null : "mismatch",
        checked_at: same ? now() : null,
        updated_at: now(),
      });
      if (!same) settleRow(a.p_tenant_id, a.p_file_id);
      // A return that waited on this copy goes back on the ledger in the same step (00729): the video is away, and
      // was asked for while its shelf copy was being put back.
      const file = fileOf(a.p_tenant_id, a.p_file_id);
      if (same && file && !file.removed_at && file.copy_state === "away" && file.copy_why === "unreadable")
        writeJobOnce("copy_return", a.p_tenant_id, a.p_file_id);
      return same ? "checked" : "mismatch";
    },
    file_shelf_failed: (a) => {
      w.asked.push({ door: "file_shelf_failed", ...a });
      if (!["mismatch", "not_found", "refused"].includes(a.p_why)) throw new Error("22023: a reason of another copy's");
      const shelf = shelfOf(a.p_tenant_id, a.p_file_id);
      if (!shelf || !["saving", "saved"].includes(shelf.state)) return false;
      Object.assign(shelf, { state: "failed", why: a.p_why, checked_at: null, updated_at: now() });
      Object.assign(pieceOf(shelf) ?? {}, { state: "failed", checked_at: null });
      settleRow(a.p_tenant_id, a.p_file_id);
      return true;
    },
    // A copy found missing or wrong, or one that failed, put back: saving again with its job, its bytes kept.
    file_shelf_again: (a) => {
      w.asked.push({ door: "file_shelf_again", ...a });
      const shelf = shelfOf(a.p_tenant_id, a.p_file_id);
      const file = fileOf(a.p_tenant_id, a.p_file_id);
      if (!shelf || !["checked", "failed"].includes(shelf.state) || !file || file.removed_at) return false;
      // Not for a copy with no piece (file_shelf_unkept): there are no bytes to put it from.
      const piece = pieceOf(shelf);
      if (!piece) return false;
      // The shelf's one room (00729): a checked copy is counted already; a failed one comes back only where it fits.
      const max = a.p_seconds_max ?? null;
      if (shelf.state === "failed" && max !== null && shelfSeconds(a.p_tenant_id) + Number(file.seconds ?? 0) > max)
        return false;
      Object.assign(shelf, { state: "saving", why: null, checked_at: null, updated_at: now() });
      Object.assign(piece, { state: "saving", checked_at: null });
      writeShelveJob(a.p_tenant_id, a.p_file_id);
      return true;
    },
    // Copies left saving for a stale stretch get their job again, once a stretch; one with a job waiting gets none.
    file_shelf_requeue: (a) => {
      w.asked.push({ door: "file_shelf_requeue", ...a });
      const stale = tables.file_archives
        .filter(
          (x) =>
            x.origin === "shelf" &&
            x.state === "saving" &&
            Date.parse(x.updated_at ?? now()) < w.nowMs - a.p_stale_seconds * 1000,
        )
        .slice(0, Math.max(a.p_limit, 0));
      let written = 0;
      for (const shelf of stale) {
        shelf.updated_at = now();
        if (writeShelveJob(shelf.tenant_id, shelf.file_id)) written += 1;
      }
      return written;
    },
    // What the shelf is owed, for every workspace whose switch is on (00729): the made videos with no shelf copy's
    // row that fit, newest first; the copies the shelf refused a while ago; and what a full shelf holds back.
    file_shelf_owed: (a) => {
      w.asked.push({ door: "file_shelf_owed", ...a });
      const on = new Set(
        (tables.tenant_config ?? []).filter((c) => c.config?.features?.video_shelf === true).map((c) => c.tenant_id),
      );
      const staleBefore = w.nowMs - Math.max(a.p_stale_seconds, 0) * 1000;
      const unshelved = tables.files
        .filter(
          (f) =>
            on.has(f.tenant_id) &&
            f.kind === "video" &&
            f.source === "made" &&
            !f.removed_at &&
            Date.parse(f.created_at) < staleBefore &&
            !shelfOf(f.tenant_id, f.id),
        )
        .map((f) => ({ act: "begin", file: f, at: Date.parse(f.created_at), bytes: Number(f.bytes ?? 0) }));
      const refused = tables.file_archives
        .filter(
          (x) =>
            on.has(x.tenant_id) &&
            x.origin === "shelf" &&
            x.state === "failed" &&
            x.why === "refused" &&
            Date.parse(x.updated_at ?? now()) < staleBefore &&
            pieceOf(x),
        )
        .map((x) => ({ act: "again", file: fileOf(x.tenant_id, x.file_id), at: Date.parse(x.updated_at), bytes: 0 }))
        .filter((o) => o.file && !o.file.removed_at);
      const judged = [...unshelved, ...refused].map((o) => ({
        ...o,
        fits: shelfSeconds(o.file.tenant_id) + Number(o.file.seconds ?? 0) <= a.p_seconds_max,
        light: o.bytes <= a.p_bytes_max,
      }));
      const few = Math.max(a.p_limit, 0);
      const waiting = judged.filter((o) => !o.fits);
      return {
        begin: judged
          .filter((o) => o.act === "begin" && o.fits && o.light)
          .sort((x, y) => y.at - x.at || x.file.id.localeCompare(y.file.id))
          .slice(0, few)
          .map((o) => ({ tenant_id: o.file.tenant_id, file_id: o.file.id, bytes: o.bytes })),
        again: judged
          .filter((o) => o.act === "again" && o.fits)
          .sort((x, y) => x.at - y.at || x.file.id.localeCompare(y.file.id))
          .slice(0, few)
          .map((o) => ({ tenant_id: o.file.tenant_id, file_id: o.file.id })),
        full: { videos: waiting.length, workspaces: new Set(waiting.map((o) => o.file.tenant_id)).size },
        heavy: judged.filter((o) => o.act === "begin" && o.fits && !o.light).length,
      };
    },
    // A made video whose own kept file is gone: its row says so, once, with no piece (00729).
    file_shelf_unkept: (a) => {
      w.asked.push({ door: "file_shelf_unkept", ...a });
      const file = fileOf(a.p_tenant_id, a.p_file_id);
      if (!file || file.removed_at || file.kind !== "video" || file.source !== "made") return false;
      if (shelfOf(a.p_tenant_id, a.p_file_id)) return false;
      tables.file_archives.push({
        id: randomUUID(),
        tenant_id: a.p_tenant_id,
        file_id: file.id,
        origin: "shelf",
        state: "failed",
        why: "not_found",
        checked_at: null,
        updated_at: now(),
      });
      return true;
    },
    // Tombstones only (gone, outside) past their grace, oldest first: the file leaves where nothing used it and no
    // other origin holds it, nothing goes to files_let_go, and the row is deleted.
    source_items_grace_end: (a) => {
      w.asked.push({ door: "source_items_grace_end", ...a });
      const due = tables.source_items
        .filter(
          (i) =>
            ["gone", "outside"].includes(i.state) &&
            i.gone_at &&
            Date.parse(i.gone_at) < w.nowMs - a.p_grace_seconds * 1000,
        )
        .sort((x, y) => String(x.gone_at).localeCompare(String(y.gone_at)))
        .slice(0, Math.max(a.p_limit, 1));
      const done = { removed: 0, kept: 0, cleared: 0 };
      for (const item of due) {
        const file = item.file_id ? tables.files.find((f) => f.id === item.file_id && !f.removed_at) : null;
        if (file) {
          const held =
            heldByItsRoad(file) ||
            tables.source_items.some(
              (o) => o.tenant_id === item.tenant_id && o.file_id === file.id && o.id !== item.id,
            ) ||
            wasUsed(item.tenant_id, file.id);
          if (held) done.kept += 1;
          else {
            removeFile(file, "source_gone");
            done.removed += 1;
          }
        }
        tables.source_items.splice(tables.source_items.indexOf(item), 1);
        done.cleared += 1;
      }
      // A file superseded at its provider that long ago, by its own mark: the same terms, and one that stays loses it.
      const superseded = tables.files
        .filter(
          (f) => f.superseded_at && !f.removed_at && Date.parse(f.superseded_at) < w.nowMs - a.p_grace_seconds * 1000,
        )
        .sort((x, y) => String(x.superseded_at).localeCompare(String(y.superseded_at)))
        .slice(0, Math.max(a.p_limit, 1));
      for (const file of superseded) {
        const held =
          heldByItsRoad(file) ||
          tables.source_items.some((o) => o.tenant_id === file.tenant_id && o.file_id === file.id) ||
          wasUsed(file.tenant_id, file.id);
        if (held) {
          file.superseded_at = null;
          done.kept += 1;
        } else {
          removeFile(file, "source_changed");
          done.removed += 1;
        }
      }
      return done;
    },
  };
}
