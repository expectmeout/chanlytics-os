/**
 * A message, open, in the pane beside the list (parts/split.tsx), in as few words as it can be said (the message sheet's
 * canvas, 12 Nov 2026): its name, which opens its one menu (Rename, Put away, Delete, and an email's or a text's Remove);
 * under it one line of what it is, what sends it and what went; at its right where it stands in a word (Needs you, Going
 * out, Checking, Not in use, Put away), whose meaning is a tap on it (sheet-head.tsx); its channels as tabs, each saying by
 * its dot where that version stands (ready, not written yet, never sent that way, or needing you), with the language a
 * quiet word where there are two; and the message as a customer reads it, its pencil the press that changes it there.
 * WhatsApp's no is said on WhatsApp's tab alone, and a channel this business cannot send it by yet says why on its own
 * tab. What is answered (Send, Save, Undo, a rename's Save, a delete's question) stands in the pane's foot, docked as every
 * drawer's acts are; the new name is typed in the body.
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
import { VERSION_CHANNELS, VERSION_CHANNEL_WORDS, channelChoices } from "@chanlytics/contracts";
import type { CampaignMessage, VersionChannel } from "@chanlytics/contracts";
import type { ApiResult } from "@/client/api";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { SubTabs } from "../../kit/sub-tabs/sub-tabs";
import { surfaceValue } from "../../surface-values";
import { CmPane } from "../parts/split";
import type { TemplateMade } from "./composer-acts";
import type { StarterGroup, TemplateGroup, TplLang } from "./group";
import { firstView, messageFacts, placeOfMessage } from "./message-row-facts";
import { LanguageWord, addLanguageItem, openRow, paneName } from "./message-row-parts";
import type { RowCtx, VersionActs } from "./message-row-parts";
import { factsLine, standingTap } from "./sheet-head";
import { VersionEditor, keptWords } from "./version-editor";
import { VersionView } from "./version-view";
import type { StarterLibrary, VersionDraft } from "./verbs";
import { messageName, neverCarried, startingWords, versionFills, versionRowOf } from "./versions";
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
  /** WhatsApp's words changed and sent back to WhatsApp (step 3); answered as a save is. */
  onSendWords?: (row: TemplateDto, body: string) => Promise<ApiResult<unknown> | null>;
}

/** The standings whose words WhatsApp lets be changed: approved, refused and paused (Meta's template management page). */
const WORDS_CHANGE: ReadonlySet<string> = new Set(["approved", "rejected", "paused"]);

type Facts = ReturnType<typeof messageFacts>;

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

/**
 * Why each channel cannot carry the message for this business now, or null where it can, or where that was not read (the
 * sequences' read of the business's channels, contracts channelChoices): no text line yet, email not set up for offers,
 * Meta's pause on offers. What a channel never carries (an offer, by text) is its tab's own, dimmed, and not said here.
 */
function channelsCannot(message: CampaignMessage | null): Record<VersionChannel, string | null> {
  const none = { whatsapp: null, email: null, sms: null };
  const ready = surfaceValue("playbooks")?.ready ?? null;
  if (!ready || !message) return none;
  const about = message.purpose === "marketing" ? "ours" : "theirs";
  const cannot: Record<VersionChannel, string | null> = { ...none };
  for (const c of channelChoices(ready, message.purpose, about))
    if (!c.ok && !(c.channel === "sms" && message.purpose === "marketing")) cannot[c.channel] = c.why;
  return cannot;
}

/**
 * The channels as tabs, each named by contracts' word, and its dot where its version stands, seen and not only hovered:
 * ready, not written yet (a ring), never sent that way (its words dimmed), or needing you (WhatsApp waiting on its review,
 * or a version this business cannot send yet).
 */
function channelTabs(
  g: TemplateGroup,
  facts: Facts,
  standing: Record<VersionChannel, string>,
  cannot: Record<VersionChannel, string | null>,
) {
  const message = facts.lang.message;
  const whatsapp = message?.versions.whatsapp ?? null;
  const waiting = !!whatsapp && (whatsapp.status !== "approved" || whatsapp.blocked !== null);
  return VERSION_CHANNELS.map((value) => {
    const has = !!message?.versions[value];
    const never = value !== "whatsapp" && neverCarried(value, g, message) !== null;
    const need = value === "whatsapp" && waiting ? standing.whatsapp : has && cannot[value] ? cannot[value] : null;
    return {
      id: value,
      label: VERSION_CHANNEL_WORDS[value],
      testid: `template-channel-${value}`,
      hint: standing[value],
      ...(need
        ? { need }
        : {
            standing: {
              said: standing[value],
              look: has ? ("ready" as const) : never ? ("never" as const) : ("empty" as const),
            },
          }),
    };
  });
}

/**
 * WhatsApp's words, where its tab is in view (the Messages redesign's step 3): changed in the same editor as an email's,
 * drawn once (the box is the words, no bubble repeats them under it: the message sheet's canvas, 12 Nov 2026), and sent
 * back to WhatsApp, for whoever may, where WhatsApp lets them be changed. A refused one opens in the editor by itself, Ask
 * already writing words WhatsApp can take from its reason; the owner reads them and sends them back. Its Edit is the
 * pencil on the words as they are read.
 */
