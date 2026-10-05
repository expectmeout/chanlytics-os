/**
 * A message's email or text version, in the pane beside the list, when the channel switch is on it (One message, every
 * channel, step 1): the version in the language in view as its recipient reads it, with its Edit and Remove under a menu
 * (Remove asks first); or, where the message has none, one quiet line and the act that writes it, which opens the editor
 * on the starter's words or a copy of the WhatsApp ones. A message the channel never carries (an offer, by text) has no
 * version there and cannot have one, so it says why in contracts' words and offers nothing. The editor takes the view's
 * place while a version is being written, and its words come back if the pane was left with them unsaved (the editor's
 * own rule).
 */
import { useState } from "react";
import { VERSION_CHANNEL_WORDS } from "@chanlytics/contracts";
import type { EmailRules, OwnVersionChannel, SlotSet, SlotValue, VersionWords } from "@chanlytics/contracts";
import type { ApiResult } from "@/client/api";
import { gate } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
import type { MenuGroup, MenuItem } from "../../kit/menu/menu";
import type { TplLang } from "./group";
import { VersionEditor, keptWords } from "./version-editor";
import { VersionPreview } from "./version-preview";
import type { VersionDraft } from "./verbs";
import type { VersionRow } from "./versions";
import { TPL_VERSION_WORDS as WORDS } from "./words";

interface VersionViewProps {
  /** The message's name (what a version is filed under), or null where it has no row to name it. */
  name: string | null;
  channel: OwnVersionChannel;
  lang: TplLang;
  /** The version on file in that language, if there is one. */
  row: VersionRow | null;
  /** What writing one begins with. */
  start: VersionWords;
  /** The message's slots with what each is called, and the example that fills each in a preview, in the same order. */
  slots: SlotSet;
  values: readonly SlotValue[];
  /** An email's rules where it is not a campaign message's: a reach-out's (step 5). */
  rules?: EmailRules<string>;
  /**
   * Why this channel never carries this message, in contracts' words (channelNeverCarries: "Texts carry no offers."), or
   * null where it may. A message a channel never carries has no version there and cannot have one, so it says why and
   * offers nothing.
   */
  neverCarried: string | null;
  /** For a starter, whether the library wrote it a version on this channel in this language (the words in `start`). */
  starterHas: boolean;
  /** Whether the message is on file (a WhatsApp row of it): a version is filed under a message that is. */
  filed: boolean;
  /** Who may write: the role store's answer. */
  canWrite: boolean;
  busy: boolean;
  onSave: (draft: VersionDraft) => Promise<ApiResult<unknown> | null>;
  /** Taking the version away, which asks first; none where the version is not this page's to remove (a reach-out's is its step's). */
  onRemove?: (row: VersionRow) => void;
}

/** The menu on a version on file: Edit, and Remove, which asks first, where the version may be removed. */
function versionMenu(p: { channel: OwnVersionChannel; busy: boolean; onEdit: () => void; onRemove?: () => void }) {
  const { channel, busy, onEdit, onRemove } = p;
  const items: MenuItem[] = [
    {
      label: WORDS.edit,
      glyph: <Icon name="pencil" size={13} />,
      disabled: busy,
      gate: { "data-testid": "template-version-edit" },
      onSelect: onEdit,
    },
  ];
  if (onRemove)
    items.push({
      label: WORDS.remove,
      glyph: <Icon name="x" size={13} />,
      tone: "danger",
      disabled: busy,
      gate: { "data-testid": "template-version-remove" },
      onSelect: onRemove,
    });
  const groups: MenuGroup[] = [{ items }];
  const name = WORDS.moreFor(VERSION_CHANNEL_WORDS[channel]);
  return (
    <Menu
      trigger={
        <Button iconOnly variant="quiet" size="sm" aria-label={name} title={name} data-testid="template-version-menu">
          <Icon name="more" size={13} />
        </Button>
      }
      groups={groups}
    />
  );
}

