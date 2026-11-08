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
 * A sign-up with an address asks its person to confirm it (signup-confirm.ts, 00489): only their press on the link it
 * emails them is a yes to offers by email, since an address typed into a form proves nothing. A sign-up that arrives
 * late is not asked (it is old news, and its person signed up before anything asked them), and the owner's notice
 * says what became of the ask. A failed ask is logged and costs nothing else: the person is kept. The answer says
 * `confirm: "sent"` when the email is on its way, so the site can tell its visitor to look for it; in every other
 * case it says nothing of it, and the site thanks them plainly.
 *
 * Twice is once: the note and the notice are each kept under a name made from the form's own words (onceKeyId), so a
 * site that sends a form again, or a re-sending of old ones, adds no second note and tells nobody twice. The person is
 * the door's own to match. A person who asked to be forgotten is not made again: the form is answered and nothing kept.
 *
 * Cross-workspace: the form names its workspace, and the key proves the site was given it.
 */
import type { ContactId } from "@chanlytics/contracts";
import { heldTenantId } from "@chanlytics/contracts";
import { createHash } from "node:crypto";
import { json, refuse } from "../shared/http.js";
import { errField, logger } from "../shared/log.js";
import { pg } from "../shared/pg.js";
import {
  DEFAULT_TIMEZONE,
  WebsiteFormBody,
  websiteFormLate,
  websiteFormNote,
  websiteFormNotice,
  websiteFormPerson,
  signupAskLine,
} from "@chanlytics/contracts";
import { PERSON_FORGOTTEN, resolvePerson } from "@chanlytics/db/people";
import { suggestPersonNote } from "@chanlytics/db/facts";
import { findWorkspaceZone } from "@chanlytics/db/workspace";
import { keepOnce, notifyOnce, onceKeyId } from "../shared/alerts/notify.js";
import { loadTenantNotifications } from "../shared/tenant-runtime.js";
import { websiteFormKeyMatches } from "./form-key.js";
import { askIfSignup } from "./signup-confirm.js";

/** A form is a few lines a person typed. Anything larger is not one. */
const MAX_BODY = 16_000;

export async function receiveWebsiteForm(request: Request): Promise<Response> {
  const log = logger({ door: "website_form" });
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
    log.warn("website_form_refused", { why: "shape" });
    return refuse(400, "bad_request");
  }
  const data = parsed.data;
  // What it names, which the key checks: a page's own form, signed for this workspace.
  const tenantId = heldTenantId(data.workspace);
  if (!websiteFormKeyMatches(tenantId, data.key)) {
    log.warn("website_form_refused", { why: "key" });
    return refuse(401, "bad_signature");
  }
  const otherWebsiteFormPerson = websiteFormPerson(data);
  if (!otherWebsiteFormPerson) {
    log.warn("website_form_refused", { tenant_id: tenantId, why: "no_way_to_reach" });
    return refuse(422, "invalid", "An email address or a phone number is needed.");
  }
  const db = pg();
  if (!db) return refuse(503, "no_database");

  let contactId: ContactId;
  let outcome: string;
  try {
    const created = await resolvePerson(db, {
      tenantId,
      phone: otherWebsiteFormPerson.phone,
      email: otherWebsiteFormPerson.email,
      name: otherWebsiteFormPerson.name,
      assurance: "found",
      source: "website",
      detail: {
        form: data.form,
        about: data.about ?? null,
        page: data.page ?? null,
        lang: data.lang ?? null,
        at: data.at ?? null,
      },
    });
    contactId = created.contact_id;
    outcome = created.outcome;
  } catch (e) {
    if ((e as { code?: string }).code === PERSON_FORGOTTEN) {
      log.info("website_form_kept", { tenant_id: tenantId, form: data.form, outcome: "forgotten" });
      return json(200, { ok: true, kept: false });
    }
    log.error("website_form_failed", { tenant_id: tenantId, step: "person", error: errField(e) });
    return refuse(503, "ingest_failed");
  }

  // The form's own words name it: the same form sent again is the same note and the same notice.
  const name = createHash("sha256")
    .update(
      JSON.stringify([
        tenantId,
        data.form,
        otherWebsiteFormPerson.email,
        otherWebsiteFormPerson.phone,
        data.about ?? "",
        data.note ?? "",
        data.at ?? "",
      ]),
    )
    .digest("hex");
  // The day a late form says it was sent is the workspace's own; the default zone where it cannot be read.
  const tz = (await findWorkspaceZone(db, tenantId).catch(() => null)) || DEFAULT_TIMEZONE;
  const nowMs = Date.now();
  let note = "kept";
  try {
    const r = await suggestPersonNote(db, {
      tenantId,
      contactId,
      body: websiteFormNote(data, { nowMs, tz }),
      source: "website",
      sourceId: onceKeyId(`website_form_note:${name}`),
    });
    if ("refused" in r) note = r.refused;
  } catch (e) {
    note = "failed";
    log.error("website_form_failed", { tenant_id: tenantId, step: "note", error: errField(e) });
  }

  const ask = await askIfSignup(db, log, {
    tenantId,
    contactId,
    form: data,
    email: otherWebsiteFormPerson.email,
    nowMs,
  });
  const notice = websiteFormNotice(data, { contactId, ...otherWebsiteFormPerson }, { nowMs, tz }, signupAskLine(ask));
  const onceKey = `website_form:${name}`;
  let otherNotice = false;
  try {
    const addressing = await loadTenantNotifications(db, tenantId);
    otherNotice =
      websiteFormLate(data, nowMs) || addressing.unread
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
    log.error("website_form_failed", { tenant_id: tenantId, step: "notice", error: errField(e) });
  }
  log.info("website_form_kept", { tenant_id: tenantId, form: data.form, outcome, note, told: otherNotice, ask });
  return json(200, { ok: true, kept: true, ...(ask === "asked" ? { confirm: "sent" } : {}) });
}
