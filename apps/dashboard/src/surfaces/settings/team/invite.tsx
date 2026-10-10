/**
 * Settings › Team, inviting: several addresses at once, the role they join as with what it does, and then what
 * happened to each, in the server's own words.
 *
 * The card took one address at a time and said nothing of the role it gave. Here an address is taken as it is typed,
 * pasted or separated (commas, spaces, new lines), each a chip that a press takes off; the role is one of the two an
 * invitation may give, each with its sentence (contracts ROLE_SAYS); an owner is made from a member, never invited
 * (the invite route's rule: a mistyped owner's address would hand over the workspace), and the panel says how.
 *
 * Each address goes to the server in turn, and its answer is said apart: emailed, joined at once (an account that
 * exists), already waiting (with Resend), already on the team, or refused in the server's sentence. The invitations'
 * bucket is ten an hour: where the server says no more, the rest are said as not sent, never as sent.
 */
import { useState, type ReactNode } from "react";
import { TEAM_INVITE_DAYS, roleSays } from "@chanlytics/contracts";
import { teamVerbs } from "@/legacy-bridge/inbox-verbs";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Panel } from "../../kit/panel/panel";
import { Press } from "../../kit/press";
import { RecordField } from "../../kit/record/field";
import { Segmented } from "../../kit/segmented/segmented";
import { editorBox, focusAsDrawn, type LegacyFlash } from "../../legacy-verbs";
import { EMAIL_SHAPE } from "../shared";
import { onTheCard, type TeamPerson } from "./people";

type InviteRole = "operator" | "viewer";

/** What happened to one address. */
interface Said {
  email: string;
  done: boolean;
  words: ReactNode;
  /** An invitation already waiting for it, which Resend sends again. */
  resend?: string;
}

/**
 * The addresses in what was typed or pasted, lowercased, each once; and what is left still being typed. A list pasted
 * from a mail's To line ("Ana Perez <ana@shop.example>, …") holds names beside its addresses: where the words hold an
 * address, the words without an @ are names, and are left out. One word typed alone is checked, so "nobody" is said
 * not to be an address.
 */
