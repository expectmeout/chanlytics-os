/**
 * New ad: one screen that AI has already written (the Ads plan's 4.6; the canvas's "Making an ad: one screen"). It
 * opens from + New with the sentence there at once, and the words arriving under "AI is writing…". The owner reads
 * it, changes the amount, the miles or the date by tapping it, tells AI anything else, and presses Turn on, which
 * names the most the ad can cost. Above the press: who Meta charges, and what the press tells Meta.
 *
 * It stands in the kit's sheet, from the side on a desk and from the bottom edge on a phone, open by the address so
 * Back closes it. Where a draft cannot be written yet it is a short sheet that says the one thing missing and opens
 * it (the plan's G13). Every sentence is the model's (model.ts); what it holds and what its presses do is
 * use-draft.ts's; where its answers come from is its source's (the workspace's own routes, or the page's example).
 *
 * While AI writes or changes the draft, AI's own mark is at work wherever it is drawn: one AI, one moving thing.
 */
import "./new.css";
import "../connect/connect.css";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { CONTENT_LIBRARY_ROUTE, CONTENT_ROUTE, isUuid, type AdStart } from "@chanlytics/contracts";
import type { AdCantDraft } from "@/server/ads/draft-shape";
import { MASCOT } from "@/bridge/mascot";
import { Button } from "../../../kit/button/button";
import { Field } from "../../../kit/field/field";
import { Icon } from "../../../kit/icon/icon";
import { Sheet } from "../../../kit/sheet/sheet";
import type { NeedVM } from "../connect/card-model";
import { newAdView } from "./model";
import type { LineAct, NewAdVM } from "./model";
import { NewAdLine, NewEditor, NewSentence, NewWhy } from "./parts";
import type { AdEditing } from "./parts";
import { AdShown } from "./shown";
import type { AdSource } from "./source";
import { useAdDraft } from "./use-draft";
import type { AdDraftActs, AdStand } from "./use-draft";
import { MISSING, NEW } from "./words";

const NEW_AD_CLOSE = { label: NEW.close, glyph: <Icon name="x" size={13} /> };

/** Where the one thing missing is added: a page of the app, or back on the Ads page itself. */
const MISSING_DOOR: Record<AdCantDraft, string | null> = {
  service: "admin/business",
  address: "admin/business",
  whatsapp: "admin/integrations",
  picture: CONTENT_LIBRARY_ROUTE,
  picture_none: CONTENT_LIBRARY_ROUTE,
  picture_person: CONTENT_LIBRARY_ROUTE,
  picture_music: CONTENT_LIBRARY_ROUTE,
  picture_gone: CONTENT_ROUTE,
  account: null,
  account_reading: null,
  stopped: null,
};

/** AI's mark at work while the draft is being written or changed, and at rest again after. */
function useAiAtWork(working: boolean) {
  useEffect(() => {
    if (!working) return undefined;
    MASCOT.mood.set("thinking");
    return () => MASCOT.mood.set("idle");
  }, [working]);
}

interface TellProps {
  tell: NewAdVM["tell"];
  onTell: (words: string) => void;
}

/** Tell AI what to change: one line to AI, and under it what the last one came to. */
function Tell({ tell, onTell }: TellProps) {
  const [words, setWords] = useState("");
  const send = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const typed = words.trim();
    if (!typed || tell.busy) return;
    onTell(typed);
    setWords("");
  };
  return (
    <form className="ads-new-tell" onSubmit={send} data-testid="ads-new-tell">
      <div className="ads-new-tell-row">
        <Field
          aria-label={NEW.tell.label}
          placeholder={NEW.tell.label}
          value={words}
          onValueChange={setWords}
          readOnly={tell.busy}
          maxLength={600}
          enterKeyHint="go"
          data-testid="ads-new-tell-box"
        />
        <Button type="submit" iconOnly variant="quiet" aria-label={NEW.tell.send} data-testid="ads-new-tell-send">
          <Icon name="send" size={14} />
        </Button>
      </div>
      {/* Under the line it answers, so the foot's top edge is always the box itself. */}
      {tell.status ? (
        <p className="ads-new-told" role="status" data-testid="ads-new-told">
          {tell.status}
        </p>
      ) : null}
    </form>
  );
}

interface FootProps {
  vm: NewAdVM;
  onTell: (words: string) => void;
  onTurnOn: () => void;
}

