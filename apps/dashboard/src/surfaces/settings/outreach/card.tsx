/**
 * Cold email (decision 0113): what every card of the page shares. A card is the record kit's, as How it answers'
 * are (business/tab.tsx btaCard): its title and line over its rows. What the page reads beyond the config is the pane's
 * kept read (frame/pane-reads.ts), begun before the pane is drawn and read again behind it.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MIN_MS, textOrEmpty, type ReachOutConfig, type ReachOutSettingsDto } from "@chanlytics/contracts";
import { hearFront, pageHidden } from "@/bridge/hearing/front";
import type { FrameFlash } from "../../frame-verbs";
import type { BtSaver } from "../business/gestures/common";
import type { Brain, Config } from "../business/save";
import { reachOutSettingsRead } from "../frame/pane-reads";

/** What every card of the page is handed: the record, who may change it, the toast, the tab's one saver, and the read. */
export interface OutreachShared {
  brain: Brain;
  config: Config;
  canEdit: boolean;
  flash: (flash: FrameFlash) => void;
  saver: BtSaver;
  read: ReachOutSettingsDto | null;
}

/** What the section holds under a key, trimmed, or null where nothing is: what a row states at rest. */
export const storedReachOut = (shared: OutreachShared, key: keyof ReachOutConfig): string | null =>
  textOrEmpty(shared.config.reach_out?.[key]).trim() || null;

/** A card of the page: its title, its line, a mark at its head's end where it has one, and its rows. */
export const OutreachCard = ({
  id,
  title,
  sub = null,
  mark = null,
  children,
}: {
  id: string;
  title: string;
  sub?: string | null;
  mark?: ReactNode;
  children: ReactNode;
}) => (
  <section className="rec-card" data-testid={`rec-card-${id}`} aria-labelledby={`ro-${id}-title`}>
    <div className="rec-card-head">
      <h2 className="rec-card-title" id={`ro-${id}-title`}>
        {title}
      </h2>
      {sub ? <span className="rec-card-sub">{sub}</span> : null}
      {mark}
    </div>
    {children}
  </section>
);

/**
 * What the page shows beyond the config: what the tab last held of it on the first frame, and the answer once it lands.
 * Read again as a save brings the config back (an address added moves Where it stands), as the owner comes back to the tab
 * (a record fixed on Connections or at their DNS host), at most once a minute, and after a change only this read shows (a
 * voice pasted): `again`. `failed` is a read that did not land with nothing to draw in its place, which the page says
 * and offers again; `reading` is one still out.
 */
export function useReachOutRead(config: unknown): {
  read: ReachOutSettingsDto | null;
  failed: boolean;
  reading: boolean;
  again: () => void;
} {
  const [read, setRead] = useState(() => reachOutSettingsRead.held());
  const [failed, setFailed] = useState(false);
  const [reading, setReading] = useState(false);
  const [round, setRound] = useState(0);
  const readAt = useRef(0);
  useEffect(
    () =>
      hearFront(() => {
        if (!pageHidden() && Date.now() - readAt.current >= MIN_MS) setRound((n) => n + 1);
      }),
    [],
  );
  useEffect(() => {
    let live = true;
    readAt.current = Date.now();
    setReading(true);
    // A read that failed leaves what was drawn, never the frame's error: the client has already said why it failed.
    const landed = (answer: ReachOutSettingsDto | null) => {
      if (!live) return;
      if (answer) setRead(answer);
      setFailed(!answer);
      setReading(false);
    };
    reachOutSettingsRead.read().then(
      (r) => landed(r.ok ? r.data : null),
      () => landed(null),
    );
    return () => {
      live = false;
    };
  }, [round, config]);
  return { read, failed: failed && !read, reading, again: () => setRound((n) => n + 1) };
}
