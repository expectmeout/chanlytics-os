import { read, write, workspace } from "@/server/route";
import {
  AppError, businessRecordProblems, registrationPathOf, REGISTRATION_PATHS,
  type BusinessRecordDto, type RegistrationPath,
} from "@chanlytics/contracts";
import { edgeLines } from "@/server/lines";

/**
 * The business on record: what the carriers ask before they let a number
 * text, kept once per workspace.
 *
 * GET — members read it, because the Texting row shows where it stands.
 * PUT — owners only: it is a statement about the business's legal identity,
 * made to the carriers in its name, and it decides whether a registration
 * can be filed at all. The edge owns the write, as it owns every other
 * write that leaves for a provider. The body is the route's own to read:
 * what is missing is said in the owner's words, per registration.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => {
    const { data, error } = await ctx.supabase
      .from("business_records")
      .select("*")
      .eq("tenant_id", member.tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    // Null record AND null path: "nothing on file" is not "a business with no
    // tax id", and the page must not render either registration's form until it
    // has been told which one this is.
    if (!data) return { record: null, path: null, problems: {} };
    const { tenant_id: _tenant, created_at: _created, ...record } = data;
    const path = registrationPathOf(record) ?? "standard";
    return { record, path, problems: businessRecordProblems(record as BusinessRecordDto, path) };
  },
});

export const PUT = write({
  scope: workspace,
  role: "owner",
  rate: "business_record",
  handle: async ({ req, member }) => {
    const body = (await req.json().catch(() => ({}))) as { record?: Partial<BusinessRecordDto>; path?: string };
    const record = body.record && typeof body.record === "object" ? body.record : {};
    // WHICH registration this is for, said by the page rather than guessed from a
    // blank box. An empty tax id means both "there is none" and "not typed yet",
    // and one of those answers files the sole-proprietor brand — one number,
    // about a message a second, and no way to withdraw it.
    const asked = typeof body.path === "string" ? body.path : "";
    if (asked && !(REGISTRATION_PATHS as readonly string[]).includes(asked)) {
      throw new AppError("validation", "That is not a registration we file.", 400);
    }
    const path = (asked || registrationPathOf(record) || "standard") as RegistrationPath;

    // Checked here, in the owner's words, before anything leaves for a
    // provider: a refusal from the carriers arrives days later and says
    // nothing a person can act on. The edge checks the same list again on the
    // row it is about to write — this one is for the message, that one is the
    // door.
    const problems = businessRecordProblems(record, path);
    if (Object.keys(problems).length) {
      const first = Object.values(problems)[0];
      throw new AppError("validation", first ?? "Something is missing.", 400);
    }

    const a = await edgeLines({ op: "record", tenant_id: member.tenantId, record, path }, 20_000);
    const b = a.body ?? {};
    if (a.status === 400) throw new AppError("validation", typeof b.error === "string" ? b.error : "That could not be saved.", 400);
    if (a.status !== 200) throw new AppError("internal", "The record could not be saved. Try again in a moment.", 502);
    return { record: b.record ?? null };
  },
});
