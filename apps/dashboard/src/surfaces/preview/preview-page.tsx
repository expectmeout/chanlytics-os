"use client";

// Chanlytics — a lead's own receptionist, before they sign up (decision 0079, L2 and L3).
//
// The page a cold email's link opens: the business's own receptionist, set up from its listing and its website, in its
// mark and its colour on the product's paper. They text it as a customer would and read, under each answer, what a
// live chat would do with it (Try it's `then`), or call it in the browser (call.tsx); they see what it knows and where
// each fact came from, and say which is not right; and the foot, which stays, makes it theirs. Every word is
// contracts' (previews/preview-words.ts); the page is drawn from its view model (previewPageOf), which the server
// builds from the row its token names.
//
// The page's own script says it was drawn (previewVerbs.opened), once a load, so a mail scanner fetching the link is
// no open. While its receptionist is being set up it reads itself again every few seconds. Opened by its sender to look
// (`look`, the lead sheet's Open it), it counts nothing and presses nothing: what it has said, and what it knows.

import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import {
  LEAD_PREVIEW_WORDS as W,
  previewMinePath,
  type PreviewKnowsRowVM,
  type PreviewPageVM,
  type PreviewTurnVM,
} from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Field, fieldProblem } from "../kit/field/field";
import { LinkButton } from "../kit/link-button/link-button";
import { Panel } from "../kit/panel/panel";
import { PvCall } from "./call";
import { previewVerbs } from "./verbs";
import "../kit/kit.css";
import "./preview.css";

/** How often a page whose receptionist is being set up reads itself again. */
const BUILDING_EVERY_MS = 4_000;

/** The business at the top: its mark, else nothing (its name is the heading under it), and who set it up. */
function PvHead({ vm }: { vm: PreviewPageVM }) {
  return (
    <header className="pv-head">
      <div className="pv-head-top">
        {vm.logo_url ? <img className="pv-logo" src={vm.logo_url} alt="" /> : null}
        <span className="chip">{W.chip}</span>
      </div>
      <h1 className="pv-title">{W.title(vm.business)}</h1>
      <p className="pv-by">{W.setUp(vm.business)}</p>
    </header>
  );
}

/** One turn: the words, and under an answer what a live chat would do with it. */
function PvTurn({ t, at }: { t: PreviewTurnVM; at: number }) {
  const mine = t.role === "user";
  return (
    <li className="pv-turn" data-mine={mine || undefined} data-testid={`pv-turn-${at}`}>
      <p className="pv-said">
        <span className="rec-sr">{mine ? W.you : W.it}: </span>
        {t.text}
      </p>
      {t.then ? (
        <p className="pv-then" data-tone={t.then.tone} data-testid={`pv-then-${at}`}>
          <span className="pv-then-label">{W.onRealChat}:</span> {t.then.words}
        </p>
      ) : null}
    </li>
  );
}

/** Text it: the chat, three questions to start from, the box, and how many it will still answer. */
function PvChat({ vm, token, look }: { vm: PreviewPageVM; token: string; look: boolean }) {
  const [turns, setTurns] = useState<PreviewTurnVM[]>(vm.turns);
  const [left, setLeft] = useState(vm.left);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const spent = vm.state === "spent" || left <= 0;

  const say = async (asked: string) => {
    const words = asked.trim();
    if (!words || busy || spent) return;
    setBusy(true);
    setProblem(null);
    setTurns((was) => [...was, { role: "user", text: words, then: null }]);
    setText("");
    const r = await previewVerbs.say(token, words);
    setBusy(false);
    if (!r.ok) {
      setTurns((was) => was.slice(0, -1));
      setText(words);
      return setProblem(r.message ?? W.failed);
    }
    setTurns((was) => [...was, r.data.turn]);
    setLeft(r.data.left);
  };
  const onSend = (e: SyntheticEvent) => {
    e.preventDefault();
    void say(text);
  };

  return (
    <Panel as="section" className="pv-section" aria-labelledby="pv-text-title" data-testid="pv-chat">
      <h2 className="pv-section-title" id="pv-text-title">
        {W.textTitle}
      </h2>
      {turns.length ? (
        <ol className="pv-chat" role="log" aria-live="polite">
          {turns.map((t, i) => (
            <PvTurn key={i} t={t} at={i} />
          ))}
          {busy ? (
            <li className="pv-turn" data-testid="pv-writing">
              <p className="pv-said">{W.writing}</p>
            </li>
          ) : null}
        </ol>
      ) : vm.starters.length && !look ? (
        <div className="pv-starters" data-testid="pv-starters">
          {vm.starters.map((s) => (
            <Button key={s} size="sm" onClick={() => void say(s)} disabled={busy}>
              {s}
            </Button>
          ))}
        </div>
      ) : null}
      {look ? null : spent ? (
        <p className="pv-quiet" role="status" data-testid="pv-spent">
          {W.spent}
        </p>
      ) : (
        <form className="pv-ask" onSubmit={onSend} aria-busy={busy || undefined}>
          <Field
            label={W.textLabel}
            rows={2}
            value={text}
            onValueChange={setText}
            readOnly={busy}
            maxLength={500}
            data-testid="pv-text"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void say(text);
              }
            }}
            {...fieldProblem(problem)}
          />
          <div className="pv-ask-acts">
            <p className="pv-quiet" data-testid="pv-left">
              {W.left(left)}
            </p>
            <Button type="submit" variant="primary" disabled={busy || !text.trim()} data-testid="pv-send">
              {W.send}
            </Button>
          </div>
        </form>
      )}
      {look ? null : <p className="pv-quiet">{W.kept}</p>}
    </Panel>
  );
}

