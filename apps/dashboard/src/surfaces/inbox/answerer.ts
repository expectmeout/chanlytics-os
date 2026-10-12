/**
 * Who has a thread a teammate is answering (moved from pages/inbox-list.jsx, decision 0015): named from the team the
 * Settings surface reads (holder-names.ts), or "A teammate" when the roster is unread or they are no longer on it -- a name
 * is never invented. The pill and the bar say it through contracts' heldPill, with the same name.
 */
import { holderName } from "../holder-names";
import type { Thread } from "./types";

export const ixAnswerer = (t: Thread | null | undefined): string => holderName(t?.assigneeUserId) ?? "A teammate";