function addressesIn(typed: string, finished: boolean): { found: string[]; rest: string } {
  const parts = typed.split(/[\s,;<>()"']+/);
  const rest = finished ? "" : (parts.pop() ?? "");
  const words = parts.map((p) => p.trim().toLowerCase()).filter(Boolean);
  const withAt = words.filter((w) => w.includes("@"));
  return { found: [...new Set(withAt.length ? withAt : words)], rest };
}

/** What the server's answer to one invitation says happened. */
function saidOf(email: string, role: InviteRole, d: Record<string, unknown>): Said {
  const as = roleSays(role).label;
  if (d.alreadyMember) return { email, done: false, words: "is already on the team" };
  if (d.added) return { email, done: true, words: `already had an account and joined as ${as}` };
  if (d.alreadyInvited) return { email, done: false, words: "already has an invitation waiting" };
  return { email, done: true, words: `invitation emailed, open for ${TEAM_INVITE_DAYS} days, as ${as}` };
}

/**
 * Each address to the server in turn, and what happened to it. One already on the card is said, not sent (an invitation
 * waiting offers its Resend); where the invitations' bucket says no more, the rest are said as not sent.
 */
async function inviteEach(to: readonly string[], people: readonly TeamPerson[], role: InviteRole): Promise<Said[]> {
  const out: Said[] = [];
  let stopped: string | null = null;
  for (const email of to) {
    const there = people.find((p) => onTheCard([p], email));
    if (stopped) out.push({ email, done: false, words: `not sent: ${stopped}` });
    else if (there)
      out.push(
        there.kind === "member"
          ? { email, done: false, words: "is already on the team" }
          : { email, done: false, words: "already has an invitation waiting", resend: there.id },
      );
    else {
      const r = await teamVerbs.invite(email, role);
      if (r.ok) out.push(saidOf(email, role, (r.data ?? {}) as Record<string, unknown>));
      else {
        if (r.status === 429) stopped = r.message;
        out.push({ email, done: false, words: r.status === 429 ? `not sent: ${r.message}` : r.message });
      }
    }
  }
  return out;
}

/** What the card flashes once every address was answered. */
function sentFlash(out: readonly Said[]): LegacyFlash {
  const sent = out.filter((s) => s.done).length;
  if (sent === out.length)
    return { tone: "ok", msg: <>{sent === 1 ? "Invitation sent" : `${sent} invitations sent`}</> };
  return {
    tone: "warn",
    msg: (
      <>
        {sent} of {out.length} sent: see the team card
      </>
    ),
  };
}

/** What happened to each address, with Resend where one was already waiting; then Invite more, or Done. */
function saidView(said: readonly Said[], onResend: (id: string) => void, again: () => void, onClose: () => void) {
  return (
    <Panel variant="inset" className="set-team-invite" data-testid="team-invite">
      <ul className="set-team-said" data-testid="team-invite-said">
        {said.map((s) => (
          <li key={s.email} data-done={s.done ? "true" : undefined}>
            <Icon name={s.done ? "check" : "dot"} size={13} />
            <span>
              <b>{s.email}</b> {s.words}
            </span>
            {s.resend && (
              <LinkButton onClick={() => onResend(s.resend as string)} data-testid="team-invite-resend">
                Resend it
              </LinkButton>
            )}
          </li>
        ))}
      </ul>
      <div className="set-team-invite-foot">
        <Button size="sm" onClick={again}>
          Invite more
        </Button>
        <Button size="sm" variant="quiet" onClick={onClose} data-testid="team-invite-done">
          Done
        </Button>
      </div>
    </Panel>
  );
}

/** The invitation being written, and what happened once it was sent. */
export function TeamInvite({
  people,
  flash,
  onResend,
  onClose,
}: {
  people: readonly TeamPerson[];
  flash: (f: LegacyFlash) => void;
  /** The card's Resend, which says what happened. */
  onResend: (invitationId: string) => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [addresses, setAddresses] = useState<string[]>([]);
  const [role, setRole] = useState<InviteRole>("operator");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Said[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  /** What was typed, taken into the chips; what is left stays in the box, and what is not an address is said. */
  const take = (words: string, finished: boolean): { next: string[]; bad: string[] } => {
    const { found, rest } = addressesIn(words, finished);
    const bad = found.filter((a) => !EMAIL_SHAPE.test(a));
    const next = [...new Set([...addresses, ...found.filter((a) => EMAIL_SHAPE.test(a))])];
    setAddresses(next);
    setTyped(bad.length ? [...bad, rest].filter(Boolean).join(" ") : rest);
    setProblem(
      bad.length ? `${bad.join(", ")} ${bad.length === 1 ? "doesn't" : "don't"} look like an email address` : null,
    );
    return { next, bad };
  };

  const send = async () => {
    // Enter while the addresses are on their way sends nothing twice.
    if (busy) return;
    const { next: to, bad } = take(typed, true);
    // An address that is not one is said under the box, and nothing goes until it is put right.
    if (bad.length) return;
    if (!to.length) {
      setProblem("Type an address first");
      return;
    }
    setBusy(true);
    const out = await inviteEach(to, people, role);
    setBusy(false);
    setAddresses([]);
    setSaid(out);
    flash(sentFlash(out));
  };

  if (said) return saidView(said, onResend, () => setSaid(null), onClose);

  const n = addresses.length + (typed.trim() ? 1 : 0);
  return (
    <Panel variant="inset" className="set-team-invite" data-testid="team-invite" {...editorBox}>
      <div className="set-team-invite-head">
        <h3 className="set-team-invite-title">Invite people</h3>
        <span className="set-team-invite-sub">They get an email to join this workspace.</span>
      </div>
      {addresses.length > 0 && (
        <div className="set-team-addresses" data-testid="team-invite-addresses">
          {addresses.map((a) => (
            <Press
              key={a}
              className="chip"
              aria-label={`Take ${a} off`}
              onClick={() => setAddresses(addresses.filter((x) => x !== a))}
            >
              {a}
              <Icon name="x" size={9} />
            </Press>
          ))}
        </div>
      )}
      <RecordField
        id="team-invite-email"
        label="Email addresses"
        // Text with the email keyboard, not type="email": that type drops a trailing space as it is typed, so a space
        // between two addresses never reached the box to separate them.
        type="text"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        placeholder={addresses.length ? "Add another…" : "teammate@email.com"}
        value={typed}
        hint="Paste several at once: commas, spaces or new lines."
        problem={problem}
        onChange={(v) => {
          setProblem(null);
          if (/[\s,;]/.test(v)) take(v, false);
          else setTyped(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (typed.trim()) take(typed, true);
            else if (addresses.length) void send();
          } else if (e.key === "Backspace" && !typed && addresses.length) setAddresses(addresses.slice(0, -1));
        }}
        // eslint-disable-next-line jsx-a11y-x/no-autofocus -- the box opens on a press that asked for it; not on a touch screen
        autoFocus={focusAsDrawn()}
        data-testid="team-invite-email"
      />
      <Segmented
        label="They join as"
        value={role}
        onValueChange={setRole}
        options={(["operator", "viewer"] as const).map((r) => ({
          value: r,
          label: roleSays(r).label,
          hint: roleSays(r).can,
          testid: `team-invite-${r}`,
        }))}
      />
      <p className="set-team-invite-note">
        Another owner? Invite them as Operator, then make them Owner from their row.
      </p>
      <div className="set-team-invite-foot">
        <Button size="sm" variant="quiet" onClick={onClose} data-testid="team-invite-cancel">
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => void send()}
          disabled={busy || n === 0}
          data-testid="team-invite-send"
        >
          {busy ? "Sending…" : n > 1 ? `Send ${n} invitations` : "Send invitation"}
        </Button>
      </div>
    </Panel>
  );
}