/** One fact it knows, where it was read, and Not right: what is right, if they say, kept for the person who wrote. */
function PvKnown({ row, token, look }: { row: PreviewKnowsRowVM; token: string; look: boolean }) {
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = async (e: SyntheticEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await previewVerbs.notRight(token, row.label, said);
    setBusy(false);
    if (r.ok) setSent(true);
  };
  return (
    <div className="pv-knows-row" data-testid={`pv-knows-${row.key}`}>
      <dt>{row.label}</dt>
      <dd>{row.value}</dd>
      <dd className="pv-knows-from">
        <span>{row.from}</span>
        {look ? null : sent ? (
          <span role="status">{W.notRightThanks}</span>
        ) : open ? null : (
          <LinkButton onClick={() => setOpen(true)} data-testid={`pv-not-right-${row.key}`}>
            {W.notRight}
          </LinkButton>
        )}
      </dd>
      {open && !sent ? (
        <dd>
          <form className="pv-ask" onSubmit={send}>
            <Field
              label={W.notRightLabel}
              rows={2}
              value={said}
              onValueChange={setSaid}
              readOnly={busy}
              maxLength={300}
            />
            <div className="pv-end">
              <Button type="submit" size="sm" disabled={busy} data-testid={`pv-not-right-send-${row.key}`}>
                {W.notRightSend}
              </Button>
            </div>
          </form>
        </dd>
      ) : null}
    </div>
  );
}

/** What it knows, folded: each fact with where it came from. */
function PvKnows({ vm, token, look }: { vm: PreviewPageVM; token: string; look: boolean }) {
  if (!vm.knows.length) return null;
  return (
    <Panel as="section" className="pv-section" data-testid="pv-knows">
      <details className="pv-knows">
        <summary>{W.knowsTitle}</summary>
        <dl className="pv-knows-list">
          {vm.knows.map((row) => (
            <PvKnown key={row.key} row={row} token={token} look={look} />
          ))}
        </dl>
      </details>
    </Panel>
  );
}

/** The foot that stays: Make it mine, and what it costs to try. */
function PvFoot({ token }: { token: string }) {
  return (
    <div className="pv-foot">
      <div className="pv-foot-in">
        <Button variant="primary" size="lg" href={previewMinePath(token)} data-testid="pv-mine">
          {W.mine}
        </Button>
        <p className="pv-quiet">{W.mineSub}</p>
      </div>
    </div>
  );
}

/** A page with one thing to say: being set up, ended, someone's own now. */
function PvAlone({ vm }: { vm: PreviewPageVM }) {
  if (vm.state === "building")
    return (
      <Panel as="section" className="pv-alone" role="status" data-testid="pv-building">
        <h1 className="pv-title">{W.building.title(vm.business)}</h1>
        <p className="pv-by">{W.building.sub}</p>
      </Panel>
    );
  if (vm.state === "taken")
    return (
      <Panel as="section" className="pv-alone" data-testid="pv-taken">
        <h1 className="pv-title">{W.taken.title(vm.business)}</h1>
        <Button variant="primary" href="/login">
          {W.taken.signIn}
        </Button>
      </Panel>
    );
  return (
    <Panel as="section" className="pv-alone" data-testid="pv-ended">
      <h1 className="pv-title">{W.ended.title}</h1>
      <p className="pv-by">{W.ended.body}</p>
      <Button variant="primary" href="/signup">
        {W.ended.start}
      </Button>
    </Panel>
  );
}

export function PreviewPage({ vm, token, look = false }: { vm: PreviewPageVM; token: string; look?: boolean }) {
  const router = useRouter();
  const told = useRef(false);
  const open = vm.state === "ready" || vm.state === "spent";

  useEffect(() => {
    if (!open || look || told.current) return;
    told.current = true;
    void previewVerbs.opened(token);
  }, [open, look, token]);

  useEffect(() => {
    if (vm.state !== "building") return;
    const again = setInterval(() => router.refresh(), BUILDING_EVERY_MS);
    return () => clearInterval(again);
  }, [vm.state, router]);

  if (!open)
    return (
      <main className="pv-page" data-testid="preview-page" data-state={vm.state}>
        <PvAlone vm={vm} />
      </main>
    );
  return (
    <main className="pv-page" data-testid="preview-page" data-state={vm.state}>
      <PvHead vm={vm} />
      {look ? (
        <p className="pv-quiet" role="note" data-testid="pv-look">
          {W.look}
        </p>
      ) : null}
      <PvChat vm={vm} token={token} look={look} />
      {look ? null : <PvCall token={token} leftMs={vm.call_left_ms} />}
      <PvKnows vm={vm} token={token} look={look} />
      {look ? null : <PvFoot token={token} />}
    </main>
  );
}
