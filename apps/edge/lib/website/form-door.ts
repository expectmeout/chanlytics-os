/**
 * POST /api/website-form: someone used a form on the business's own website (00488, 00674). The site's server posts the
 * form with its workspace and one of that workspace's keys (form-key.ts); a browser never holds a key.
 *
 * The door is api/website-form.ts: `door(receiveWebsiteForm)`. In order (the Forms plan's 3.2): the shape (contracts
 * WebsiteFormBody), the key, a way to reach them, then ONE write (form_entry_take): the person through the one door
 * (resolve_person, source 'website', which fills what is empty and never overwrites), the entry, and its event
 * (form_entry.accepted), together. The site is answered ok only after that write; a database that fails it is a
 * refusal (503), so the site sends it again. A person who asked to be forgotten: nothing is written at all, and the
 * site is answered ok all the same.
 *
 * Once: the site's own id for the entry (`entry_id`), where it sends one; with none, the same words within ten minutes
 * are the same entry, and later they are a new one (Ruben's call 19). The same entry again is answered as before and
 * starts nothing.
 *
 * Everything an entry owes happens after, each by its own step with its own outcome (form-effects.ts, from the event):
 * what they asked as a note on their page waiting for a member's Keep (0007), the owner's notice, and a sign-up's ask to
 * confirm (signup-confirm.ts, 00489). The answer says `confirm: "sent"` when the entry owes that ask and it would go,
 * so the site can tell its visitor to look for the email; in every other case it says nothing of it.
 *
 * Cross-workspace: the form names its workspace, and the key proves the site was given it.
 */
import { heldTenantId, WebsiteFormBody, websiteFormPerson, type WebsiteFormInput } from "@chanlytics/contracts";
import { takeFormEntry, type FormEntryTaken } from "@chanlytics/db/people";
import { json, refuse } from "../shared/http.js";
import { errField, logger, type Logger } from "../shared/log.js";
import { pg } from "../shared/pg.js";
import { entryAnswersOf, entryOwes, entryWords } from "./form-entry.js";
import { checkWebsiteFormKey } from "./form-key.js";
import { checkSignupWouldAsk } from "./signup-confirm.js";

type Db = NonNullable<ReturnType<typeof pg>>;

/** A form is a few lines a person typed. Anything larger is not one. */
const MAX_BODY = 16_000;

/** The form the site sent, or why it is not one. */
function formOf(raw: string, log: Logger): WebsiteFormInput | null {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    // Not JSON: nothing to read.
    body = null;
  }
  const parsed = WebsiteFormBody.safeParse(body);
  if (parsed.success) return parsed.data;
  log.warn("website_form_refused", { why: "shape" });
  return null;
}

/**
 * Whether the visitor will be emailed to confirm: a sign-up kept now, owing the ask, that the rules and the limits let
 * go. Read only, and never the reason a form is not answered: a read that fails says nothing of it.
 */
async function confirmWillGo(
  db: Db,
  log: Logger,
  entry: { taken: FormEntryTaken; owesAsk: boolean; data: WebsiteFormInput; email: string | null; nowMs: number },
): Promise<boolean> {
  if (entry.taken.outcome !== "accepted" || !entry.owesAsk || !entry.email) return false;
  const tenantId = heldTenantId(entry.data.workspace);
  return checkSignupWouldAsk(db, {
    tenantId,
    contactId: entry.taken.contactId,
    typed: entry.email,
    form: entry.data,
    nowMs: entry.nowMs,
  }).catch((e: unknown) => {
    log.error("website_form_failed", { tenant_id: tenantId, step: "ask_check", error: errField(e) });
    return false;
  });
}

export async function receiveWebsiteForm(request: Request): Promise<Response> {
  const log = logger({ door: "website_form" });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return refuse(413, "too_large");
  const data = formOf(raw, log);
  if (!data) return refuse(400, "bad_request");
  // What it names, which the key checks: a page's own form, sent with a key this workspace gave its site.
  const tenantId = heldTenantId(data.workspace);
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const nowMs = Date.now();
  const key = await checkWebsiteFormKey(db, tenantId, data.key, nowMs).catch((e: unknown) => {
    log.error("website_form_failed", { tenant_id: tenantId, step: "key", error: errField(e) });
    return null;
  });
  if (!key) return refuse(503, "ingest_failed");
  if (!key.ok) {
    log.warn("form_key_refused", { tenant_id: tenantId, why: key.why });
    return refuse(401, "bad_signature");
  }
  const person = websiteFormPerson(data);
  if (!person) {
    log.warn("website_form_refused", { tenant_id: tenantId, why: "no_way_to_reach" });
    return refuse(400, "invalid", "An email address or a phone number is needed.");
  }

  const owed = entryOwes(data, nowMs);
  let taken: FormEntryTaken;
  try {
    taken = await takeFormEntry(db, {
      tenantId,
      keyId: key.keyId,
      form: data.form,
      answers: entryAnswersOf(data),
      person: {
        ...person,
        detail: {
          form: data.form,
          about: data.about ?? null,
          page: data.page ?? null,
          lang: data.lang ?? null,
          at: data.at ?? null,
        },
      },
      ref: data.entry_id ?? null,
      words: entryWords(data, person),
      owed,
    });
  } catch (e) {
    // Nothing was kept, so the site is not told it was: it sends the form again.
    log.error("website_form_failed", { tenant_id: tenantId, step: "entry", error: errField(e) });
    return refuse(503, "ingest_failed");
  }
  log.info("form_entry_accepted", {
    tenant_id: tenantId,
    form: data.form,
    outcome: taken.outcome,
    entry_id: taken.entryId,
    owed: owed.join(","),
  });
  if (taken.outcome === "forgotten") return json(200, { ok: true, kept: false });
  const owesAsk = owed.includes("confirm");
  const confirm = await confirmWillGo(db, log, { taken, owesAsk, data, email: person.email, nowMs });
  return json(200, { ok: true, kept: true, ...(confirm ? { confirm: "sent" } : {}) });
}
