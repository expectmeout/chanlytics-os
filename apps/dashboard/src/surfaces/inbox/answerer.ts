/**
 * Who has a thread a teammate is answering (moved from pages/inbox-list.jsx, decision 0015): named from the team the
 * Settings surface reads (memberWords), or "A teammate" when the roster is unread or they are no longer on it -- a name
 * is never invented.
 */
import { memberName, team } from "./shell";
import type { Thread } from "./types";

export const ixAnswerer = (t: Thread | null | undefined): string => {
  const roster = team();
  const m = t && t.assigneeUserId && roster ? roster.find((x) => x.userId === t.assigneeUserId) : null;
  if (!m) return "A teammate";
  const said = memberName({ email: m.email, display_name: m.displayName || null });
  return said !== undefined ? said : m.displayName || m.email || "A teammate";
};
