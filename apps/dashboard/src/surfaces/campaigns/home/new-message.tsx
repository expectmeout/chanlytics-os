/**
 * Send once inside the one New (the Campaigns wiring review's rule F, lane 6, 19 Oct 2026; Ruben's call 4: one New replaces
 * New sequence and New message): a message sent once, now or on a day -- Send once is New with "now". It was half of the
 * composer, a sheet of its own over Sequences with a choice at its head between it and Write to leads (`campaigns/new`,
 * `new:to:<audience>`, `new:leads`), which New sequence's "A date" and "Leads" handed you to; those addresses land on New
 * for whom they named (contracts retiredRouteOf). Write to leads is drawn by New itself (reach-out/sources.tsx).
 *
 * The send screen (broadcasts/broadcasts-page.tsx BroadcastSend: who, what and when, held by the Broadcasts page's own
 * state, so what is kept in the tab, the channels, the preview and the one Send are the page's) is New's pane once the
 * broadcasts it is made of are read, New's who and when over its sentence: its name the pane's title, its Cancel New's
 * Close, its Send the foot. Before they are read, and where they could not be, New's own pane says so (`pane`), never a
 * pane in a pane. Its toast is the route's (route-toast.ts), so one that offers to stop a send outlives New, which closes
 * the moment the send is made.
 *
 * A chunk of its own (sequences/new.tsx asks for it as Once is picked): New's page carries none of Sent's send screen.
 */
import type { ReactNode } from "react";
import { LIFECYCLE_WORDS } from "@chanlytics/contracts";
import type { SurfaceKey } from "../../surface-values";
import { useReadsHere, useSurfaceFailed } from "../../use-surface";
import { BroadcastSend } from "../broadcasts/broadcasts-page";
import type { Flash } from "../broadcasts/page/types";
import { HomeFailed, HomeReading } from "./failed";
import { useComposerData } from "./use-home";

interface NewOnceProps {
  /** The audience the door asked for (`new:once:to:<audience>`), or none: the screen opens on its own first. */
  to: string | null;
  /** The route's toast: what a send says, with its Stop, outlives New. */
  flash: Flash;
  /** The screen has been left: sent, scheduled or cancelled. */
  onDone: () => void;
  /** The screen's door to where their yes is got: New's address is replaced by the sheet's, never closed past. */
  onYes: (route: string) => void;
  /** New's who and when, over the screen's sentence. */
  above: ReactNode;
  /** New's own pane, holding what is said while the screen cannot be drawn: reading, or what could not be read. */
  pane: (body: ReactNode) => ReactNode;
}

/** What Send once is made of beyond Sequences' list: Sent's runs, who each audience reaches, and the numbers it goes by. */
const ONCE_READS: readonly SurfaceKey[] = ["broadcasts", "audiences", "channels"];

/** Send once, as New's pane: the send screen once the broadcasts it is made of are read. */
export function NewOnce({ to, flash, onDone, onYes, above, pane }: NewOnceProps) {
  // New is Sequences' address, which opens on its list alone: what the screen is made of is asked for as it is drawn.
  useReadsHere(ONCE_READS);
  const { broadcasts } = useComposerData(true);
  // Its Retry reads again what could not be read: Sent's surface, else who each audience reaches (audiences-surface.ts).
  const sentFailed = useSurfaceFailed("broadcasts");
  if (broadcasts)
    return (
      <BroadcastSend data={broadcasts} initialSegment={to} flash={flash} onDone={onDone} onYes={onYes} above={above} />
    );
  if (broadcasts === undefined) return pane(<HomeReading testid="cmh-composer-reading" />);
  const failed = LIFECYCLE_WORDS.compose.failed;
  return pane(
    <HomeFailed failed={sentFailed ? failed : { ...failed, surface: "audiences" }} testid="cmh-composer-failed" />,
  );
}
