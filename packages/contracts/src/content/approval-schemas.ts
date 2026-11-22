/**
 * What the two presses and AI's publish tool take of a placement's reason (the content loop PRD's 6.1): the request
 * schemas, apart from content/approvals.ts so the card code a page loads never carries a schema library. The server's.
 */
import { z } from "zod";
import { DAY_KEY } from "../shared/zone/day-keys";
import type { OwnersFact, PostAbout } from "./approvals";

const DAY = z.string().regex(DAY_KEY);

/** What a press's words are about: a day, an offer with its last day, a service, or that they date nothing. */
export const PostAboutSchema: z.ZodType<PostAbout> = z.object({
  day: DAY.nullish(),
  offer: z.object({ says: z.string().trim().min(1).max(120), until: DAY.nullish() }).nullish(),
  service: z.string().trim().min(1).max(120).nullish(),
  nothing: z.literal(true).nullish(),
});

/** A fact the owner stated on the card, kept on the approval until its day ends. */
export const OwnersFactSchema: z.ZodType<OwnersFact> = z.object({
  says: z.string().trim().min(1).max(200),
  until: DAY,
});