function whatsappPart(o: {
  g: TemplateGroup;
  S: StarterLibrary;
  facts: Facts;
  canWrite: boolean;
  busy: boolean;
  heldOf: ReturnType<typeof useVersionHeld>;
  onSend: (row: TemplateDto, body: string) => Promise<ApiResult<unknown> | null>;
  /** The pane's foot, where the editor's acts stand. */
  dock: HTMLElement | null;
}): { version: ReactNode; versionActs: VersionActs | null } {
  const { g, S, facts, canWrite, busy, heldOf, dock } = o;
  const { present, lang, words, has } = facts;
  const { view, row } = lang;
  if (!row || !canWrite || !WORDS_CHANGE.has(row.meta_status)) return { version: null, versionActs: null };
  const key = versionKey("whatsapp", view);
  const refused = row.meta_status === "rejected";
  const held = heldOf(key, refused || keptWords(row.name, view, "whatsapp") !== null);
  if (!held.writing)
    return {
      version: null,
      versionActs: { word: VERSION_CHANNEL_WORDS.whatsapp, onEdit: () => held.setWriting(true), onRemove: null },
    };
  const fills = versionFills({ g, S, present, row, own: [...has.email, ...has.sms], view, values: words.values });
  const version = (
    <VersionEditor
      key={key}
      name={row.name}
      channel="whatsapp"
      language={view}
      start={{ subject: null, body: row.body_preview ?? words.body }}
      slots={fills.slots}
      values={fills.values}
      busy={busy}
      fix={refused ? (row.rejected_reason ?? "no reason given") : null}
      oneBody
      dock={dock}
      onSave={() => Promise.resolve(null)}
      onSendWords={(body) => o.onSend(row, body)}
      onClose={() => held.setWriting(false)}
    />
  );
  return { version, versionActs: null };
}

/**
 * An email's or a text's version, where its tab is in view, and its acts, which the head's one menu holds: Edit, and
 * Remove, where a version is on file to act on. WhatsApp's are whatsappPart's.
 */
function versionPart({
  g,
  S,
  facts,
  channel,
  canWrite,
  busy,
  heldOf,
  dock,
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
  dock: HTMLElement | null;
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
      oneBody
      dock={dock}
    />
  );
  return { version, versionActs };
}

export function TemplatePane(p: PaneProps) {
  const { g, langs, bizName, canAct, canAdd = false, addWhy = null, busy, doing = null, S, onClose } = p;
  const { onAdd, onRename, onHide, onDelete, onWritten, versions, canWrite = false } = p;
  const { onSaveVersion = () => Promise.resolve(null), onRemoveVersion = () => undefined } = p;
  const { onSendWords = () => Promise.resolve(null) } = p;
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
  // A language asked for from the name's menu, where the message had one: its word is drawn, already open.
  const [langAsked, setLangAsked] = useState(false);
  // The pane's foot, once drawn: the editor's acts and the menu's answers stand there, docked as every drawer's do.
  const [dock, setDock] = useState<HTMLDivElement | null>(null);
  const heldOf = useVersionHeld();
  // Which of the message's channels is in view: where it opens is the one its anchor is on (contracts rule 2: WhatsApp's,
  // else the email's, else the text's), WhatsApp's words as they always were where it has them.
  const [channel, setChannel] = useState<VersionChannel>(
    () => g.rows.find((r) => r.lang.id === first.langId)?.message?.anchor.channel ?? "whatsapp",
  );
  const facts = messageFacts({ g, langs, S, canAdd, addWhy, versions, view: { langId, back, adding, sentLang } });
  const { present, onFile, lang, words, usage, note, standing } = facts;
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
    dock,
  };
  // The language is a word of the bar only where there is a choice to make: two languages on file, one being added, or one
  // in view that is not where it opened. One language says nothing; the name's menu adds another.
  const languages = new Set(onFile.map((r) => r.lang.id)).size;
  const cannot = channelsCannot(lang.message);
  const langShown = languages > 1 || langAsked || adding !== null || view !== first.langId;
  const more = !langShown && lang.mayAdd && canAct ? [addLanguageItem(() => setLangAsked(true))] : [];
  // The channels as tabs, and the language word beside them, which keeps its place whichever is in view.
  const bar = (
    <div className="tpl-viewbar">
      <SubTabs
        label={TPL_VERSION_WORDS.switchName(g.title)}
        value={channel}
        tabs={channelTabs(g, facts, standing, cannot)}
        onSelect={(id) => setChannel(VERSION_CHANNELS.find((v) => v === id) ?? channel)}
        className="tpl-channels"
      />
      {langShown ? <LanguageWord c={c} open={langAsked} /> : null}
    </div>
  );
  const { version, versionActs } =
    channel === "whatsapp"
      ? whatsappPart({ g, S, facts, canWrite: canAct, busy, heldOf, onSend: onSendWords, dock })
      : versionPart({
          ...{ g, S, facts, channel, canWrite, busy, heldOf, dock },
          onSave: (written) => onSaveVersion(g, lang.cur.lang, written),
          onRemove: (filed) => onRemoveVersion(g, lang.cur.lang, filed),
        });
  return (
    <CmPane
      testid="template-pane"
      className="tpl-pane"
      // What it is (the gift or the bell) leads the line of facts under its name, not a mark before it.
      title={paneName(c, channel, versionActs, more)}
      badge={standingTap(g, facts, setting)}
      sub={factsLine(g, facts)}
      onClose={onClose}
      // What is answered stands here, docked as every drawer's acts are; nothing is drawn of it while nothing is asked.
      foot={<div className="tpl-foot" data-foot-pair="" ref={setDock} />}
    >
      {openRow(c, bar, version, {
        need: channel === "whatsapp" && setting.place === "need" ? setting.said : null,
        cannot: cannot[channel],
        onEdit: channel === "whatsapp" ? (versionActs?.onEdit ?? null) : null,
      })}
    </CmPane>
  );
}
