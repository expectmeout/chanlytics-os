/**
 * Settings › Notifications on a real workspace (decision 0040): where alerts reach you, what you are told about, and
 * who else is emailed. Every control is one the code reads: the business's addresses and what it is emailed are the
 * config's `notifications` section (escalation_emails, email_off), which the edge's notify() reads before every mail;
 * what reaches the member's phones is their own membership row (`useSurface("alerts")`, me/alerts), which the push job
 * reads; this browser is the bell's own switch. The topics, their groups and every sentence are contracts'
 * (notification-kinds.ts: ALERT_TOPICS, alertGrid, ALERT_PANE_WORDS); the acts are acts.tsx's.
 */
import { useRef, useState } from "react";
import { ALERT_PANE_WORDS as W, alertGrid, bellLineFor, type EmailHeld } from "@chanlytics/contracts/alert-pane";
import { canDo, gate, meNow, type LegacyFlash } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { businessActs, phoneAct, sectionSaver, teammatesOf, type Config } from "./acts";
import { addressesOf, ChannelsCard } from "./channels";
import { AlertGrid, type PutTick } from "./grid";
import { alertVerbs } from "./surface";

const BROKEN =
  "This workspace's settings can't be read — Chanlytics has to repair them before anything here can change";

export const PaneNotificationsReal = ({ flash }: { flash: (f: LegacyFlash) => void }) => {
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
      </section>
      <p className="ntf-foot">
        {W.never}
        {notif.from ? ` ${W.sentFrom(notif.from)}` : null}
      </p>
    </>
  );
};
