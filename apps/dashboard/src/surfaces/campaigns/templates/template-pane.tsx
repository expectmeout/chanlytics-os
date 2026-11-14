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
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { MESSAGE_CHANGE_WORDS, VERSION_CHANNELS, VERSION_CHANNEL_WORDS, channelChoices } from "@chanlytics/contracts";
import type { CampaignMessage, VersionChannel } from "@chanlytics/contracts";
import type { ApiResult } from "@/client/api";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { SubTabs } from "../../kit/sub-tabs/sub-tabs";
import { surfaceValue } from "../../surface-values";
import { CmPane } from "../parts/split";
import type { TemplateMade } from "./composer-acts";
import type { StarterGroup, TemplateGroup, TplLang } from "./group";
import { aboutOfMessage, firstView, messageFacts, placeOfMessage, sentByWords } from "./message-row-facts";
import { LanguageWord, addLanguageItem, openRow, paneName } from "./message-row-parts";
import type { RowCtx, VersionActs } from "./message-row-parts";
import { factsLine, standingTap } from "./sheet-head";
import { VersionEditor, keptWords } from "./version-editor";
import { VersionView } from "./version-view";
import type { StarterLibrary, VersionDraft } from "./verbs";
import { messageName, neverCarried, startingWords, versionFills, versionRowOf } from "./versions";
import { TPL_VERSION_WORDS, tplLangLabel } from "./words";

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
  /** A language the set wrote, added to a starter the workspace already uses. */
  onAdd: (g: StarterGroup, lang: TplLang) => void;
  onRename: (rows: readonly TemplateDto[], draft: string) => void;
  onHide: (row: TemplateDto, stillSentBy?: string | null) => void;
  /** The message deleted whole in the language in view: every version of it there. */
  onDelete: (title: string, rows: readonly TemplateDto[]) => void;
  onWritten?: (g: TemplateGroup, lang: TplLang, made: TemplateMade) => void;
  /** The workspace's email and text rows, from which the message's own versions are found. */
  versions?: readonly TemplateDto[];
  /** Who may write an email or a text version: the role store's answer, with no need of a WhatsApp number. */
  canWrite?: boolean;
  onSaveVersion?: (g: TemplateGroup, lang: TplLang, draft: VersionDraft) => Promise<ApiResult<unknown> | null>;
  onRemoveVersion?: (g: TemplateGroup, lang: TplLang, row: TemplateDto) => void;
  /** WhatsApp's words changed and sent back to WhatsApp (step 3); answered as a save is. */
  onSendWords?: (row: TemplateDto, body: string) => Promise<ApiResult<unknown> | null>;
  /** A language added: the message's email and text versions written in it too, each saved beside the message. */
  onTranslateOwn?: (title: string, rows: readonly TemplateDto[], to: TplLang) => void;
}

/**
 * Adding a language, for every version the message has (the message sheet's review, 12 Nov 2026: it wrote WhatsApp's
 * alone): once WhatsApp's goes out in it, its email and text are written in it too; a message with no WhatsApp version
 * adds a language by its email and text alone, straight from the pick, with no number needed.
 */