/** The foot: Tell AI, who Meta charges and what the press tells Meta, the press, and the line under it. */
function Foot({ vm, onTell, onTurnOn }: FootProps) {
  return (
    <div className="ads-new-foot">
      <Tell tell={vm.tell} onTell={onTell} />
      <dl className="ads-conn-facts" data-testid="ads-new-facts">
        {vm.facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
      <Button
        variant="primary"
        size="lg"
        className="ads-new-go"
        disabled={!vm.press.can}
        onClick={onTurnOn}
        data-testid="ads-new-turn-on"
      >
        {vm.press.words}
      </Button>
      <p className="ads-new-under" data-testid="ads-new-under">
        {vm.press.under}
      </p>
    </div>
  );
}

interface DraftProps {
  stand: Extract<AdStand, { at: "draft" }>;
  vm: NewAdVM;
  acts: AdDraftActs;
  telling: boolean;
  onConnect: () => void;
}

/** The draft's body: the sentence, the word being changed, why that amount, the one line, and the ad as it will look. */
function DraftBody({ stand, vm, acts, telling, onConnect }: DraftProps) {
  const [editing, setEditing] = useState<AdEditing>(null);
  const act = (line: LineAct) => {
    if (line.kind === "rewrite") return acts.write();
    if (line.kind === "no_price") return acts.write(true);
    if (line.kind === "next_picture") return acts.nextPicture();
    if (line.kind === "amount") return acts.type({ total_minor: line.minor });
    if (line.kind === "end") return acts.type({ end_day: line.day });
    if (line.kind === "miles") return acts.type({ miles: line.miles });
    if (line.kind === "answer") return acts.answer(line.about, line.answer);
    return undefined;
  };
  return (
    <div className="ads-new" data-words={stand.words.at} data-testid="ads-new-body">
      <NewSentence vm={vm} editing={editing} still={telling} onEdit={setEditing} />
      {editing && !telling ? (
        <NewEditor
          vm={vm}
          editing={editing}
          local={stand.local}
          currency={stand.answer.account.currency}
          onType={acts.type}
          onDone={() => setEditing(null)}
        />
      ) : null}
      <NewWhy lines={vm.why} />
      {vm.line ? <NewAdLine line={vm.line} onAct={act} onConnect={onConnect} /> : null}
      <AdShown shown={vm.shown} onNext={acts.nextVersion} />
    </div>
  );
}

/** What a short sheet says: the one thing missing, or that New ad could not be read. */
function ShortBody({ title, body, small }: { title: string; body: string; small: string | null }) {
  return (
    <div className="ads-new ads-new-short" data-testid="ads-new-short">
      <p className="ads-new-short-head">{title}</p>
      <p className="ads-new-short-body">{body}</p>
      {small ? <p className="ads-new-under">{small}</p> : null}
    </div>
  );
}

interface NewAdProps {
  /** Whether the address says New ad is open. */
  open: boolean;
  source: AdSource;
  /** The ad account's own need, as its card says it: the draft's line for a card check not met. */
  need: NeedVM | null;
  onClose: () => void;
  /** Open Meta's own window again, where the card's need asks for it. */
  onConnect: () => void;
  /** Go to a page of the app. */
  onGo: (route: string) => void;
  /** Turn on was pressed, where it can be: the example's alone, until the job that makes an ad exists. */
  onTurnOn: () => void;
  /**
   * What the address says New ad starts from: a piece Run as an ad chose in Content is drafted around once, and the
   * address then says New ad alone (`onDrafted`), so a reload opens the kept draft. Anything else opens the kept draft.
   */
  start?: { how: AdStart; id: string } | null;
  onDrafted?: () => void;
}

/** The sheet's parts for where the screen stands: its head's words, its body and its foot. */
function newAdParts(
  props: NewAdProps,
  here: ReturnType<typeof useAdDraft>,
): { title: string; sub: string | null; body: ReactNode; foot: ReactNode; fit: boolean } {
  const { stand, acts } = here;
  if (stand.at === "draft") {
    const vm = newAdView({
      answer: stand.answer,
      local: stand.local,
      words: stand.words,
      version: stand.version,
      telling: here.telling,
      told: here.told,
      need: props.need,
    });
    return {
      title: vm.title,
      sub: vm.kicker,
      body: <DraftBody stand={stand} vm={vm} acts={acts} telling={here.telling} onConnect={props.onConnect} />,
      foot: <Foot vm={vm} onTell={acts.tell} onTurnOn={props.onTurnOn} />,
      fit: false,
    };
  }
  if (stand.at === "missing") {
    const words = MISSING[stand.missing];
    const door = MISSING_DOOR[stand.missing];
    const press = stand.missing === "account_reading" ? acts.again : door ? () => props.onGo(door) : props.onClose;
    return {
      title: NEW.opening,
      sub: null,
      body: <ShortBody title={words.title} body={words.body} small={words.small} />,
      foot: (
        <Button variant="primary" className="ads-new-go" onClick={press} data-testid="ads-new-missing-act">
          {words.act}
        </Button>
      ),
      fit: true,
    };
  }
  if (stand.at === "failed")
    return {
      title: NEW.opening,
      sub: null,
      body: <ShortBody title={NEW.failed.title} body={NEW.failed.body} small={null} />,
      foot: (
        <Button variant="primary" className="ads-new-go" onClick={acts.again} data-testid="ads-new-again">
          {NEW.failed.act}
        </Button>
      ),
      fit: true,
    };
  return { title: NEW.opening, sub: null, body: <div className="ads-new ads-new-short" />, foot: null, fit: true };
}

export function NewAd(props: NewAdProps) {
  const here = useAdDraft(props.open, props.source, {
    // An address naming no file's id is New ad on its kept draft: a link never lands on a refusal.
    piece: props.start?.how === "piece" && isUuid(props.start.id) ? props.start.id : null,
    drafted: props.onDrafted ?? (() => undefined),
  });
  const { stand } = here;
  useAiAtWork(props.open && ((stand.at === "draft" && stand.words.at === "writing") || here.telling));
  const parts = newAdParts(props, here);
  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title={parts.title}
      {...(parts.sub ? { sub: parts.sub } : {})}
      close={NEW_AD_CLOSE}
      foot={parts.foot}
      flatFoot
      fit={parts.fit}
      testid="ads-new"
    >
      {parts.body}
    </Sheet>
  );
}
