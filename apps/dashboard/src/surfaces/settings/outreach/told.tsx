/**
 * How it reaches out (decision 0113): What it's told. At rest a card of one row, Open; open, the kit's sheet, as How it
 * answers' prompt sheet is (business/prompt.tsx): the three writers of a cold email by a toggle, each prompt cut into
 * the parts an owner can name, each a line that opens onto its words, with its share as one thin bar (never a number on
 * the glass) and its door back to the row that writes it. The words' and the opening's are composed by the server for
 * this workspace now (GET settings/reach-out/told); an answer's parts differ with every reply, so they carry no share.
 */
import { useEffect, useState } from "react";
import {
  REACH_OUT_SETTINGS_WORDS,
  replyToldParts,
  toldShares,
  type ToldKind,
  type ToldPart,
} from "@chanlytics/contracts";
import { api } from "@/bridge/api";
import { navigate } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { LinkButton } from "../../kit/link-button/link-button";
import { Meter } from "../../kit/meter/meter";
import { RecordDisclosure } from "../../kit/record/disclosure";
import { RecordToggleGroup } from "../../kit/record/field";
import { useRecordFold } from "../../kit/record/hooks";
import { recFolds } from "../../kit/record/registry";
import { RecordRow } from "../../kit/record/row";
import { RecordSheet } from "../../kit/record/sheet";
import { OutreachCard } from "./card";

const W = REACH_OUT_SETTINGS_WORDS.told;
const KINDS: { value: ToldKind; label: string }[] = [
  { value: "words", label: W.kinds.words },
  { value: "opening", label: W.kinds.opening },
  { value: "reply", label: W.kinds.reply },
];

/** A part's parts, as the server composed them for this workspace, or the answer's, which no read composes. */
function useToldParts(open: boolean, kind: ToldKind): ToldPart[] | null {
  const [parts, setParts] = useState<Partial<Record<ToldKind, ToldPart[]>>>({});
  useEffect(() => {
    if (!open || kind === "reply" || parts[kind]) return;
    let live = true;
    api()("GET settings/reach-out/told", { query: { kind } }).then(
      (r) => {
        if (live && r.ok) setParts((was) => ({ ...was, [kind]: r.data.parts }));
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [open, kind, parts]);
  return kind === "reply" ? replyToldParts() : (parts[kind] ?? null);
}

/** A part's line: its name, whose words they are, and its share as one thin bar where one is true. */
const partLine = (p: ToldPart, share: number | null) => (
  <>
    <span className="bt-disc-name" id={`ro-told-label-${p.id}`}>
      {p.label}
    </span>
    <span className="bt-disc-sub">{p.note}</span>
    {share !== null ? (
      <Meter
        size="sm"
        className="bt-prompt-share"
        parts={[
          { share, color: "var(--ink-dim)" },
          { share: Math.max(0, 100 - share), tone: "rest" },
        ]}
        aria-label={`About ${share}% of what it reads`}
        data-testid={`rec-told-share-${p.id}`}
      />
    ) : null}
  </>
);

/** A part's door back to the row of this page that writes it, or to the page that holds it. */
const partDoor = (p: ToldPart, close: () => void, canEdit: boolean) => {
  if (p.row && canEdit)
    return (
      <LinkButton onClick={() => recFolds.request(p.row ?? "")} data-testid={`rec-told-door-${p.id}`}>
        Change
      </LinkButton>
    );
  if (p.door)
    return (
      <LinkButton
        onClick={() => {
          close();
          navigate(p.door ?? "");
        }}
        data-testid={`rec-told-door-${p.id}`}
      >
        Open
      </LinkButton>
    );
  return null;
};

/** What a part opens onto: its way to the row or page that writes it, its words, or that it is each reply's own. */
function partBody(p: ToldPart, close: () => void, canEdit: boolean) {
  const door = partDoor(p, close, canEdit);
  if (!p.text) return door ?? <p className="bt-fold-note">{W.everyTime}</p>;
  return (
    <>
      {door}
      <p className="bt-prompt-block-text">{p.text}</p>
    </>
  );
}

/** What it's told: the card at rest, and its sheet while it is open. */
export function ToldCard({ canEdit }: { canEdit: boolean }) {
  const fold = useRecordFold("told", { dirty: false });
  useEffect(() => recFolds.drawn("told"), []);
  const [kind, setKind] = useState<ToldKind>("words");
  const parts = useToldParts(fold.open, kind);
  const shares = parts ? toldShares(parts) : null;
  return (
    <OutreachCard id="told" title={W.title} sub={W.sub}>
      <RecordRow
        id="told"
        label={W.title}
        value={W.value}
        act={{ label: W.open, icon: "chevron", onClick: () => fold.request() }}
      />
      {fold.open ? (
        <RecordSheet
          id="told"
          title={W.title}
          onClose={fold.close}
          tools={
            <RecordToggleGroup<ToldKind>
              label="Which writer"
              value={kind}
              options={KINDS}
              onChange={setKind}
              testid="rec-told-kind"
            />
          }
          foot={
            <span data-foot-pair>
              <Button size="sm" onClick={fold.close} data-testid="rec-told-done">
                Done
              </Button>
            </span>
          }
          testid="rec-told-sheet"
        >
          <div className="bt-prompt bt-stack">
            <p className="bt-fold-note" data-testid="rec-told-hint">
              {W.hints[kind]}
            </p>
            {parts === null ? (
              <p className="bt-fold-note">…</p>
            ) : (
              parts.map((p, i) => (
                <RecordDisclosure
                  key={`${kind}-${p.id}`}
                  id={`ro-told-${kind}-${p.id}`}
                  label={partLine(p, shares?.[i] ?? null)}
                  testid={`rec-told-part-${p.id}`}
                >
                  {partBody(p, fold.close, canEdit)}
                </RecordDisclosure>
              ))
            )}
            {kind === "opening" ? <p className="bt-fold-note">{W.foot}</p> : null}
          </div>
        </RecordSheet>
      ) : null}
    </OutreachCard>
  );
}
