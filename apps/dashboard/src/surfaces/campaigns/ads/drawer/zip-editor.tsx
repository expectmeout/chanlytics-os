/**
 * TikTok's area (MOCKUP; audit #14): ZIP codes, not a circle. Its tapped word opens this: the ZIP codes the ad reaches as the
 * house's name chips that each come out (a cross), a box that takes one more (5 digits, checked as it is typed), and Save,
 * which hands the list back. At least one stays. On a desk it stands in the popover; on a phone it is the bottom list's body
 * (list-sheet.tsx), where Save is the sheet's primary.
 */
import { useState } from "react";
import type { KeyboardEvent } from "react";
import { ADS_ZIP_DIGITS, DRAWER, ZIPS, zipIssue } from "@chanlytics/contracts/ads-page";
import { Button } from "../../../kit/button/button";
import { Field } from "../../../kit/field/field";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { AdsNotes } from "./notes";

interface ZipEditorProps {
  zips: readonly string[];
  /** The notes under the editor: what changing the area does. */
  notes: readonly string[];
  /** Hands back the ZIP codes as they now stand. */
  onSave: (zips: string[]) => void;
  onCancel: () => void;
  /** In a bottom list, Save is the sheet's primary. */
  phone: boolean;
}

export function ZipEditor({ zips, notes, onSave, onCancel, phone }: ZipEditorProps) {
  const [list, setList] = useState<string[]>([...zips]);
  const [text, setText] = useState("");
  const typed = text.trim();
  const issue = typed === "" ? null : zipIssue(typed, list);
  const changed = list.join(",") !== zips.join(",");
  const add = () => {
    if (typed === "" || issue !== null) return;
    setList([...list, typed]);
    setText("");
  };
  const box = {
    "aria-label": ZIPS.add,
    value: text,
    onValueChange: (v: string) => setText(v.replace(/\D/g, "")),
    inputMode: "numeric",
    placeholder: ZIPS.placeholder(ADS_ZIP_DIGITS),
    maxLength: ADS_ZIP_DIGITS,
    onKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === "Enter") add();
    },
    "data-testid": "ads-zip-box",
  } as const;
  return (
    <div className="ads-opts ads-zips" data-testid="ads-zips">
      {phone ? null : <p className="ads-opts-title">{ZIPS.title}</p>}
      <div className="ads-zip-list" role="list" aria-label={ZIPS.held(list.length)}>
        {list.map((zip) => (
          <span key={zip} className="chip" role="listitem" data-testid={`ads-zip-${zip}`}>
            <span>{zip}</span>
            <LinkButton
              className="chip-x"
              aria-label={ZIPS.remove(zip)}
              disabled={list.length === 1}
              onClick={() => setList(list.filter((z) => z !== zip))}
            >
              <Icon name="x" size={9} />
            </LinkButton>
          </span>
        ))}
      </div>
      <div className="ads-zip-add">
        {/* A mistake is said once the box holds a whole ZIP code, not while it is still being typed. */}
        {issue !== null && typed.length >= ADS_ZIP_DIGITS ? (
          <Field {...box} problem={issue} problemGlyph={<Icon name="alert" size={12} />} />
        ) : (
          <Field {...box} />
        )}
        <Button size="sm" disabled={typed === "" || issue !== null} onClick={add} data-testid="ads-zip-add">
          {ZIPS.addPress}
        </Button>
      </div>
      {list.length === 1 ? <p className="ads-note">{ZIPS.none}</p> : null}
      <div className="ads-zip-acts">
        {/* On a phone the sheet's head says Cancel: a second one beside Save said it twice (the fitted sheets). */}
        {phone ? null : (
          <Button size="sm" variant="quiet" onClick={onCancel}>
            {DRAWER.foot.cancel}
          </Button>
        )}
        <Button
          size="sm"
          variant={phone ? "primary" : undefined}
          disabled={!changed || list.length === 0}
          onClick={() => onSave(list)}
          data-testid="ads-zip-save"
        >
          {ZIPS.save}
        </Button>
      </div>
      <AdsNotes notes={notes} phone={phone} id="zips" />
    </div>
  );
}
