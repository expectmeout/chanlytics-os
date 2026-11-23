import "server-only";

/**
 * A hosted form's own address, /b/<workspace>/<form> (the Forms plan, 3.2 and F1): GET draws the form, POST takes an
 * entry. No session: a visitor comes from a link or a printed code, so it reads and writes on the service role, as the
 * other pages a stranger opens do (link-page.ts), and shows only what the form's owner published.
 *
 * The order an entry is taken in is the plan's: which form and which version (the one the visitor saw, read against
 * its own description); is it a person (a field nobody sees, the time it took, how many from one sender: a doubtful
 * entry is HELD, never dropped and never told to the visitor); once (the page made the entry's id as it was drawn, so
 * a press sent twice is one entry); then ONE write (form_request_take: the person, the entry and its event together, or
 * nothing at all for a person who asked to be forgotten). The visitor is thanked only after that write; a database that
 * fails it answers 503, and the page keeps what was typed and sends again.
 *
 * Every check is here and nowhere in the browser: a needed answer missing, an address or a number that is none, a
 * choice the field does not hold are each said beside their field; a likely typo in an address is offered once as a
 * fix and never refused. The thank-you carries the request's code into a chat where the business has one.
 *
 * Cross-workspace: the address names one workspace by its slug, and every read and write is of that workspace alone.
 */
import { createHash, randomUUID } from "node:crypto";
import {
  continueMessage,
  emailTypoFix,
  formatPhoneDisplay,
  formPagePath,
  formPageWords,
  formProblemWords,
  formTestPath,
  hasPublicPages,
  heldTenantId,
  publishesBusinessPage,
  readFormAnswers,
  SLUG,
  formSlotWords,
  sourceFromSeen,
  type FormDescription,
  type FormPageWords,
  type TenantId,
} from "@chanlytics/contracts";
import {
  findFormBySlug,
  findFormVersion,
  type FormHeldWhy,
  type FormRequestTaken,
  type FormRequestToTake,
  type FormRead,
} from "@chanlytics/db/forms";
import type { Database } from "@chanlytics/db/types";
import { findPublicWorkspaceBySlug, listMyMemberships, type PublicWorkspaceRead } from "@chanlytics/db/workspace";
import { logAndGoOn } from "@chanlytics/log";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { findEmailReady } from "../connections/email-readiness";
import { log } from "../shared/log";
import { takeRate } from "../shared/rate-limit";
import { hashKey, ipOf } from "../shared/request-ip";
import { activeNumberOf } from "./facts";
import {
  closedMain,
  formDocument,
  formMain,
  thanksMain,
  type FieldShown,
  type FormPageFrame,
  type FormShown,
  type TimeNotice,
} from "./form-draw";
import {
  askedTimeOf,
  askedTimeWords,
  checkFormTime,
  findFormTimes,
  keepFormEntry,
  type FormTimesShown,
} from "./form-times";
import { linkPageDb, linkPageLookOf, type LinkPageLook } from "./link-page";
import { phoneFor } from "./phone-by-country";

type Db = SupabaseClient<Database>;

/** A form is a few lines a person typed. Anything larger is not one. */
const FORM_BODY_MAX = 24_000;
/** What the answers themselves may hold, as the entry keeps them. */
const MAX_ANSWERS = 16_000;
/** Faster than this from the page's drawing to its send is no person typing. */
const TOO_FAST_MS = 2_000;

const HTML = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" };

const htmlPage = (status: number, body: string) => new Response(body, { status, headers: HTML });

