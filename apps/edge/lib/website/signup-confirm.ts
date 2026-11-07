/**
 * A website's sign-up asks its person to confirm (00489, the double opt-in). An address typed into a form proves
 * nothing, so the door (form-door.ts) hands a sign-up here: the address is emailed a link, sealed (channels
 * confirm-token.ts), to the dashboard's page /c/<token>, and only their press there is a yes to offers by email
 * (set_email_offers_yes, confirmed_signup).
 *
 * The email is the person's own: the first on their one thread, from the workspace's hosted mailbox (the business's
 * name, Reply-To its reply route, so an answer lands in the Inbox), written queued with its request frozen and sent by
 * an outbound_send job through the send door, which reads their STOP, their address's suppression and the workspace's
 * pause again at the wire. It is about something they set going themselves (contracts MessageAbout `theirs`), so it
 * needs no yes and is no offer. Whether it is written at all is contracts signupAskRefusal's: never to an address that
 * looks made up, that is not on their page, that does not take email, to a person who said STOP or already said yes,
 * from a workspace with no mailbox, and within the limits (SIGNUP_ASK_LIMITS).
 *
 * A member may ask again from the person's page (askAgain, POST /api/admin/email/signup-confirm): the same ask under the same
 * rules and limits, for someone who signed up on the website (it brought them, or a sign-up of theirs was asked before:
 * the email says they signed up there), at the address their page has, the form their last ask carried kept as its
 * evidence and the member who asked beside it.
 */
