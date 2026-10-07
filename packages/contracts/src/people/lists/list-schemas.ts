/**
 * What the routes and the model read about lists, in zod's classic API: the People export's query and the list a
 * model drafts. Apart from lists.ts and list-rules.ts, which the browser reads (the rule's own grammar is zod/mini),
 * so a page that counts a list loads none of the classic API.
 */
import { z } from "zod";
import { LIST_RULE_MAX } from "./list-rules";
import { parseListToken } from "./lists";

/**
 * The People export's query (GET contacts/export): the list it follows, by its token (`seg:<id>` or `list:<id>`);
 * none is everyone. The route counts it the way a send does, every member and not the page's loaded rows.
 */
export const PeopleExportQuerySchema = z.object({
  list: z
    .string()
    .max(80)
    .refine((t) => parseListToken(t) !== null, "Name a list by its token.")
    .optional(),
});

export const ListDraftAnswerSchema = z.object({
  name: z.string().trim().min(1).max(60),
  cannot: z.string().trim().max(200),
  all: z.array(z.unknown()).max(LIST_RULE_MAX),
});
export type ListDraftAnswer = z.infer<typeof ListDraftAnswerSchema>;
