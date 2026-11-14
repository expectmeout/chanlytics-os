/**
 * What cannot wait (Today in three zones, 2 Nov 2026): one line under the head, for systems alone, the whole of it a press with
 * its door said at its end (9 Nov 2026: a band and a button inside it took two lines on a phone). A line that is down, or the
 * workspace paused (contracts `standing.alert`), and a warning the bell holds that stops customers being answered (a WhatsApp
 * number's health, a line or a mailbox that stopped being read, the subscription), two at most, and two about one thing are one
 * line. A reply that never reached someone is Need you's row now; everything else waits where it is answered. Nothing at all
 * when nothing is wrong.
 */
import { useEffect, useState, type MouseEvent } from "react";
import {
  BELL_READ_WORDS,
  CHANNELS_DOOR,
  TODAY_PHONE_WORDS as P,
  bellSections,
  type BellLineVM,
} from "@chanlytics/contracts";
import type { BellApi, BellRow } from "@/bridge/notifications";
import { Icon } from "../../kit/icon/icon";
import { useSurface } from "../../use-surface";
import { routeDoor } from "../../frame-verbs";
import { bell, doorGlyph } from "../shell";

/** The bell's warnings that stop customers being answered, by their kind (notifications.ts SERVER_LOOK). */
const STOPS_ANSWERS = new Set(["number", "sweep", "billing"]);

/** Two warnings at most under the head: the bell holds the rest. */
const WARNINGS_MAX = 2;

/** The bell's unread warnings that stop customers being answered, as the bell groups them, kept as the bell moves. */
function useWarnings(): { api: BellApi | null; lines: BellLineVM<BellRow>[] } {
  const api = bell() || null;
  const [rows, setRows] = useState<BellRow[]>(() => (api ? api.feed() : []));
  useEffect(() => {
    if (!api) return undefined;
    const refresh = () => setRows(api.feed());
    refresh();
    return api.onChange(refresh);
  }, [api]);
  // The bell's unread section, by the name contracts gives it: it was sought as "New", which the section is no longer called.
  const unread = bellSections(rows.filter((r) => r.unread)).find((s) => s.label === BELL_READ_WORDS.unread);
  const fresh = unread?.lines ?? [];
  return {
    api,
    lines: fresh.filter((l) => l.row.tone === "warn" && STOPS_ANSWERS.has(l.row.kind ?? "")).slice(0, WARNINGS_MAX),
  };
}

/** One line of what cannot wait: all of it a press. Called, not drawn. */
function alertLine(a: {
  key: string;
  tone: "warn" | null;
  words: string;
  door: { label: string; to: string } | null;
  testid: string;
  role?: "alert";
  /** What a press does besides going through the door: a warning read. */
  before?: () => void;
}) {
  const door = a.door;
  const go = door ? routeDoor(door.to) : null;
  // The whole line is a press for a finger; the door in it is the press for the keys and for a reader, and goes once.
  const anywhere = (event: MouseEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest("a")) return;
    event.currentTarget.querySelector("a")?.click();
  };
  return (
    <div
      key={a.key}
      className="tz-alert"
      data-tone={a.tone ?? undefined}
      data-testid={a.testid}
      role={a.role}
      onClick={door ? anywhere : undefined}
    >
      <i aria-hidden="true" />
      <span>{a.words}</span>
      {door && go ? (
        <a
          {...go}
          onClick={(event) => {
            a.before?.();
            go.onClick(event);
          }}
        >
          {door.label}
          <Icon name={doorGlyph()} size={11} />
        </a>
      ) : null}
    </div>
  );
}

export function TodayAlertBand() {
  const vm = useSurface("today");
  const { api, lines } = useWarnings();
  const alert = vm?.standing.alert ?? null;
  if (!alert && !lines.length) return null;
  const door = vm?.standing.paused
    ? { label: P.alertDoor.billing, to: "admin/billing" }
    : { label: P.alertDoor.reconnect, to: CHANNELS_DOOR };
  // Two warnings about one thing say so once: a number's quality and its limit are one trip to one page.
  const [first, second] = lines;
  const fold =
    first && second && first.row.kind === second.row.kind ? P.alertFold(lines.length, first.row.kind ?? "") : null;
  const shown = fold ? lines.slice(0, 1) : lines;
  return (
    <div className="tz-alerts" data-testid="today-warnings">
      {alert
        ? alertLine({
            key: "alert",
            tone: null,
            words: alert,
            door,
            testid: "today-alert",
            role: "alert",
          })
        : null}
      {shown.map((l) => {
        const act = l.row.actions?.[0];
        return alertLine({
          key: l.key,
          tone: "warn",
          words: fold ?? (l.count > 1 && l.title ? l.title : l.row.title),
          door: act ? { label: fold ? P.alertDoor.see : P.alertDoor.open, to: act.to } : null,
          testid: "today-warning",
          before: () => {
            for (const each of fold ? lines : [l]) api?.read(each.row.id);
          },
        });
      })}
    </div>
  );
}
