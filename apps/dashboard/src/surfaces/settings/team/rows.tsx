/**
 * Settings › Team, a row: a member or an invitation, its role, its one menu, and the question it asks on itself.
 *
 * A role a person may change is a quiet picker (the house MoreMenu, its items the roles with what each does under the
 * name, the one held ticked), everywhere else the plain word: the outline chip that drew every role looked the same as
 * the "You" beside it, and the role an owner could change looked fixed. Making someone Owner asks first, on the row:
 * it hands them billing and the power to remove everyone else, and it happened on one press. ⋯ holds what is not a
 * role: alerts on or off, Remove; on your own row your name and Leave. An invitation offers Resend, or Send again once
 * it expired, which renews it and emails it (00371), and ⋯ Revoke.
 *
 * Hookless, as the card's rows have always been: the card holds what is asked and what is busy, and hands each row its
 * acts. On a phone the role and ⋯ give way to the row's own press, which opens the person's sheet (sheet.tsx).
 */
import type { ReactNode } from "react";
import { TEAM_ROLES, roleSays } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Face } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { MoreMenu } from "../../kit/more-menu/more-menu";
import { StatePill } from "../../kit/pill/state-pill";
import { RecordSwitch } from "../../kit/record/field";
import { gatedProps } from "../../legacy-verbs";
import type { TeamPerson } from "./people";

/** What the card has asked on a row, and of whom. */
export type TeamAsk =
  | { kind: "remove"; id: string; stopAlerts: boolean }
  | { kind: "revoke"; id: string }
  | { kind: "promote"; id: string }
  | { kind: "leave"; id: string; dropAlerts: boolean };

/** What a row is handed: who may do what, what is asked and busy, and the card's acts. */
export interface RowActs {
  /** May change the team (an owner, as they act: View as narrows it). */
  canManage: boolean;
  /** May change who gets alerts (the settings permission). */
  mayAlerts: boolean;
  ask: TeamAsk | null;
  busy: boolean;
  /** Whether this member is the only owner. */
  lastOwner: (m: TeamPerson) => boolean;
  /** Why alerts may not be turned off for this member, or null where they may. */
  alertsHeld: (m: TeamPerson) => string | null;
  pickRole: (m: TeamPerson, role: string) => void;
  setAlerts: (m: TeamPerson, on: boolean) => void;
  arm: (ask: TeamAsk) => void;
  answer: (yes: boolean) => void;
  setStopAlerts: (on: boolean) => void;
  resend: (i: TeamPerson) => void;
  /** Your name, on Profile. */
  toProfile: () => void;
  /** The person's sheet, on a phone. */
  open: (p: TeamPerson) => void;
  resending: string | null;
}

/** The words under a member's name: their address where a name was given, the day they joined, and the alerts mark. */
function memberSub(m: TeamPerson): ReactNode {
  const parts: ReactNode[] = [m.sub, m.when].filter(Boolean);
  if (m.alerts)
    parts.push(
      <span key="alerts" className="set-team-alerts" data-testid={`team-alerts-${m.id}`}>
        <Icon name="bell" size={11} /> Gets alerts
      </span>,
    );
  return parts.map((p, i) => (
    <span key={i}>
      {i > 0 && " · "}
      {p}
    </span>
  ));
}

/** The role as the row says it: a picker where it may be changed, else the word. A partner's role is the attribution's. */
function roleOf(m: TeamPerson, k: RowActs): ReactNode {
  const words = roleSays(m.role);
  if (!k.canManage || m.isMe || m.kind !== "member" || m.role === "partner")
    return <span className="set-team-role-word">{words.label}</span>;
  return (
    <MoreMenu
      btnClass="btn btn-ghost btn-sm"
      label={words.label}
      title={`Change ${m.name}'s role`}
      testid={`team-role-${m.id}`}
      items={[
        { header: "Role" },
        ...TEAM_ROLES.map((r) => ({
          label: roleSays(r).label,
          meta: roleSays(r).short,
          metaBelow: true,
          checked: m.role === r,
          onClick: () => k.pickRole(m, r),
        })),
      ]}
    />
  );
}

