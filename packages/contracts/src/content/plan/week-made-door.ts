import { z } from "zod";

/**
 * The one call the edge makes to the dashboard (00714): a week a rung let AI approve, made by the code the owner's press
 * runs, as AI. Opened only by a token the edge signs for this path with the secret the two share (channels/tokens).
 */
export const WEEK_MADE_DOOR = {
  path: "/api/content/week-made",
  body: z.object({ tenant_id: z.uuid(), plan_id: z.uuid() }),
} as const;
export type WeekMadeBody = z.infer<typeof WEEK_MADE_DOOR.body>;
