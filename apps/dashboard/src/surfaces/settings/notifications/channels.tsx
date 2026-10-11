/**
 * Settings › Notifications' first card (decision 0040): where alerts reach you. The bell, always; the business's email
 * addresses, a teammate's by their face and name, changed in place under the row; the member's own phones, where they
 * have one; and this browser, where a browser can alert. Every word is contracts' (ALERT_PANE_WORDS).
 */
import { useState, type ReactNode } from "react";
import { personInitials, type PhoneDto } from "@chanlytics/contracts";
import { ALERT_ADDRESSES_MIN, ALERT_PANE_WORDS as W, phoneLine } from "@chanlytics/contracts/alert-pane";
import type { BellApi } from "@/legacy-bridge/notifications";
import { Button } from "../../kit/button/button";
import { Face } from "../../kit/face/face";
import { LinkButton } from "../../kit/link-button/link-button";
import { StatePill } from "../../kit/pill/state-pill";
import { RecordField, RecordSwitch } from "../../kit/record/field";
import { RecordChips, RecordRow } from "../../kit/record/row";
import { gateTitle, showTip, type GateProps, type LegacyFlash } from "../../legacy-verbs";
import { object } from "../../shell-doors";

/** An address on the list, and whose it is: a teammate's name and face, "you", or no teammate. */
interface AlertAddress {
  email: string;
  /** Whether a teammate's address it is. */
  teammate: boolean;
  /** The name the teammate gave; null for none, and for an address that is no teammate's. */
  name: string | null;
  initials: string;
  you: boolean;
}

/** A teammate whose address is not on the list: one press adds it. */
interface AlertTeammate {
  email: string;
  name: string;
}

/** What the email row is handed: the list, who may change it, and the pane's own acts. */
interface EmailRowProps {
  addresses: AlertAddress[];
  teammates: AlertTeammate[];
  may: boolean;
  gated: GateProps;
  /** A sentence where nothing here can change (a config that cannot be read), else null. */
  locked: string | null;
  busy: boolean;
  testing: boolean;
  add: (email: string) => void;
  remove: (email: string) => void;
  test: () => void;
}

/** A held press: the reason said where it is pressed, as a gated act says it. */
const heldPress = (why: string): GateProps => ({
  "aria-disabled": true,
  "data-tip": why,
  onClick: (e) => showTip(e.currentTarget),
});

/** The addresses as chips: a teammate by name, "you" beside the member's own, any other by the address itself. */
function addressChips(addresses: AlertAddress[]): ReactNode {
  return (
    <RecordChips
      chips={addresses.map((a) => ({ label: a.name ?? a.email, meta: a.you ? W.you : null }))}
      max={3}
      more={(n) => W.emailMore(n)}
      testid="ntf-email-chips"
    />
  );
}

/** One address in the editor: whose it is, and its Remove for a role that may. The last one cannot go, and says why. */
function addressLine(a: AlertAddress, o: EmailRowProps, last: boolean): ReactNode {
  const why = last ? "At least one address must stay — the receptionist has to be able to reach someone" : o.locked;
  return (
    <li key={a.email} className="ntf-addr" data-testid="ntf-address">
      <Face initials={a.teammate ? a.initials : "@"} size="sm" />
      <span className="ntf-addr-who">
        <span className="ntf-addr-mail">{a.email}</span>
        <span className="ntf-addr-sub">
          {a.teammate ? `${a.name ?? W.onTeam}${a.you ? ` · ${W.you}` : ""}` : W.notOnTeam}
        </span>
      </span>
      {o.may && (
        <LinkButton
          aria-label={`Remove ${a.email}`}
          onClick={() => o.remove(a.email)}
          {...(why || o.busy ? heldPress(why || "Saving — wait for this one to land.") : {})}
        >
          Remove
        </LinkButton>
      )}
    </li>
  );
}

/** The editor under the email row: the addresses, the box an address is added from, teammates in one press, a test. */
function EmailEditor(o: EmailRowProps) {
  const [email, setEmail] = useState("");
  const add = () => {
    o.add(email);
    setEmail("");
  };
  const shut = !!o.locked || o.busy;
  return (
    <div className="ntf-email-edit" data-testid="ntf-email-edit">
      <ul className="ntf-addrs">
        {o.addresses.map((a) => addressLine(a, o, o.addresses.length <= ALERT_ADDRESSES_MIN))}
      </ul>
      {/* The box and its Add are drawn for every role, gated where the role may not (the one gate): pressing says why. */}
      <div className="ntf-addbar">
        <RecordField
          id="ntf-add"
          label={null}
          type="email"
          placeholder={W.addPlaceholder}
          value={email}
          disabled={shut}
          title={o.locked ?? undefined}
          onChange={setEmail}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          aria-label={W.addLabel}
          {...o.gated}
        />
        <Button
          size="sm"
          variant="primary"
          disabled={shut || !email.trim()}
          title={o.locked ?? undefined}
          onClick={add}
          {...o.gated}
        >
          {o.busy ? "Saving…" : "Add"}
        </Button>
      </div>
      {o.may ? (
        <>
          {o.teammates.length > 0 && (
            <p className="ntf-teammates" data-testid="ntf-teammates">
              <span>{W.teammates}</span>
              {o.teammates.map((t) => (
                <LinkButton
                  key={t.email}
                  aria-label={`Email ${t.name} too`}
                  onClick={() => o.add(t.email)}
                  {...(shut ? heldPress(o.locked || "Saving — wait for this one to land.") : {})}
                >
                  + {t.name}
                </LinkButton>
              ))}
            </p>
          )}
          <p className="ntf-email-foot">
            <span>{W.emailFoot}</span>
            {o.addresses.length > 0 && (
              <LinkButton
                onClick={o.test}
                data-testid="ntf-test"
                {...(o.testing ? heldPress(W.testing) : o.locked ? heldPress(o.locked) : {})}
              >
                {o.testing ? W.testing : W.test}
              </LinkButton>
            )}
          </p>
        </>
      ) : (
        <p className="ntf-email-foot" data-testid="ntf-gated">
          {gateTitle("settings", "change who is emailed")}
        </p>
      )}
    </div>
  );
}

