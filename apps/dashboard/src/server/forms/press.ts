import "server-only";

/**
 * A press on Campaigns › Forms (00680; the Forms plan, 3.6 and 3.7): a form made by saying what to collect (AI drafts
 * it), its draft kept as its owner changes it in place, AI told what to change or asked for one question to add, a
 * form published, turned off or on, duplicated, or a draft never published deleted; and one place a form is shared
 * made by saying where, renamed, stopped or started again.
 *
 * Who may is the route's (an owner, an operator or a partner) and the tables' own row rules again. AI writes words and
 * never state: a form is live only by its owner's press, and a change AI wrote to a live form waits as a draft like
 * any other. A form that could not be answered (no email address and no phone number to ask for) is not published:
 * the refusal says so in words, and the page offers the fix.
 */
import {
  AppError,
  FORM_LIMITS,
  formDescriptionProblems,
  formSlugOf,
  parseTenantConfig,
  type FormBrief,
  type FormDescription,
  type FormJob,
  type FormLinkPress,
  type FormPress,
  type FormPressed,
} from "@chanlytics/contracts";
import { findOldestActiveChannel } from "@chanlytics/db/channels";
import {
  deleteFormDraft,
  keepFormDraft,
  keepLink,
  listFormLinks,
  makeForm,
  makeFormLink,
  publishForm,
  setFormOn,
} from "@chanlytics/db/forms";
import { writeForm } from "../ask/skills/form/write";
import { findFormOrRefuse } from "../readers/forms";
import type { Member } from "../shared/route";
import type { RouteContext } from "../shared/with-route";
import { applySitePress } from "./sites";
import { getStoredConfig } from "../workspace/config-row";

/** How long AI has to draft: inside the minute a route may run, with room to answer. */
const DRAFT_MS = 50_000;

/** The first link every published form has, and the one drawn as a code to print. */
const FIRST_PLACE = "Your link";
const PRINTED_PLACE = "Printed code";

/** The languages a business says it speaks, by their names, as the codes a form is written in. */
const LANGUAGE_CODES: ReadonlyArray<[name: string, code: string]> = [
  ["english", "en"],
  ["spanish", "es"],
  ["español", "es"],
  ["portuguese", "pt"],
  ["creole", "ht"],
  ["french", "fr"],
];

/** The language a business's forms are written in unless its owner asks for another: the first it says it speaks. */
function formLanguageOf(languages: readonly string[] | undefined): string {
  const first = (languages?.[0] ?? "").toLowerCase();
  return LANGUAGE_CODES.find(([name]) => first.includes(name))?.[1] ?? "en";
}

/** What the drafter is handed of the business: its name, its own words, what it offers, and whether it has a chat. */
async function briefOf(
  ctx: RouteContext,
  member: Member,
  request: { job: FormJob; sentence: string; draft?: FormDescription },
): Promise<FormBrief> {
  const [stored, chat] = await Promise.all([
    getStoredConfig(ctx.supabase, member.tenantId),
    findOldestActiveChannel(ctx.supabase, member.tenantId, "whatsapp"),
  ]);
  const brain = parseTenantConfig(stored)?.brain;
  const profile = brain?.profile;
  return {
    job: request.job,
    sentence: request.sentence,
    business: {
      name: brain?.business_name || member.facts?.name || "the business",
      about: null,
      tone: profile?.tone?.trim() || null,
    },
    services: (profile?.services ?? []).map((service) => service.name).filter(Boolean),
    language: request.draft?.lang ?? formLanguageOf(profile?.languages),
    chat: chat !== null,
    ...(request.draft ? { draft: request.draft } : {}),
  };
}

const NOTHING_PRESSED: FormPressed = { form_id: null, proposed: null, said: null, asked: false, failed: false };

/** A form made as a draft at an address of its own: the heading's, or the next one free. */
async function makeAt(ctx: RouteContext, member: Member, draft: FormDescription): Promise<string> {
  const base = formSlugOf(draft.heading);
  for (let n = 1; n <= 9; n++) {
    const created = await makeForm(ctx.supabase, {
      tenantId: member.tenantId,
      slug: n === 1 ? base : `${base}-${n}`,
      draft,
      userId: ctx.userId,
    });
    if ("id" in created) return created.id;
  }
  throw new AppError("conflict", "There are already several forms by that name. Give this one another heading.", 409);
}

/** What a form says before it may go live: the first thing wrong with it, in words its owner can act on, or null. */
function notPublishable(draft: FormDescription): string | null {
  return formDescriptionProblems(draft)[0] ?? null;
}

/** Every published form has its link and its printed code: made once, the first time it is live, and found after. */
async function ensureFirstLinks(ctx: RouteContext, member: Member, formId: string): Promise<void> {
  const links = await listFormLinks(ctx.supabase, member.tenantId, formId);
  const copyOf = { tenantId: member.tenantId, formId, userId: ctx.userId };
  if (!links.some((link) => !link.printed))
    await makeFormLink(ctx.supabase, { ...copyOf, place: FIRST_PLACE, printed: false });
  if (!links.some((link) => link.printed))
    await makeFormLink(ctx.supabase, { ...copyOf, place: PRINTED_PLACE, printed: true });
}

/** AI asked: a whole form from a sentence, a change to a draft, or one question to add. */
async function askAi(
  ctx: RouteContext,
  member: Member,
  request: { job: FormJob; sentence: string; draft?: FormDescription },
) {
  const brief = await briefOf(ctx, member, request);
  return writeForm({ tenantId: member.tenantId, userId: ctx.userId, deadline: Date.now() + DRAFT_MS }, brief);
}

