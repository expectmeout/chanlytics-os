/**
 * Settings › Notifications on a real workspace (moved from legacy/pages/settings.jsx, decision 0015 step 11): who is
 * alerted, and what they are alerted about.
 *
 * What the system actually does: it emails the addresses in notifications.escalation_emails, for the kinds of alert the
 * edge really sends, and nothing else. No switch is offered that no code reads. The kinds, grouped (Customers,
 * Reach-outs, To Chanlytics), and when each is sent, are contracts' (notification-kinds.ts). Settings' page
 * (settings.jsx) still draws it by its old name, which seed-globals publishes (settings/globals.ts), until Settings'
 * frame moves; the mockup's seeded twin (six switches kept in the browser, which nothing read) left with it.
 */
import { useState, type ReactNode } from "react";
import { NOTIFICATION_KIND_GROUPS, type NotificationsConfig } from "@chanlytics/contracts";
import { saveSettings } from "@/legacy-bridge/inbox-verbs";
import type { WorkspaceSettings } from "@/legacy-bridge/surfaces/settings";
import { Icon } from "../../kit/icon/icon";
import { canDo, gate, gateTitle, showTip, type GateProps, type LegacyFlash } from "../../legacy-verbs";
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
    <section className="fl-card set-card" data-testid="notif-recipients">
      <div className="fl-card-head">
        <h2 className="fl-card-title">Who gets alerted</h2>
        <span className="fl-card-sub">
          Every alert below goes to each of these, except the two marked for Chanlytics.
        </span>
      </div>
      {emails.length === 0 && (
        <div className="set-row">
          <div className="set-row-info">
            <span className="set-row-label">Nobody yet</span>
            <span className="set-row-hint">
              Until an address is added, the platform operator receives a notice that this workspace needs attention —
              without the customer&apos;s message, which is withheld rather than sent to a stranger.
            </span>
          </div>
        </div>
      )}
      {emails.map((e) => (
        <div className="set-row" key={e}>
          <div className="set-row-info">
            <span className="set-row-label">{e}</span>
          </div>
          {/* Removing an address is an item's own act: out of sight for a role that may not, and the card says why
              once, below. */}
          {may && (
            <button
              className="btn btn-ghost btn-sm"
              disabled={broken || busy || emails.length <= 1}
              title={
                emails.length <= 1
                  ? "At least one address must stay — the receptionist has to be able to reach someone"
                  : lockTitle
              }
              onClick={() => remove(e)}
            >
              <Icon name="x" size={11} /> Remove
            </button>
          )}
        </div>
      ))}
      <div className="set-row">
        <div className="set-row-info" style={{ flex: 1 }}>
          <input
            className="sd-input"
            type="email"
            placeholder="owner@yourbusiness.com"
            value={email}
            disabled={broken || busy}
            title={lockTitle}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            aria-label="Add an address to alert"
            {...gated}
          />
        </div>
        <button
          className="btn btn-primary btn-sm"
          disabled={broken || busy || !email.trim()}
          title={lockTitle}
          onClick={add}
          {...gated}
        >
          {busy ? "Saving…" : "Add"}
        </button>
      </div>
      {!may && (
        <div className="set-row">
          <div className="set-row-info">
            <span className="set-row-hint" data-testid="notif-gated">
              <Icon name="shield" size={11} /> {gateTitle("settings", "change who is alerted")}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

/** What is sent, in contracts' groups: each kind's name, whether it goes to Chanlytics, and when it is sent as its tip. */
function kindsCard(): ReactNode {
  return (
    <section className="fl-card set-card" data-testid="notif-kinds">
      <div className="fl-card-head">
        <h2 className="fl-card-title">What you&apos;ll get</h2>
        <span className="fl-card-sub">
          By email, the moment it happens; the day&apos;s reach-out numbers are a line in the bell.
        </span>
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
                  <button
                    type="button"
                    className="set-mark"
                    data-tip={k.what}
                    aria-label={`When this is sent: ${k.what}`}
                    onClick={(e) => showTip(e.currentTarget)}
                  >
                    <Icon name="info" size={12} />
                  </button>
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
    <section className="fl-card set-card">
      <div className="fl-card-head">
        <h2 className="fl-card-title">How</h2>
      </div>
      <ul className="st-bullets">
        {/* The bell's device alerts are real (notifications.ts: a browser notification while the app is open in the
            background), so "push notifications are not built" denied a switch one click away (S20). */}
        <li>
          <Icon name="check" size={11} />
          <span>Your browser can alert you too while Chanlytics is open in it — switch alerts on from the bell.</span>
        </li>
        <li>
          <Icon name="check" size={11} />
          <span>
            Sent from {from ? <b>{from}</b> : "the Chanlytics alert address"}
            {from ? "" : " until your own sending domain is verified"}.
          </span>
        </li>
        <li>
          <Icon name="check" size={11} />
          <span>No text-message alerts, and no daily or weekly email. Today is the brief.</span>
        </li>
      </ul>
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
      {kindsCard()}
      {howCard(notif.from)}
    </>
  );
};
