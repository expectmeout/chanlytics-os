/**
 * Cold email (decision 0113): See the exact instructions. At rest one row, Open; open, the kit's sheet, as How it
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

const TOLD_CARD = REACH_OUT_SETTINGS_WORDS.told;
const KINDS: { value: ToldKind; label: string }[] = [
  { value: "words", label: TOLD_CARD.kinds.words },
  { value: "opening", label: TOLD_CARD.kinds.opening },
  { value: "reply", label: TOLD_CARD.kinds.reply },
];

/**
 * A part's parts, as the server composed them for this workspace, or the answer's, which no read composes; null while
 * read, and "failed" where the read failed or was refused, which the sheet says, with Try again (`retry`).
 */
function useToldParts(open: boolean, kind: ToldKind): { parts: ToldPart[] | null | "failed"; retry: () => void } {
  const [parts, setParts] = useState<Partial<Record<ToldKind, ToldPart[] | "failed">>>({});
  // Closed, it lets go of what it read: a save on the page changes the prompt, so the next opening reads it again.
  useEffect(() => {
    if (!open) setParts({});
  }, [open]);
  useEffect(() => {
    if (!open || kind === "reply" || parts[kind]) return;
    let live = true;
    const failed = () => {
      if (live) setParts((was) => ({ ...was, [kind]: "failed" }));
    };
    api()("GET settings/reach-out/told", { query: { kind } }).then((r) => {
      if (!live) return;
      if (r.ok) setParts((was) => ({ ...was, [kind]: r.data.parts }));
      else failed();
    }, failed);
    return () => {
      live = false;
    };
  }, [open, kind, parts]);
  const retry = () => setParts(({ [kind]: _gone, ...rest }) => rest);
  return { parts: kind === "reply" ? replyToldParts() : (parts[kind] ?? null), retry };
}

/** A part's line: its name, whose words they are, and its share as one thin bar where one is true. */
const partLine = (part: ToldPart, share: number | null) => (
  <>
    <span className="bt-disc-name" id={`ro-told-label-${part.id}`}>
      {part.label}
    </span>
    <span className="bt-disc-sub">{part.note}</span>
    {share !== null ? (
      <Meter
        size="sm"
        className="bt-prompt-share"
        parts={[
          { share, color: "var(--ink-dim)" },
          { share: Math.max(0, 100 - share), tone: "rest" },
        ]}
        aria-label={TOLD_CARD.share(share)}
        data-testid={`rec-told-share-${part.id}`}
      />
    ) : null}
  </>
);

/** A part's door back to the row of this page that writes it, or to the page that holds it. */
const partDoor = (part: ToldPart, close: () => void, canEdit: boolean) => {
  if (part.row && canEdit)
    return (
      <LinkButton onClick={() => recFolds.request(part.row ?? "")} data-testid={`rec-told-door-${part.id}`}>
        Change
      </LinkButton>
    );
  if (part.door)
    return (
      <LinkButton
        onClick={() => {
          close();
          navigate(part.door ?? "");
        }}
        data-testid={`rec-told-door-${part.id}`}
      >
        Open
      </LinkButton>
    );
  return null;
};

/** What a part opens onto: its way to the row or page that writes it, its words, or that it is each reply's own. */
function partBody(p: ToldPart, close: () => void, canEdit: boolean) {
  const door = partDoor(p, close, canEdit);
  if (!p.text) return door ?? <p className="bt-fold-note">{TOLD_CARD.everyTime}</p>;
  return (
    <>
      {door}
      <p className="bt-prompt-block-text">{p.text}</p>
    </>
  );
}

/** What it's told: the card at rest, and its sheet while it is open. */
export function ToldRow({ canEdit }: { canEdit: boolean }) {
  const fold = useRecordFold("told", { dirty: false });
  useEffect(() => recFolds.drawn("told"), []);
  const [kind, setKind] = useState<ToldKind>("words");
  const { parts, retry } = useToldParts(fold.open, kind);
  const shares = parts && parts !== "failed" ? toldShares(parts) : null;
  return (
    <>
      <RecordRow
        id="told"
        label={TOLD_CARD.title}
        act={{ label: TOLD_CARD.open, icon: "chevron", onClick: () => fold.request() }}
      />
      {fold.open ? (
        <RecordSheet
          id="told"
          title={TOLD_CARD.title}
          onClose={fold.close}
          tools={
            <RecordToggleGroup<ToldKind>
              label={TOLD_CARD.which}
              value={kind}
              options={KINDS}
              onChange={setKind}
              testid="rec-told-kind"
            />
          }
          foot={
            <span data-foot-pair>
              <Button size="sm" onClick={fold.close} data-testid="rec-told-done">
                {TOLD_CARD.done}
              </Button>
            </span>
          }
          testid="rec-told-sheet"
        >
          <div className="bt-prompt bt-stack">
            <p className="bt-fold-note" data-testid="rec-told-hint">
              {TOLD_CARD.hints[kind]}
            </p>
            {parts === null ? (
              <p className="bt-fold-note">…</p>
            ) : parts === "failed" ? (
              <p className="bt-fold-note" data-testid="rec-told-unread">
                {TOLD_CARD.unread}{" "}
                <LinkButton onClick={retry} data-testid="rec-told-again">
                  {TOLD_CARD.again}
                </LinkButton>
              </p>
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
            {kind === "opening" ? <p className="bt-fold-note">{TOLD_CARD.foot}</p> : null}
          </div>
        </RecordSheet>
      ) : null}
    </>
  );
}
