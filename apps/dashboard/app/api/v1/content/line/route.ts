import { write, workspace } from "@/server/shared/route";
import { keepContentLineFor, lineInput } from "@/server/content/line";

/**
 * POST /api/v1/content/line — `{ line, words }`: a line of Settings › Content in the owner's own words (00706; the content
 * loop PRD's 21.1): what posts are for, how often, the quiet days or the languages. AI reads the sentence into what the
 * week is planned by (one small call, `content_line`), and the sentence is kept as the line says it. Whoever may change
 * Settings. Answers `{ goals, content }`, or why the line could not be read.
 *
 * The handle is in src/server/content/line.ts.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "ask",
  input: lineInput,
  handle: ({ ctx, input, member }) => keepContentLineFor(ctx, member, input),
});
