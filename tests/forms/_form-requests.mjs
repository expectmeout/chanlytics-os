/**
 * A hosted form's SQL doors (00680) over a database in memory, as the migration writes them: form_publish and form_turn
 * (a member's), form_request_take (the visitor's one write: the version checked, once by the page's own id, the person
 * through the door the suite hands it, the entry and its event; held with no person, a test with neither),
 * form_entry_let_through and form_entry_hold, form_code_person and form_code_link (a request carried into a chat),
 * link_open (where a link lands, and its open counted), and the reads (form_requests_open, form_requests_open_count,
 * form_results' shape), each taking a website form's requests from its requests_from on beside the hosted ones (00709).
 * The real SQL is proved on a database by the suite's own .db test; this is what lets the page, the routes and the
 * edge's steps run here.
 */
import { randomUUID } from "node:crypto";
import { fakeDb } from "../_fake-db.mjs";
import { formEntryDoors } from "../people/doors/_form-entries.mjs";

const DAY_MS = 86_400_000;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LINK_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

/** A code as the database makes one, from the suite's own counter so a test can name it. */
const codeFrom = (chars, n) => Array.from({ length: 6 }, (_, i) => chars[(n * 7 + i * 11) % chars.length]).join("");

const OWED = ["note", "notice"];

/**
 * The doors over `tables`, the person resolved by `resolve` (the suite's own resolve_person), the clock `clock` (the
 * database's now()), and `member` (whether whoever calls a member's door may act: is_acting_member).
 */