/** A small page for an address that opens nothing: no business is named, since none answered. */
const nothingHere = () =>
  htmlPage(
    404,
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not found</title><p style="font:16px system-ui;margin:20vh auto;max-width:420px;padding:0 22px">Nothing is at this address.</p>`,
  );

/** A form at its address: the workspace, its look, and the form. */
interface FormPlace {
  db: Db;
  tenantId: TenantId;
  workspace: PublicWorkspaceRead;
  look: LinkPageLook;
  form: FormRead;
  /** The form's own address, without its site. */
  path: string;
  /** The same address as its owner's Test opens it. */
  testPath: string;
}

/** The form an address names, or null for an address that opens nothing: no such workspace, no such form, or a draft. */
export async function findFormPlace(db: Db, slug: string, formSlug: string): Promise<FormPlace | null> {
  const clean = slug.trim().toLowerCase();
  const address = formSlug.trim().toLowerCase();
  if (!SLUG.test(clean) || !SLUG.test(address)) return null;
  const workspace = await findPublicWorkspaceBySlug(db, clean);
  if (!workspace || !hasPublicPages(workspace.status, workspace.open)) return null;
  const tenantId = heldTenantId(workspace.id);
  const form = await findFormBySlug(db, tenantId, address);
  if (!form || form.state === "draft") return null;
  const look = await linkPageLookOf(db, tenantId);
  return {
    db,
    tenantId,
    workspace,
    look,
    form,
    path: formPagePath(clean, address),
    testPath: formTestPath(clean, address),
  };
}

/** The name the page says the business by: the one it trades under, else the workspace's. */
export const businessNameOf = (workspace: PublicWorkspaceRead): string =>
  workspace.record?.trade_name || workspace.record?.legal_name || workspace.name;

function pageFrameOf(
  place: FormPlace,
  described: Pick<FormDescription, "heading" | "intro" | "lang" | "words">,
  test: boolean,
): FormPageFrame {
  return {
    look: place.look,
    business: businessNameOf(place.workspace),
    // Linked only where it opens (the page's own rule): a record too thin to say who the business is publishes no page,
    // and its address is Not found.
    businessHref: publishesBusinessPage(place.workspace.record) ? `/b/${place.workspace.slug}` : null,
    lang: described.lang,
    heading: described.heading,
    intro: described.intro ?? null,
    words: formPageWords(described),
    test,
  };
}

/** The address that opens a WhatsApp chat with the business, a message ready where one is given; null with no number. */
function chatHrefOf(workspace: PublicWorkspaceRead, text: string | null): string | null {
  const number = activeNumberOf(workspace, "whatsapp");
  if (!number) return null;
  const digits = number.replace(/\D/g, "");
  return text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}`;
}

/** A closed form's page: it says so, with a way to message the business and who they are. */
function closedPage(place: FormPlace, fragment: boolean): Response {
  const described = place.form.draft ?? { heading: businessNameOf(place.workspace), lang: "en" };
  const frame = pageFrameOf(place, { intro: undefined, words: undefined, ...described }, false);
  const main = closedMain(frame, chatHrefOf(place.workspace, null), place.workspace.record?.about ?? null);
  return htmlPage(200, fragment ? main : formDocument(frame, main));
}

/**
 * What the page's own address may say: the link it was opened through (`l`), whether its owner is sending a test,
 * and a campaign's labels, each a short word. Anything else an address carries is passed over.
 */
const PageQuery = z.record(z.string().max(40), z.string().max(500));

/** The page's address, read once against that shape; nothing where it does not fit. */
function pageQueryOf(request: Request): Record<string, string> {
  const read = PageQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  return read.success ? read.data : {};
}

/** What rides with the answers, unseen, as the page was drawn: the entry's id, the version, and where it came from. */
function carriedOf(request: Request, versionId: string): Record<string, string> {
  const query = pageQueryOf(request);
  const carried: Record<string, string> = { entry_id: randomUUID(), version: versionId, t: String(Date.now()) };
  if (query.l) carried.l = query.l.slice(0, 12);
  const referrer = request.headers.get("referer");
  if (referrer) carried.site = referrer.slice(0, 500);
  for (const [name, value] of Object.entries(query))
    if (name.startsWith("utm_") && value) carried[name] = value.slice(0, 120);
  return carried;
}

/** The session's own client, made by the route when it is needed: only a test asks who is signed in. */
type Session = () => Promise<Db>;

/**
 * Whether this is a test its owner is sending: the address says so, and whoever is signed in may act in the workspace
 * (read under their own row rules; a viewer, a stranger and nobody signed in send a real entry like anyone).
 */
async function isTest(request: Request, session: Session, slug: string): Promise<boolean> {
  if (pageQueryOf(request).test !== "1") return false;
  try {
    const client = await session();
    const { data } = await client.auth.getUser();
    if (!data.user) return false;
    const mine = await listMyMemberships(client, data.user.id);
    return (mine.data ?? []).some((member) => member.role !== "viewer" && member.tenants.slug === slug);
  } catch {
    // Who is signed in could not be read: not a test.
    return false;
  }
}

