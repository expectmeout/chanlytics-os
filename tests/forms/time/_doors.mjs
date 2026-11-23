/**
 * 00691's doors over a database in memory, beside 00680's (_form-requests.mjs), as the migration writes them: a time
 * asked for on a form is form_request_take's entry and, for one accepted with its person, the same request a chat opens
 * (a proposed visit, the receptionist's, in no thread, held 23 hours and never past an hour before it, the person's
 * request before it let go), named from the entry; form_booking_open counts a business's own booking page opened from a
 * form; the two reads say the time and the counts; booking_request_answer answers it as a member does. The real SQL is
 * proved on a database (the lane's doors script and the suite's .db test); this lets the page and the routes run here.
 */
import { randomUUID } from "node:crypto";

const HOUR_MS = 3_600_000;

/**
 * The doors over `tables`, wrapping `base` (formRequestDoors' own, for form_request_take and the two reads), on the
 * clock `clock`. `member` says whether whoever answers may act (booking_request_answer asks it).
 */
export function formTimeDoors(tables, base, { clock = Date.now, member = () => true } = {}) {
  const now = () => new Date(clock()).toISOString();
  const appointments = () => (tables.appointments ??= []);
  const entryLinks = () => (tables.form_entry_links ??= []);
  const visitOf = (entryId) => {
    const link = entryLinks()
      .filter((l) => l.entry_id === entryId && l.kind === "visit")
      .at(-1);
    return link ? appointments().find((a) => a.id === link.appointment_id) : undefined;
  };
  const timeLine = (entryId) => {
    const v = visitOf(entryId);
    return v
      ? {
          appointment_id: v.id,
          starts_at: v.starts_at,
          ends_at: v.ends_at,
          service: v.service,
          status: v.status,
          expires_at: v.expires_at,
          timezone: v.timezone,
        }
      : null;
  };
  return {
    form_time_request_take: (a) => {
      const taken = base.form_request_take(a);
      if (taken.outcome === "again") {
        const v = visitOf(taken.entry_id);
        return v ? { ...taken, time: { appointment_id: v.id, expires_at: v.expires_at } } : taken;
      }
      if (taken.outcome !== "accepted") return taken;
      const startMs = Date.parse(a.p_starts_at);
      const expires = Math.min(clock() + 23 * HOUR_MS, startMs - HOUR_MS);
      if (expires <= clock()) return { ...taken, time: { error: "too_soon" } };
      const person = (tables.contacts ?? []).find((c) => c.id === taken.contact_id);
      for (const v of appointments())
        if (
          v.tenant_id === a.p_tenant_id &&
          v.contact_id === taken.contact_id &&
          v.source === "receptionist" &&
          v.status === "proposed"
        )
          v.status = "cancelled";
      const visit = {
        id: randomUUID(),
        tenant_id: a.p_tenant_id,
        contact_id: taken.contact_id,
        conversation_id: null,
        source: "receptionist",
        status: "proposed",
        starts_at: a.p_starts_at,
        ends_at: a.p_ends_at,
        title: a.p_service || null,
        service: a.p_service || null,
        client_name: person?.display_name ?? null,
        client_phone: person?.phone_e164 ?? null,
        client_email: person?.email ?? null,
        timezone: a.p_timezone,
        expires_at: new Date(expires).toISOString(),
        // What it answered: the form (00700).
        through_type: "form",
        through_id: a.p_form_id,
        created_at: now(),
        updated_at: now(),
        lapse_told: null,
      };
      appointments().push(visit);
      entryLinks().push({
        id: randomUUID(),
        tenant_id: a.p_tenant_id,
        entry_id: taken.entry_id,
        kind: "visit",
        message_id: null,
        conversation_id: null,
        appointment_id: visit.id,
        created_by: null,
        created_at: now(),
      });
      return { ...taken, time: { appointment_id: visit.id, expires_at: visit.expires_at } };
    },
    form_booking_open: (a) => {
      const form = (tables.forms ?? []).find((f) => f.tenant_id === a.p_tenant_id && f.id === a.p_form_id);
      if (form?.state !== "live") return false;
      const day = now().slice(0, 10);
      const days = (tables.form_days ??= []);
      const row = days.find((d) => d.form_id === form.id && d.day === day);
      if (row) row.booking_opens += 1;
      else days.push({ form_id: form.id, tenant_id: form.tenant_id, day, booking_opens: 1 });
      return true;
    },
    form_requests_open: (a) => base.form_requests_open(a).map((line) => ({ ...line, time: timeLine(line.id) })),
    form_results: (a) => {
      const results = base.form_results(a);
      const entries = tables.form_entries ?? [];
      const places = results.places.map((p) => ({
        ...p,
        asked: entries.filter(
          (e) =>
            e.form_id === p.form_id &&
            (e.link_id ?? null) === p.link_id &&
            !e.test &&
            e.state !== "held" &&
            visitOf(e.id),
        ).length,
      }));
      const booking = new Map();
      for (const d of tables.form_days ?? [])
        if (d.tenant_id === a.p_tenant_id) booking.set(d.form_id, (booking.get(d.form_id) ?? 0) + d.booking_opens);
      return { ...results, places, booking_opens: [...booking].map(([form_id, opens]) => ({ form_id, opens })) };
    },
    booking_request_answer: (a) => {
      const v = appointments().find((x) => x.id === a.p_appointment_id);
      if (!v || !member(v.tenant_id)) throw Object.assign(new Error("Appointment not found."), { code: "P0002" });
      if (v.source !== "receptionist") return { error: "not_a_request" };
      if (v.status !== "proposed") return { error: "answered", status: v.status };
      if (a.p_booked && v.expires_at && Date.parse(v.expires_at) <= clock()) return { error: "expired" };
      v.status = a.p_booked ? "booked" : "cancelled";
      if (a.p_booked) v.expires_at = null;
      return { appointment: { id: v.id, status: v.status }, hold: null, decision_id: randomUUID() };
    },
  };
}
