/**
 * The sheets a website's key opens (00675): a key made for a site, by its name; the key itself, shown this once with
 * where the site sends its forms; and one key's own, to change it for a new one (the old one honoured a day) or end it.
 */
import { useEffect, useState } from "react";
import type { WebsiteFormKeyMade, WebsiteFormsDto } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { CopyButton } from "../../kit/copy-button/copy-button";
import { Field } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { Sheet } from "../../kit/sheet/sheet";
import { WEBSITE_FORM_WORDS as W, keyHint, keyName, keyUsed, type SaysWhen, type WebsiteKey } from "./words";

const KEY_SHEET_CLOSE = { label: W.close, glyph: <Icon name="x" size={13} /> };

/** A key made for a site: its name asked, then the press. */
export function MakeKeySheet(props: {
  open: boolean;
  busy: boolean;
  onMake: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const typed = name.trim();
  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title={W.makeSheet.title}
      close={KEY_SHEET_CLOSE}
      flatFoot
      fit
      testid="wf-make"
      foot={
        <div data-foot-pair="">
          <Button
            variant="primary"
            disabled={props.busy || typed.length === 0}
            onClick={() => props.onMake(typed)}
            data-testid="wf-make-go"
          >
            {W.makeSheet.press}
          </Button>
          <Button variant="quiet" onClick={props.onClose}>
            {W.makeSheet.cancel}
          </Button>
        </div>
      }
    >
      <Field
        label={W.makeSheet.label}
        value={name}
        onValueChange={setName}
        placeholder={W.makeSheet.placeholder}
        maxLength={60}
        data-testid="wf-make-name"
        spellCheck={false}
        enterKeyHint="go"
      />
    </Sheet>
  );
}

/** One line the made key's sheet says: what it is, its words, and a copy of them, each copy named for what it copies. */
function CopiedLine(props: { label: string; text: string; copy: string; testid: string }) {
  return (
    <div className="wf-made-line" data-testid={props.testid}>
      <span className="wf-made-label">{props.label}</span>
      <code className="wf-made-text">{props.text}</code>
      <CopyButton text={props.text} label={props.copy} testid={`${props.testid}-copy`} />
    </div>
  );
}

/** The key just made, shown this once, with where the site sends its forms. */
export function MadeKeySheet(props: {
  made: WebsiteFormKeyMade | null;
  door: WebsiteFormsDto["door"] | null;
  graceUntil: string | null;
  onClose: () => void;
}) {
  const { made, door } = props;
  return (
    <Sheet
      open={made !== null}
      onClose={props.onClose}
      title={W.madeSheet.title(made?.name ?? "")}
      close={KEY_SHEET_CLOSE}
      flatFoot
      fit
      testid="wf-made"
      foot={
        <div data-foot-pair="">
          <Button variant="primary" onClick={props.onClose} data-testid="wf-made-done">
            {W.madeSheet.done}
          </Button>
        </div>
      }
    >
      <div className="wf-made">
        <p data-strong="true">{W.madeSheet.once}</p>
        {made ? (
          <CopiedLine label={W.madeSheet.key} text={made.key} copy={W.madeSheet.copyKey} testid="wf-made-key" />
        ) : null}
        {door ? (
          <CopiedLine
            label={W.madeSheet.address}
            text={door.address}
            copy={W.madeSheet.copyAddress}
            testid="wf-made-address"
          />
        ) : null}
        {door ? (
          <CopiedLine
            label={W.madeSheet.workspace}
            text={door.workspace}
            copy={W.madeSheet.copyWorkspace}
            testid="wf-made-workspace"
          />
        ) : null}
        {props.graceUntil ? <p>{W.madeSheet.graceUntil(props.graceUntil)}</p> : null}
      </div>
    </Sheet>
  );
}

/**
 * One key's own: when it was made and last used, and the two presses, the end asked once more before it goes. A key
 * already on its last day (changed before) offers its end alone: changed again it would leave two old keys working.
 */
export function KeySheet(props: {
  keyShown: WebsiteKey | null;
  busy: boolean;
  says: SaysWhen;
  onChange: (key: WebsiteKey) => void;
  onEnd: (key: WebsiteKey) => void;
  onClose: () => void;
}) {
  const { keyShown: key, says } = props;
  const [confirming, setConfirming] = useState(false);
  // Each key opens on its own two presses: an end asked of one key is never still asked of the next one opened.
  const shownId = key?.id ?? null;
  useEffect(() => setConfirming(false), [shownId]);
  const lastDay = !!key?.ends_at;
  const ending = confirming || lastDay;
  const close = () => {
    setConfirming(false);
    props.onClose();
  };
  return (
    <Sheet
      open={key !== null}
      onClose={close}
      title={key ? keyName(key) : ""}
      close={KEY_SHEET_CLOSE}
      flatFoot
      fit
      testid="wf-key"
      foot={
        key ? (
          <div data-foot-pair="">
            {ending ? (
              <Button
                variant="secondary"
                tone="danger"
                disabled={props.busy}
                onClick={() => props.onEnd(key)}
                data-testid="wf-key-end-now"
              >
                {W.keySheet.endNow}
              </Button>
            ) : (
              <Button
                variant="secondary"
                disabled={props.busy}
                onClick={() => props.onChange(key)}
                data-testid="wf-key-change"
              >
                {W.keySheet.changeKey}
              </Button>
            )}
            <Button
              variant="quiet"
              tone={ending ? undefined : "danger"}
              onClick={lastDay ? close : () => setConfirming(!confirming)}
              data-testid="wf-key-end"
            >
              {ending ? W.keySheet.keep : W.keySheet.endKey}
            </Button>
          </div>
        ) : null
      }
    >
      {key ? (
        <div className="wf-made">
          <p>{keyUsed(key, says)}</p>
          <p>
            {W.keySheet.made} {says.stamp(Date.parse(key.made_at))}
          </p>
          {key.ends_at ? <p>{keyHint(key, says)}</p> : null}
          <p data-strong={ending ? "true" : undefined}>{ending ? W.keySheet.endSays : W.keySheet.changeSays}</p>
        </div>
      ) : null}
    </Sheet>
  );
}
