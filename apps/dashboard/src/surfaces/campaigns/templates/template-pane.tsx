/**
 * A message, open, in the pane beside the list (parts/split.tsx): its mark, its name, its state in the language in view
 * and what sends it over its one language control, the message as a customer reads it, its foot and the verbs that
 * change it -- Rename, Hide and Delete, the menu in the pane's head (message-row-parts.tsx). The rename form and a
 * delete's question stay in the body, where they are answered.
 *
 * It was the row's own, under it. What it keeps is what the open message was keeping: the language in view, the one
 * being written, the one just sent, and the name or the delete in progress. The page keys it by the message, so another
 * message opens on its own first language.
 *
 * A message is a name and its versions (One message, every channel, step 1): beside its language control a switch,
 * WhatsApp | Email | Text, says which version is in view in that language. WhatsApp's is what the pane always drew; an
 * email's and a text's are version-view.tsx, which reads the rows of that name the page was handed (versions.ts) and
 * writes them through the page's acts. The head's menu is the WhatsApp message's own, so it is drawn on WhatsApp alone.
 */
import { useState } from "react";
import { VERSION_CHANNELS, VERSION_CHANNEL_WORDS } from "@chanlytics/contracts";
import type { VersionChannel } from "@chanlytics/contracts";
import type { ApiResult } from "@/client/api";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { statePillPart } from "../../legacy-parts";
import { Segmented } from "../../kit/segmented/segmented";
import { CmPane } from "../parts/split";
import type { TemplateMade } from "./composer-acts";
import type { StarterGroup, TemplateGroup, TplLang } from "./group";
import { firstView, messageFacts } from "./message-row-facts";
import { langBar, openRow, paneMenu, tplMark } from "./message-row-parts";
import type { LineCtx, RowCtx } from "./message-row-parts";
import { VersionView } from "./version-view";
import type { StarterLibrary, VersionDraft } from "./verbs";
import { isOffer, messageName, startingWords, versionFills, versionRowOf } from "./versions";
import { TPL_VERSION_WORDS } from "./words";

interface PaneProps {
  g: TemplateGroup;
  langs: readonly TplLang[];
  bizName: string | null;
  canAct: boolean;
  canAdd?: boolean;
  addWhy?: string | null;
  busy: boolean;
  doing?: string | null;
  S: StarterLibrary;
  onClose: () => void;
  onAdd: (g: StarterGroup, lang: TplLang) => void;
  onRename: (row: TemplateDto, draft: string) => void;
  onHide: (row: TemplateDto) => void;
  onDelete: (row: TemplateDto) => void;
  onWritten?: (g: TemplateGroup, lang: TplLang, made: TemplateMade) => void;
  /** The workspace's email and text rows, from which the message's own versions are found. */
  versions?: readonly TemplateDto[];
  /** Who may write an email or a text version: the role store's answer, with no need of a WhatsApp number. */
  canWrite?: boolean;
  onSaveVersion?: (g: TemplateGroup, lang: TplLang, draft: VersionDraft) => Promise<ApiResult<unknown> | null>;
  onRemoveVersion?: (g: TemplateGroup, lang: TplLang, row: TemplateDto) => void;
}

/** The channel switch's choices, in the order a page offers them, each by contracts' name for it. */
const CHANNEL_OPTIONS = VERSION_CHANNELS.map((value) => ({
  value,
  label: VERSION_CHANNEL_WORDS[value],
  testid: `template-channel-${value}`,
}));

/** What sends it, in the words its row says: the one line under the pane's name. */
const sendsWords = (use: LineCtx["use"]) =>
  use ? (use.unused ? "Nothing sends it" : `${use.words}${use.note ? ` · ${use.note}` : ""}`) : null;

