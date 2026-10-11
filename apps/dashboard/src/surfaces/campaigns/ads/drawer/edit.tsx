/**
 * What Edit holds that the sentence's words do not (MOCKUP; "Edit stays for the photo, words and name"): the photo, the words
 * the ad says (a headline and its text; Google's headlines and lines), and the one word that cannot change on a running ad --
 * how the chat starts -- which says why and offers a copy instead. A changed one wears the same dot as a chip. Under them
 * what a change of the form or of a Google ad in review does. Nothing here is sent: Save keeps the draft in the browser.
 */
import type { AdCopy, AdRead } from "@chanlytics/contracts";
import { CHIPS, DRAWER, EDIT, NEW_AD } from "@chanlytics/contracts/ads-page";
import { Button } from "../../../kit/button/button";
import { Field } from "../../../kit/field/field";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Popover } from "../../../kit/popover/popover";
import { cx } from "../../../kit/variants";
import type { EditId } from "./draft";

/** One box of words: what it is called, what it holds, how many lines tall (0 for one line), and the copy it would make. */
interface Box {
  id: string;
  label: string;
  value: string;
  rows: number;
  set: (value: string) => AdCopy;
}

const swap = (xs: readonly string[], at: number, value: string): string[] => xs.map((x, i) => (i === at ? value : x));

/** The boxes an ad's words are in: a headline and its text; TikTok's caption alone; Google's headlines and descriptions. */
function boxesOf(ad: AdRead): Box[] {
  const c = ad.copy;
  if (ad.platform === "google") {
    return [
      ...c.headlines.map((value, at) => ({
        id: `headline-${at}`,
        label: EDIT.headlineN(at + 1),
        value,
        rows: 0,
        set: (v: string): AdCopy => ({ ...c, headlines: swap(c.headlines, at, v) }),
      })),
      ...c.lines.map((value, at) => ({
        id: `line-${at}`,
        label: EDIT.descriptionN(at + 1),
        value,
        rows: 2,
        set: (v: string): AdCopy => ({ ...c, lines: swap(c.lines, at, v) }),
      })),
    ];
  }
  const text: Box = {
    id: "text",
    label: NEW_AD.step2.text,
    value: c.text,
    rows: 2,
    set: (v: string): AdCopy => ({ ...c, text: v }),
  };
  if (ad.platform === "tiktok") return [text];
  return [
    { id: "headline", label: NEW_AD.step2.headline, value: c.headline, rows: 0, set: (v) => ({ ...c, headline: v }) },
    text,
  ];
}

function WordsBox({ box, onWords }: { box: Box; onWords: (copy: AdCopy) => void }) {
  const change = (v: string) => onWords(box.set(v));
  return box.rows > 0 ? (
    <Field label={box.label} value={box.value} onValueChange={change} rows={box.rows} data-testid={`ads-${box.id}`} />
  ) : (
    <Field label={box.label} value={box.value} onValueChange={change} data-testid={`ads-${box.id}`} />
  );
}

/** How the chat starts: fixed on a running ad (a welcome message in use cannot be changed), so it says why and offers a copy. */
function LockedChat({ copy, onCopy }: { copy: AdCopy; onCopy: () => void }) {
  const now = copy.startWith === "ready" ? NEW_AD.step2.chatReady : NEW_AD.step2.chatQuestions;
  return (
    <Popover
      label={NEW_AD.step2.chat}
      align="start"
      className="ads-theirs"
      trigger={
        <LinkButton className="ads-lock" data-testid="ads-lock">
          <Icon name="lock" size={12} />
          <span>{EDIT.chatNow(NEW_AD.step2.chat, now)}</span>
        </LinkButton>
      }
    >
      <p className="ads-theirs-text">{CHIPS.lockedWhy}</p>
      <Button size="sm" onClick={onCopy} data-testid="ads-lock-copy">
        {DRAWER.menu.copy}
      </Button>
    </Popover>
  );
}

interface AdEditProps {
  /** The ad as the draft would make it. */
  ad: AdRead;
  changed: ReadonlySet<EditId>;
  onWords: (copy: AdCopy) => void;
  onPhoto: () => void;
  onCopy: () => void;
}

export function AdEdit({ ad, changed, onWords, onPhoto, onCopy }: AdEditProps) {
  return (
    <section className="ads-edit" aria-label={EDIT.title} data-testid="ads-edit">
      <h3 className="ads-h">{EDIT.title}</h3>
      <div className={cx("ads-edit-row", changed.has("photo") && "cm-changed")}>
        <span className="ads-photo-mini" aria-hidden="true" />
        <span className="ads-edit-label">{EDIT.photo}</span>
        <Button size="sm" variant="quiet" onClick={onPhoto} data-testid="ads-photo">
          {changed.has("photo") ? EDIT.photoNew : EDIT.changePhoto}
        </Button>
      </div>
      <div className={cx("ads-edit-words", changed.has("words") && "cm-changed")}>
        {boxesOf(ad).map((box) => (
          <WordsBox key={box.id} box={box} onWords={onWords} />
        ))}
      </div>
      {ad.door === "whatsapp" ? <LockedChat copy={ad.copy} onCopy={onCopy} /> : null}
      {ad.door === "form" ? <p className="ads-line">{CHIPS.formNew}</p> : null}
      {ad.platform === "google" && ad.state === "review" ? <p className="ads-line">{CHIPS.googleWait}</p> : null}
    </section>
  );
}