/** ⋯ on someone else's row: alerts on or off, and Remove, which asks. */
function othersMenu(m: TeamPerson, k: RowActs) {
  const held = k.alertsHeld(m);
  return [
    ...(k.mayAlerts && m.email
      ? [
          {
            label: m.alerts ? "Stop emailing them alerts" : "Email them alerts",
            icon: "bell",
            onClick: () => k.setAlerts(m, !m.alerts),
            ...(k.busy
              ? { gate: gatedProps("Saving the last change…") }
              : m.alerts && held
                ? { gate: gatedProps(held) }
                : {}),
          },
          { divider: true },
        ]
      : []),
    {
      label: "Remove from team…",
      icon: "x",
      danger: true,
      onClick: () => k.arm({ kind: "remove", id: m.id, stopAlerts: m.alerts && !held }),
    },
  ];
}

/** ⋯ on your own row: your name, your alerts, and Leave, which asks, and which the only owner may not. */
function myMenu(m: TeamPerson, k: RowActs) {
  const held = k.alertsHeld(m);
  return [
    { label: m.sub ? "Change your name" : "Add your name", icon: "user", onClick: k.toProfile },
    ...(k.mayAlerts && m.email
      ? [
          {
            label: m.alerts ? "Stop emailing me alerts" : "Email me alerts",
            icon: "bell",
            onClick: () => k.setAlerts(m, !m.alerts),
            ...(k.busy
              ? { gate: gatedProps("Saving the last change…") }
              : m.alerts && held
                ? { gate: gatedProps(held) }
                : {}),
          },
        ]
      : []),
    { divider: true },
    {
      label: "Leave this workspace…",
      icon: "logout",
      danger: true,
      onClick: () => k.arm({ kind: "leave", id: m.id, dropAlerts: m.alerts && k.mayAlerts && !k.alertsHeld(m) }),
      ...(k.lastOwner(m) ? { gate: gatedProps("You're the only owner. Make someone else Owner first.") } : {}),
    },
  ];
}

/** The row's ⋯, or the room it would take, so every row's role stands in one column. */
function moreOf(m: TeamPerson, k: RowActs): ReactNode {
  const items = m.isMe ? myMenu(m, k) : k.canManage ? othersMenu(m, k) : null;
  if (!items) return <span className="set-team-spacer" />;
  return <MoreMenu items={items} title={m.isMe ? "More for you" : `More for ${m.name}`} testid={`team-more-${m.id}`} />;
}

/** A phone's press on the row: the person's sheet. Drawn on a desk too, and hidden there by the page's sheet. */
function personDoor(p: TeamPerson, k: RowActs): ReactNode {
  return (
    <Button
      size="sm"
      variant="quiet"
      iconOnly
      className="set-team-open"
      aria-label={p.isMe ? "Open your details" : `Open ${p.name}`}
      onClick={() => k.open(p)}
      data-testid={`team-open-${p.id}`}
    >
      <Icon name="chevron" size={12} />
    </Button>
  );
}

/** Removing a member asks, and offers to stop emailing them too while their address gets alerts. */
function removeAsk(m: TeamPerson, ask: Extract<TeamAsk, { kind: "remove" }>, k: RowActs): ReactNode {
  const held = m.alerts ? k.alertsHeld(m) : null;
  const detail = (
    <>
      They lose access at once; what they decided stays on the record.
      {m.alerts && !held && (
        <span className="set-team-also">
          <RecordSwitch
            labelledBy={`team-also-${m.id}`}
            on={ask.stopAlerts}
            onChange={k.setStopAlerts}
            testid="team-remove-alerts"
          />
          <span id={`team-also-${m.id}`}>Also stop emailing {m.email} alerts</span>
        </span>
      )}
      {m.alerts && held && (
        <span className="set-team-also">
          {m.email} still gets alerts: {held}
        </span>
      )}
    </>
  );
  return (
    <Confirm
      className="set-row-ask"
      question={`Remove ${m.name} from the team?`}
      detail={detail}
      yes="Yes, remove"
      danger
      busy={k.busy}
      onYes={() => k.answer(true)}
      onNo={() => k.answer(false)}
      testid="team-remove"
    />
  );
}

/** What leaving does, and what it does to the alerts your address gets: taken off with you, or an owner's to take off. */
function leaveDetail(p: TeamPerson, ask: TeamAsk): string {
  const gone = "You lose access at once. An owner can invite you again.";
  if (!p.alerts) return gone;
  if (ask.kind === "leave" && ask.dropAlerts) return `${gone} Your address comes off the alerts too.`;
  return `${gone} ${p.email} still gets alerts until an owner takes it off Notifications.`;
}