/** Where the form posts: its own address, saying so when it is a test. */
const actionOf = (place: FormPlace, test: boolean): string => (test ? place.testPath : place.path);

/** How the form's when question asks for a time now (form-times.ts): only a form that has one asks the calendar. */
const timesFor = (place: FormPlace, described: FormDescription): Promise<FormTimesShown | undefined> =>
  described.fields.some((field) => field.kind === "when")
    ? findFormTimes(place, new Date(), described.lang)
    : Promise.resolve(undefined);

/**
 * GET: the form as a visitor sees it, the closed page for one that is off, or nothing for an address that opens none.
 * `session` makes the signed-in person's own client: a member of this workspace alone may send a test.
 */
export async function drawFormPage(
  slug: string,
  formSlug: string,
  request: Request,
  session: Session,
): Promise<Response> {
  const db = linkPageDb();
  if (!db) return htmlPage(503, "");
  const place = await findFormPlace(db, slug, formSlug);
  if (!place) return nothingHere();
  if (place.form.state !== "live" || !place.form.liveVersionId) return closedPage(place, false);
  const version = await findFormVersion(db, place.tenantId, place.form.liveVersionId);
  if (!version?.description) return closedPage(place, false);
  const carried = carriedOf(request, version.id);
  const [test, times] = await Promise.all([
    isTest(request, session, place.workspace.slug),
    timesFor(place, version.description),
  ]);
  const frame = pageFrameOf(place, version.description, test);
  const main = formMain(frame, {
    description: version.description,
    action: actionOf(place, test),
    carried,
    shown: {},
    notice: null,
    times,
  });
  return htmlPage(200, formDocument(frame, main));
}

/** A form's post as pairs of a name and a value: at most 300, a name short, a value within the body's own limit. */
const PostedPairs = z.array(z.tuple([z.string().max(80), z.string().max(FORM_BODY_MAX)])).max(300);

/** The fields a form sent: every value by its name, a name sent more than once keeping each. Null past the limit. */
async function postedFieldsOf(request: Request): Promise<Map<string, string[]> | null> {
  const raw = await request.text();
  if (raw.length > FORM_BODY_MAX) return null;
  const pairs = PostedPairs.safeParse([...new URLSearchParams(raw)]);
  if (!pairs.success) return null;
  const fields = new Map<string, string[]>();
  for (const [name, value] of pairs.data) fields.set(name, [...(fields.get(name) ?? []), value]);
  return fields;
}

const first = (fields: Map<string, string[]>, name: string): string => fields.get(name)?.[0]?.trim() ?? "";

/** What was typed, by field id, as the answers are read: a fix that was pressed stands in for the address typed. */
function rawAnswersOf(description: FormDescription, fields: Map<string, string[]>): Record<string, string | string[]> {
  const typed: Record<string, string | string[]> = {};
  for (const field of description.fields) {
    const sent = fields.get(`a.${field.id}`) ?? [];
    const fixed = first(fields, `fix.${field.id}`);
    typed[field.id] = fixed || (field.kind === "several" ? sent : (sent[0] ?? ""));
  }
  return typed;
}

/** Why an entry is held for a look, or null for one that reads as a person's. */
async function doubtOf(
  request: Request,
  fields: Map<string, string[]>,
  formId: string,
): Promise<Exclude<FormHeldWhy, "member"> | null> {
  if (first(fields, "website")) return "hidden_field";
  const drawn = Number(first(fields, "t"));
  if (Number.isFinite(drawn) && drawn > 0 && Date.now() - drawn < TOO_FAST_MS) return "too_fast";
  try {
    await takeRate(`form:${formId}:${hashKey(ipOf(request))}`, "form_sender");
    await takeRate(`form:${formId}`, "form_day");
  } catch {
    // Past a limit: kept for a look, never refused to the visitor.
    return "too_many";
  }
  return null;
}

