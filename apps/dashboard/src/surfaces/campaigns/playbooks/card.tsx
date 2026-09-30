/**
 * Campaigns › Playbooks: one playbook as a row of People's table, with its tile and its slot (moved from
 * legacy/pages/playbook-card.jsx, decision 0015; Reach out Part 2.5). The card a row opens into is card-detail.tsx.
 */
import { poolWords, reachLines } from "@chanlytics/contracts";
import { statePillPart } from "../../legacy-parts";
import { gate } from "../../legacy-verbs";
import { Icon } from "../../kit/icon/icon";
import { useSurface } from "../../use-surface";
import { cmRowPress } from "../parts/head";
import { CmSpark, CmReach } from "../parts/reach";
import { PlaybookCard, triggerOption } from "./card-detail";
import type { Flash, PlaybookRow } from "./card-detail";
import type { PlaybookTriggerOption } from "./surface";
import { PB_BLURBS, PB_NONE, pbIcon, pbPeople, pbReplyTip, pbStatus } from "./words";

interface TileProps {
  p: PlaybookRow;
  canAct: boolean;
  onEdit: (p: PlaybookRow) => void;
  flash: Flash;
  open?: boolean;
  onOpen: () => void;
  focus?: boolean;
}

/**
 * Who a run reaches: the people on the list who said yes and have not heard from a playbook this week. Paused, nobody --
 * and the bar says so. Waiting on the owner, the run it holds. Everyone its moment names -- the list, everyone in People,
 * the day's visits -- as the server counts them with the runner's own rules. The bar is the whole of them: green reaches,
 * amber waits, and the grey is who no run reaches whatever the week (never said yes, asked to stop, no number). It
 * counted only who said yes, so the people who never did were in no number on the page, and they are the one part an
 * owner can change.
 *
 * Who its moment reaches could not be counted (the server's read failed): the page says so once, over the cards, and the
 * tile draws no count. It drew "0 of 0 who said yes", a zero nobody counted.
 */
function tileReach(p: PlaybookRow, trig: PlaybookTriggerOption | null) {
  const waiting = p.totals.waiting;
  const paused = p.state === "paused";
  const named = p.named || (trig && trig.named) || null;
  if (named === null || p.candidates === null || p.held === null) return false;
  // Past the cap the rest go next time; a reminder is owed to every visit, uncapped (eligibleForPlaybook).
  const capped =
    !paused && !waiting && !(trig && trig.kind === "visit") ? Math.max(0, p.candidates - p.cap_per_run) : 0;
  const will = paused ? 0 : waiting ? (waiting.recipient_count ?? p.candidates) : p.candidates - capped;
  // A paused playbook counts nobody of its own, so its moment's count says how
  // many it is not reaching.
  const reachable = Math.max(p.candidates + p.held, trig ? (trig.candidates || 0) + (trig.held || 0) : 0);
  const pool = Math.max(will, named.pool);
  // Paused, everyone it could reach waits on the pause: the amber is all of them.
  const held = paused ? reachable : p.held;
  // A run sends `template_language` to everyone on it (run-playbook.ts), so a
  // language the message lacks holds nobody back and is not a reason here.
  // Why the rest are not reached, in the approval sheet's words (contracts
  // reachLines), the most first -- and "Get their yes" on the one an owner can
  // change. Three at most: a card is a glance, and the rest open with it.
  const lines = (
    reachLines(
      {
        pool: named.pool,
        will,
        noNumber: named.noNumber,
        stopped: named.stopped,
        noYes: named.noYes,
        heardThis: 0,
        heardAny: paused ? 0 : p.held,
        overCap: capped,
        overLimit: 0,
      },
      p,
    )?.lines ?? []
  ).map((l) => ({ t: l.words, tone: l.tone, door: l.door }));
  const reasons = [...(paused ? [{ t: "paused — nothing goes out", tone: "warn" as const }] : []), ...lines].slice(
    0,
    3,
  );
  return (
    <CmReach
      will={will}
      pool={pool}
      of={poolWords(p.trigger)}
      held={held}
      reasons={reasons.length ? reasons : [{ t: "nobody held back", tone: "plain" }]}
      size="sm"
      testid="pb-tile-reach"
    />
  );
}

/**
 * A run waiting on the owner: the line says what the press does, and the press opens the row where Approve and Skip are.
 * Paused, the pill beside it says so in its tone; the cell says what that means for the clock. Waiting, the words open the
 * row where Approve and Skip are -- a press only while it is closed: open, they are the row's words, and a press that
 * closed the row took Approve away with it. The column's head is a desk's and hidden from a screen reader, so "Next run"
 * rides the words for both (a phone draws no head).
 */
function tileNext(p: PlaybookRow, open: boolean, onOpen: () => void) {
  const waiting = p.totals.waiting;
  const paused = p.state === "paused";
  const hour = `${String(p.run_hour).padStart(2, "0")}:00`;
  return waiting ? (
    open ? (
      <span className="pb-tile-next">Approve it and it goes at {hour}</span>
    ) : (
      <button type="button" className="pb-tile-next" onClick={onOpen} data-testid="pb-tile-approve">
        Approve it and it goes at {hour}
      </button>
    )
  ) : (
    <span className="pb-tile-next">
      {paused ? (
        "Not running"
      ) : p.off ? (
        "Not while deals are off"
      ) : (
        <>
          <span className="pb-next-k">Next run </span>
          {p.next}
        </>
      )}
    </span>
  );
}

