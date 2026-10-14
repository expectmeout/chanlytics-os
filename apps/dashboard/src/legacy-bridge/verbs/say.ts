/**
 * Say it, asked (the sheets as verbs, 14 Oct 2026, step 5): what a member said about one person, read into one sheet's
 * fields by POST people/[id]/say. It writes nothing, so it is no verb of its own: it fills the payload the sheet's Save
 * then commits through its verb (commit.ts). Nothing is read again after it: no surface shows what it answers.
 */
import type { SayItDto, SayItVerb } from "@chanlytics/contracts";
import type { Api, ApiResult } from "../../client/api";
import { apiFor } from "../api";

/** One line read into a sheet's fields: the deal's or the note's, or the refusal in the door's words. */
export function sayIt(
  personId: string,
  verb: SayItVerb,
  words: string,
  client: Api = apiFor(window),
): Promise<ApiResult<SayItDto>> {
  return client("POST people/[id]/say", {
    params: { id: personId },
    body: { verb, words },
    once: true,
    refresh: false,
  });
}
