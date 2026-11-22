/**
 * A website form's two SQL doors (00675) over a database in memory, as the migration writes them: form_entry_take (the
 * key's last use, the once rule, the person through the door the suite hands it, the entry and its event, or nothing
 * for a person who asked to be forgotten) and form_entry_settled (an effect's outcome on its entry, the entry processed,
 * when the owner was first told, and the ask's first outcome as form_entry.asked). The real SQL is proved on a database
 * by website-form-entry.db.test.mjs; this is what lets the edge's door and steps run here.
 *
 * And the relay, as event_subscriptions holds it for these two kinds: each event handed to each step it is subscribed
 * to (deliver), the way the event_deliver jobs would run them, once per event and step, until nothing new is written.
 */
import { randomUUID } from "node:crypto";

/** The ten minutes the same words are the same entry within (call 19). */
export const AGAIN_WITHIN_MS = 10 * 60_000;

/** Who reacts to which kind (00675's event_subscriptions rows). */
const SUBSCRIBED = {
  "form_entry.accepted": ["note", "notice", "confirm"],
  "form_entry.asked": ["notice"],
};

/**
 * The two doors over `tables`, the person resolved by `resolve` (the suite's own resolve_person), the clock `clock`
 * (the database's now()).
 */
export function formEntryDoors(tables, { resolve, clock = Date.now }) {
  const now = () => new Date(clock()).toISOString();
  const event = (tenantId, kind, entryId, data) =>
    (tables.events ??= []).push({
      id: randomUUID(),
      tenant_id: tenantId,
      kind,
      category: "contact",
      subject_type: "form_entry",
      subject_id: entryId,
      data,
      created_at: now(),
    });
  return {
    form_entry_take: (a) => {
      const keys = (tables.form_keys ??= []);
      let keyId = a.p_key_id ?? null;
      if (!keyId) {
        let first = keys.find((k) => k.tenant_id === a.p_tenant_id && k.first);
        if (!first) {
          first = {
            id: randomUUID(),
            tenant_id: a.p_tenant_id,
            name: null,
            hash: null,
            first: true,
            made_by: null,
            created_at: now(),
            last_used_at: null,
            ends_at: null,
          };
          keys.push(first);
        }
        first.last_used_at = now();
        keyId = first.id;
      } else {
        const own = keys.find((k) => k.tenant_id === a.p_tenant_id && k.id === keyId);
        if (own) own.last_used_at = now();
      }
      const entries = (tables.form_entries ??= []);
      const ref = (a.p_ref ?? "").trim() || null;
      const again = ref
        ? entries.find((e) => e.tenant_id === a.p_tenant_id && e.ref === ref)
        : entries
            .filter(
              (e) =>
                e.tenant_id === a.p_tenant_id &&
                e.words === a.p_words &&
                !e.ref &&
                Date.parse(e.created_at) > clock() - AGAIN_WITHIN_MS,
            )
            .at(-1);
      if (again) return { outcome: "again", entry_id: again.id, contact_id: again.contact_id };
      let person;
      try {
        person = resolve({
          p_tenant_id: a.p_tenant_id,
          p_channel: "",
          p_external: "",
          p_phone: a.p_person.phone ?? "",
          p_email: a.p_person.email ?? "",
          p_name: a.p_person.name ?? "",
          p_assurance: "found",
          p_source: "website",
          p_detail: a.p_person.detail ?? {},
        });
      } catch (e) {
        if (e && e.code === "PE001") return { outcome: "forgotten", entry_id: null, contact_id: null };
        throw e;
      }
      const entry = {
        id: randomUUID(),
        tenant_id: a.p_tenant_id,
        contact_id: person.contact_id,
        key_id: keyId,
        form: a.p_form,
        answers: a.p_answers,
        ref,
        words: a.p_words,
        owed: a.p_owed,
        effects: {},
        state: "accepted",
        told_at: null,
        created_at: now(),
        // A website's own form has no hosted form, and is never a test or held (00680's columns, as the table defaults them).
        form_id: null,
        version_id: null,
        link_id: null,
        source: null,
        reach: null,
        test: false,
        held_why: null,
        code: null,
        code_used_at: null,
      };
      entries.push(entry);
      event(a.p_tenant_id, "form_entry.accepted", entry.id, { form: a.p_form, owed: a.p_owed });
      return { outcome: "accepted", entry_id: entry.id, contact_id: entry.contact_id, person: person.outcome };
    },
    form_entry_settled: (a) => {
      const entry = (tables.form_entries ?? []).find((e) => e.tenant_id === a.p_tenant_id && e.id === a.p_entry_id);
      if (!entry) return { settled: false, gone: true, effects: {} };
      const before = entry.effects[a.p_effect];
      // A step done stays as it was, whichever step: a twin that lost to it writes nothing.
      if (before?.state === "done") return { settled: false, gone: false, effects: entry.effects };
      entry.effects = { ...entry.effects, [a.p_effect]: { ...a.p_outcome, at: now() } };
      if (entry.owed.every((o) => entry.effects[o]?.state === "done")) entry.state = "processed";
      if (a.p_effect === "notice" && a.p_outcome.told === true) entry.told_at ??= now();
      if (a.p_effect === "confirm" && !before)
        event(a.p_tenant_id, "form_entry.asked", entry.id, { state: a.p_outcome.state });
      return { settled: true, gone: false, effects: entry.effects };
    },
  };
}

/**
 * The relay over `tables`: every form entry event not handed on yet, to each step it is subscribed to, in the order the
 * rows say, through `run` (the edge's runFormEffect), until no step writes another event. A step that throws is a failed
 * delivery: kept in the answer, and handed again only when `deliver` is called again for it (`again`). Answers the
 * failures of this pass, as { kind, effect, entry, error }.
 */
export async function deliver(tables, run, handed = new Set(), { again = [] } = {}) {
  const failed = [];
  const handOne = async (ev, effect) => {
    try {
      await run(ev.tenant_id, ev.subject_id, effect);
    } catch (e) {
      failed.push({ kind: ev.kind, effect, entry: ev.subject_id, event: ev.id, error: String(e?.message ?? e) });
    }
  };
  for (const f of again) {
    const ev = (tables.events ?? []).find((e) => e.id === f.event);
    if (ev) await handOne(ev, f.effect);
  }
  for (;;) {
    const fresh = (tables.events ?? []).filter((e) => SUBSCRIBED[e.kind] && !handed.has(e.id));
    if (fresh.length === 0) return failed;
    for (const ev of fresh) {
      handed.add(ev.id);
      for (const effect of SUBSCRIBED[ev.kind]) await handOne(ev, effect);
    }
  }
}
