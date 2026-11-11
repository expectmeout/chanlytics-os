/**
 * A message, open, in the pane beside the list (parts/split.tsx): its mark, its name, where it stands (Needs you, Going
 * out, Not in use, Put away: the list's own reading of it) and what it is for; its channels as tabs, each saying by its dot
 * whether that version needs you, beside its one language control; the message as a customer reads it, its foot, and
 * under them what sends it and what went out (Messages, the canvas of 10 Nov 2026, step 2). The verbs that change it are
 * the one menu on the caret at its head: Rename, Put away and Delete on WhatsApp; Edit and Remove on an email or a text.
 * The rename form and a delete's question stay in the body, where they are answered.
 *
 * It was the row's own, under it. What it keeps is what the open message was keeping: the language in view, the one
 * being written, the one just sent, the channel in view, and the name, the delete, or a version's editor or Remove in
 * progress. The page keys it by the message, so another message opens on its own first language.
 *
 * A message is a name and its versions (One message, every channel, step 1): WhatsApp's is what the pane always drew; an
 * email's and a text's are version-view.tsx, which reads the rows of that name the page was handed (versions.ts) and
 * writes them through the page's acts.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { SEQUENCES_ROUTE, VERSION_CHANNELS, VERSION_CHANNEL_WORDS, sequenceRoute } from "@chanlytics/contracts";
import type { VersionChannel } from "@chanlytics/contracts";
import type { ApiResult } from "@/client/api";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { navigate } from "../../frame-verbs";
import { StatePill } from "../../kit/pill/state-pill";
import { RecordRow } from "../../kit/record/row";
import { SubTabs } from "../../kit/sub-tabs/sub-tabs";
import { CmPane, useCmPhone } from "../parts/split";
import type { TemplateMade } from "./composer-acts";
import type { StarterGroup, TemplateGroup, TplLang } from "./group";
import { firstView, messageFacts, placeOfMessage, sentByWords } from "./message-row-facts";
import type { MessagePlace } from "./message-row-facts";
import { langBar, openRow, paneMenu, tplMark } from "./message-row-parts";
import type { RowCtx, VersionActs } from "./message-row-parts";
import { keptWords } from "./version-editor";
import { VersionView } from "./version-view";
import type { StarterLibrary, VersionDraft } from "./verbs";
import { messageName, neverCarried, startingWords, versionFills, versionRowOf } from "./versions";
import { TPL_LIST_WORDS, TPL_VERSION_WORDS } from "./words";

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

/** Where it stands, as its head's pill says it: the list's group, in the tone of what it asks of you. */
const PLACE_TONES: Record<MessagePlace, string> = { need: "warn", going: "ok", idle: "plain", away: "plain" };

type Facts = ReturnType<typeof messageFacts>;

/**
 * What the message is for, under its name: a starter's own line, else what kind of message it is (an offer reaches only
 * people who said yes to offers; a note about their own booking reaches anyone a send may).
 */
function forWords(g: TemplateGroup, offer: boolean): string {
  if (g.starter) return g.purpose.charAt(0).toUpperCase() + g.purpose.slice(1);
  return offer ? TPL_LIST_WORDS.anOffer : TPL_LIST_WORDS.aNote;
}

/**
 * Under the words: what sends it, with the one sequence that does where it opens it (else the list of them), and how many
 * went out and when the last did. Nothing of either where it was not read; a starter never added has no sends to say.
 */
function messageFactsRows(facts: Facts) {
  const { use, sent } = facts.usage;
  const sends = use && !use.unused;
  const sentLine = !sent
    ? null
    : sent.count
      ? TPL_LIST_WORDS.sentFact(sent.count, sent.when)
      : /never/i.test(sent.when ?? "")
        ? TPL_LIST_WORDS.neverSent
        : null;
  if (!sends && !sentLine) return null;
  return (
    <div className="tpl-facts" data-testid="template-facts">
      {sends ? (
        <RecordRow
          id="template-sent-by"
          label={TPL_LIST_WORDS.sentBy}
          value={sentByWords(use)}
          act={{
            label: TPL_LIST_WORDS.open,
            onClick: () => navigate(use.sequence ? sequenceRoute(use.sequence) : SEQUENCES_ROUTE),
            testid: "template-users",
            name: `${TPL_LIST_WORDS.open} ${use.words}`,
          }}
        />
      ) : null}
      {sentLine ? <RecordRow id="template-sent-count" label={TPL_LIST_WORDS.sent} value={sentLine} /> : null}
    </div>
  );
}

/** The key a version's editor and its Remove are held under: its channel and its language. */
const versionKey = (channel: VersionChannel, language: string): string => `${channel}:${language}`;

/**
 * An email's or a text's version's two states, which the pane's menu sets (Edit, Remove): which one is being written, and
 * which one's Remove is being asked. Words an editor left in the tab open it again, until it is closed.
 */
function useVersionHeld() {
  // A key being written; `-key` for one closed by hand, so words it kept do not open it again.
  const [writing, setWriting] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  return (key: string, kept: boolean) => ({
    writing: writing === null ? kept : writing === key,
    setWriting: (on: boolean) => setWriting(on ? key : `-${key}`),
    removing: removing === key,
    setRemoving: (on: boolean) => setRemoving(on ? key : null),
  });
}

