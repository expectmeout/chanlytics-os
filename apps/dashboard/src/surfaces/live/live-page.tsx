/**
 * Chanlytics, Live, on a real workspace (moved from legacy/pages/live-monitor.jsx, decision 0015).
 *
 * The mockup's console promised Live Listen, Take Over and End Call over an invented caller. The phone provider's own
 * dashboard has all three; its API has two -- a sentence into the call, and an end -- and keeps the audio and the
 * microphone to itself. So this page shows what is true: the calls in progress under the heartbeat rule, a clock
 * running from each call's real start, the transcript when the provider sends turns and an honest wait when it does
 * not, and the calls that just ended with their summary as it arrives. A demo session draws the same page from the
 * sample (sample.ts).
 *
 * Reads the live surface (`useSurface("live")`, written by liveOverride in the bridge). Three writes: a whisper -- a
 * sentence only the receptionist hears -- an end, and a hand-over, which is the transfer a caller gets when they ask
 * for a person, asked for by the owner.
 */
import { useEffect, useState } from "react";
import { liveStillUp } from "@chanlytics/contracts";
import type { LiveCallVM } from "@chanlytics/contracts";
import { refreshLive } from "@/legacy-bridge/inbox-verbs";
import { demoSession, navigate, replaceRoute } from "../legacy-verbs";
import { useSurface } from "../use-surface";
import { LrList } from "./list";
import { LrPanel } from "./panel";
import { liveSample } from "./sample";
import type { LiveSurface } from "./surface";

// The clock ticks once a second while a call is up; a call's calls are read again every eight.
const CLOCK_MS = 1000;
const REFRESH_MS = 8000;

interface LivePageProps {
  initialCallId?: string | null;
}

interface LiveMonitorProps extends LivePageProps {
  /** What a demo session draws where the surface holds nothing. */
  sample?: LiveSurface | null;
}

const LiveMonitorReal = ({ initialCallId = null, sample = null }: LiveMonitorProps) => {
  const L = useSurface("live") || sample;
  const [nowMs, setNowMs] = useState(Date.now());
  // live/<callId> opens the call a door names (Today's, a bell's) rather than the one on the line, and the call open is
  // the address's: a row writes it (replaced -- Back leaves Live rather than replaying every call looked at), so a
  // refresh opens the same call and the crumbs name it. The page stays mounted across its calls (routes.ts, `mount`).
  // Where no shell is to write the address, the choice lives for the page.
  const [picked, setPicked] = useState<string | null>(null);
  const activeId = initialCallId || picked;
  const setActiveId = (id: string) => {
    setPicked(id);
    replaceRoute(`live/${id}`);
  };
  const hasLive = !!(L && L.now.length);

  // One clock, only while a call is up.
  useEffect(() => {
    if (!hasLive) return undefined;
    const t = window.setInterval(() => setNowMs(Date.now()), CLOCK_MS);
    return () => window.clearInterval(t);
  }, [hasLive]);
  // Insurance while a call is up: realtime carries each turn (proved on the
  // deployed page), but a channel that drops silently after a sleep would
  // leave a live transcript frozen with no sign. One re-read every 8 s, only
  // while a call is live, costs one calls fetch and cannot be wrong.
  useEffect(() => {
    if (!hasLive) return undefined;
    const t = window.setInterval(() => {
      void refreshLive();
    }, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [hasLive]);
  useEffect(() => {
    setNowMs(Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as the JSX had it
  }, [L && L.fetchedAtMs]);

  if (!L) return null;

  // The heartbeat rule, re-applied between refreshes: a call nobody has heard
  // from for heartbeatMs stops being live here even before the next fetch.
  const live = L.now.filter((c) => liveStillUp(c, L.heartbeatMs, nowMs));
  const recent = L.recent;
  const elapsedOf = (c: LiveCallVM) => Math.max(0, Math.floor((nowMs - (c.startedAtMs || nowMs)) / 1000));
  const all = [...live, ...recent];
  // The call chosen -- by a click or a link -- or, when none was, the one on the line, else the last. A chosen call Live
  // no longer holds is said to be gone: the panel fell to whoever was on the line, End and Pass to me with it, and
  // nothing said the call on screen was not the one chosen.
  const chosen = activeId ? all.find((c) => c.callId === activeId) || null : null;
  const active = activeId ? chosen : live[0] || recent[0] || null;
  const line = L.line;
  const notice =
    activeId && !chosen
      ? {
          words: "That call has ended, and Live no longer holds it.",
          open: () => navigate(`conversations/cv-${activeId}`),
        }
      : null;

  // No title, no sub-headline, no stat cards: the work first, like the Inbox and Conversations beside it
  // under the same strip. The three cards each said something the page says once anyway -- how many
  // are on the line (the list's head), whether the line is on (the list, when nobody is), and the last
  // call (the panel, which opens on it when nobody is on the line).
  return (
    <div className="live-monitor" data-testid="live-real">
      <div className="lm-body lm-body-rows">
        <LrList
          live={live}
          line={line}
          lineRead={L.lineRead !== false}
          activeId={active ? active.callId : null}
          elapsedOf={elapsedOf}
          onSelect={setActiveId}
        />
        <LrPanel c={active} elapsed={active ? elapsedOf(active) : 0} nowMs={nowMs} notice={notice} />
      </div>
    </div>
  );
};

// The route renders the real page whenever the surface holds a value; a demo session draws the same page over the
// sample, and a session with neither draws nothing.
export function LivePage(props: LivePageProps) {
  const live = useSurface("live");
  if (live !== undefined) return <LiveMonitorReal {...props} />;
  return demoSession() ? <LiveMonitorReal {...props} sample={liveSample()} /> : null;
}
