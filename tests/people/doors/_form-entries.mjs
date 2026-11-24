/**
 * A website form's two SQL doors (00675, 00709) over a database in memory, as the migrations write them: form_entry_take
 * (the key's last use and its site, the form the entry is of, the once rule within that form, the person through the
 * door the suite hands it, the entry with where its visitor came from and its event, a test that keeps nothing of
 * anyone, or nothing for a person who asked to be forgotten) and form_entry_settled (an effect's outcome on its entry, the entry processed,
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
  /** The key's site, made at its first use, learning its host from the first entry whose page names one. */
  const siteOf = (tenantId, keyId, host) => {
    const sites = (tables.form_sites ??= []);
    const key = (tables.form_keys ?? []).find((k) => k.tenant_id === tenantId && k.id === keyId);
    let site = sites.find((s) => s.tenant_id === tenantId && s.id === key?.site_id);
    if (!site) {
      site = { id: randomUUID(), tenant_id: tenantId, name: key?.name ?? null, host: null, first_entry_at: null };
      Object.assign(site, { last_entry_at: null, test_at: null, created_at: now() });
      sites.push(site);
      if (key) key.site_id = site.id;
    }
    const named = (host ?? "").trim().toLowerCase();
    if (!site.host && /^[a-z0-9][a-z0-9.-]*$/.test(named) && named.length <= 253) site.host = named;
    return site;
  };
  /** The form an entry is of: found by its site, kind and the site's id for it, or made, its requests from now. */
  const outsideFormOf = (a, site) => {
    const forms = (tables.outside_forms ??= []);
    const ref = (a.p_form_ref ?? "").trim().slice(0, 100) || null;
    const sent = (a.p_form_name ?? "").trim().slice(0, 120) || null;
    let form = forms.find(
      (o) => o.tenant_id === a.p_tenant_id && o.site_id === site.id && o.form === a.p_form && o.ref === ref,
    );
    if (!form) {
      form = { id: randomUUID(), tenant_id: a.p_tenant_id, kind: "website", site_id: site.id, form: a.p_form, ref };
      Object.assign(form, { sent_name: null, name: null, listed: true, requests_from: now(), created_at: now() });
      Object.assign(form, { first_entry_at: null, last_entry_at: null });
      forms.push(form);
    }
    form.sent_name = sent ?? form.sent_name;
    return form;
  };
  /** An entry's row, every column the table has (00675, 00680, 00709), as the table defaults them. */
  const entryRow = (a, keyId, contactId, ref, source, outsideFormId = null) => ({
    id: randomUUID(),
    tenant_id: a.p_tenant_id,
    contact_id: contactId,
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
    // A website's own form has no hosted form, and is never held (00680's columns).
    form_id: null,
    version_id: null,
    link_id: null,
    outside_form_id: outsideFormId,
    source,
    reach: null,
    test: false,
    held_why: null,
    code: null,
    code_used_at: null,
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
      const site = siteOf(a.p_tenant_id, keyId, a.p_host);
      const source =
        a.p_source && typeof a.p_source === "object" && JSON.stringify(a.p_source).length <= 4000 ? a.p_source : null;
      // A test tells nobody, keeps nobody and names no form: its site stands at "test received" from now.
      if (a.p_test === true) {
        const test = { ...entryRow(a, keyId, null, null, source), owed: [], test: true };
        entries.push(test);
        site.test_at = now();
        return { outcome: "test", entry_id: test.id, contact_id: null, clash: false };
      }
      const form = outsideFormOf(a, site);
      // Once within its form: the site's id with the same words is the same entry, with other words a new one (clash).
      let ref = (a.p_ref ?? "").trim() || null;
      let clash = false;
      if (ref) {
        const had = entries.find(
          (e) => e.tenant_id === a.p_tenant_id && e.outside_form_id === form.id && e.ref === ref,
        );
        if (had && had.words === a.p_words)
          return { outcome: "again", entry_id: had.id, contact_id: had.contact_id, clash };
        if (had) [clash, ref] = [true, null];
      }
      if (!ref) {
        const again = entries
          .filter(
            (e) =>
              e.tenant_id === a.p_tenant_id &&
              e.outside_form_id === form.id &&
              e.words === a.p_words &&
              !e.ref &&
              Date.parse(e.created_at) > clock() - AGAIN_WITHIN_MS,
          )
          .at(-1);
        if (again) return { outcome: "again", entry_id: again.id, contact_id: again.contact_id, clash: false };
      }
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
      const entry = entryRow(a, keyId, person.contact_id, ref, source, form.id);
      entries.push(entry);
      for (const row of [form, site]) [row.first_entry_at, row.last_entry_at] = [row.first_entry_at ?? now(), now()];
      event(a.p_tenant_id, "form_entry.accepted", entry.id, { form: a.p_form, owed: a.p_owed });
      return { outcome: "accepted", entry_id: entry.id, contact_id: entry.contact_id, person: person.outcome, clash };
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