/** The channels as tabs, each named by contracts' word, its standing on hover, and a dot where its version needs you. */
function channelTabs(facts: Facts, standing: Record<VersionChannel, string>) {
  const whatsapp = facts.lang.message?.versions.whatsapp ?? null;
  const waiting = !!whatsapp && (whatsapp.status !== "approved" || whatsapp.blocked !== null);
  return VERSION_CHANNELS.map((value) => ({
    id: value,
    label: VERSION_CHANNEL_WORDS[value],
    testid: `template-channel-${value}`,
    hint: standing[value],
    ...(value === "whatsapp" && waiting ? { need: standing.whatsapp } : {}),
  }));
}

/**
 * An email's or a text's version, where its tab is in view, and its acts, which the head's one menu holds: Edit, and
 * Remove, where a version is on file to act on. Nothing of either on WhatsApp, whose words are the pane's own.
 */
function versionPart({
  g,
  S,
  facts,
  channel,
  canWrite,
  busy,
  heldOf,
  onSave,
  onRemove,
}: {
  g: TemplateGroup;
  S: StarterLibrary;
  facts: Facts;
  channel: VersionChannel;
  canWrite: boolean;
  busy: boolean;
  heldOf: ReturnType<typeof useVersionHeld>;
  onSave: (written: VersionDraft) => Promise<ApiResult<unknown> | null>;
  onRemove: (filed: TemplateDto) => void;
}): { version: ReactNode; versionActs: VersionActs | null } {
  if (channel === "whatsapp") return { version: null, versionActs: null };
  const { present, onFile, lang, words, has } = facts;
  const { view, row } = lang;
  const own = [...has.email, ...has.sms];
  const fills = versionFills({ g, S, present, row, own, view, values: words.values });
  const filedRow = has[channel].find((r) => r.language === view) ?? null;
  const name = messageName(g);
  const key = versionKey(channel, view);
  const held = heldOf(key, !!name && !!keptWords(name, view, channel));
  const versionActs: VersionActs | null =
    filedRow && name && canWrite && !held.writing
      ? {
          word: VERSION_CHANNEL_WORDS[channel],
          onEdit: () => held.setWriting(true),
          onRemove: () => held.setRemoving(true),
        }
      : null;
  if (!fills) return { version: null, versionActs };
  const version = (
    <VersionView
      key={key}
      name={name}
      channel={channel}
      lang={lang.cur.lang}
      row={filedRow ? versionRowOf(filedRow) : null}
      start={startingWords({
        channel,
        g,
        language: view,
        copy: words.body || (own.find((r) => r.language === view)?.body_preview ?? ""),
      })}
      slots={fills.slots}
      values={fills.values}
      neverCarried={neverCarried(channel, g, lang.message)}
      starterHas={!!(channel === "email" ? g.starter?.email?.[view] : g.starter?.sms?.[view])}
      filed={onFile.length > 0}
      canWrite={canWrite}
      busy={busy}
      onSave={onSave}
      onRemove={() => filedRow && onRemove(filedRow)}
      held={held}
    />
  );
  return { version, versionActs };
}

export function TemplatePane(p: PaneProps) {
  const { g, langs, bizName, canAct, canAdd = false, addWhy = null, busy, doing = null, S, onClose } = p;
  const { onAdd, onRename, onHide, onDelete, onWritten, versions, canWrite = false } = p;
  const { onSaveVersion = () => Promise.resolve(null), onRemoveVersion = () => undefined } = p;
  const first = firstView(g, langs);
  const phone = useCmPhone();
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
  const heldOf = useVersionHeld();
  // Which of the message's channels is in view: where it opens is the one its anchor is on (contracts rule 2: WhatsApp's,
  // else the email's, else the text's), WhatsApp's words as they always were where it has them.
  const [channel, setChannel] = useState<VersionChannel>(
    () => g.rows.find((r) => r.lang.id === first.langId)?.message?.anchor.channel ?? "whatsapp",
  );
  const facts = messageFacts({ g, langs, S, canAdd, addWhy, versions, view: { langId, back, adding, sentLang } });
  const { present, onFile, lang, words, usage, marks, note, standing } = facts;
  // Where it stands is the list's reading, of the language it opens on: the head says what its row says.
  const setting = placeOfMessage(g, messageFacts({ g, langs, S, versions, view: first }));
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
    onFile,
    standing,
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
  // The channels as tabs, and the language control beside them, which keeps its place whichever is in view.
  const bar = (
    <div className="tpl-viewbar">
      <SubTabs
        label={TPL_VERSION_WORDS.switchName(g.title)}
        value={channel}
        tabs={channelTabs(facts, standing)}
        onSelect={(id) => setChannel(VERSION_CHANNELS.find((v) => v === id) ?? channel)}
        className="tpl-channels"
      />
      {langBar(c)}
    </div>
  );
  const { version, versionActs } = versionPart({
    ...{ g, S, facts, channel, canWrite, busy, heldOf },
    onSave: (written) => onSaveVersion(g, lang.cur.lang, written),
    onRemove: (filed) => onRemoveVersion(g, lang.cur.lang, filed),
  });
  return (
    <CmPane
      testid="template-pane"
      // A phone's head is a line a thumb wide: the gift or the bell is the desk's.
      mark={phone ? null : tplMark(marks.offer)}
      title={g.title}
      badge={
        <StatePill
          kind="tone"
          value={PLACE_TONES[setting.place]}
          label={TPL_LIST_WORDS.placeWord[setting.place]}
          testid="template-pane-status"
        />
      }
      sub={<span data-testid="template-pane-users">{forWords(g, marks.offer)}</span>}
      tools={paneMenu(c, channel, versionActs)}
      onClose={onClose}
    >
      {openRow(c, bar, version, {
        need: setting.place === "need" ? setting.said : null,
        facts: messageFactsRows(facts),
      })}
    </CmPane>
  );
}
