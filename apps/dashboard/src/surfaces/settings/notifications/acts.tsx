/**
 * Settings › Notifications' acts (decision 0040): the business's addresses and what it is emailed, each saved through
 * the whole config against the version the server last answered, and the member's own phone choices. Each says what
 * it did in the frame's toast, with an Undo where one can be taken back.
 */
import type { ReactNode, RefObject } from "react";
import type { NotificationsConfig, PushKind } from "@chanlytics/contracts";
import {
  ALERT_REFUSED_WORDS,
  alertAddressesOf,
  memberGetsAlerts,
  withAlertAddress,
  withTopicEmail,
  withTopicPush,
  type AlertTopic,
} from "@chanlytics/contracts/alert-pane";
import type { WorkspaceSettings } from "@/legacy-bridge/surfaces/settings";
import type { LegacyFlash } from "../../legacy-verbs";
import { EMAIL_SHAPE } from "../shared";
import { alertVerbs } from "./verbs";

/** The config as this pane reads it: the section it writes, beside whatever else the workspace holds. */
export type Config = WorkspaceSettings & { notifications?: Partial<NotificationsConfig> };
type Section = Partial<NotificationsConfig>;
type Flash = (f: LegacyFlash) => void;

/** The config and its version as the server last answered them: what the next save, and an Undo, go from. */
type Latest = RefObject<{ cfg: Config; version: number } | null>;

/** What a save of the section is said as once it lands, and how it is taken back. */
interface Said {
  msg: ReactNode;
  undo?: (() => void) | null;
}

/** Save the section as `next` says it, marked busy under `key` until the server answers. */
type SaveSection = (key: string, next: (n: Section) => Section, said: Said) => void;

/**
 * The one save: the WHOLE config as last answered with this section changed, under the version that answer made. A
 * closure over the draw before it sent the version read before the remove, and the server refused the Undo as someone
 * else's save.
 */
export function sectionSaver(latest: Latest, setBusy: (key: string | null) => void, flash: Flash): SaveSection {
  return (key, next, said) => {
    const at = latest.current;
    if (!at) return;
    const config = { ...at.cfg, notifications: next(at.cfg.notifications || {}) };
    setBusy(key);
    void alertVerbs
      .saveConfig(config, at.version, (saved) => {
        // What the server now holds (what was sent, where its answer does not carry it), under the version it answered.
        const held = saved.config && typeof saved.config === "object" ? (saved.config as Config) : config;
        latest.current = { cfg: held, version: saved.version };
        setBusy(null);
        flash({ msg: said.msg, undo: said.undo ?? null });
      })
      .then((r) => {
        if (r.ok) return;
        setBusy(null);
        flash({ tone: "danger", msg: <>{r.message}</> });
      });
  };
}

/** The section with this address on the list or off it, the rest as it was (contracts' withAlertAddress), or as it was. */
function withAddress(n: Section, v: string, on: boolean): Section {
  const r = withAlertAddress(n, v, on);
  return r.ok ? r.notifications : n;
}

/** The business's acts: an address added or removed, and a topic's email turned on or off. */
export function businessActs(save: SaveSection, notif: Section, flash: Flash) {
  const addAddress = (raw: string) => {
    const v = raw.trim().toLowerCase();
    if (!EMAIL_SHAPE.test(v)) {
      flash({ tone: "warn", msg: <>{ALERT_REFUSED_WORDS.address}</> });
      return;
    }
    if (alertAddressesOf(notif).has(v)) return;
    const r = withAlertAddress(notif, v, true);
    if (!r.ok) {
      flash({ tone: "warn", msg: <>{ALERT_REFUSED_WORDS[r.reason]}</> });
      return;
    }
    save("address", (n) => withAddress(n, v, true), {
      msg: (
        <>
          <b>{v}</b> will be alerted from the next one
        </>
      ),
    });
  };
  // Reversible, so it is not armed: the toast offers the address back, saved against the version the remove made.
  const removeAddress = (v: string) =>
    save("address", (n) => withAddress(n, v, false), {
      msg: (
        <>
          <b>{v}</b> removed — no more alerts to that address
        </>
      ),
      undo: () =>
        save("address", (n) => withAddress(n, v, true), {
          msg: (
            <>
              <b>{v}</b> is alerted again
            </>
          ),
        }),
    });
  const putEmail = (topic: AlertTopic, on: boolean): void =>
    save(`email:${topic.key}`, (n) => ({ ...n, email_off: withTopicEmail(n, topic, on) }), {
      msg: (
        <>
          <b>{topic.title}</b> {on ? "is emailed again" : "is no longer emailed"}
        </>
      ),
      undo: () => putEmail(topic, !on),
    });
  return { addAddress, removeAddress, putEmail };
}

/** The member's own act: a topic on or off for their phones, the rest of their choice kept. */
export function phoneAct(pushOff: readonly PushKind[], setBusy: (key: string | null) => void, flash: Flash) {
  return async (topic: AlertTopic, on: boolean) => {
    setBusy(`phone:${topic.key}`);
    const r = await alertVerbs.setPushOff(withTopicPush(pushOff, topic, on));
    setBusy(null);
    if (!r.ok) {
      flash({ tone: "danger", msg: <>{r.message}</> });
      return;
    }
    flash({
      msg: (
        <>
          <b>{topic.title}</b> {on ? "reaches your phone again" : "no longer reaches your phone"}
        </>
      ),
    });
  };
}

/** The teammates whose address is not on the list, each by name, and the member's own as "You". */
export function teammatesOf(
  team: readonly { email: string | null; displayName: string }[] | null | undefined,
  notif: Section,
  me: string | null,
): { email: string; name: string }[] {
  const key = (e: string) => e.trim().toLowerCase();
  return (team ?? []).flatMap((m) =>
    m.email && !memberGetsAlerts(m.email, notif)
      ? [{ email: m.email, name: !!me && key(m.email) === key(me) ? "You" : m.displayName.trim() || m.email }]
      : [],
  );
}