/** The email row: the addresses as chips, Change to open the editor under it. With none, it says so and is open. */
function EmailRow(o: EmailRowProps) {
  const none = o.addresses.length === 0;
  const [open, setOpen] = useState(none);
  const shown = open || none;
  return (
    <RecordRow
      id="ntf-email"
      label={W.email}
      value={none ? <StatePill kind="tone" value="warn" label={W.emailNobody} /> : addressChips(o.addresses)}
      hint={none ? W.emailNobodyHint : null}
      act={
        none ? null : { label: shown ? W.done : W.change, onClick: () => setOpen(!shown), testid: "ntf-email-change" }
      }
    >
      {shown ? <EmailEditor {...o} /> : null}
    </RecordRow>
  );
}

/** The member's own phones: what each is and when it was last seen. Drawn only where they have one. */
function PhonesRow({ phones, now }: { phones: PhoneDto[]; now: number }) {
  return (
    <RecordRow
      id="ntf-phones"
      label={W.phone(phones.length)}
      value={
        <span className="ntf-phones">
          {phones.map((p, i) => (
            <span key={i}>{phoneLine(p, now)}</span>
          ))}
        </span>
      }
      hint={W.phoneHint}
    />
  );
}

/**
 * This browser: the bell's own switch (legacy-bridge/notifications.ts), kept in this browser, the same one the bell's
 * popover and the account menu stand on. Drawn only where a browser can alert (never in the phone app's view); one that
 * refused says so, since only its own settings can let alerts through again.
 */
function BrowserRow({ flash }: { flash: (f: LegacyFlash) => void }) {
  const api = object<BellApi>("__notifs") ?? null;
  const [alerts, setAlerts] = useState(() => api?.alerts() ?? null);
  if (!api || !alerts?.can) return null;
  const blocked = alerts.permission === "denied";
  const set = async (on: boolean) => {
    await api.setAlerts(on);
    const next = api.alerts();
    setAlerts(next);
    if (on && !next.on)
      flash({ tone: "warn", msg: <>Alerts are blocked in your browser&apos;s settings for this site.</> });
  };
  return (
    <RecordRow
      id="ntf-browser"
      label={W.browser}
      value={
        <span className="ntf-browser">
          <span>{W.browserValue}</span>
          <RecordSwitch
            labelledBy="rec-row-ntf-browser-key"
            on={alerts.on}
            readOnly={blocked}
            onChange={(on) => void set(on)}
            testid="ntf-browser-switch"
          />
        </span>
      }
      hint={blocked ? W.browserBlocked : W.browserHint}
    />
  );
}

/** The card: the bell, the email, the phones where there are any, and this browser where it can alert. */
export function ChannelsCard({
  email,
  phones,
  flash,
  now,
}: {
  email: EmailRowProps;
  phones: PhoneDto[];
  flash: (f: LegacyFlash) => void;
  now: number;
}) {
  return (
    <section className="rec-card set-card" data-testid="ntf-channels">
      <div className="rec-card-head">
        <h2 className="rec-card-title">{W.where}</h2>
        <span className="rec-card-sub">{W.whereSub}</span>
      </div>
      <RecordRow
        id="ntf-bell"
        label={W.bell}
        value={
          <span className="ntf-bell">
            <span>{W.bellValue}</span>
            <StatePill kind="tone" value="ok" label={W.bellOn} />
          </span>
        }
      />
      <EmailRow {...email} />
      {phones.length > 0 && <PhonesRow phones={phones} now={now} />}
      <BrowserRow flash={flash} />
    </section>
  );
}

/** Each address on the list, said whose it is by the roster: a teammate's name and face, and "you" for the member's own. */
export function addressesOf(
  emails: readonly string[],
  team: readonly { email: string | null; displayName: string }[] | null | undefined,
  me: string | null,
): AlertAddress[] {
  const key = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();
  return emails.map((email) => {
    const m = (team ?? []).find((t) => key(t.email) === key(email));
    const name = m?.displayName.trim() || null;
    return {
      email,
      teammate: !!m,
      name,
      initials: personInitials(name, email),
      you: !!me && key(me) === key(email),
    };
  });
}