export function formRequestDoors(tables, { resolve, clock = Date.now, member = () => true } = {}) {
  const now = () => new Date(clock()).toISOString();
  let made = 0;
  const forms = () => (tables.forms ??= []);
  /** The form owned elsewhere an entry is of (00709). */
  const outsideOf = (e) =>
    e.outside_form_id ? (tables.outside_forms ?? []).find((o) => o.id === e.outside_form_id) : undefined;
  /**
   * form_requests_open's rule: a hosted form's entry with its version, or a website form's request from its form's
   * requests_from on; not held, not a test, inside sixty days, and answered by nothing.
   */
  const openRequest = (e, tenantId) => {
    const outside = outsideOf(e);
    const ofAForm =
      (e.form_id && versions().some((v) => v.id === e.version_id)) ||
      (outside && e.form === "request" && e.created_at >= outside.requests_from);
    return (
      e.tenant_id === tenantId &&
      ofAForm &&
      e.state !== "held" &&
      !e.test &&
      Date.parse(e.created_at) > clock() - 60 * DAY_MS &&
      !answered(e)
    );
  };
  const versions = () => (tables.form_versions ??= []);
  const entries = () => (tables.form_entries ??= []);
  const links = () => (tables.links ??= []);
  const entryLinks = () => (tables.form_entry_links ??= []);
  const event = (tenantId, entry) =>
    (tables.events ??= []).push({
      id: randomUUID(),
      tenant_id: tenantId,
      kind: "form_entry.accepted",
      category: "contact",
      subject_type: "form_entry",
      subject_id: entry.id,
      data: { form: "request", owed: OWED, form_id: entry.form_id },
      created_at: now(),
    });
  const personOf = (tenantId, reach, formId) =>
    resolve({
      p_tenant_id: tenantId,
      p_channel: "",
      p_external: "",
      p_phone: reach.phone ?? "",
      p_email: reach.email ?? "",
      p_name: reach.name ?? "",
      p_assurance: "found",
      p_source: "form",
      p_detail: { form_id: formId },
    });
  const refused = () => Object.assign(new Error("Not yours to change."), { code: "42501" });
  const statusOf = (link) => (tables.messages ?? []).find((m) => m.id === link.message_id)?.status;
  const answered = (entry) =>
    entryLinks().some(
      (link) =>
        link.entry_id === entry.id &&
        (link.kind === "marked" ||
          link.kind === "conversation" ||
          (link.kind === "reply" && !["failed", "canceled"].includes(statusOf(link)))),
    );
  /**
   * form_entries_standing's rule for one entry (00726): what answered it (a member's word first, then a conversation,
   * then the newest reply that left), else sending where a reply still waits to go, else aged past its sixty days,
   * else open; and whether a reply to it failed.
   */
  const standingOf = (entry) => {
    const mine = entryLinks().filter((link) => link.entry_id === entry.id);
    const replies = mine.filter((link) => link.kind === "reply");
    const left = replies.filter((link) => !["failed", "canceled", "queued"].includes(statusOf(link)));
    const by = (kind) => mine.filter((link) => link.kind === kind).at(-1);
    const how = by("marked") ?? by("conversation") ?? left.at(-1) ?? null;
    const sending = replies.some((link) => statusOf(link) === "queued");
    const aged = Date.parse(entry.created_at) <= clock() - 60 * DAY_MS;
    return {
      id: entry.id,
      standing: how ? "answered" : sending ? "sending" : aged ? "aged" : "open",
      how: how?.kind ?? null,
      at: how?.created_at ?? null,
      conversation_id: how?.conversation_id ?? null,
      unreached: replies.some((link) => statusOf(link) === "failed"),
    };
  };

  return {
    link_code_new: () => codeFrom(LINK_CHARS, ++made),
    form_publish: (a) => {
      if (!member(a.p_tenant_id)) throw refused();
      const form = forms().find((f) => f.tenant_id === a.p_tenant_id && f.id === a.p_form_id);
      if (!form) throw Object.assign(new Error("That form is not there."), { code: "P0002" });
      const live = versions().find((v) => v.id === form.live_version_id);
      if (live && JSON.stringify(live.description) === JSON.stringify(form.draft)) {
        form.state = "live";
        return { version_id: live.id, made: false };
      }
      const n =
        Math.max(
          0,
          ...versions()
            .filter((v) => v.form_id === form.id)
            .map((v) => v.n),
        ) + 1;
      const version = {
        id: randomUUID(),
        tenant_id: a.p_tenant_id,
        form_id: form.id,
        n,
        description: structuredClone(form.draft),
        published_by: null,
        published_at: now(),
        replaced_at: null,
      };
      versions().push(version);
      if (live && !live.replaced_at) live.replaced_at = now();
      Object.assign(form, { state: "live", live_version_id: version.id, updated_at: now() });
      return { version_id: version.id, made: true, n };
    },
    form_turn: (a) => {
      if (!member(a.p_tenant_id)) throw refused();
      const form = forms().find((f) => f.tenant_id === a.p_tenant_id && f.id === a.p_form_id);
      const from = a.p_on ? "off" : "live";
      if (!form?.live_version_id || form.state !== from) return false;
      form.state = a.p_on ? "live" : "off";
      return true;
    },
    form_request_take: (a) => {
      const form = forms().find((f) => f.tenant_id === a.p_tenant_id && f.id === a.p_form_id);
      if (!form) throw Object.assign(new Error("That form is not there."), { code: "P0002" });
      const ref = (a.p_ref ?? "").trim();
      const again = entries().find((e) => e.tenant_id === a.p_tenant_id && e.ref === ref);
      if (again) return { outcome: "again", entry_id: again.id, contact_id: again.contact_id, code: again.code };
      if (form.state !== "live") return { outcome: "closed", entry_id: null, contact_id: null };
      if (a.p_version_id !== form.live_version_id) {
        const saw = versions().find((v) => v.form_id === form.id && v.id === a.p_version_id);
        if (!saw?.replaced_at || Date.parse(saw.replaced_at) < clock() - DAY_MS)
          return { outcome: "stale", entry_id: null, contact_id: null, version_id: form.live_version_id };
      }
      const code = (a.p_link_code ?? "").trim().toLowerCase();
      const link = code
        ? links().find((l) => l.tenant_id === a.p_tenant_id && l.code === code && l.subject_id === form.id)
        : null;
      const test = a.p_test === true;
      const held = !test && a.p_held_why ? a.p_held_why : null;
      let contact = null;
      let person = null;
      if (!test && !held) {
        try {
          person = personOf(a.p_tenant_id, a.p_reach, form.id);
        } catch (e) {
          if (e && e.code === "PE001") return { outcome: "forgotten", entry_id: null, contact_id: null };
          throw e;
        }
        contact = person.contact_id;
      }
      const entry = {
        id: randomUUID(),
        tenant_id: a.p_tenant_id,
        contact_id: contact,
        key_id: null,
        form: "request",
        answers: a.p_answers,
        ref,
        words: a.p_words,
        owed: test || held ? [] : [...OWED],
        effects: {},
        state: test ? "processed" : held ? "held" : "accepted",
        told_at: null,
        created_at: now(),
        form_id: form.id,
        version_id: a.p_version_id,
        link_id: link?.id ?? null,
        source: a.p_source ?? null,
        reach: a.p_reach,
        test,
        held_why: held,
        code: codeFrom(CODE_CHARS, ++made),
        code_used_at: null,
      };
      entries().push(entry);
      if (test) return { outcome: "test", entry_id: entry.id, contact_id: null, code: entry.code };
      if (held) return { outcome: "held", entry_id: entry.id, contact_id: null, code: entry.code };
      form.last_entry_at = now();
      event(a.p_tenant_id, entry);
      return {
        outcome: "accepted",
        entry_id: entry.id,
        contact_id: contact,
        code: entry.code,
        person: person.outcome,
      };
    },
    form_entry_let_through: (a) => {
      const entry = entries().find((e) => e.tenant_id === a.p_tenant_id && e.id === a.p_entry_id && e.state === "held");
      if (!entry) return { outcome: "gone", entry_id: a.p_entry_id, contact_id: null };
      if (entry.contact_id) {
        entry.held_why = null;
        entry.state = entry.owed.every((o) => entry.effects[o]?.state === "done") ? "processed" : "accepted";
        return { outcome: "back", entry_id: entry.id, contact_id: entry.contact_id };
      }
      // A site's entry the door held (00726): resolved as the website's, owing what the door said, its form stamped.
      const outside = outsideOf(entry);
      let person;
      try {
        person = outside
          ? resolve({
              p_tenant_id: a.p_tenant_id,
              p_channel: "",
              p_external: "",
              p_phone: entry.reach?.phone ?? "",
              p_email: entry.reach?.email ?? "",
              p_name: entry.reach?.name ?? "",
              p_assurance: "found",
              p_source: "website",
              p_detail: { form: entry.form, about: entry.answers?.about ?? null, page: entry.answers?.page ?? null },
            })
          : personOf(a.p_tenant_id, entry.reach, entry.form_id);
      } catch (e) {
        if (!e || e.code !== "PE001") throw e;
        tables.form_entries = entries().filter((e2) => e2.id !== entry.id);
        return { outcome: "forgotten", entry_id: null, contact_id: null };
      }
      if (outside) {
        Object.assign(entry, { contact_id: person.contact_id, state: "accepted", held_why: null });
        Object.assign(outside, { first_entry_at: outside.first_entry_at ?? now(), last_entry_at: now() });
        (tables.events ??= []).push({
          id: randomUUID(),
          tenant_id: a.p_tenant_id,
          kind: "form_entry.accepted",
          category: "contact",
          subject_type: "form_entry",
          subject_id: entry.id,
          data: { form: entry.form, owed: entry.owed },
          created_at: now(),
        });
        return { outcome: "accepted", entry_id: entry.id, contact_id: person.contact_id };
      }
      Object.assign(entry, { contact_id: person.contact_id, state: "accepted", held_why: null, owed: [...OWED] });
      event(a.p_tenant_id, entry);
      return { outcome: "accepted", entry_id: entry.id, contact_id: person.contact_id };
    },
    form_entry_hold: (a) => {
      // A hosted form's entry, or a site's (00726): a test names neither.
      const entry = entries().find(
        (e) =>
          e.tenant_id === a.p_tenant_id &&
          e.id === a.p_entry_id &&
          (e.form_id || e.outside_form_id) &&
          e.state !== "held" &&
          !e.test,
      );
      if (!entry) return false;
      Object.assign(entry, { state: "held", held_why: "member" });
      return true;
    },
    form_code_person: (a) => {
      const entry = entries().find(
        (e) =>
          e.tenant_id === a.p_tenant_id &&
          e.code === String(a.p_code ?? "").toUpperCase() &&
          !e.code_used_at &&
          !e.test &&
          Date.parse(e.created_at) > clock() - 30 * DAY_MS,
      );
      const person = entry?.contact_id && (tables.contacts ?? []).find((c) => c.id === entry.contact_id);
      if (!person || !person.email || person.phone_e164) return false;
      if ((tables.contacts ?? []).some((c) => c.tenant_id === a.p_tenant_id && c.phone_e164 === a.p_phone))
        return false;
      person.phone_e164 = a.p_phone;
      return true;
    },
    form_code_link: (a) => {
      const entry = entries().find(
        (e) =>
          e.tenant_id === a.p_tenant_id &&
          e.code === String(a.p_code ?? "").toUpperCase() &&
          !e.code_used_at &&
          !e.test &&
          Date.parse(e.created_at) > clock() - 30 * DAY_MS,
      );
      const writer = (tables.conversations ?? []).find((c) => c.id === a.p_conversation_id)?.contact_id;
      if (!entry || !writer) return { linked: false };
      if (entry.state === "held" && !entry.contact_id) {
        Object.assign(entry, { contact_id: writer, state: "accepted", held_why: null, owed: [...OWED] });
        event(a.p_tenant_id, entry);
      }
      if (!entryLinks().some((l) => l.entry_id === entry.id && l.conversation_id === a.p_conversation_id))
        entryLinks().push({
          id: randomUUID(),
          tenant_id: a.p_tenant_id,
          entry_id: entry.id,
          kind: "conversation",
          message_id: a.p_message_id ?? null,
          conversation_id: a.p_conversation_id,
          appointment_id: null,
          created_by: null,
          created_at: now(),
        });
      entry.code_used_at = now();
      return { linked: true, entry_id: entry.id, same_person: entry.contact_id === writer };
    },
    link_open: (a) => {
      const link = links().find((l) => l.code === String(a.p_code ?? "").toLowerCase());
      if (!link) return null;
      if (!link.stopped_at && a.p_count !== false) {
        const day = now().slice(0, 10);
        const days = (tables.link_days ??= []);
        const row = days.find((d) => d.link_id === link.id && d.day === day);
        if (row) row.opens += 1;
        else days.push({ link_id: link.id, tenant_id: link.tenant_id, day, opens: 1 });
      }
      const form = forms().find((f) => f.id === link.subject_id);
      return {
        link_id: link.id,
        tenant_id: link.tenant_id,
        code: link.code,
        subject_type: "form",
        subject_id: link.subject_id,
        stopped: !!link.stopped_at,
        workspace: (tables.tenants ?? []).find((t) => t.id === link.tenant_id)?.slug ?? null,
        ...(form ? { slug: form.slug, state: form.state } : {}),
      };
    },
    /**
     * set_person_email (00171, 00726) for a member's own write: the address kept in its spelling; where one is
     * replaced or cleared, the event holds the one before and after and what had stopped mail to the one before, a yes
     * to offers by email the old address gave is set back to not asked, and an address that left stopped comes back
     * stopped. A first address is never named in its event.
     */
    set_person_email: (a) => {
      const person = (tables.contacts ?? []).find((c) => c.id === a.p_contact_id && !c.erased_at);
      if (!person) throw Object.assign(new Error("Person not found."), { code: "P0002" });
      const email =
        String(a.p_email ?? "")
          .trim()
          .toLowerCase() || null;
      const was =
        String(person.email ?? "")
          .trim()
          .toLowerCase() || null;
      const moved = was !== email;
      const events = (tables.events ??= []);
      const say = (kind, data) =>
        events.push({
          id: randomUUID(),
          tenant_id: person.tenant_id,
          kind,
          category: "contact",
          subject_type: "contact",
          subject_id: person.id,
          data,
          created_at: now(),
        });
      const stopped = { why: person.email_suppressed_reason ?? null, at: person.email_suppressed_at ?? null };
      person.email = email;
      if (moved) Object.assign(person, { email_suppressed_at: null, email_suppressed_reason: null });
      if (moved && was && person.email_marketing === "opted_in") {
        Object.assign(person, { email_marketing: "unknown", email_marketing_source: "address_changed" });
        say("contact.consent_changed", {
          purpose: "email_marketing",
          consent: "unknown",
          source: "address_changed",
          previous: "opted_in",
          channel: "email",
        });
      }
      if (moved && email) {
        const back = events
          .filter((e) => e.kind === "contact.email_set" && e.subject_id === person.id && e.data.was === email)
          .at(-1);
        if (back?.data.was_stopped)
          Object.assign(person, {
            email_suppressed_at: back.data.was_stopped_at ?? now(),
            email_suppressed_reason: back.data.was_stopped,
          });
      }
      say("contact.email_set", {
        set: email !== null,
        by: "member",
        source: "member",
        ...(moved && was
          ? {
              was,
              ...(email ? { now: email } : {}),
              ...(stopped.why ? { was_stopped: stopped.why, was_stopped_at: stopped.at } : {}),
            }
          : {}),
      });
      return { contact_id: person.id, email };
    },
    form_entries_standing: (a) =>
      entries()
        .filter((e) => e.tenant_id === a.p_tenant_id && (a.p_entry_ids ?? []).includes(e.id))
        .map(standingOf),
    form_requests_open: (a) =>
      entries()
        .filter((e) => openRequest(e, a.p_tenant_id))
        // Read on from where a list ended (00726): older than that request, and among those of its moment, below its id.
        .filter(
          (e) =>
            !a.p_before ||
            Date.parse(e.created_at) < Date.parse(a.p_before) ||
            (!!a.p_before_id && Date.parse(e.created_at) === Date.parse(a.p_before) && e.id < a.p_before_id),
        )
        .sort((x, y) => y.created_at.localeCompare(x.created_at) || y.id.localeCompare(x.id))
        .slice(0, 200)
        .map((e) => ({
          id: e.id,
          form_id: e.form_id,
          version_id: e.version_id,
          outside_form_id: e.outside_form_id ?? null,
          contact_id: e.contact_id,
          created_at: e.created_at,
          answers: e.answers,
          reach: e.reach,
          place: links().find((l) => l.id === e.link_id)?.place ?? null,
          heading:
            versions().find((v) => v.id === e.version_id)?.description?.heading ??
            outsideOf(e)?.name ??
            outsideOf(e)?.sent_name ??
            null,
          unreached: entryLinks().some(
            (l) =>
              l.entry_id === e.id &&
              l.kind === "reply" &&
              (tables.messages ?? []).find((m) => m.id === l.message_id)?.status === "failed",
          ),
        })),
    form_requests_open_count: (a) => entries().filter((e) => openRequest(e, a.p_tenant_id)).length,
    form_results: (a) => {
      const since = clock() - Math.max(1, Math.min(a.p_days ?? 30, 366)) * DAY_MS;
      const places = new Map();
      for (const e of entries()) {
        const counted =
          e.tenant_id === a.p_tenant_id && (e.form_id || e.outside_form_id) && e.state !== "held" && !e.test;
        if (!counted || Date.parse(e.created_at) <= since) continue;
        const person = (tables.contacts ?? []).find((c) => c.id === e.contact_id);
        if (!person) continue;
        const key = e.form_id ? `${e.form_id} ${e.link_id ?? ""}` : `outside ${e.outside_form_id}`;
        const place = places.get(key) ?? {
          form_id: e.form_id ?? null,
          outside_form_id: e.form_id ? null : e.outside_form_id,
          link_id: e.link_id ?? null,
          requests: 0,
          talked: 0,
          people: new Set(),
          booked: new Set(),
          fresh: new Set(),
          confirmed: new Set(),
        };
        places.set(key, place);
        place.requests += 1;
        place.people.add(e.contact_id);
        const talked = entryLinks().some(
          (l) =>
            l.entry_id === e.id &&
            (l.kind === "conversation" ||
              (l.kind === "reply" &&
                !["failed", "canceled"].includes((tables.messages ?? []).find((m) => m.id === l.message_id)?.status))),
        );
        if (talked) place.talked += 1;
        const booked = (tables.appointments ?? []).some(
          (v) =>
            v.tenant_id === e.tenant_id &&
            ["receptionist", "person"].includes(v.source) &&
            !["cancelled", "proposed"].includes(v.status) &&
            v.created_at > e.created_at &&
            v.starts_at > e.created_at &&
            v.contact_id === e.contact_id,
        );
        if (booked) place.booked.add(e.contact_id);
        if (person.created_at && Date.parse(person.created_at) > Date.parse(e.created_at) - 60_000)
          place.fresh.add(e.contact_id);
        // A sign-up confirmed: its person said yes to offers from the email it sent them, after it came (00489, 00709).
        const confirmed =
          e.form === "signup" &&
          person.email_marketing === "opted_in" &&
          person.email_marketing_source === "confirmed_signup" &&
          person.email_marketing_updated_at >= e.created_at;
        if (confirmed) place.confirmed.add(e.contact_id);
      }
      const day = new Date(since).toISOString().slice(0, 10);
      const opens = new Map();
      for (const d of tables.link_days ?? [])
        if (d.tenant_id === a.p_tenant_id && d.day >= day) opens.set(d.link_id, (opens.get(d.link_id) ?? 0) + d.opens);
      const counts = (p) => ({
        talked: p.talked,
        visits: p.booked.size,
        people: p.people.size,
        new_people: p.fresh.size,
      });
      const all = [...places.values()];
      return {
        places: all
          .filter((p) => p.form_id)
          .map((p) => ({ form_id: p.form_id, link_id: p.link_id, requests: p.requests, ...counts(p) })),
        outside: all
          .filter((p) => p.outside_form_id)
          .map((p) => ({
            outside_form_id: p.outside_form_id,
            entries: p.requests,
            ...counts(p),
            confirmed: p.confirmed.size,
          })),
        opens: [...opens].map(([link_id, n]) => ({ link_id, opens: n })),
      };
    },
    form_entries_purge: () => {
      const before = entries().length;
      tables.form_entries = entries().filter(
        (e) =>
          !(e.state === "held" && Date.parse(e.created_at) < clock() - 30 * DAY_MS) &&
          !(e.test && Date.parse(e.created_at) < clock() - 7 * DAY_MS),
      );
      return before - tables.form_entries.length;
    },
  };
}