/** The fields redrawn with what was typed, what is wrong, and an address offered as a fix. */
function shownFrom(
  description: FormDescription,
  typed: Record<string, string | string[]>,
  found: { problems: Record<string, string>; fixes: Record<string, string> },
): Record<string, FieldShown> {
  return Object.fromEntries(
    description.fields.map((field) => [
      field.id,
      { value: typed[field.id] ?? "", problem: found.problems[field.id] ?? null, fix: found.fixes[field.id] ?? null },
    ]),
  );
}

/** What a send that was read came to, before anything is kept. */
interface SendRead {
  place: FormPlace;
  fields: Map<string, string[]>;
  /** The version the answers are read against: the one the visitor saw, where it is still this form's. */
  against: { id: string; description: FormDescription };
  typed: Record<string, string | string[]>;
  test: boolean;
  /** How the when question is drawn again: as open times where the page showed them (F3). */
  times?: FormTimesShown;
}

/** The form's page again, with what is to be said: mistakes, a fix, or that the form changed. */
function againPage(
  read: SendRead,
  state: Partial<Pick<FormShown, "notice" | "timeNotice">> & {
    problems?: Record<string, string>;
    fixes?: Record<string, string>;
    offered?: string[];
  },
  status: number,
  fragment: boolean,
): Response {
  const { place, fields, against, typed } = read;
  const carried: Record<string, string> = {};
  for (const name of [
    "entry_id",
    "l",
    "site",
    "t",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ]) {
    const value = first(fields, name);
    if (value) carried[name] = value;
  }
  carried.version = against.id;
  const offered = [...new Set([...first(fields, "offered").split(",").filter(Boolean), ...(state.offered ?? [])])];
  if (offered.length) carried.offered = offered.join(",");
  const frame = pageFrameOf(place, against.description, read.test);
  const main = formMain(frame, {
    description: against.description,
    action: actionOf(place, read.test),
    carried,
    shown: shownFrom(against.description, typed, { problems: state.problems ?? {}, fixes: state.fixes ?? {} }),
    notice: state.notice ?? null,
    times: read.times,
    timeNotice: state.timeNotice ?? null,
  });
  return htmlPage(status, fragment ? main : formDocument(frame, main));
}

/** The words of each problem, beside its field, in the form's own language. */
function problemWords(
  description: FormDescription,
  problems: Record<string, Parameters<typeof formProblemWords>[0]>,
): Record<string, string> {
  return Object.fromEntries(
    description.fields.flatMap((field) => {
      const problem = problems[field.id];
      return problem ? [[field.id, formProblemWords(problem, field, description)]] : [];
    }),
  );
}

/** The addresses that look mistyped and were not offered a fix yet, by field id. */
function fixesOf(
  description: FormDescription,
  answers: Record<string, unknown>,
  fields: Map<string, string[]>,
): Record<string, string> {
  const offered = new Set(first(fields, "offered").split(",").filter(Boolean));
  const fixes: Record<string, string> = {};
  for (const field of description.fields) {
    const answer = answers[field.id];
    if (field.kind !== "email" || typeof answer !== "string" || offered.has(field.id)) continue;
    const fix = emailTypoFix(answer);
    if (fix) fixes[field.id] = fix;
  }
  return fixes;
}

/**
 * Where "Send another request" opens the form: still through the link it was opened by, and still a test where it was
 * one. Without them a second request lost the place it came through, and an owner's second test was a real request.
 */
function againHrefOf(read: SendRead): string {
  const query = new URLSearchParams({ again: "1" });
  if (read.test) query.set("test", "1");
  const code = first(read.fields, "l");
  if (code) query.set("l", code.slice(0, 12));
  return `${read.place.path}?${query.toString()}`;
}

/**
 * Whether a reply by email can go from this business now (connections findEmailReady, the send door's own answer),
 * asked only of a request that left an address. Never fails: what nobody could check is not promised.
 */
const repliesByEmail = (place: FormPlace, email: string | null): Promise<boolean> =>
  email
    ? findEmailReady(place.db, place.tenantId).then(
        (ready) => ready.ready,
        logAndGoOn("a form's email readiness", false),
      )
    : Promise.resolve(false);

