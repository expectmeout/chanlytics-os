/**
 * Settings › Notifications on a real workspace (decision 0040): where alerts reach you, what you are told about, and
 * who else is emailed. Every control is one the code reads: the business's addresses and what it is emailed are the
 * config's `notifications` section (escalation_emails, email_off), which the edge's notify() reads before every mail;
 * what reaches the member's phones is their own membership row (`useSurface("alerts")`, me/alerts), which the push job
 * reads; this browser is the bell's own switch. The topics, their groups and every sentence are contracts'
 * (notification-kinds.ts: ALERT_TOPICS, alertGrid, ALERT_PANE_WORDS); the acts are acts.tsx's.
 */
import { useEffect, useRef, useState } from "react";
import { ALERT_PANE_WORDS as W, alertGrid, bellLineFor, type EmailHeld } from "@chanlytics/contracts/alert-pane";
import { webPushCan, webPushOn, webPushTurnOff, webPushTurnOn } from "@/bridge/ask/web-push";
import { Button } from "../../kit/button/button";
import { canDo, gate, meNow, type FrameFlash } from "../../frame-verbs";
import { useSurface } from "../../use-surface";
import { businessActs, phoneAct, sectionSaver, teammatesOf, type Config } from "./acts";
import { addressesOf, ChannelsCard } from "./channels";
import { AlertGrid, type PutTick } from "./grid";
import { alertVerbs } from "./verbs";

const BROKEN =
  "This workspace's settings can't be read — Chanlytics has to repair them before anything here can change";

/**
 * This browser told, or not (D12 of the answers canvas): a press asks the browser's own question, and nothing is drawn where
 * the deployment holds no keys. On an iPhone it says what it takes first.
 */
function ThisBrowser({ flash }: { flash: (f: FrameFlash) => void }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void webPushOn(window).then(setOn, () => setOn(false));
  }, []);
  const can = typeof window === "undefined" ? { can: false, reason: "no_key" as const } : webPushCan(window);
  if (can.reason === "no_key" || can.reason === "no_support") return null;
  if (can.reason === "home_screen")
    return <p className="ntf-bell-line">To be told on this iPhone, add Chanlytics to your Home Screen first.</p>;
  const press = async () => {
    setBusy(true);
    const r = on ? await webPushTurnOff(window) : await webPushTurnOn(window);
    setBusy(false);
    if (r.ok) setOn(!on);
    else flash({ tone: "warn", msg: <>{r.message}</> });
  };
  return (
    <p className="ntf-bell-line" data-testid="ntf-this-browser">
      {on ? "This browser is told." : "This browser is not told."}{" "}
      <Button
        variant="quiet"
        size="sm"
        onClick={press}
        aria-disabled={busy || undefined}
        data-testid="ntf-this-browser-press"
      >
        {on ? "Stop" : "Tell me here"}
      </Button>
    </p>
  );
}

export const PaneNotificationsReal = ({ flash }: { flash: (f: FrameFlash) => void }) => {
  const read = useSurface("settings");
  const alerts = useSurface("alerts");
  const [busy, setBusy] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  // The config as the server last answered it (acts.tsx sectionSaver): a read, or a save's answer, whichever is newer.
  const latest = useRef<{ cfg: Config; version: number } | null>(null);
  // The route waits for the settings read before Settings draws; before it, there is nothing of this workspace to say.
  if (!read) return null;
  const settings = read.settings;
  const cfg: Config = (settings && settings.config) || {};
  if (settings && (!latest.current || latest.current.version <= settings.version))
    latest.current = { cfg, version: settings.version };
  // Drawn from what the server last accepted: the re-read that follows a save takes seconds, and a tick drawn from the
  // read before it said the opposite of the toast beside it until then.
  const notif = (latest.current?.cfg ?? cfg).notifications || {};
  const emails = Array.isArray(notif.escalation_emails) ? notif.escalation_emails : [];
  // Who may change who is emailed and what: the one gate, in contracts' words (View-as included).
  const may = canDo("settings");
  // A save here writes the WHOLE config it read. When the config could not be read, what it read is {}, and saving
  // would replace the broken row with one holding nothing but this section.
  const broken = !!(settings && settings.broken);
  const business = businessActs(sectionSaver(latest, setBusy, flash), notif, flash);
  const dto = alerts?.dto ?? null;
  const phones = dto?.phones ?? [];
  const putPhone = phoneAct(dto?.push_off ?? [], setBusy, flash);
  const put: PutTick = (topic, channel, on) =>
    channel === "email" ? business.putEmail(topic, on) : void putPhone(topic, on);
  const test = async () => {
    setTesting(true);
    const r = await alertVerbs.test();
    setTesting(false);
    const said = !r.ok ? r.message : r.sent ? W.testSent(r.to) : W.testNot(r.why);
    flash({ tone: r.ok && r.sent ? undefined : "warn", msg: <>{said}</> });
  };
  const emailHeld: EmailHeld = !may ? "role" : broken ? "broken" : emails.length === 0 ? "no_address" : null;
  const groups = alertGrid({
    notifications: notif,
    emailHeld,
    phone: dto && phones.length > 0 ? { pushOff: dto.push_off, choosable: dto.choosable } : null,
  });
  const me = meNow()?.email ?? null;

  return (
    <>
      <ChannelsCard
        email={{
          addresses: addressesOf(emails, read.team, me),
          teammates: teammatesOf(read.team, notif, me),
          may,
          gated: gate("settings", "change who is emailed"),
          locked: broken ? BROKEN : null,
          busy: busy !== null,
          testing,
          add: business.addAddress,
          remove: business.removeAddress,
          test: () => void test(),
        }}
        phones={phones}
        flash={flash}
        now={Date.now()}
      />
      <section className="rec-card set-card" data-testid="ntf-what">
        <div className="rec-card-head">
          <h2 className="rec-card-title">{W.what}</h2>
          <span className="rec-card-sub">{W.whatSub}</span>
        </div>
        <AlertGrid groups={groups} put={put} busy={busy} />
        <p className="ntf-bell-line">{bellLineFor(phones.length > 0)}</p>
        <ThisBrowser flash={flash} />
      </section>
      <p className="ntf-foot">
        {W.never}
        {notif.from ? ` ${W.sentFrom(notif.from)}` : null}
      </p>
    </>
  );
};
