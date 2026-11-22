import { z } from "zod";
import { FILE_YES_USES, SUBJECT_LABELS, UUID } from "@chanlytics/contracts";
import { write } from "@/server/shared/route";
import { fileScope } from "@/server/files/file";
import { keepPersonsYes, sayWhoIsInIt } from "@/server/files/people";

/**
 * POST /api/v1/files/:id/people — `{ state, people? }`: who is in this file, as the owner or an operator says it, never
 * from a face (00691; the content loop PRD's 5.3, principle 6): `named` with each person (their name, a client, staff or
 * someone else, and the person in People where the workspace knows them), `none`, or `unsure` (no new use until the
 * owner says). The door asks the add_files permission itself.
 *
 * PATCH — `{ subject_id, uses, said_in, message_id? }`: that person's own yes for each use, said to AI, in a message (the
 * message named is its evidence) or in person. The door asks the settings permission itself.
 *
 * The handles are in src/server/files/people.ts.
 */
export const POST = write({
  scope: fileScope,
  role: "operator",
  rate: "settings",
  input: z.strictObject({
    state: z.enum(["named", "none", "unsure"]),
    people: z
      .array(
        z.strictObject({
          name: z.string().trim().min(1).max(120),
          label: z.enum(SUBJECT_LABELS),
          contact_id: z.string().regex(UUID, "Which person?").nullish(),
        }),
      )
      .max(20)
      .optional(),
  }),
  handle: ({ ctx, member, row, input }) => sayWhoIsInIt(ctx, member, row, input),
});

export const PATCH = write({
  scope: fileScope,
  role: "partner",
  rate: "settings",
  input: z.strictObject({
    subject_id: z.string().regex(UUID, "Which person?"),
    uses: z.array(z.enum(FILE_YES_USES)).min(1).max(FILE_YES_USES.length),
    said_in: z.enum(["ai", "message", "in_person"]),
    message_id: z.string().regex(UUID, "Which message?").optional(),
  }),
  handle: ({ ctx, member, input }) => keepPersonsYes(ctx, member, input),
});