/**
 * The thank-you for an entry that was kept (or held, or a forgotten person's: a visitor is told nothing of either).
 * `emailOpen`: a reply by email can go now. Where it cannot, their address is not promised a reply: the thank-you
 * says the roads that can carry one (the chat, a call), or only that the business will answer.
 */
function thanksPage(
  read: SendRead,
  taken: FormRequestTaken,
  reach: { name: string | null; email: string | null; phone: string | null; emailOpen: boolean; asked: string | null },
  fragment: boolean,
): Response {
  const { place, against } = read;
  const frame = pageFrameOf(place, against.description, read.test);
  const words: FormPageWords = frame.words;
  const code = "code" in taken ? taken.code : null;
  const lead = against.description.fields.find((field) => field.kind === "long");
  const leadWords = lead ? read.typed[lead.id] : null;
  const message =
    code && against.description.next.chat
      ? continueMessage(words, {
          business: frame.business,
          name: reach.name,
          heading: against.description.heading,
          lead: typeof leadWords === "string" ? leadWords : null,
          code,
        })
      : null;
  const email = reach.emailOpen ? reach.email : null;
  const main = thanksMain(frame, {
    thanks: against.description.thanks,
    // Thanked by their first name, as a person would.
    name: reach.name?.split(/\s+/)[0] || null,
    email,
    phoneOnly: email || !reach.phone ? null : formatPhoneDisplay(reach.phone),
    chatHref: message ? chatHrefOf(place.workspace, message) : null,
    againHref: againHrefOf(read),
    asked: reach.asked,
  });
  return htmlPage(200, fragment ? main : formDocument(frame, main));
}

/** The form again with the time they picked let go: it was taken since, or is too short for the service they picked. */
function timeGonePage(
  read: SendRead,
  picked: { slot: string; service: string | null },
  lost: TimeNotice["why"],
  fragment: boolean,
): Response {
  const when = read.against.description.fields.find((field) => field.kind === "when");
  const typed = when ? { ...read.typed, [when.id]: "" } : read.typed;
  const time = formSlotWords(picked.slot, read.against.description.lang);
  return againPage({ ...read, typed }, { timeNotice: { why: lost, time, service: picked.service } }, 409, fragment);
}

/** The entry as the door keeps it: what was answered, who, where it came from, and whether it is a test or doubtful. */
async function entryToKeep(
  request: Request,
  read: SendRead,
  answered: ReturnType<typeof readFormAnswers>,
): Promise<FormRequestToTake> {
  const { place, fields } = read;
  const entryId = first(fields, "entry_id") || randomUUID();
  return {
    tenantId: place.tenantId,
    formId: place.form.id,
    versionId: read.against.id,
    ref: entryId.slice(0, 100),
    answers: answered.answers,
    reach: answered.reach,
    words: createHash("sha256")
      .update(JSON.stringify([place.form.id, answered.answers]))
      .digest("hex"),
    source: sourceFromSeen({
      code: first(fields, "l") || null,
      page: place.path,
      referrer: first(fields, "site") || null,
      labels: Object.fromEntries([...fields].map(([name, values]) => [name, values[0]])),
      own: new URL(request.url).hostname,
    }),
    linkCode: first(fields, "l") || null,
    test: read.test,
    heldWhy: await doubtOf(request, fields, place.form.id),
  };
}

/** What a send read as, once it was read against the version the visitor saw: or the page that says what is wrong. */
async function readSend(
  request: Request,
  session: Session,
  sent: Pick<SendRead, "place" | "fields" | "against">,
): Promise<{ read: SendRead; answered: ReturnType<typeof readFormAnswers> }> {
  const { place, fields, against } = sent;
  // How the page asked the when question: as open times (drawn so again, a picked time its answer), or as a way to
  // the business's own booking page (asked nothing here), else as the form wrote it.
  const shown = first(fields, "times");
  const when = shown === "1" ? "times" : shown === "page" ? "page" : "asked";
  const [test, times] = await Promise.all([
    isTest(request, session, place.workspace.slug),
    when === "asked" ? Promise.resolve(undefined) : timesFor(place, against.description),
  ]);
  const read: SendRead = { place, fields, against, typed: rawAnswersOf(against.description, fields), test, times };
  const answered = readFormAnswers(against.description, read.typed, phoneFor(place.workspace.record?.country), {
    when,
  });
  return { read, answered };
}

