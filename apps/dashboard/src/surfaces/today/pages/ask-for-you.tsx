/**
 * Ask for you (decision 0070; the operator's D7, "a card on Today and a line in the bell, never a pop-up"): what Ask
 * would do first today. Once a day, as a member who acts arrives, Ask runs one turn as them (contracts
 * ask-memory/morning.ts); this draws its Say and the cards it left still waiting, up to three. A card is approved here
 * through its own verb walk, as the Line approves it (window.__ask), and what became of it is kept on its turn, so the
 * Line reads back "Sent" too; Not now lets it go, and waits while the card's Approve is on its way. The store writes a turn
 * whole, so what became of each card is kept one after another, never two over one turn at once (as the Line keeps
 * them). A plan's step, which is pressed with its plan, opens in Ask, and so does the whole turn. Drawn under the queue:
 * nothing Ask suggests outranks a person who has been waiting.
 */
import { useEffect, useState } from "react";
import { ASK_MORNING_WORDS, type AskProposal, type AskProposalOutcome } from "@chanlytics/contracts";
import { refreshSurfaces } from "@/legacy-bridge/surface-runner";
import { AttnRow } from "../../kit/attention/attn-row";
import { surfaceValue } from "../../surface-values";
import { askMorningOverride } from "../ask-morning-surface";
import { askAbout, askCards, canDo, gate, useMoved, useToast } from "../shell";

/** How often Ask for you reads again while Ask writes: a turn takes up to two minutes. */
const MORNING_POLL_MS = 8_000;

/** A card pressed here this visit: on its way, approved, or let go. */
type Pressed = Record<string, "busy" | "done" | "let_go">;

/** The last outcome on its way for each turn: the next is kept after it, since the store writes a turn whole. */
const turnWrites = new Map<string, Promise<unknown>>();

/** One outcome kept on its turn once the one before it has landed, whatever that one came to. */
function afterTheLast<T>(messageId: string, write: () => Promise<T>): Promise<T> {
  const next = (turnWrites.get(messageId) ?? Promise.resolve()).then(write, write);
  turnWrites.set(
    messageId,
    next.catch(() => undefined),
  );
  return next;
}

export function TodayAsk() {
  useMoved(["ask_morning"]);
  const [toastNode, flash] = useToast();
  const [pressed, setPressed] = useState<Pressed>({});
  const m = surfaceValue("ask_morning")?.dto ?? null;
  const writing = m?.state === "writing";
  // While Ask writes, its answer is read again every few seconds; the surface stops the wait when it lands.
  useEffect(() => {
    if (!writing) return;
    const id = setInterval(() => void refreshSurfaces([askMorningOverride]), MORNING_POLL_MS);
    return () => clearInterval(id);
  }, [writing]);
  if (!m || !m.offered || m.state === "none") return toastNode;
  const W = ASK_MORNING_WORDS;
  const open = () => askAbout(m.thread_id ? { thread: m.thread_id } : {});
  const unpress = (id: string) =>
    setPressed((x) => Object.fromEntries<Pressed[string]>(Object.entries(x).filter(([k]) => k !== id)));
  // What became of a card, kept on the turn that made it, as the Line keeps it.
  const keptOnTurn = (p: AskProposal, o: AskProposalOutcome): Promise<boolean> => {
    const door = askCards();
    const id = m.message_id;
    return id && door ? afterTheLast(id, () => door.outcome(id, p.id, o)) : Promise.resolve(false);
  };
  const approve = async (p: AskProposal) => {
    const door = askCards();
    if (!door || !canDo("approve")) return;
    setPressed((x) => ({ ...x, [p.id]: "busy" }));
    const r = await door.commit(p);
    const atMs = Date.now();
    if (!r.ok) {
      unpress(p.id);
      await keptOnTurn(p, { state: "failed", receipt: r.message, atMs, undo: null });
      flash({ tone: "danger", msg: <>{r.message}</> });
      return;
    }
    await keptOnTurn(p, { state: "done", receipt: r.receipt, atMs, undo: r.undo ?? null, made: r.made ?? null });
    setPressed((x) => ({ ...x, [p.id]: "done" }));
    flash({ msg: <>{r.receipt}</> });
  };
  const letGo = async (p: AskProposal) => {
    if (pressed[p.id] === "busy") return;
    setPressed((x) => ({ ...x, [p.id]: "let_go" }));
    await keptOnTurn(p, { state: "dismissed", receipt: W.dismissed, atMs: Date.now(), undo: null });
  };
  const cards = m.cards.filter((p) => pressed[p.id] !== "done" && pressed[p.id] !== "let_go");
  const said =
    m.state === "writing" ? W.writing : m.state === "failed" ? W.failed : m.headline || (cards.length ? "" : W.quiet);
  return (
    <section className="tq today-ask" data-testid="today-ask">
      <div className="tq-head">
        <span className="tq-title">{W.title}</span>
        <span className="tq-sub">{W.sub}</span>
      </div>
      <div className="tq-list">
        <AttnRow
          initials="✦"
          glyph="sparkle"
          name={W.title}
          sentence={said}
          status={m.state === "ready" && m.detail ? [m.detail] : []}
          tone={m.state === "failed" ? "warn" : ""}
          cta={m.thread_id ? { label: W.open, kind: "ghost", onClick: open } : null}
          also={null}
          onOpen={m.thread_id ? open : undefined}
          testid="today-ask-say"
        />
        {cards.map((p) => (
          <AttnRow
            key={p.id}
            initials="✦"
            glyph="sparkle"
            name={p.title}
            sentence={p.summary}
            status={[]}
            tone=""
            cta={
              p.plan
                ? { label: W.open, kind: "ghost", onClick: open }
                : {
                    label: W.approve,
                    kind: "primary",
                    onClick: () => void approve(p),
                    busy: pressed[p.id] === "busy",
                    gate: gate("approve", "approve Ask's card"),
                  }
            }
            also={{
              label: W.notNow,
              onClick: () => void letGo(p),
              busy: pressed[p.id] === "busy",
              testid: "today-ask-not-now",
            }}
            onOpen={open}
            testid="today-ask-card"
          />
        ))}
      </div>
      {toastNode}
    </section>
  );
}
