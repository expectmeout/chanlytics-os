/**
 * An ad as one sentence (MOCKUP; Ruben, 11 Oct 2026, "Option B"): "Show [Spring offer] on Facebook and Instagram to people
 * within [5 miles], so they message you on WhatsApp, up to [$720] in all until [Sat 31 Oct]." Each word that can change is
 * the kit's soft tinted token; pressed, it opens a list that says what each choice changes: a small popover on a desk, and on
 * a phone a bottom list (the kit's sheet in a job's shape, list-sheet.tsx), one at a time, never a sheet's own sheet. A word
 * that cannot change on a running ad is plain text, an ad that ended or that the owner made on the platform itself reads
 * whole and none opens. The drawer and New ad both draw it; what a choice does is the caller's (`onChange`).
 *
 * The values `onChange` hands back are the chip's own, as the sentence's parts hold them (contracts vm-base.ts
 * sentenceParts): `area` the miles ("8"), or for TikTok the ZIP codes ("zips:10001,10003", contracts areaOfValue),
 * `amount` the minor units ("90000"), `end` the ISO day ("2026-11-07"), `offer` a Service's id, `door` the door ("call")
 * and `platform` the platform ("google"). New ad gives every word a `jump` to its step and no `edit`: its words open no list.
 */
import { Fragment, useState } from "react";
import type { ReactElement } from "react";
import type { AdsRead } from "@chanlytics/contracts";
import { DOOR_ORDER, LIST, ZIPS, areaValueOf } from "@chanlytics/contracts/ads-page";
import type { ChipId, EditVM, SentencePart } from "@chanlytics/contracts/ads-page";
import { Popover } from "../../../kit/popover/popover";
import { Token } from "../../../kit/picker/picker";
import { cx } from "../../../kit/variants";
import { useCmPhone } from "../../parts/split";
import { chipValue, listFor } from "./chip-lists";
import type { ChipPart, ListCtx } from "./chip-lists";
import { ListSheet } from "./list-sheet";
import { OfferNote, OptPanel, OwnBox } from "./option-list";
import { ZipEditor } from "./zip-editor";

interface AdSentenceProps {
  parts: readonly SentencePart[];
  /** Edit (or New ad): the offer opens the Services, where on a running ad it opens Edit. */
  editing?: boolean;
  /** The chips an edit has moved: each wears a dot. */
  changed?: ReadonlySet<string>;
  onChange?: (id: ChipId, value: string) => void;
  /** What the lists offer and say, from the model's `adModel(...).edit`; without it no word opens a list. */
  edit?: EditVM;
  /** The Services the offer can be. */
  offers?: AdsRead["services"];
  /** An ended ad's sentence, or one made on the platform itself: its words are read, none opens. */
  readOnly?: boolean;
  /** A running ad's offer opens this: the photo and words are Edit's. */
  onEdit?: () => void;
  /** New ad: a chip that takes its step's control instead of opening a list. */
  jump?: Partial<Record<ChipId, () => void>>;
}

interface ChipPopProps {
  part: ChipPart;
  /** The word, as the token that opens its list. */
  token: (onClick?: () => void) => ReactElement;
  props: AdSentenceProps;
  ctx: ListCtx;
  onOwn: () => void;
}

/** What a tapped word's list holds: the ZIP codes of TikTok's area, a running ad's offer, or the choices. */
function ListBody(o: { chip: ChipPopProps; phone: boolean; done: () => void; onOwn: () => void }) {
  const { chip, phone, done, onOwn } = o;
  const { part, props, ctx } = chip;
  const { onChange, onEdit, editing = false } = props;
  const list = listFor(part, ctx);
  if (part.id === "area" && ctx.edit.zips !== null) {
    const save = (zips: string[]) => {
      done();
      onChange?.("area", areaValueOf({ kind: "zips", zips }));
    };
    return <ZipEditor zips={ctx.edit.zips} notes={ctx.edit.notes.area} onSave={save} onCancel={done} phone={phone} />;
  }
  // A running ad's offer is Edit's: tapped, it says so and offers the door.
  if (part.id === "offer" && !editing) {
    const toEdit = onEdit
      ? () => {
          done();
          onEdit();
        }
      : undefined;
    return <OfferNote edit={ctx.edit} onEdit={toEdit} phone={phone} />;
  }
  const choose = (value: string) => {
    done();
    if (!list.rows.some((r) => r.value === value && r.current)) onChange?.(part.id, value);
  };
  return (
    <OptPanel
      list={list}
      edit={ctx.edit}
      phone={phone}
      onChoose={choose}
      onOwn={() => {
        done();
        onOwn();
      }}
    />
  );
}