/**
 * POST: an entry taken. Answers the thank-you, the form again with what is wrong, or the closed page. `session`
 * makes the signed-in person's own client: a member of this workspace alone may send a test.
 *
 * A time picked from the open times (F3) is checked against the calendar as it stands now: one taken since, or too short
 * for the service picked, draws the form again with what is open now and nothing lost; one still open is held for the
 * business in the same write as the entry. Nothing here books it, and nothing says it is booked.
 */
export async function takeFormPost(
  slug: string,
  formSlug: string,
  request: Request,
  session: Session,
): Promise<Response> {
  const fragment = request.headers.get("x-form") === "1";
  const db = linkPageDb();
  if (!db) return htmlPage(503, "");
  const fields = await postedFieldsOf(request);
  const place = await findFormPlace(db, slug, formSlug);
  if (!place) return nothingHere();
  if (place.form.state !== "live" || !place.form.liveVersionId) return closedPage(place, fragment);
  const live = await findFormVersion(db, place.tenantId, place.form.liveVersionId);
  if (!live?.description) return closedPage(place, fragment);
  const liveVersion = { id: live.id, description: live.description };
  if (!fields) {
    const read: SendRead = { place, fields: new Map(), against: liveVersion, typed: {}, test: false };
    return againPage(read, { notice: "too_much" }, 413, fragment);
  }
  // The version the visitor saw, where it is this form's and still reads; else the live one.
  const sawId = first(fields, "version");
  const saw = sawId && sawId !== live.id ? await findFormVersion(db, place.tenantId, sawId) : null;
  const against =
    saw?.description && saw.formId === place.form.id ? { id: saw.id, description: saw.description } : liveVersion;
  const { read, answered } = await readSend(request, session, { place, fields, against });
  if (Object.keys(answered.problems).length > 0)
    return againPage(read, { problems: problemWords(against.description, answered.problems) }, 422, fragment);
  if (JSON.stringify(answered.answers).length > MAX_ANSWERS)
    return againPage(read, { notice: "too_much" }, 413, fragment);
  const fixes = fixesOf(against.description, answered.answers, fields);
  if (Object.keys(fixes).length > 0) return againPage(read, { fixes, offered: Object.keys(fixes) }, 422, fragment);
  const pickedTime = askedTimeOf(against.description, answered.answers, read.times?.way === "requests");
  const open = pickedTime ? await checkFormTime(place, pickedTime, new Date()) : null;
  if (pickedTime && open && !open.ok)
    return timeGonePage(read, pickedTime, open.why === "too_short" ? "too_short" : "taken", fragment);

  // Asked beside the write, so the thank-you waits for one of them and not both.
  const emailOpen = repliesByEmail(place, answered.reach.email);
  let kept: { taken: FormRequestTaken; held: boolean };
  try {
    kept = await keepFormEntry(db, await entryToKeep(request, read, answered), open);
  } catch (e) {
    // Nothing was kept, so the visitor is not thanked: the page keeps what was typed and sends again.
    log.error("form_request_failed", {
      tenant_id: place.tenantId,
      form_id: place.form.id,
      error: String(e).slice(0, 300),
    });
    return againPage(read, { notice: "unsent" }, 503, fragment);
  }
  const { taken } = kept;
  log.info("form_request_taken", {
    tenant_id: place.tenantId,
    form_id: place.form.id,
    outcome: taken.outcome,
    entry_id: taken.entryId,
    time: kept.held ? "held" : pickedTime ? "asked" : "none",
  });
  if (taken.outcome === "closed") return closedPage(place, fragment);
  // The version is past its day: the live one, with what was typed carried over by its questions.
  if (taken.outcome === "stale") {
    const carriedOver: SendRead = {
      ...read,
      against: liveVersion,
      typed: rawAnswersOf(liveVersion.description, fields),
    };
    return againPage(carriedOver, { notice: "changed" }, 422, fragment);
  }
  const reach = {
    ...answered.reach,
    emailOpen: await emailOpen,
    asked: askedTimeWords(read.against.description, pickedTime, open),
  };
  return thanksPage(read, taken, reach, fragment);
}