export function TemplatePane(p: PaneProps) {
  const { g, langs, bizName, canAct, canAdd = false, addWhy = null, busy, doing = null, S, onClose } = p;
  const { onAdd, onRename, onHide, onDelete, onWritten, versions, canWrite = false } = p;
  const { onSaveVersion = () => Promise.resolve(null), onRemoveVersion = () => undefined } = p;
  const first = firstView(g, langs);
  const [langId, setLangId] = useState(first.langId);
  // The language that was in view before one nobody has written was picked: the
  // words a translation is written from, and where Cancel goes back to.
  const [back, setBack] = useState<string | null>(null);
  // A language picked from "Translate into": the one being written now. Only a
  // language picked there is ever written -- one that simply stopped being on
  // file (deleted, or gone with a sync) is not a request to write it again.
  const [adding, setAdding] = useState<string | null>(null);
  // A language just sent to WhatsApp, until its row arrives with the next read:
  // the pane says it went, rather than offering the same words to send twice.
  const [sentLang, setSentLang] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [arm, setArm] = useState(false);
  // Which of the message's channels is in view: WhatsApp's words as they always were, or its email or its text.
  const [channel, setChannel] = useState<VersionChannel>("whatsapp");
  const facts = messageFacts({ g, langs, S, canAdd, addWhy, versions, view: { langId, back, adding, sentLang } });
  const { present, lang, words, usage, marks, note, has } = facts;
  const { view, row } = lang;
  const closeActs = () => {
    setRenaming(false);
    setArm(false);
  };
  const pick = (id: string, choice?: { group?: string }) => {
    if (id !== view) {
      // Back to a language that exists, never to one that was only being drafted.
      if (row || lang.written) setBack(view);
      setLangId(id);
    }
    // Picked from "Translate into": the one language this message may now write, which is WhatsApp's to write.
    setAdding(choice && choice.group === "add" ? id : null);
    if (choice && choice.group === "add") setChannel("whatsapp");
    closeActs();
  };
  const cancelNew = () => {
    setLangId(back || first.langId);
    setBack(null);
    setAdding(null);
  };
  const c: RowCtx = {
    ...lang,
    ...words,
    ...usage,
    g,
    langs,
    S,
    bizName,
    canAct,
    busy,
    doing,
    onAdd,
    onRename,
    onHide,
    onDelete,
    onWritten,
    present,
    renaming,
    draft,
    arm,
    adding,
    sentLang,
    setRenaming,
    setDraft,
    setArm,
    setAdding,
    setSentLang,
    setBack,
    note,
    closeActs,
    pick,
    cancelNew,
  };
  const StatePill = statePillPart();
  const says = sendsWords(usage.use);
  // The language control keeps its place; the switch is beside it, and picks what the body below shows.
  const bar = (
    <div className="tpl-viewbar">
      {langBar(c)}
      <Segmented
        label={TPL_VERSION_WORDS.switchName(g.title)}
        value={channel}
        onValueChange={setChannel}
        options={CHANNEL_OPTIONS}
        className="tpl-channels"
      />
    </div>
  );
  const fills = channel === "whatsapp" ? null : versionFills({ g, S, present, row, view, values: words.values });
  const filedRow = channel === "whatsapp" ? null : (has[channel].find((r) => r.language === view) ?? null);
  const version =
    channel !== "whatsapp" && fills ? (
      <VersionView
        key={`${channel}:${view}`}
        name={messageName(g)}
        channel={channel}
        lang={lang.cur.lang}
        row={filedRow ? versionRowOf(filedRow) : null}
        start={startingWords({ channel, g, language: view, whatsapp: words.body })}
        slots={fills.slots}
        values={fills.values}
        offer={isOffer(g, row, present)}
        starterHas={!!(channel === "email" ? g.starter?.email?.[view] : g.starter?.sms?.[view])}
        filed={g.rows.some((r) => r.row)}
        canWrite={canWrite}
        busy={busy}
        onSave={(written) => onSaveVersion(g, lang.cur.lang, written)}
        onRemove={() => filedRow && onRemoveVersion(g, lang.cur.lang, filedRow)}
      />
    ) : null;
  return (
    <CmPane
      testid="template-pane"
      mark={tplMark(marks.offer)}
      title={g.title}
      badge={row ? <StatePill kind="template" value={row.meta_status} testid="template-pane-status" /> : null}
      sub={says ? <span data-testid="template-pane-users">{says}</span> : null}
      // Rename, Hide and Delete are the WhatsApp message's (their question and their form are drawn where its words are);
      // an email's or a text's own Edit and Remove are the menu on that version.
      tools={channel === "whatsapp" ? paneMenu(c) : null}
      onClose={onClose}
    >
      {openRow(c, bar, version)}
    </CmPane>
  );
}
