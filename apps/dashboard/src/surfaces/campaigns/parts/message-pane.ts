/**
 * The message's own pane (message-in-place.tsx), as a view inside Campaigns draws it without importing it: Campaigns'
 * route holds the pane already, for the home's message drawer, and hands it down, so a view loaded on demand (the
 * Sequences view's step editor, its Edit the words here) draws it in place while its chunk never reaches the Library's
 * pane. Imported there, even on demand, it regrouped the chunks four pages share, and each loaded the kit a second time
 * (8 to 10 KB gzipped on Campaigns, Sent, People and Messages; #1644).
 */
import { createContext } from "react";
import type { ComponentType, Context } from "react";
import type { MessageInPlaceProps } from "./message-in-place";

type Pane = ComponentType<MessageInPlaceProps> | null;
let made: Context<Pane> | null = null;

/**
 * The pane's context, where the route hands it down; null where nothing does, and a view then offers no Edit. Made the
 * first time it is asked for, never as the module loads: the page tests' React (its react-server build) has no
 * createContext, and a test that imports the drawer draws neither.
 */
export function messagePaneContext(): Context<Pane> {
  made ??= createContext<Pane>(null);
  return made;
}
