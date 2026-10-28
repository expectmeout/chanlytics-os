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
import { env } from "../env.js";
import { json, refuse } from "../http.js";
import { pg } from "../pg.js";
import { personFor, workspaceFor, type Admitted } from "../admin-auth.js";
import { dashboardOrigin } from "../dashboard-origin.js";
import { emailCanSend, emailDomain } from "../email/email.js";
import { buildEmailRequest, confirmUrl, hostedIdentity, signConfirmToken } from "../packages/channels.js";
import {
  SIGNUP_CONFIRM_MS,
  SIGNUP_CONFIRM_SOURCE,
  signupAddressKey,
  signupAskRefusal,
  signupConfirmEmail,
  UUID,
  websiteFormLate,
  type SignupAskRefusal,
  type WebsiteFormInput,
} from "../packages/contracts.js";
import {
  contactEmailOf,
  insertQueuedEmail,
  mailboxOfTenant,
  resolveOutboundTargetForContact,
  signupAskFacts,
  type Json,
} from "../packages/db.js";
import { scheduleJob } from "../packages/jobs.js";
import { errField, logger, type Logger } from "../log.js";
import { onceKeyId } from "../ops/notify.js";

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
  p: {
    tenantId: string;
    contactId: string;
    typed: string;
    nowMs: number;
    from: { form: WebsiteFormInput } | { member: string | null };
  },
): Promise<SignupAsked> {
  const typed = p.typed.trim().toLowerCase();
  const key = signupAddressKey(typed);
  const domain = emailDomain();
  const secret = env.UNSUBSCRIBE_SECRET;
  const [facts, mailbox] = await Promise.all([
    signupAskFacts(db, { tenantId: p.tenantId, contactId: p.contactId, addressKey: key, nowMs: p.nowMs }),
    mailboxOfTenant(db, p.tenantId),
  ]);
  // A deployment that cannot send email, or seal the link, has no mailbox to ask from as surely as a workspace without one.
  const sendsAs = mailbox && domain && emailCanSend() && secret ? { mailbox, domain, secret } : null;
  // A member asks only someone the website brought: the email says they signed up there.
  if ("member" in p.from && facts.person && !facts.person.fromWebsite) return { asked: false, why: "not_from_website" };
  const why = signupAskRefusal(typed, { ...facts, mailbox: !!sendsAs });
  if (why || !sendsAs) return { asked: false, why: why ?? "no_mailbox" };

  const thread = await resolveOutboundTargetForContact(db, {
    tenantId: p.tenantId,
    contactId: p.contactId,
    touch: false,
  });
  if (!thread) return { asked: false, why: "gone" };
  // One ask per person and address in a link's span of days, by its id: two posts of one form at once (a double press,
  // a site that sends again) both pass the open ask's read, and the second insert finds the first's row.
  const messageId = onceKeyId(
    `signup_confirm:${p.tenantId}:${p.contactId}:${key}:${Math.floor(p.nowMs / SIGNUP_CONFIRM_MS)}`,
  );
  const link = confirmUrl(
    dashboardOrigin(),
    signConfirmToken(sendsAs.secret, { tenantId: p.tenantId, contactId: p.contactId, messageId }),
  );
  const words = signupConfirmEmail({ business: sendsAs.mailbox.from_name, link });
  const request = buildEmailRequest({
    identity: hostedIdentity(sendsAs.mailbox, sendsAs.domain),
    to: typed,
    parent: null,
    subject: words.subject,
    body: words.body,
    signature: null,
    // A program's first email: Auto-Submitted, so an auto-responder does not answer it.
    actor: "ai",
    messageId,
    tenantId: p.tenantId,
  });
  // The request spread whole, so the row's JSON is its fields as frozen (an interface is no JSON object to the compiler).
  const meta: Json = {
    source: SIGNUP_CONFIRM_SOURCE,
    email: { subject: request.subject, to: [typed], request: { ...request } },
    signup_confirm:
      "member" in p.from
        ? { key, form: facts.lastForm ?? signedUpOn({ form: "signup" }), by: p.from.member }
        : { key, form: signedUpOn(p.from.form) },
  };
  const wrote = await insertQueuedEmail(db, {
    id: messageId,
    tenant_id: p.tenantId,
    conversation_id: thread.conversationId,
    contact_id: p.contactId,
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
    tenantId: p.tenantId,
    kind: "outbound_send",
    dueAt: new Date(p.nowMs),
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
  L: Logger,
  p: { tenantId: string; contactId: string; form: WebsiteFormInput; email: string | null; nowMs: number },
): Promise<SignupAskRefusal | "asked" | null> {
  if (p.form.form !== "signup" || !p.email || websiteFormLate(p.form, p.nowMs)) return null;
  try {
    const r = await askToConfirm(db, {
      tenantId: p.tenantId,
      contactId: p.contactId,
      typed: p.email,
      nowMs: p.nowMs,
      from: { form: p.form },
    });
    return r.asked ? "asked" : r.why;
  } catch (e) {
    L.error("website_form_failed", { tenant_id: p.tenantId, step: "ask", error: errField(e) });
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
    const email = await contactEmailOf(db, tenantId, contactId);
    if (!email) return json(200, { ok: true, asked: false, why: "no_email" });
    const r = await askToConfirm(db, {
      tenantId,
      contactId,
      typed: email,
      nowMs: Date.now(),
      from: { member: personFor(auth, body.user_id) },
    });
    return json(200, { ok: true, asked: r.asked, why: r.asked ? null : r.why });
  } catch (e) {
    logger({ tenant_id: tenantId }).error("signup_confirm_failed", { step: "ask_again", error: errField(e) });
    return refuse(502, "could_not_queue", "the confirmation could not be written");
  }
}
