/**
 * What the Templates page does (moved from MessagesReal in legacy/pages/messages.jsx, decision 0015): every verb goes
 * through the templates verbs and the surface is re-fetched, so the cards are the server's. One act runs at a time:
 * every control waits for it, and only the one pressed says it is working. The ref holds the guard before the page has
 * drawn the state. What each says when it is done is the toast's.
 */
import type { RefObject, ReactNode } from "react";
import {
  MESSAGE_CHANGE_WORDS,
  OWN_VERSION_CHANNELS,
  VERSION_CHANNELS,
  VERSION_CHANNEL_WORDS,
  isOneOf,
  reachOutEditedWords,
  versionWord,
  versionWords,
} from "@chanlytics/contracts";
import type { OwnVersionChannel } from "@chanlytics/contracts";
import type { ApiResult } from "@/client/api";
import type { TemplateDto } from "@/surfaces/inbox/types";
import type { useFrameToast } from "../../frame-verbs";
import { starterWords } from "./composer";
import type { TemplateGroup, TplLang } from "./group";
import { syncTemplates, templates as templateVerbs } from "./verbs";
import type { VersionDraft } from "./verbs";
import { TPL_SHEET_WORDS, TPL_VERSION_WORDS, tplLangLabel, tplTitle } from "./words";

interface ActsProps {
  doingRef: RefObject<string | null>;
  setDoing: (doing: string | null) => void;
  flash: ReturnType<typeof useFrameToast>[1];
}

/**
 * A message deleted whole in a language (the message sheet's Delete): its WhatsApp version first, which a send using it
 * refuses before anything goes, then its email's and its text's, each through its own door. The first refusal stops it,
 * and says what already went.
 */
async function deleteWhole(rows: readonly TemplateDto[]): Promise<ApiResult<null>> {
  const order = [...rows].sort((a, b) => Number(b.channel === "whatsapp") - Number(a.channel === "whatsapp"));
  const gone: string[] = [];
  for (const r of order) {
    const res = r.channel === "whatsapp" ? await templateVerbs.remove(r.id) : await templateVerbs.removeVersion(r.id);
    if (!res.ok) return gone.length ? { ...res, message: TPL_SHEET_WORDS.deletedPart(gone, res.message) } : res;
    gone.push(isOneOf(VERSION_CHANNELS, r.channel) ? versionWord(r.channel) : r.channel);
  }
  return { ok: true, data: null };
}

/**
 * A message's email and text versions written again in a language being added (Add a language, for every version the
 * message has): each written by Ask from the words it has, every value kept, then saved beside the message. The first
 * refusal stops it, and says what was saved.
 */
async function writeOwnIn(rows: readonly TemplateDto[], to: TplLang): Promise<ApiResult<{ saved: string[] }>> {
  const saved: string[] = [];
  for (const version of rows) {
    if (!isOneOf(OWN_VERSION_CHANNELS, version.channel)) continue;
    const { subject, body } = versionWords(version);
    const ask = TPL_VERSION_WORDS.translateAsk(to.label);
    const wrote = await templateVerbs.rewrite({ channel: version.channel, language: to.id, subject, body, ask });
    const kept = wrote.ok
      ? await templateVerbs.saveVersion({
          name: version.name,
          language: to.id,
          channel: version.channel,
          ...(wrote.data.subject ? { subject: wrote.data.subject } : {}),
          body: wrote.data.body,
        })
      : wrote;
    if (!kept.ok)
      return saved.length ? { ...kept, message: TPL_VERSION_WORDS.translatedPart(saved, kept.message) } : kept;
    saved.push(versionWord(version.channel));
  }
  return { ok: true, data: { saved } };
}

/** One act at a time: every control waits for it, only the one pressed says it is working, and the toast says what it did. */
function actRunner({ doingRef, setDoing, flash }: ActsProps) {
  return async <T,>(what: string, fn: () => Promise<ApiResult<T>>, said: (r: { ok: true; data: T }) => ReactNode) => {
    if (doingRef.current) return;
    doingRef.current = what;
    setDoing(what);
    const r = await fn();
    doingRef.current = null;
    setDoing(null);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? said(r) : <>{r.message}</> });
  };
}

/** Each version given the name, one call each, the first refusal stopping it. */
async function renameAll(rows: readonly TemplateDto[], title: string | null): Promise<ApiResult<null>> {
  for (const r of rows) {
    const res = await templateVerbs.rename(r.id, title);
    if (!res.ok) return res;
  }
  return { ok: true, data: null };
}

/** The rename's toast: the new name, and where WhatsApp holds a version, the name WhatsApp keeps for it. */
function renamedSays(title: string | null, name: string, atWhatsApp: boolean): ReactNode {
  if (!title)
    return (
      <>
        <b>{tplTitle({ name })}</b> goes by its name again
      </>
    );
  return (
    <>
      Now called <b>{title}</b>
      {atWhatsApp ? ` — WhatsApp still knows it as ${name}` : null}
    </>
  );
}

/** Put away or brought back; put away while something still sends it, it says it stops nothing, naming what. */
function hiddenSays(row: TemplateDto, stillSentBy: string | null): ReactNode {
  if (row.hidden_at) return MESSAGE_CHANGE_WORDS.back(tplTitle(row));
  return (
    <>
      {MESSAGE_CHANGE_WORDS.away(tplTitle(row))}
      {stillSentBy ? `. ${MESSAGE_CHANGE_WORDS.awayStill(stillSentBy)}` : null}
    </>
  );
}

