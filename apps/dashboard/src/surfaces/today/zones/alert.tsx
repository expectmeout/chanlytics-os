/**
 * What cannot wait (Today in three zones, 2 Nov 2026): a band across the page under the head, for systems alone. A line
 * that is down, or the workspace paused (contracts `standing.alert`), with its one door, and a warning the bell holds that
 * stops customers being answered (a WhatsApp number's health, a line or a mailbox that stopped being read, the
 * subscription), two at most, each with its own. A reply that never reached someone is Need you's row now, with Try
 * again; everything else waits where it is answered. Nothing at all when nothing is wrong.
 */
import { useEffect, useState } from "react";
import { CHANNELS_DOOR, TODAY_PHONE_WORDS as P, bellSections, type BellLineVM } from "@chanlytics/contracts";
import type { BellApi, BellRow } from "@/legacy-bridge/notifications";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { routeDoor } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { appNavigate, bell } from "../shell";

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
  const fresh = bellSections(rows.filter((r) => r.unread)).find((s) => s.label === "New")?.lines ?? [];
  return {
    api,
    lines: fresh.filter((l) => l.row.tone === "warn" && STOPS_ANSWERS.has(l.row.kind ?? "")).slice(0, WARNINGS_MAX),
  };
}

export function TodayAlertBand() {
  const vm = useSurface("today");
  const { api, lines } = useWarnings();
  const alert = vm?.standing.alert ?? null;
  if (!alert && !lines.length) return null;
  const door = vm?.standing.paused
    ? { label: P.alertDoor.billing, to: "admin/billing" }
    : { label: P.alertDoor.reconnect, to: CHANNELS_DOOR };
  return (
    <div className="tz-alerts" data-testid="today-warnings">
      {alert ? (
        <div className="tz-alert" role="alert" data-testid="today-alert">
          <Icon name="alert" size={16} />
          <span>{alert}</span>
          <Button variant="secondary" size="sm" {...routeDoor(door.to)}>
            {door.label}
          </Button>
        </div>
      ) : null}
      {lines.map((l) => {
        const act = l.row.actions?.[0];
        return (
          <div key={l.key} className="tz-alert" data-tone="warn" data-testid="today-warning">
            <Icon name={l.row.icon} size={16} />
            <span>{l.count > 1 && l.title ? l.title : l.row.title}</span>
            {act ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  api?.read(l.row.id);
                  appNavigate(act.to);
                }}
              >
                {act.label}
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
