/**
 * 00654's SQL as the copies' tests model it (the footage sources plan's P4, "Availability"): where a copy stands by
 * its origins, the letting go, a return's door and the seven-day cleanup, over tables in memory. Pure: it imports
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
  // file_copy_standing: null where an origin can give it back, else why none can.
  const standingOf = (tenantId, fileId) => {
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
  const reading = () =>
    new Set(tables.media_sources.filter((s) => ["setting_up", "watching"].includes(s.state)).map((s) => s.id));
  /** A copy that could ever be let go: a watched clip its owner did not upload, here, playable, its item in a folder read. */
  const mayEverGo = (f, tenantId) =>
    f.tenant_id === tenantId &&
    f.kind === "video" &&
    f.source === "drive" &&
    !f.owner_uploaded &&
    !f.removed_at &&
    (f.copy_state ?? "here") === "here" &&
    f.media_status === "ready" &&
    f.media_ref &&
    originsOf(f.tenant_id, f.id).some((i) => i.state === "in" && reading().has(i.source_id));
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
      const row = fileOf(a.p_tenant_id, a.p_file_id);
      if (!row) return { copy_state: null };
      const lost = standingOf(a.p_tenant_id, a.p_file_id);
      if ((row.copy_state === "away" && lost) || (row.copy_state === "lost" && lost !== row.copy_why))
        Object.assign(row, { copy_state: lost ? "lost" : "away", copy_why: lost, updated_at: now() });
      return {
        copy_state: row.copy_state ?? "here",
        copy_why: row.copy_why ?? null,
        item_id: originOf(a.p_tenant_id, a.p_file_id)?.id ?? null,
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
        const spent = dayRow();
        const day = pacificDay(w.nowMs);
        const today = tables.files.filter(
          (f) =>
            f.tenant_id === a.p_tenant_id && f.copy_returned_at && pacificDay(Date.parse(f.copy_returned_at)) === day,
        ).length;
        const binds =
          spent.units + a.p_units > a.p_units_max
            ? "units"
            : spent.bytes + Number(row.bytes ?? 0) > a.p_platform_bytes_max
              ? "platform_bytes"
              : today + 1 > a.p_workspace_returns_max
                ? "workspace_returns"
                : null;
        if (binds) {
          Object.assign(row, { copy_state: "away", copy_why: "budget", updated_at: now() });
          return { fate: "wait", binds, until: nextPacificDay(w.nowMs).toISOString() };
        }
        spent.bytes += Number(row.bytes ?? 0);
        spent.returns += 1;
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