/** A version on file: its preview, its menu and, once Remove is chosen, the question. */
function Held(p: VersionViewProps & { row: VersionRow; onEdit: () => void }) {
  const { channel, lang, row, slots, values, rules, canWrite, busy, onEdit, onRemove } = p;
  const [arm, setArm] = useState(false);
  const word = VERSION_CHANNEL_WORDS[channel];
  return (
    <div className="tpl-ver" data-testid="template-version" data-channel={channel}>
      <div className="tpl-ver-read">
        <VersionPreview
          channel={channel}
          words={row.words}
          values={values}
          language={lang.id}
          slots={slots}
          rules={rules}
        />
        {canWrite ? versionMenu({ channel, busy, onEdit, onRemove: onRemove ? () => setArm(true) : undefined }) : null}
      </div>
      {arm ? (
        <Confirm
          question={WORDS.removeAsk(word, lang.label)}
          detail={WORDS.removeDetail}
          yes={WORDS.removeYes}
          danger
          busy={busy}
          onYes={() => {
            setArm(false);
            onRemove?.(row);
          }}
          onNo={() => setArm(false)}
          testid="template-version-remove"
        />
      ) : null}
    </div>
  );
}

/** A message with no version here: what it says of that, and the act that writes one. */
function None(p: VersionViewProps & { onWrite: () => void }) {
  const { channel, lang, neverCarried, busy, onWrite } = p;
  const word = VERSION_CHANNEL_WORDS[channel];
  // A message this channel never carries has no version and cannot have one: there is nothing to write, so no act is offered.
  return (
    <div className="tpl-ver-none" data-testid="template-version-none">
      <p className="bc-excl-hint">{neverCarried ?? WORDS.none(word, lang.label)}</p>
      {neverCarried ? null : (
        <Button
          size="sm"
          disabled={busy}
          onClick={onWrite}
          data-testid="template-version-write"
          {...gate("approve", "write a version")}
        >
          {WORDS.write(word)}
        </Button>
      )}
    </div>
  );
}

/**
 * A starter not added yet: nothing is on file to write a version of (the server would refuse it), so the version the
 * library wrote is shown as it reads and said to come with the set; one the library did not write is said not to.
 */
function Unfiled(p: VersionViewProps) {
  const { channel, lang, start, slots, values, rules, neverCarried, starterHas } = p;
  if (!starterHas || neverCarried)
    return (
      <div className="tpl-ver-none" data-testid="template-version-none">
        <p className="bc-excl-hint">{neverCarried ?? WORDS.noneInSet(VERSION_CHANNEL_WORDS[channel])}</p>
      </div>
    );
  return (
    <div className="tpl-ver" data-testid="template-version-starter" data-channel={channel}>
      <div className="tpl-ver-read">
        <VersionPreview
          channel={channel}
          words={start}
          values={values}
          language={lang.id}
          slots={slots}
          rules={rules}
        />
      </div>
      <p className="bc-excl-hint">{WORDS.withStarters}</p>
    </div>
  );
}

/** The version on the channel the switch is on, in the language in view. */
export function VersionView(p: VersionViewProps) {
  const { name, channel, lang, row, start, slots, values, rules, busy, onSave } = p;
  // Words kept in the tab from an editor that was left open are written again where the pane opens.
  const [writing, setWriting] = useState(() => !!name && !!keptWords(name, lang.id, channel));
  if (!name || !p.filed) return <Unfiled {...p} />;
  if (writing && name) {
    return (
      <VersionEditor
        name={name}
        channel={channel}
        language={lang.id}
        start={row ? row.words : start}
        slots={slots}
        values={values}
        rules={rules}
        busy={busy}
        onSave={onSave}
        onClose={() => setWriting(false)}
      />
    );
  }
  return row ? (
    <Held {...p} row={row} onEdit={() => setWriting(true)} />
  ) : (
    <None {...p} onWrite={() => setWriting(true)} />
  );
}