/**
 * A client that fills what 00680's tables default, as the database does. The double fills a row's id and created_at
 * alone, so a form or a link a route makes would read back with no state and no code; here each is whole. `code` is
 * the next link code (link_code_new) and `now` the database's clock.
 */
export function fillingDefaults(db, { code, now }) {
  const fills = {
    forms: () => ({ state: "draft", live_version_id: null, updated_at: now(), last_entry_at: null }),
    links: () => ({ code: code(), printed: false, stopped_at: null }),
    form_entry_links: () => ({ message_id: null, conversation_id: null, appointment_id: null, created_by: null }),
  };
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop !== "from") return Reflect.get(target, prop, receiver);
      return (table) => {
        const query = target.from(table);
        const fill = fills[table];
        if (!fill) return query;
        return new Proxy(query, {
          get(q, name, r) {
            if (name !== "insert") return Reflect.get(q, name, r);
            return (sent) =>
              q.insert(Array.isArray(sent) ? sent.map((row) => ({ ...fill(), ...row })) : { ...fill(), ...sent });
          },
        });
      };
    },
  });
}

/** A consultation form as AI drafts one (the canvas's Colour consultation). */
export const consultForm = (over = {}) => ({
  heading: "Colour consultation",
  intro: "Tell us about the colour you'd love, and Maria or Jo will get back to you.",
  lang: "en",
  thanks: "Thanks, we have your request.",
  fields: [
    { id: "f1name", kind: "short", label: "Your name", needed: true },
    { id: "f2mail", kind: "email", label: "Email", needed: false },
    { id: "f3phon", kind: "phone", label: "Phone", needed: false },
    { id: "f4want", kind: "long", label: "What would you like?", needed: true },
    {
      id: "f5who0",
      kind: "one",
      label: "Who would you like?",
      needed: false,
      choices: [
        { id: "c1", label: "Maria" },
        { id: "c2", label: "Jo" },
        { id: "c3", label: "No preference" },
      ],
    },
  ],
  next: { chat: true, draft: true, follow_up: false },
  ...over,
});