/** The question a row asks on itself, under it. */
function askOf(p: TeamPerson, ask: TeamAsk, k: RowActs): ReactNode {
  if (ask.kind === "remove") return removeAsk(p, ask, k);
  const says =
    ask.kind === "revoke"
      ? {
          question: `Revoke the invitation to ${p.email}?`,
          detail: "The link in their email stops working.",
          yes: "Yes, revoke",
          danger: true,
          testid: "team-remove",
        }
      : ask.kind === "promote"
        ? {
            question: `Make ${p.name} an Owner?`,
            detail: "Owners run billing and the team, and can remove anyone, you included.",
            yes: "Make Owner",
            danger: false,
            testid: "team-promote",
          }
        : {
            question: "Leave this workspace?",
            detail: leaveDetail(p, ask),
            yes: "Yes, leave",
            danger: true,
            testid: "team-leave",
          };
  return (
    <Confirm
      className="set-row-ask"
      {...says}
      busy={k.busy}
      onYes={() => k.answer(true)}
      onNo={() => k.answer(false)}
    />
  );
}

/** One member: their face, name and the words under it, their role, ⋯, and the question asked on them. */
export function memberRow(m: TeamPerson, k: RowActs): ReactNode {
  const asking = k.ask && k.ask.id === m.id ? k.ask : null;
  return (
    <div
      key={m.id}
      className="set-team-row"
      data-testid={`team-row-${m.id}`}
      data-me={m.isMe ? "true" : undefined}
      data-asking={asking ? "true" : undefined}
    >
      <Face className="set-team-face" initials={m.initials} />
      <span className="set-team-body">
        <span className="set-team-name" title={m.email || undefined}>
          <span className="set-team-who">{m.name}</span>
          {m.isMe && <span className="chip set-team-you">You</span>}
        </span>
        <span className="set-team-mail">{memberSub(m)}</span>
        <span className="set-team-role-line">{roleSays(m.role).label}</span>
      </span>
      <span className="set-team-role">{roleOf(m, k)}</span>
      <span className="set-team-acts">{moreOf(m, k)}</span>
      {personDoor(m, k)}
      {asking && askOf(m, asking, k)}
    </div>
  );
}

/** One invitation: its address, the role it gives and how long it has (or that it expired), Resend, and ⋯ Revoke. */
export function inviteRow(i: TeamPerson, k: RowActs): ReactNode {
  const asking = k.ask && k.ask.id === i.id ? k.ask : null;
  const sending = k.resending === i.id;
  return (
    <div
      key={i.id}
      className={`set-team-row pending${i.expired ? " expired" : ""}`}
      data-testid={`team-row-${i.id}`}
      data-asking={asking ? "true" : undefined}
    >
      <Face className="set-team-face" glyph={<Icon name="mail" size={13} />} />
      <span className="set-team-body">
        <span className="set-team-name" title={i.email}>
          {i.email}
        </span>
        <span className="set-team-mail">
          {i.expired && <StatePill kind="tone" value="warn" label="Expired" testid={`team-expired-${i.id}`} />}
          {[roleSays(i.role).label, i.when, i.left].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="set-team-role">
        {k.canManage && (
          <Button
            size="sm"
            variant={i.expired ? undefined : "quiet"}
            onClick={() => k.resend(i)}
            disabled={k.resending !== null}
            aria-busy={sending || undefined}
            data-testid={`team-resend-${i.id}`}
          >
            {sending ? "Sending…" : i.expired ? "Send again" : "Resend"}
          </Button>
        )}
      </span>
      <span className="set-team-acts">
        {k.canManage ? (
          <MoreMenu
            items={[
              {
                label: "Revoke invitation…",
                icon: "x",
                danger: true,
                onClick: () => k.arm({ kind: "revoke", id: i.id }),
              },
            ]}
            title={`More for ${i.email}`}
            testid={`team-more-${i.id}`}
          />
        ) : (
          <span className="set-team-spacer" />
        )}
      </span>
      {k.canManage && personDoor(i, k)}
      {asking && askOf(i, asking, k)}
    </div>
  );
}