function languageAdds(props: PaneProps, facts: Facts) {
  const own = [...facts.has.email, ...facts.has.sms];
  const translate = (from: string | null, to: TplLang) => {
    // A channel the message already has in the new language keeps its own words: only the missing ones are written.
    const has = (r: TemplateDto) => own.some((o) => o.language === to.id && o.channel === r.channel);
    const rows = from ? own.filter((r) => r.language === from && !has(r)) : [];
    if (rows.length && props.onTranslateOwn) props.onTranslateOwn(props.g.title, rows, to);
  };
  const ownOnly =
    !props.g.starter && facts.present.length === 0 && own.length > 0 && !!props.canWrite && !!props.onTranslateOwn;
  return { ownOnly, translate };
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
  // How many times an editor was closed: the sheet's held height lets go of what the editor made it (useGrowOnly).
  const [closes, setCloses] = useState(0);
  const of = (key: string, kept: boolean) => ({
    writing: writing === null ? kept : writing === key,
    setWriting: (on: boolean) => {
      setWriting(on ? key : `-${key}`);
      if (!on) setCloses((n) => n + 1);
    },
    removing: removing === key,
    setRemoving: (on: boolean) => setRemoving(on ? key : null),
  });
  return Object.assign(of, { closes });
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
  const cannot: Record<VersionChannel, string | null> = { ...none };
  for (const c of channelChoices(ready, message.purpose, aboutOfMessage(message)))
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
  const { present, lang, words, has, usage } = facts;
  const { view, row } = lang;
  // A row WhatsApp holds no copy of (never sent there) has no words to send back: New writes it. A server from before
  // `at_meta` says nothing of it, and the edge answers in words.
  if (!row || !canWrite || !WORDS_CHANGE.has(row.meta_status) || row.at_meta === false)
    return { version: null, versionActs: null };
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
      approvedBefore={refused ? (row.approved_before ?? null) : null}
      // Kept under the refusal the row carries (none is ""), as the read finds it: never the prompt's "no reason given".
      fixFor={refused ? { id: row.id, kept: row.fix_words ?? null, reason: row.rejected_reason ?? "" } : null}
      holds={
        row.meta_status === "approved"
          ? MESSAGE_CHANGE_WORDS.holdsWhileChecked(usage.sending, !!usage.use?.booking)
          : null
      }
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
  const starterHas = !!(channel === "email" ? g.starter?.email?.[view] : g.starter?.sms?.[view]);
  // A ready-made starter's version is changed as a filed one is, before its first use (the clean list, 14 Nov 2026).
  const readyMade = onFile.length === 0 && starterHas && neverCarried(channel, g, lang.message) === null;
  const versionActs: VersionActs | null =
    (filedRow || readyMade) && name && canWrite && !held.writing
      ? {
          word: VERSION_CHANNEL_WORDS[channel],
          onEdit: () => held.setWriting(true),
          onRemove: filedRow ? () => held.setRemoving(true) : null,
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
      starterHas={starterHas}
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

/**
 * The open message keeps the tallest it has been while it is open, on a phone (campaigns.css `.tpl-grow`): its sheet is as
 * tall as what it holds (Ruben, 14 Oct 2026), so a short tab dropped the whole tab row ~200px under the thumb that pressed
 * it, and the next press landed on what had risen there (the live demo, 12 Nov 2026). It grows, and never shrinks while
 * open; the height is a property its stylesheet reads under the phone's width alone.
 */
function useGrowOnly(letGo: number) {
  const tallest = useRef(0);
  const held = useRef<HTMLDivElement | null>(null);
  // An editor closed: what it made the sheet is let go of, and the sheet is as tall as what it holds again.
  useEffect(() => {
    tallest.current = 0;
    held.current?.style.removeProperty("--tpl-tallest");
  }, [letGo]);
  return useCallback((el: HTMLDivElement | null) => {
    held.current = el;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const seen = new ResizeObserver(([entry]) => {
      const height = Math.ceil(entry?.contentRect.height ?? 0);
      if (height <= tallest.current) return;
      tallest.current = height;
      el.style.setProperty("--tpl-tallest", `${height}px`);
    });
    seen.observe(el);
    return () => seen.disconnect();
  }, []);
}

/** The channels as tabs, and the language word beside them, which keeps its place whichever is in view. */
function viewBar(parts: {
  c: RowCtx;
  facts: Facts;
  cannot: Record<VersionChannel, string | null>;
  channel: VersionChannel;
  setChannel: (channel: VersionChannel) => void;
  /** Drawn where there is a choice; asked for from the menu, it goes again as its list closes with nothing added. */
  languageWord: { shown: boolean; asked: boolean; done: () => void };
}) {
  const { c, facts, cannot, channel, setChannel, languageWord } = parts;
  return (
    <div className="tpl-viewbar">
      <SubTabs
        label={TPL_VERSION_WORDS.switchName(c.g.title)}
        value={channel}
        tabs={channelTabs(c.g, facts, c.standing, cannot)}
        onSelect={(id) => setChannel(VERSION_CHANNELS.find((v) => v === id) ?? channel)}
        className="tpl-channels"
      />
      {languageWord.shown ? <LanguageWord c={c} open={languageWord.asked} onClosed={languageWord.done} /> : null}
    </div>
  );
}

/** The version in view and its acts: WhatsApp's words (sent back to WhatsApp), or an email's or a text's. */
function paneVersion(
  props: PaneProps,
  shown: { facts: Facts; channel: VersionChannel; heldOf: ReturnType<typeof useVersionHeld>; dock: HTMLElement | null },
) {
  const { g, S, canAct, canWrite = false, busy } = props;
  const { facts, channel, heldOf, dock } = shown;
  const onSend = props.onSendWords ?? (() => Promise.resolve(null));
  if (channel === "whatsapp") return whatsappPart({ g, S, facts, canWrite: canAct, busy, heldOf, onSend, dock });
  const at = facts.lang.cur.lang;
  return versionPart({
    ...{ g, S, facts, channel, canWrite, busy, heldOf, dock },
    onSave: (written) => props.onSaveVersion?.(g, at, written) ?? Promise.resolve(null),
    onRemove: (filed) => props.onRemoveVersion?.(g, at, filed),
  });
}

/**
 * Every version of the message in the language in view, and the one that names it (contracts' anchor): the menu acts on
 * these whichever channels the message has, never only on a WhatsApp version.
 */
function versionsInView(facts: Facts): { inView: TemplateDto[]; anchor: TemplateDto | null } {
  const { view, row, message } = facts.lang;
  const inView = [...(row ? [row] : []), ...facts.has.email, ...facts.has.sms].filter((r) => r.language === view);
  return { inView, anchor: inView.find((r) => r.id === message?.anchor.id) ?? inView[0] ?? null };
}

/**
 * The language is a word of the bar only where there is a choice to make: two languages on file, one being added, or one
 * in view that is not where it opened. One language says nothing; the name's menu adds another.
 */
function languageChoice(choice: {
  facts: Facts;
  firstLangId: string;
  adding: string | null;
  asked: boolean;
  setAsked: (on: boolean) => void;
  mayAdd: boolean;
  mayWrite: boolean;
}) {
  const { facts, asked, setAsked } = choice;
  const languages = new Set(facts.onFile.map((r) => r.lang.id)).size;
  const shown = languages > 1 || asked || choice.adding !== null || facts.lang.view !== choice.firstLangId;
  const more = !shown && choice.mayAdd && choice.mayWrite ? [addLanguageItem(() => setAsked(true))] : [];
  return { languageWord: { shown, asked, done: () => setAsked(false) }, more };
}

/** What still sends it, said as it is put away: the sequences that run it, which putting it away does not stop. */
const stillSentByOf = (usage: Facts["usage"]): string | null =>
  usage.use && usage.use.running ? sentByWords(usage.use) : null;

export function TemplatePane(p: PaneProps) {
  const { g, langs, bizName, canAct, canAdd = false, addWhy = null, busy, doing = null, S, onClose } = p;
  const { onAdd, onRename, onHide, onDelete, onWritten, versions, canWrite = false } = p;
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
  const grow = useGrowOnly(heldOf.closes);
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
  const adds = languageAdds(p, facts);
  const mayAdd = lang.mayAdd || adds.ownOnly;
  const { inView, anchor } = versionsInView(facts);
  const closeActs = () => {
    setRenaming(false);
    setArm(false);
  };
  const pick = (id: string, choice?: { group?: string }) => {
    // A message with no WhatsApp version writes its new language at once, by its email and text: nothing to draft.
    if (choice?.group === "add" && adds.ownOnly) return adds.translate(view, { id, label: tplLangLabel(id) });
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
    mayAdd,
    g,
    langs,
    S,
    bizName,
    canAct,
    busy,
    doing,
    onAdd,
    onRename,
    onHide: (r: TemplateDto) => onHide(r, stillSentByOf(usage)),
    onDelete,
    onWritten: (gg: TemplateGroup, to: TplLang, filed: TemplateMade) => {
      onWritten?.(gg, to, filed);
      adds.translate(lang.source?.from ?? null, to);
    },
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
    anchor,
    inView,
    canChange: canWrite,
  };
  const cannot = channelsCannot(lang.message);
  const { languageWord, more } = languageChoice({
    ...{ facts, firstLangId: first.langId, adding, mayAdd },
    ...{ asked: langAsked, setAsked: setLangAsked, mayWrite: adds.ownOnly || canAct },
  });
  const bar = viewBar({ c, facts, cannot, channel, setChannel, languageWord });
  const { version, versionActs } = paneVersion(p, { facts, channel, heldOf, dock });
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
      <div className="tpl-grow" ref={grow}>
        {openRow(c, bar, version, {
          // Why it needs you, on WhatsApp's tab; one that only waits for a way out says so on each tab's own line instead.
          need: channel === "whatsapp" && setting.place === "need" ? setting.said : null,
          cannot: cannot[channel],
          onEdit: channel === "whatsapp" ? (versionActs?.onEdit ?? null) : null,
        })}
      </div>
    </CmPane>
  );
}
