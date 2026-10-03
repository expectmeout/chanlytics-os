/**
 * What the Templates page does (moved from MessagesReal in legacy/pages/messages.jsx, decision 0015): every verb goes
 * through the templates verbs and the surface is re-fetched, so the cards are the server's. One act runs at a time:
 * every control waits for it, and only the one pressed says it is working. The ref holds the guard before the page has
 * drawn the state. What each says when it is done is the toast's.
 */
import type { RefObject, ReactNode } from "react";
import { VERSION_CHANNEL_WORDS, reachOutEditedWords } from "@chanlytics/contracts";
import type { OwnVersionChannel } from "@chanlytics/contracts";
import type { ApiResult } from "@/client/api";
import type { TemplateDto } from "@/surfaces/inbox/types";
import type { useLegacyToast } from "../../legacy-verbs";
import { starterWords } from "./composer";
import type { TemplateGroup, TplLang } from "./group";
import { syncTemplates, templates as templateVerbs } from "./verbs";
import type { VersionDraft } from "./verbs";
import { TPL_VERSION_WORDS, tplTitle } from "./words";

interface ActsProps {
  doingRef: RefObject<string | null>;
  setDoing: (doing: string | null) => void;
  flash: ReturnType<typeof useLegacyToast>[1];
}

export function pageActs({ doingRef, setDoing, flash }: ActsProps) {
  const run = async <T,>(
    what: string,
    fn: () => Promise<ApiResult<T>>,
    said: (r: { ok: true; data: T }) => ReactNode,
  ) => {
    if (doingRef.current) return;
    doingRef.current = what;
    setDoing(what);
    const r = await fn();
    doingRef.current = null;
    setDoing(null);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? said(r) : <>{r.message}</> });
  };
  const rename = (t: TemplateDto, draft: string) => {
    const title = draft.replace(/\s+/g, " ").trim() || null;
    void run(
      `rename:${t.id}`,
      () => templateVerbs.rename(t.id, title),
      () =>
        title ? (
          <>
            Now called <b>{title}</b> — WhatsApp still knows it as {t.name}
          </>
        ) : (
          <>
            <b>{t.name}</b> goes by its name again
          </>
        ),
    );
  };
  const toggleHidden = (t: TemplateDto) =>
    run(
      `hide:${t.id}`,
      () => (t.hidden_at ? templateVerbs.show(t.id) : templateVerbs.hide(t.id)),
      () => (
        <>
          <b>{tplTitle(t)}</b> {t.hidden_at ? "is back in the composers" : "is out of the composers — still on file"}
        </>
      ),
    );
  const remove = (t: TemplateDto) =>
    run(
      `delete:${t.id}`,
      () => templateVerbs.remove(t.id),
      () => (
        <>
          <b>{tplTitle(t)}</b> deleted — sends that named it fail from now on
        </>
      ),
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
            {seen} template{seen === 1 ? "" : "s"} from WhatsApp — {approved} approved, {marketing} marketing
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
  return { rename, toggleHidden, remove, addStarters, sync, written, saveVersion, saveEmail, removeVersion };
}