/** A form made by saying what to collect: AI's draft kept as a draft, one question back, or nothing made. */
async function makeBySentence(ctx: RouteContext, member: Member, sentence: string): Promise<FormPressed> {
  const written = await askAi(ctx, member, { job: "draft", sentence });
  if (written.wrote === "ask") return { ...NOTHING_PRESSED, said: written.ask, asked: true };
  if (written.wrote !== "form") return { ...NOTHING_PRESSED, failed: true };
  return { ...NOTHING_PRESSED, form_id: await makeAt(ctx, member, written.form), said: written.said };
}

/**
 * AI told what to change (the draft is kept as it wrote it, and the page keeps the one before for its Undo), or asked
 * for one question to add (proposed for the owner to accept, never kept by itself).
 */
async function changeByAi(
  ctx: RouteContext,
  member: Member,
  press: { act: "tell" | "question"; form_id: string; sentence: string },
): Promise<FormPressed> {
  const form = await findFormOrRefuse({ ctx, tenantId: member.tenantId }, press.form_id);
  const written = await askAi(ctx, member, {
    job: press.act === "tell" ? "change" : "question",
    sentence: press.sentence,
    draft: form.draft,
  });
  if (written.wrote === "ask") return { ...NOTHING_PRESSED, form_id: form.id, said: written.ask, asked: true };
  if (written.wrote !== "form") return { ...NOTHING_PRESSED, form_id: form.id, failed: true };
  if (press.act === "question")
    return { ...NOTHING_PRESSED, form_id: form.id, proposed: written.form, said: written.said };
  await keepFormDraft(ctx.supabase, {
    tenantId: member.tenantId,
    formId: form.id,
    draft: written.form,
    nowIso: new Date().toISOString(),
  });
  return { ...NOTHING_PRESSED, form_id: form.id, said: written.said };
}

/** A form's draft kept as its owner changed it, in place. */
async function saveDraft(
  ctx: RouteContext,
  member: Member,
  formId: string,
  draft: FormDescription,
): Promise<FormPressed> {
  const kept = await keepFormDraft(ctx.supabase, {
    tenantId: member.tenantId,
    formId,
    draft,
    nowIso: new Date().toISOString(),
  });
  if (!kept) throw new AppError("not_found", "That form isn't here any more.", 404);
  return { ...NOTHING_PRESSED, form_id: formId };
}

/** What a press on a form's state asks: published, turned on or off, a draft deleted, or made again as a copy. */
type FormStatePress = "publish" | "turn_on" | "turn_off" | "delete" | "duplicate";

/** A press on a form's state: published, turned, deleted, or made again as a copy. */
async function changeForm(
  ctx: RouteContext,
  member: Member,
  act: FormStatePress,
  formId: string,
): Promise<FormPressed> {
  const at = { tenantId: member.tenantId, formId };
  if (act === "delete") {
    const gone = await deleteFormDraft(ctx.supabase, at);
    if (!gone) throw new AppError("conflict", "A form that was published is turned off, not deleted.", 409);
    return NOTHING_PRESSED;
  }
  if (act === "turn_on" || act === "turn_off") {
    await setFormOn(ctx.supabase, { ...at, on: act === "turn_on" });
    return { ...NOTHING_PRESSED, form_id: formId };
  }
  const form = await findFormOrRefuse({ ctx, tenantId: member.tenantId }, formId);
  if (act === "duplicate") {
    const heading = `${form.draft.heading} copy`.slice(0, FORM_LIMITS.heading);
    return { ...NOTHING_PRESSED, form_id: await makeAt(ctx, member, { ...form.draft, heading }) };
  }
  const wrong = notPublishable(form.draft);
  if (wrong) throw new AppError("validation", wrong);
  await publishForm(ctx.supabase, at);
  await ensureFirstLinks(ctx, member, form.id);
  return { ...NOTHING_PRESSED, form_id: form.id };
}

/** `POST forms`: one press on Campaigns › Forms. */
export function applyFormPress(ctx: RouteContext, member: Member, press: FormPress): Promise<FormPressed> {
  switch (press.act) {
    case "make":
      return makeBySentence(ctx, member, press.sentence);
    case "tell":
    case "question":
      return changeByAi(ctx, member, { act: press.act, form_id: press.form_id, sentence: press.sentence });
    case "save":
      return saveDraft(ctx, member, press.form_id, press.draft);
    default:
      return changeForm(ctx, member, press.act, press.form_id);
  }
}

/** `POST forms/links`: a link made for a place by saying where, renamed, stopped (it lands on the business's page) or started again. */
export async function applyFormLinkPress(
  ctx: RouteContext,
  member: Member,
  press: FormLinkPress,
): Promise<{ link_id: string }> {
  if (press.act === "site_add" || press.act === "site_remove") return applySitePress(ctx, member, press);
  if (press.act === "make") {
    await findFormOrRefuse({ ctx, tenantId: member.tenantId }, press.form_id);
    const created = await makeFormLink(ctx.supabase, {
      tenantId: member.tenantId,
      formId: press.form_id,
      place: press.place,
      printed: false,
      userId: ctx.userId,
    });
    return { link_id: created.id };
  }
  const kept = await keepLink(ctx.supabase, {
    tenantId: member.tenantId,
    linkId: press.link_id,
    ...(press.act === "rename" ? { place: press.place } : {}),
    ...(press.act === "stop" ? { stoppedAt: new Date().toISOString() } : {}),
    ...(press.act === "start" ? { stoppedAt: null } : {}),
  });
  if (!kept) throw new AppError("not_found", "That link isn't here any more.", 404);
  return { link_id: press.link_id };
}