/** The title of the bottom list a word opens. */
const sheetTitle = (part: ChipPart, ctx: ListCtx): string => {
  if (part.id === "area" && ctx.edit.zips !== null) return ZIPS.title;
  return part.id === "offer" ? LIST.chip.offer : listFor(part, ctx).title;
};

/** A word that can change: the token, and the list it opens over the drawer; a choice closes it and tells the caller. */
function ChipPop(chip: ChipPopProps) {
  const { part, token, ctx, onOwn } = chip;
  const phone = useCmPhone();
  const [open, setOpen] = useState(false);
  const body = <ListBody chip={chip} phone={phone} done={() => setOpen(false)} onOwn={onOwn} />;
  if (phone) {
    return (
      <>
        {token(() => setOpen(true))}
        <ListSheet open={open} onClose={() => setOpen(false)} title={sheetTitle(part, ctx)}>
          {body}
        </ListSheet>
      </>
    );
  }
  return (
    <Popover
      label={LIST.chip[part.id]}
      align="start"
      size="flush"
      className="ads-list"
      open={open}
      onOpenChange={setOpen}
      trigger={token()}
    >
      {body}
    </Popover>
  );
}

/** One word of the sentence that can be tapped. */
function Word({ part, props, ctx }: { part: ChipPart; props: AdSentenceProps; ctx: ListCtx | null }) {
  const [own, setOwn] = useState(false);
  const { changed, readOnly, jump, onChange } = props;
  if (readOnly) return <span className="ads-word">{part.chip}</span>;
  if (own && ctx && part.id === "amount") {
    return (
      <OwnBox
        edit={ctx.edit}
        onSet={(value) => {
          setOwn(false);
          onChange?.("amount", value);
        }}
        onCancel={() => setOwn(false)}
      />
    );
  }
  const said = LIST.chipSaid(LIST.chip[part.id], part.blank ? LIST.blank : part.chip);
  const className = cx(changed?.has(part.id) && "cm-changed", part.blank && "ads-blank");
  const onJump = jump?.[part.id];
  const token = (onClick?: () => void) => (
    <Token className={className} aria-label={said} onClick={onClick} data-testid={`ads-chip-${part.id}`}>
      {part.chip}
    </Token>
  );
  if (onJump) return token(onJump);
  // A word with neither a step to jump to nor a list to open is only read.
  if (!ctx) return <span className="ads-word">{part.chip}</span>;
  return <ChipPop part={part} token={token} props={props} ctx={ctx} onOwn={() => setOwn(true)} />;
}

export function AdSentence(props: AdSentenceProps) {
  const { parts, readOnly = false, edit, offers = [] } = props;
  const doorSaid = chipValue(parts, "door");
  const ctx: ListCtx | null = edit
    ? { edit, offers, door: DOOR_ORDER.find((d) => d === doorSaid) ?? "whatsapp" }
    : null;
  return (
    <div className="cm-recipe ads-sentence" data-readonly={readOnly ? "" : undefined} data-testid="ads-sentence">
      {parts.map((part, at) =>
        "chip" in part ? (
          <Word key={`${at}-${part.id}`} part={part} props={props} ctx={ctx} />
        ) : (
          <Fragment key={at}>{part.text}</Fragment>
        ),
      )}
    </div>
  );
}
