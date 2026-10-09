/**
 * Settings › Notifications on a real workspace (moved from legacy/pages/settings.jsx, decision 0015 step 11): who is
 * alerted, and what they are alerted about.
 *
 * What the system actually does: it emails the addresses in notifications.escalation_emails, for the kinds of alert the
 * edge really sends, and nothing else. No switch is offered that no code reads. The kinds, grouped, and when each is
 * sent, and the sentences around them, are contracts' (notification-kinds.ts), whose one closed list of what is emailed
 * is what notify() asks before it mails. Settings' page
 * (settings.jsx) still draws it by its old name, which seed-globals publishes (settings/globals.ts), until Settings'
 * frame moves; the mockup's seeded twin (six switches kept in the browser, which nothing read) left with it.
 */
import { useState, type ReactNode } from "react";
import { NOTIFICATION_KIND_GROUPS, NOTIFICATION_PANE_WORDS, type NotificationsConfig } from "@chanlytics/contracts";
import { saveSettings } from "@/legacy-bridge/inbox-verbs";
import type { BellApi } from "@/legacy-bridge/notifications";
import type { WorkspaceSettings } from "@/legacy-bridge/surfaces/settings";
import { Button } from "../../kit/button/button";
import { RecordField, RecordSwitch, RecordTip } from "../../kit/record/field";
import { RecordRow } from "../../kit/record/row";
import { canDo, gate, gateTitle, showTip, type GateProps, type LegacyFlash } from "../../legacy-verbs";
import { object } from "../../shell-doors";
import { useSurface } from "../../use-surface";
import { EMAIL_SHAPE } from "../shared";

const MOST = 10;

/** The config as this pane reads it: the section it writes, beside whatever else the workspace holds. */
type Config = WorkspaceSettings & { notifications?: Partial<NotificationsConfig> };

/** What the recipients' card is handed: the addresses, who may change them, and the pane's own acts. */
interface Recipients {
  emails: string[];
  may: boolean;
  gated: GateProps;
  broken: boolean;
  busy: boolean;
  lockTitle: string | undefined;
  email: string;
  setEmail: (v: string) => void;
  add: () => void;
  remove: (v: string) => void;
}

/** Who gets alerted: each address, with its Remove for a role that may, and the box an address is added from. */
function recipientsCard(o: Recipients): ReactNode {
  const { emails, may, gated, broken, busy, lockTitle, email, setEmail, add, remove } = o;
  return (
    <section className="rec-card set-card" data-testid="notif-recipients">
      <div className="rec-card-head">
        <h2 className="rec-card-title">Who gets alerted</h2>
        <span className="rec-card-sub">{NOTIFICATION_PANE_WORDS.recipients}</span>
      </div>
      {emails.length === 0 && (
        <RecordRow
          id="notif-nobody"
          label="Alerted"
          empty="Nobody yet"
          value={null}
          hint="Until an address is added, the platform operator receives a notice that this workspace needs attention — without the customer's message, which is withheld rather than sent to a stranger."
        />
      )}
      {emails.map((e, i) => {
        // Removing an address is an item's own act: out of sight for a role that may not, and the card says why once,
        // below. The last one cannot go, and says so where it is pressed, as a gated act does.
        const last = emails.length <= 1;
        const held = broken || busy || last;
        const why = last
          ? "At least one address must stay — the receptionist has to be able to reach someone"
          : lockTitle;
        return (
          <RecordRow
            key={e}
            id={`notif-email-${i}`}
            label="Alerted"
            value={e}
            act={
              may
                ? {
                    label: "Remove",
                    name: `Remove ${e}`,
                    onClick: () => remove(e),
                    gate: held
                      ? {
                          "aria-disabled": true,
                          "data-tip": why || "Saving — wait for this one to land.",
                          onClick: (ev: { currentTarget: HTMLElement }) => showTip(ev.currentTarget),
                        }
                      : null,
                  }
                : null
            }
          />
        );
      })}
      <div className="set-invite">
        <RecordField
          id="notif-add"
          label={null}
          type="email"
          placeholder="owner@yourbusiness.com"
          value={email}
          disabled={broken || busy}
          title={lockTitle}
          onChange={setEmail}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          aria-label="Add an address to alert"
          {...gated}
        />
        <Button
          size="sm"
          variant="primary"
          disabled={broken || busy || !email.trim()}
          title={lockTitle}
          onClick={add}
          {...gated}
        >
          {busy ? "Saving…" : "Add"}
        </Button>
      </div>
      {!may && (
        <RecordRow
          id="notif-gate"
          label="Who can change this"
          value={<span data-testid="notif-gated">{gateTitle("settings", "change who is alerted")}</span>}
        />
      )}
    </section>
  );
}

/**
 * This device: the bell's own switch (legacy-bridge/notifications.ts), kept in this browser. It stood only in the bell's popover
 * and the account menu; the menu now says where it stands and opens this page, so the switch is here (Ruben, 7 Oct 2026). A
 * browser that refused says so, since only its own settings can let them through again; one that cannot alert draws nothing.
 */
