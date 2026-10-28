/**
 * POST /api/website-form: someone used a form on the business's own website (00488). The site's server posts the form
 * with its workspace and that workspace's key (form-key.ts); a browser never holds the key.
 *
 * The door is api/website-form.ts: `door(receiveWebsiteForm)`. In order: the shape (contracts WebsiteFormBody), the key,
 * a way to reach them, then the person through the one door (resolve_person, source 'website', which fills what is
 * empty and never overwrites), what they asked as a note suggested on their page (person_note_suggest: a stranger's
 * words wait for a member's Keep, 0007), and the owner told: by mail and phone as the business chooses (notifyOnce), or
 * on the bell alone for a form that arrives late (websiteFormLate: one re-sent from where it was kept before).
 *
 * Twice is once: the note and the notice are each kept under a name made from the form's own words (onceKeyId), so a
 * site that sends a form again, or a re-sending of old ones, adds no second note and tells nobody twice. The person is
 * the door's own to match. A person who asked to be forgotten is not made again: the form is answered and nothing kept.
 *
 * Cross-workspace: the form names its workspace, and the key proves the site was given it.
 */
import { createHash } from "node:crypto";
import { json, refuse } from "../http.js";
import { errField, logger } from "../log.js";
import { pg } from "../pg.js";
import {
  DEFAULT_TIMEZONE,
  WebsiteFormBody,
  websiteFormLate,
  websiteFormNote,
  websiteFormNotice,
  websiteFormPerson,
} from "../packages/contracts.js";
import { PERSON_FORGOTTEN, resolvePerson, suggestPersonNote, workspaceZoneOf } from "../packages/db.js";
import { keepOnce, notifyOnce, onceKeyId } from "../ops/notify.js";
import { loadTenantNotifications } from "../tenant-runtime.js";
import { websiteFormKeyMatches } from "./form-key.js";

/** A form is a few lines a person typed. Anything larger is not one. */
const MAX_BODY = 16_000;

export async function receiveWebsiteForm(request: Request): Promise<Response> {
  const L = logger({ door: "website_form" });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return refuse(413, "bad_request");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  const parsed = WebsiteFormBody.safeParse(body);
  if (!parsed.success) {
    L.warn("website_form_refused", { why: "shape" });
    return refuse(400, "bad_request");
  }
  const f = parsed.data;
  if (!websiteFormKeyMatches(f.workspace, f.key)) {
    L.warn("website_form_refused", { why: "key" });
    return refuse(401, "bad_signature");
  }
  const tenantId = f.workspace;
  const who = websiteFormPerson(f);
  if (!who) {
    L.warn("website_form_refused", { tenant_id: tenantId, why: "no_way_to_reach" });
    return refuse(422, "invalid", "An email address or a phone number is needed.");
  }
  const db = pg();
  if (!db) return refuse(503, "no_database");

  let contactId: string;
  let outcome: string;
  try {
    const made = await resolvePerson(db, {
      tenantId,
      phone: who.phone,
      email: who.email,
      name: who.name,
      assurance: "found",
      source: "website",
      detail: { form: f.form, about: f.about ?? null, page: f.page ?? null, lang: f.lang ?? null, at: f.at ?? null },
    });
    contactId = made.contact_id;
    outcome = made.outcome;
  } catch (e) {
    if ((e as { code?: string }).code === PERSON_FORGOTTEN) {
      L.info("website_form_kept", { tenant_id: tenantId, form: f.form, outcome: "forgotten" });
      return json(200, { ok: true, kept: false });
    }
    L.error("website_form_failed", { tenant_id: tenantId, step: "person", error: errField(e) });
    return refuse(503, "ingest_failed");
  }

  // The form's own words name it: the same form sent again is the same note and the same notice.
  const name = createHash("sha256")
    .update(JSON.stringify([tenantId, f.form, who.email, who.phone, f.about ?? "", f.note ?? "", f.at ?? ""]))
    .digest("hex");
  // The day a late form says it was sent is the workspace's own; the default zone where it cannot be read.
  const tz = (await workspaceZoneOf(db, tenantId).catch(() => null)) || DEFAULT_TIMEZONE;
  const nowMs = Date.now();
  let note = "kept";
  try {
    const r = await suggestPersonNote(db, {
      tenantId,
      contactId,
      body: websiteFormNote(f, { nowMs, tz }),
      source: "website",
      sourceId: onceKeyId(`website_form_note:${name}`),
    });
    if ("refused" in r) note = r.refused;
  } catch (e) {
    note = "failed";
    L.error("website_form_failed", { tenant_id: tenantId, step: "note", error: errField(e) });
  }

  const notice = websiteFormNotice(f, { contactId, ...who }, { nowMs, tz });
  const onceKey = `website_form:${name}`;
  let told = false;
  try {
    const addressing = await loadTenantNotifications(db, tenantId);
    told =
      websiteFormLate(f, nowMs) || addressing.unread
        ? await keepOnce(
            tenantId,
            {
              kind: notice.kind,
              title: notice.subject,
              body: notice.body,
              route: notice.route,
              about: notice.about,
              onceKey,
            },
            { push: false },
            db,
          )
        : await notifyOnce({ tenantId, ...addressing }, { ...notice, onceKey }, { db });
  } catch (e) {
    L.error("website_form_failed", { tenant_id: tenantId, step: "notice", error: errField(e) });
  }
  L.info("website_form_kept", { tenant_id: tenantId, form: f.form, outcome, note, told });
  return json(200, { ok: true, kept: true });
}