import { env } from "../shared/env.js";
import { json, refuse } from "../shared/http.js";
import { pg } from "../shared/pg.js";
import { personFor, workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { dashboardOrigin } from "../shared/dashboard-origin.js";
import { emailCanSend, emailDomain } from "../email/email.js";
import { buildEmailRequest, hostedIdentity } from "@chanlytics/channels/email";
import { confirmUrl, signConfirmToken } from "@chanlytics/channels/tokens";
import {
  SIGNUP_CONFIRM_MS,
  SIGNUP_CONFIRM_SOURCE,
  signupAddressKey,
  signupAskRefusal,
  signupConfirmEmail,
  signupConfirmEmailHtml,
  UUID,
  websiteFormLate,
  workspaceLogoSrc,
  type SignupAskRefusal,
  type WebsiteFormInput,
} from "@chanlytics/contracts";
import { findContactEmail, insertQueuedEmail, findSignupAskFacts } from "@chanlytics/db/campaigns";
import { findMailboxOfTenant } from "@chanlytics/db/email";
import { resolveOutboundTargetForContact } from "@chanlytics/db/channels";
import { findWorkspaceLook } from "@chanlytics/db/look";
import { type Json } from "@chanlytics/db/types";
import { scheduleJob } from "@chanlytics/jobs";
import { errField, logger, type Logger } from "../shared/log.js";
import { onceKeyId } from "../shared/alerts/notify.js";

type Db = NonNullable<ReturnType<typeof pg>>;

/** What asking came to: asked (the email is queued), or why not. */
type SignupAsked = { asked: true; messageId: string } | { asked: false; why: SignupAskRefusal };

/** What they signed up on, as the email keeps it and the yes's event carries it. */
const signedUpOn = (f: Pick<WebsiteFormInput, "form" | "page" | "about" | "lang" | "at">) => ({
  form: f.form,
  page: f.page ?? null,
  about: f.about ?? null,
  lang: f.lang ?? null,
  at: f.at ?? null,
});

/**
 * Ask the person a sign-up brought to confirm it at `typed`: the email written queued and its send scheduled, or why
 * it was not. `from` is who asks: the form itself (its words kept on the email, meta.signup_confirm.form, which the yes
 * door copies onto the yes's event: what they signed up on, read off the email, never off the press), or a member,
 * whose ask is for someone who signed up on the website alone and keeps the form their last ask carried. Throws when a
 * read or a write fails, for the caller to log: the person is kept either way.
 */
async function askToConfirm(
  db: Db,
  params: {
    tenantId: string;
    contactId: string;
    typed: string;
    nowMs: number;
    from: { form: WebsiteFormInput } | { member: string | null };
  },
): Promise<SignupAsked> {
  const typed = params.typed.trim().toLowerCase();
  const key = signupAddressKey(typed);
  const domain = emailDomain();
  const secret = env.UNSUBSCRIBE_SECRET;
  const [facts, mailbox, row] = await Promise.all([
    findSignupAskFacts(db, {
      tenantId: params.tenantId,
      contactId: params.contactId,
      addressKey: key,
      nowMs: params.nowMs,
    }),
    findMailboxOfTenant(db, params.tenantId),
    findWorkspaceLook(db, params.tenantId),
  ]);
  // A deployment that cannot send email, or seal the link, has no mailbox to ask from as surely as a workspace without one.
  const sendsAs = mailbox && domain && emailCanSend() && secret ? { mailbox, domain, secret } : null;
  // A member asks only someone the website brought: the email says they signed up there.
  if ("member" in params.from && facts.person && !facts.person.fromWebsite)
    return { asked: false, why: "not_from_website" };
  const reason = signupAskRefusal(typed, { ...facts, mailbox: !!sendsAs });
  if (reason || !sendsAs) return { asked: false, why: reason ?? "no_mailbox" };

  const thread = await resolveOutboundTargetForContact(db, {
    tenantId: params.tenantId,
    contactId: params.contactId,
    touch: false,
  });
  if (!thread) return { asked: false, why: "gone" };
  // One ask per person and address in a link's span of days, by its id: two posts of one form at once (a double press,
  // a site that sends again) both pass the open ask's read, and the second insert finds the first's row.
  const messageId = onceKeyId(
    `signup_confirm:${params.tenantId}:${params.contactId}:${key}:${Math.floor(params.nowMs / SIGNUP_CONFIRM_MS)}`,
  );
  const link = confirmUrl(
    dashboardOrigin(),
    signConfirmToken(sendsAs.secret, { tenantId: params.tenantId, contactId: params.contactId, messageId }),
  );
  const words = signupConfirmEmail({ business: sendsAs.mailbox.from_name, link });
  // The same words as a letter in the business's own look (decision 0075): its logo where it wears one, its colour.
  const html = signupConfirmEmailHtml({
    business: sendsAs.mailbox.from_name,
    link,
    look: {
      business: sendsAs.mailbox.from_name,
      logo_url: workspaceLogoSrc(env.SUPABASE_URL, row?.logo_path),
      accent: row?.accent ?? null,
    },
  });
  const request = buildEmailRequest({
    identity: hostedIdentity(sendsAs.mailbox, sendsAs.domain),
    to: typed,
    parent: null,
    subject: words.subject,
    body: words.body,
    html,
    signature: null,
    // A program's first email: Auto-Submitted, so an auto-responder does not answer it.
    actor: "ai",
    messageId,
    tenantId: params.tenantId,
  });
  // The request spread whole, so the row's JSON is its fields as frozen (an interface is no JSON object to the compiler).
  const meta: Json = {
    source: SIGNUP_CONFIRM_SOURCE,
    email: { subject: request.subject, to: [typed], request: { ...request } },
    signup_confirm:
      "member" in params.from
        ? { key, form: facts.lastForm ?? signedUpOn({ form: "signup" }), by: params.from.member }
        : { key, form: signedUpOn(params.from.form) },
  };
  const wrote = await insertQueuedEmail(db, {
    id: messageId,
    tenant_id: params.tenantId,
    conversation_id: thread.conversationId,
    contact_id: params.contactId,
    channel: "email",
    direction: "outbound",
    sender: "system",
    type: "text",
    body: words.body,
    status: "queued",
    meta,
  });
  if (wrote === "exists") return { asked: false, why: "open" };
  await scheduleJob(db, {
    tenantId: params.tenantId,
    kind: "outbound_send",
    dueAt: new Date(params.nowMs),
    payload: { message_id: messageId, conversation_id: thread.conversationId, to_email: typed, proactive: true },
  });
  return { asked: true, messageId };
}

/**
 * The website-form door's ask (form-door.ts): a sign-up with an address that arrives as it is sent is asked to confirm,
 * and what came of it is said ("asked", or why not; contracts signupAskLine words it for the owner). Null where nothing
 * was asked: a request, a sign-up with no address, one that arrived late, or an ask that failed, which is logged and
 * costs nothing else, since the person is kept either way.
 */
export async function askIfSignup(
  db: Db,
  log: Logger,
  params: { tenantId: string; contactId: string; form: WebsiteFormInput; email: string | null; nowMs: number },
): Promise<SignupAskRefusal | "asked" | null> {
  if (params.form.form !== "signup" || !params.email || websiteFormLate(params.form, params.nowMs)) return null;
  try {
    const r = await askToConfirm(db, {
      tenantId: params.tenantId,
      contactId: params.contactId,
      typed: params.email,
      nowMs: params.nowMs,
      from: { form: params.form },
    });
    return r.asked ? "asked" : r.why;
  } catch (e) {
    log.error("website_form_failed", { tenant_id: params.tenantId, step: "ask", error: errField(e) });
    return null;
  }
}

/**
 * POST /api/admin/email/signup-confirm, a member's ask from the person's page (Ask to confirm, Ask again): the ask for the
 * person `contact_id` names, at the address their page has, by the member the token names. Answers `{ ok, asked, why }`:
 * a refusal of the rules (contracts signupAskRefusal, and not_from_website, no_email) is an answer, said in the page's
 * words by the dashboard, never an error. A read or a write that fails is a 502.
 */
export async function askAgain(
  auth: Admitted,
  body: Partial<{ tenant_id: string; user_id: string; contact_id: string }>,
): Promise<Response> {
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  if (!UUID.test(tenantId)) return refuse(400, "bad_tenant", "tenant_id (a workspace id) is required");
  const contactId = typeof body.contact_id === "string" ? body.contact_id : "";
  if (!UUID.test(contactId)) return refuse(400, "bad_request", "contact_id (a person's id) is required");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  try {
    const email = await findContactEmail(db, tenantId, contactId);
    if (!email) return json(200, { ok: true, asked: false, why: "no_email" });
    const result = await askToConfirm(db, {
      tenantId,
      contactId,
      typed: email,
      nowMs: Date.now(),
      from: { member: personFor(auth, body.user_id) },
    });
    return json(200, { ok: true, asked: result.asked, why: result.asked ? null : result.why });
  } catch (e) {
    logger({ tenant_id: tenantId }).error("signup_confirm_failed", { step: "ask_again", error: errField(e) });
    return refuse(502, "could_not_queue", "the confirmation could not be written");
  }
}