function DeviceAlerts({ flash }: { flash: (f: LegacyFlash) => void }) {
  // The bell as the top bar holds it (`window.__notifs`), read through the surfaces' one door to the shell.
  const api = object<BellApi>("__notifs") ?? null;
  const [alerts, setAlerts] = useState(() => api?.alerts() ?? null);
  if (!api || !alerts?.can) return null;
  const blocked = alerts.permission === "denied";
  const set = async (on: boolean) => {
    await api.setAlerts(on);
    const next = api.alerts();
    setAlerts(next);
    if (on && !next.on) flash({ tone: "warn", msg: <>Alerts are blocked in your browser's settings for this site.</> });
  };
  return (
    <section className="rec-card set-card" data-testid="notif-device">
      <div className="rec-card-head">
        <h2 className="rec-card-title">This device</h2>
      </div>
      <RecordRow
        id="notif-device"
        label="Alert this device"
        value={
          <RecordSwitch
            labelledBy="rec-row-notif-device-key"
            on={alerts.on}
            readOnly={blocked}
            onChange={(on) => void set(on)}
            testid="notif-device-switch"
          />
        }
        hint={
          blocked
            ? "Your browser is blocking alerts from Chanlytics. Allow them in its settings for this site, then switch this on."
            : "A browser alert when something needs you, while Chanlytics is open in a tab. Kept on this device only."
        }
      />
    </section>
  );
}

/** What is sent, in contracts' groups: each kind's name, whether it goes to Chanlytics, and when it is sent as its tip. */
function kindsCard(): ReactNode {
  return (
    <section className="rec-card set-card" data-testid="notif-kinds">
      <div className="rec-card-head">
        <h2 className="rec-card-title">What you&apos;ll get</h2>
        <span className="rec-card-sub">{NOTIFICATION_PANE_WORDS.kinds}</span>
      </div>
      {NOTIFICATION_KIND_GROUPS.map((g) => (
        <div className="set-notif-group" key={g.title} data-testid="notif-group">
          <div className="set-sec-head">
            <h3 className="set-sec-title">{g.title}</h3>
          </div>
          {g.rows.map((k) => (
            <div className="set-row" key={k.title}>
              <div className="set-row-info">
                <span className="set-row-label">
                  {k.title}
                  {k.platform && <span className="chip set-notif-platform">to Chanlytics</span>}
                  <RecordTip text={k.what} label={`When this is sent: ${k.what}`} />
                </span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

/** How the alerts arrive: the bell's own alerts in the browser, the address they are sent from, and what is not sent. */
function howCard(from: string | undefined): ReactNode {
  return (
    <section className="rec-card set-card">
      <div className="rec-card-head">
        <h2 className="rec-card-title">How</h2>
      </div>
      {/* The bell's device alerts are real (notifications.ts: a browser notification while the app is open in the
          background), so "push notifications are not built" denied a switch one click away (S20). */}
      <RecordRow
        id="notif-how-browser"
        label="In your browser"
        value="Your browser can alert you too while Chanlytics is open in it: This device, above."
      />
      <RecordRow
        id="notif-how-from"
        label="Sent from"
        value={
          from ? (
            <>
              {NOTIFICATION_PANE_WORDS.sentFrom} <b>{from}</b>.
            </>
          ) : (
            NOTIFICATION_PANE_WORDS.sentFromPlatform
          )
        }
      />
      <RecordRow
        id="notif-how-not"
        label="Not sent"
        value="No text-message alerts, and no daily or weekly email. Today is the brief."
      />
    </section>
  );
}

export const PaneNotificationsReal = ({ flash }: { flash: (f: LegacyFlash) => void }) => {
  const read = useSurface("settings");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  // The route waits for the settings read before Settings draws; before it, there is nothing of this workspace to say.
  if (!read) return null;
  const settings = read.settings;
  const cfg: Config = (settings && settings.config) || {};
  const notif = cfg.notifications || {};
  const emails = Array.isArray(notif.escalation_emails) ? notif.escalation_emails : [];
  // Who may change who is alerted: the one gate, in contracts' words. It asked `__ME.role`, blind to an owner's View-as
  // preview, and put the reason in a title on disabled controls that no keyboard or finger reaches.
  const may = canDo("settings");
  const gated = gate("settings", "change who is alerted");
  // A save here writes the WHOLE config it read. When the config could not be read, what it read is {} — and saving
  // would replace the broken row with one holding nothing but these addresses.
  const broken = !!(settings && settings.broken);
  const lockTitle = broken
    ? "This workspace's settings can't be read — Chanlytics has to repair them before anything here can change"
    : undefined;

  const save = (nextEmails: string[], msg: ReactNode, undo: (() => void) | null = null) => {
    if (!settings) return;
    const next = { ...cfg, notifications: { ...notif, escalation_emails: nextEmails } };
    setBusy(true);
    void saveSettings(next, settings.version, () => {
      setBusy(false);
      flash({ msg, undo });
    }).then((r) => {
      if (r.ok) return;
      setBusy(false);
      flash({ tone: "danger", msg: <>{r.message}</> });
    });
  };
  const add = () => {
    const v = email.trim().toLowerCase();
    if (!EMAIL_SHAPE.test(v)) {
      flash({ tone: "warn", msg: <>That doesn&apos;t look like an email address.</> });
      return;
    }
    if (emails.includes(v)) {
      setEmail("");
      return;
    }
    if (emails.length >= MOST) {
      flash({ tone: "warn", msg: <>Up to ten addresses can be alerted.</> });
      return;
    }
    setEmail("");
    save(
      [...emails, v],
      <>
        <b>{v}</b> will be alerted from the next escalation
      </>,
    );
  };
  // Reversible, so it is not armed: the toast offers the address back.
  const remove = (v: string) =>
    save(
      emails.filter((e) => e !== v),
      <>
        <b>{v}</b> removed — no more alerts to that address
      </>,
      () =>
        save(
          emails,
          <>
            <b>{v}</b> is alerted again
          </>,
        ),
    );

  return (
    <>
      {recipientsCard({ emails, may, gated, broken, busy, lockTitle, email, setEmail, add, remove })}
      <DeviceAlerts flash={flash} />
      {kindsCard()}
      {howCard(notif.from)}
    </>
  );
};