/**
 * The edge's answer about the deployment's email, as the dashboard asks it (connections/email-readiness.ts): it can
 * send (true, as a test begins), it cannot (false), or the edge does not answer (null). `says` sets the answer and has
 * the dashboard ask again at once, so what it kept from the answer before is not read; `undo` gives the network back.
 * `getEmailWire` is that module's own, as the test imported it.
 */
export function emailWire(getEmailWire) {
  const real = globalThis.fetch;
  let ready = true;
  globalThis.fetch = async (url, init) => {
    if (new URL(String(url)).pathname !== "/api/admin/email/wire") return real(url, init);
    if (ready === null) throw new Error("the edge is away");
    return new Response(JSON.stringify({ ok: true, ready, offers: false }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return {
    says: async (next) => {
      ready = next;
      await getEmailWire({ fresh: true });
    },
    undo: () => {
      globalThis.fetch = real;
    },
  };
}

export const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const FORM = "f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0";
export const V1 = "11111111-1111-4111-8111-111111111111";
export const LINK = "22222222-2222-4222-8222-222222222222";

/**
 * A salon with one form and one link to it, over a database in memory. `chat` is whether it has WhatsApp, `forgotten`
 * an address that asked to be forgotten, `state` the form's, `failing` a database that fails the door's write, `more`
 * tables and `rpcs` doors a suite adds (or a function that makes them over the world's own). The person door is the
 * suite's own: found by number or address, else made.
 */
export function formWorld({
  chat = true,
  email = true,
  forgotten = null,
  state = "live",
  description = consultForm(),
  failing = false,
  more = {},
  rpcs = {},
} = {}) {
  const clock = { now: Date.now() };
  const contacts = [];
  const tables = {
    tenants: [
      {
        id: A,
        slug: "luma-salon",
        name: "Luma Salon",
        status: "active",
        timezone: "America/New_York",
        left_empty_at: null,
        logo_path: null,
        accent: null,
      },
    ],
    billing_accounts: [],
    business_records: [
      {
        tenant_id: A,
        trade_name: "Luma Salon",
        legal_name: "Luma Salon LLC",
        country: "US",
        about: "Hair colour, cuts and treatments",
      },
    ],
    tenant_config: [{ tenant_id: A, config: {} }],
    tenant_channels: chat
      ? [
          {
            tenant_id: A,
            kind: "whatsapp",
            number_e164: "+13055550100",
            status: "active",
            created_at: "2026-01-01T00:00:00Z",
          },
        ]
      : [],
    // The business's mailbox: with it, and an edge that says its email can send (emailWire below), a reply by email can go.
    mailboxes: email ? [{ tenant_id: A, local_part: "luma" }] : [],
    contacts,
    forms: [
      {
        id: FORM,
        tenant_id: A,
        slug: "colour-consultation",
        state,
        draft: description,
        live_version_id: state === "draft" ? null : V1,
        created_by: null,
        created_at: "2026-11-12T00:00:00Z",
        updated_at: "2026-11-12T00:00:00Z",
        last_entry_at: null,
      },
    ],
    form_versions:
      state === "draft"
        ? []
        : [
            {
              id: V1,
              tenant_id: A,
              form_id: FORM,
              n: 1,
              description,
              published_by: null,
              published_at: "2026-11-12T00:00:00Z",
              replaced_at: null,
            },
          ],
    links: [
      {
        id: LINK,
        tenant_id: A,
        code: "k7q2md",
        subject_type: "form",
        subject_id: FORM,
        place: "Your link",
        printed: false,
        created_by: null,
        created_at: "2026-11-12T00:00:00Z",
        stopped_at: null,
      },
    ],
    form_entries: [],
    form_entry_links: [],
    events: [],
    ...more,
  };
  const resolved = [];
  const resolve = (asked) => {
    resolved.push(asked);
    if (forgotten && asked.p_email === forgotten) throw Object.assign(new Error("forgotten"), { code: "PE001" });
    let person = contacts.find(
      (c) => (asked.p_phone && c.phone_e164 === asked.p_phone) || (asked.p_email && c.email === asked.p_email),
    );
    const outcome = person ? "found" : "made";
    if (!person) {
      person = {
        id: `c${contacts.length + 1}`,
        tenant_id: A,
        phone_e164: asked.p_phone || null,
        email: asked.p_email || null,
        display_name: asked.p_name || null,
        consent: "unknown",
        dnc: false,
        email_marketing: "unknown",
      };
      contacts.push(person);
    }
    return { contact_id: person.id, outcome };
  };
  const doors = formRequestDoors(tables, { resolve, clock: () => clock.now });
  const faults = {};
  const plain = fakeDb(tables, faults, {
    // The website form's own doors (00675): a hosted form's entry is settled by the same one.
    ...formEntryDoors(tables, { resolve, clock: () => clock.now }),
    ...doors,
    resolve_person: resolve,
    sole_proprietor_of: () => false,
    ...(failing
      ? {
          form_request_take: () => {
            throw Object.assign(new Error("the database is away"), { code: "57P01" });
          },
        }
      : {}),
    // A suite's own doors, or a function that makes them over these: `(tables, doors, clock)`.
    ...(typeof rpcs === "function" ? rpcs(tables, doors, () => clock.now) : rpcs),
  });
  const db = fillingDefaults(plain, { code: doors.link_code_new, now: () => new Date(clock.now).toISOString() });
  return { db, tables, faults, resolved, clock };
}
