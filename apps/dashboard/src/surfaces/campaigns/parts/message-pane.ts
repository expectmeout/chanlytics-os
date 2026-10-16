/**
 * The message's own pane (message-in-place.tsx), as a view inside Campaigns draws it without importing it: Campaigns'
 * route holds the pane already, for the home's message drawer, and hands it down, so a view loaded on demand (the
 * Sequences view's step editor, its Edit the words here) draws it in place while its chunk never reaches the Library's
 * pane. Imported there, even on demand, it regrouped the chunks four pages share, and each loaded the kit a second time
 * (8 to 10 KB gzipped on Campaigns, Sent, People and Messages; #1644).
 */
import { createContext } from "react";
import type { ComponentType } from "react";
import type { MessageInPlaceProps } from "./message-in-place";

/** The pane, where the route hands it down; null where nothing does, and a view then offers no Edit. */
export const MessagePaneContext = createContext<ComponentType<MessageInPlaceProps> | null>(null);