export function pageActs({ doingRef, setDoing, flash }: ActsProps) {
  const run = actRunner({ doingRef, setDoing, flash });
  // Renamed: every version of the message in the language takes the name, so none keeps an old one another could show
  // again (the message sheet's review, 12 Nov 2026); the first is the one that names it.
  const rename = (rows: readonly TemplateDto[], draft: string) => {
    const first = rows[0];
    if (!first) return;
    const title = draft.replace(/\s+/g, " ").trim() || null;
    const atWhatsApp = rows.some((r) => r.channel === "whatsapp");
    void run(
      `rename:${first.id}`,
      () => renameAll(rows, title),
      () => renamedSays(title, first.name, atWhatsApp),
    );
  };
  // Put away (or brought back); where something still sends it, putting it away says it stops nothing, naming what.
  const toggleHidden = (row: TemplateDto, stillSentBy: string | null = null) =>
    run(
      `hide:${row.id}`,
      () => (row.hidden_at ? templateVerbs.show(row.id) : templateVerbs.hide(row.id)),
      () => hiddenSays(row, stillSentBy),
    );
  // A language added: the message's email and text written in it too, each saved beside the message.
  const translateOwn = (title: string, rows: readonly TemplateDto[], to: TplLang) =>
    run(
      `translate:${to.id}:${rows.map((r) => r.id).join(",")}`,
      () => writeOwnIn(rows, to),
      (r) => <>{TPL_VERSION_WORDS.translated(title, to.label, r.data.saved)}</>,
    );
  const removeMessage = (title: string, rows: readonly TemplateDto[]) =>
    run(
      `delete:${rows.map((r) => r.id).join(",")}`,
      () => deleteWhole(rows),
      () => <>{MESSAGE_CHANGE_WORDS.deleted(title)}</>,
    );
  const addStarters = (keys: string[] | null, languages: string[]) =>
    run(
      `add:${keys ? keys.join(",") : "all"}:${languages.join(",")}`,
      () => templateVerbs.addStarters({ ...(keys ? { keys } : {}), languages }),
      (r) => <>{starterWords(r.data)}</>,
    );
  const sync = () =>
    run(
      "sync",
      () => syncTemplates(),
      (r) => {
        const { seen, approved, marketing } = r.data;
        return (
          <>
            {seen} message{seen === 1 ? "" : "s"} from WhatsApp — {approved} approved, {marketing} marketing
          </>
        );
      },
    );
  // An email or a text version written: the answer goes back to the editor, which says a refusal where it was typed (the
  // server's own words), so only a save that landed is a toast here, saying what it did. One act at a time, as every other.
  const writeVersion = async (draft: VersionDraft, said: (saved: { rechecked?: number }) => ReactNode) => {
    if (doingRef.current) return null;
    const what = `version:${draft.name}:${draft.language}:${draft.channel}`;
    doingRef.current = what;
    setDoing(what);
    try {
      const r = await templateVerbs.saveVersion(draft);
      if (r.ok) flash({ tone: "ok", msg: said(r.data) });
      return r;
    } finally {
      // Whatever the save did, the page is free to act again.
      doingRef.current = null;
      setDoing(null);
    }
  };
  const saveVersion = (g: TemplateGroup, lang: TplLang, draft: VersionDraft) =>
    writeVersion(draft, () => TPL_VERSION_WORDS.saved(g.title, VERSION_CHANNEL_WORDS[draft.channel], lang.label));
  // The first version of a message the composer wrote: the same save, and the toast says the message is in the Library.
  const beginMessage = (draft: VersionDraft) =>
    writeVersion(draft, () =>
      TPL_VERSION_WORDS.began(
        draft.message?.title ?? draft.name,
        VERSION_CHANNEL_WORDS[draft.channel],
        tplLangLabel(draft.language),
      ),
    );
  // WhatsApp's words sent back to WhatsApp (step 3): one act at a time, the toast once it landed, a refusal the editor's.
  const sendWords = async (row: TemplateDto, body: string) => {
    if (doingRef.current) return null;
    const what = `words:${row.id}`;
    doingRef.current = what;
    setDoing(what);
    try {
      const r = await templateVerbs.sendWords(row.id, body);
      if (r.ok) flash({ tone: "ok", msg: <>{TPL_VERSION_WORDS.sentBack(tplTitle(row))}</> });
      return r;
    } finally {
      doingRef.current = null;
      setDoing(null);
    }
  };
  // A reach-out's email, written where it is read: its save sends what waits for the step back to the check, and says so.
  const saveEmail = (draft: VersionDraft) => writeVersion(draft, (saved) => reachOutEditedWords(saved.rechecked ?? 0));
  const removeVersion = (g: TemplateGroup, lang: TplLang, row: TemplateDto) =>
    run(
      `version-remove:${row.id}`,
      () => templateVerbs.removeVersion(row.id),
      () => TPL_VERSION_WORDS.removed(g.title, VERSION_CHANNEL_WORDS[row.channel as OwnVersionChannel], lang.label),
    );
  // A message written in a new language, from the row that opened it: said once it is on its way.
  const written = (g: TemplateGroup, lang: TplLang) =>
    flash({
      msg: (
        <>
          <b>{g.title}</b> in {lang.label} went to WhatsApp — it reads as in review until they approve it, usually
          within minutes
        </>
      ),
    });
  return {
    rename,
    toggleHidden,
    removeMessage,
    translateOwn,
    addStarters,
    sync,
    written,
    saveVersion,
    beginMessage,
    saveEmail,
    removeVersion,
    sendWords,
  };
}