/**
 * A playbook, as a row of People's table: what starts it, with the one language its
 * runs go out in; its state; who it will actually reach, with the people it holds
 * back named; when it runs next; and the shape of its last runs beside their count.
 * Pressed anywhere, it opens in place under itself into its detail -- the message as
 * a customer sees it, its runs, and every verb (PlaybookCard, bare) -- as a template
 * opens under its row. It was a card of five stacked blocks, 221-258px tall on a desk
 * and 174-290px on a phone, where a person's row is 84.
 */
export function PlaybookTile({ p, canAct, onEdit, flash, open = false, onOpen, focus = false }: TileProps) {
  const surface = useSurface("playbooks");
  const StatePill = statePillPart();
  const status = pbStatus(p);
  const trig = triggerOption(surface, p.trigger);
  const spark = (p.totals.history || PB_NONE)
    .slice(0, 6)
    .reverse()
    .map((h) => h.sent || 0);
  return (
    <section
      id={`pb-${p.id}`}
      className={`pb-row${open ? " is-open" : ""}${focus ? " is-focus" : ""}`}
      data-testid="pb-card"
      data-state={status}
    >
      {/* A press anywhere on the line that is not one of its controls opens it (cmRowPress), as a person's row does. */}
      <div className="pb-row-line" role="presentation" onClick={cmRowPress}>
        <button
          type="button"
          className="pb-row-what"
          onClick={onOpen}
          aria-expanded={open}
          data-row-open
          data-testid="pb-open"
        >
          <span className="mark pb-row-mark" aria-hidden="true">
            <Icon name={pbIcon(p.trigger)} size={13} />
          </span>
          <span className="pb-row-titles">
            <span className="pb-row-name">{p.name}</span>
            {/* What starts it. The message and the one language its runs go out in are the
                open row's caption ("Win-back · English"): a run sends one language to
                everyone, and a language tag on every row said nothing an owner acts on. */}
            <span className="pb-row-hint">{p.triggerHint}</span>
          </span>
        </button>
        <span className="pb-row-state">
          <StatePill
            kind="playbook"
            value={status === "paused" ? "paused" : status === "approval" ? "approval" : "running"}
          />
        </span>
        <span className="pb-row-reach">{tileReach(p, trig)}</span>
        <span className="pb-row-next">{tileNext(p, open, onOpen)}</span>
        <span className="pb-row-runs">
          <CmSpark
            values={spark}
            label={spark.length ? `The last ${spark.length} runs sent ${spark.join(", ")}` : null}
          />
          {/* What its runs earned, behind the count: the row keeps to its line, and the
              numbers are a hover, a focus or a tap away -- with what "wrote back"
              counts (the reply window). */}
          <span
            className="pb-tile-runs"
            // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- as the JSX drew it (decision 0015)
            tabIndex={0}
            data-tip={`${p.totals.sent} sent, ${p.totals.delivered} delivered, ${p.totals.replied} wrote back. ${pbReplyTip()}.`}
            data-testid="pb-tile-runs"
          >
            <span className="tabular">{p.totals.runs}</span> {p.totals.runs === 1 ? "run" : "runs"}
          </span>
        </span>
      </div>
      {open && (
        <div className="pb-row-open">
          <PlaybookCard p={p} canAct={canAct} onEdit={onEdit} flash={flash} bare />
        </div>
      )}
    </section>
  );
}

interface SlotProps {
  t: PlaybookTriggerOption;
  onStart: (id: string) => void;
}

/**
 * A moment nobody is using: its name, what starts it and who it would reach today,
 * and one press to set it up. What it is for (the blurb) is the tile's hover.
 *
 * PLAYBOOK_TRIGGERS is a CLOSED set, and the page drew only the ones somebody had
 * made, so the moments nobody had set up were simply absent -- the surest way to
 * get more out of Campaigns was the one thing it never mentioned. They stayed, but
 * as full cards with a paragraph each: five of the eight cards on the salon's page,
 * 179-258px apiece, around the three that work. They are a compact group under the
 * playbooks now. The count is the surface's own for that trigger: who it would
 * reach TODAY.
 */
export function PlaybookSlot({ t, onStart }: SlotProps) {
  return (
    <section className="pb-slot" data-testid="pb-slot" data-trigger={t.id} data-tip={PB_BLURBS[t.id] || undefined}>
      <span className="mark pb-slot-mark" aria-hidden="true">
        <Icon name={pbIcon(t.id)} size={13} />
      </span>
      <span className="pb-slot-titles">
        {/* Who it would reach today rides the name, where an ellipsis never takes it; what starts it is the line under. */}
        <span className="pb-slot-name">
          <span className="pb-slot-label">{t.label}</span>
          {/* A moment the server could not count says no number at all (the page says why, once). */}
          {t.candidates === null ? null : (
            <span className="pb-slot-who" data-testid="pb-slot-who">
              {t.candidates > 0 ? `${pbPeople(t.candidates)} today` : "Nobody today"}
            </span>
          )}
        </span>
        <span className="pb-slot-hint">{t.hint}</span>
      </span>
      {/* What the moment is for is the tile's hover, and Set up's description, so a keyboard and a screen reader have it. */}
      {/* eslint-disable-next-line jsx-a11y-x/role-supports-aria-props -- as the JSX drew it (decision 0015) */}
      <button
        className="btn btn-sm pb-slot-start"
        onClick={() => onStart(t.id)}
        aria-description={PB_BLURBS[t.id] || undefined}
        data-testid="pb-slot-start"
        {...gate("approve", "start a playbook")}
      >
        <Icon name="plus" size={11} /> Set up
      </button>
    </section>
  );
}
