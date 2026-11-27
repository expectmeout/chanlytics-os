import { FormPress } from "@chanlytics/contracts";
import { read, write, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { formsList } from "@/server/readers/forms/forms";
import { applyFormPress } from "@/server/forms/press";

/** AI drafting a form reads the business first and writes a whole form: the platform's ceiling, as the other drafts'. */
export const maxDuration = 60;

/**
 * GET /api/v1/forms: a business's forms as Campaigns › Forms lists them (00680): each with its heading, whether it is a
 * draft, live or off, whether changes wait to be published, when it last took a request and how many entries it holds
 * for a look. Any member. The body is its reader's (readers/forms.ts formsList).
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), formsList, undefined)).data,
});

/**
 * POST /api/v1/forms: one press on Campaigns › Forms. A form made by saying what to collect (`make`: AI drafts it, and
 * it is kept as a draft; or AI asks one thing back; or nothing is made and `failed` says so), its draft kept as it was
 * changed in place (`save`), AI told what to change (`tell`) or asked for one question to add (`question`, proposed and
 * never kept by itself), a form published, turned on or off, duplicated, or a draft never published deleted. AI writes
 * words and never state: a form is live only by this press. An owner, an operator or a partner.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "form_change",
  input: FormPress,
  handle: ({ ctx, member, input }) => applyFormPress(ctx, member, input),
});
