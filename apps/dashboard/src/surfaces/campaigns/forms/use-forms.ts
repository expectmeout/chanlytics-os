/**
 * Campaigns › Forms, read and pressed (00680): the list (`GET forms`), one form's sheet (`GET forms/sheet`), and the
 * presses that make, change, publish and share a form. Each read is made as its part is drawn, again after each press,
 * and again when the owner comes back to the tab, so a request that arrived shows with no reload. A read that fails
 * keeps what was known on screen; only a page that knows nothing says it could not read.
 *
 * AI drafting a form is one press that waits (the route has its whole minute): while it waits the page says so, and a
 * press that came back with nothing made says that, with the sentence kept.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  FormDescription,
  FormLinkPress,
  FormPress,
  FormPressed,
  FormRequestPress,
  FormsDto,
  FormSheetDto,
} from "@chanlytics/contracts";
import { readFormSheet, readForms, sendFormLinkPress, sendFormPress, sendFormRequestPress } from "@/bridge/verbs/forms";
import { getActiveWorkspace } from "@/bridge/workspace";
import { formsOpenedOn } from "./opening";
import { FORMS_WORDS as W } from "./words";

/** A read's standing: what it holds, and whether it failed with nothing known. */
interface ReadOf<T> {
  dto: T | null;
  failed: boolean;
  again: () => Promise<void>;
}

/**
 * A read made as its part is drawn and again when the tab is come back to. `key` names what is read: null reads nothing.
 * `first`, where a load read it a moment before the part was drawn (./opening.ts), is what the part is first drawn from, and
 * stands for the read its drawing would make.
 */
function useReadOf<T>(key: string | null, reader: (key: string) => Promise<T>, first?: () => T | null): ReadOf<T> {
  const [state, setState] = useState<{ key: string | null; dto: T | null; failed: boolean }>(() => ({
    key,
    dto: first?.() ?? null,
    failed: false,
  }));
  const live = useRef(true);
  const known = useRef<{ key: string | null; dto: T | null }>({ key, dto: state.dto });
  // The first answer, held: the mount's read is not made again for it (the next is a press's, or a return to the tab's).
  const firstHeld = useRef(state.dto !== null);
  const again = useCallback(async () => {
    if (key === null) return;
    try {
      const dto = await reader(key);
      known.current = { key, dto };
      if (live.current) setState({ key, dto, failed: false });
    } catch {
      const had = known.current.key === key ? known.current.dto : null;
      if (live.current) setState({ key, dto: had, failed: had === null });
    }
  }, [key, reader]);
  useEffect(() => {
    live.current = true;
    if (firstHeld.current) firstHeld.current = false;
    else void again();
    const back = () => {
      if (document.visibilityState === "visible") void again();
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      live.current = false;
      document.removeEventListener("visibilitychange", back);
    };
  }, [again]);
  // What another form's read held is never drawn as this one's.
  const mine = state.key === key;
  return { dto: mine ? state.dto : null, failed: mine && state.failed, again };
}

const readList = () => readForms();
/** The list a load that opened on Forms read with its first draw (./opening.ts), where it is this workspace's and recent. */
const listOpenedOn = () => formsOpenedOn(Date.now(), getActiveWorkspace());

/** The list of forms. */
export const useFormsList = (): ReadOf<FormsDto> => useReadOf("forms", readList, listOpenedOn);

/** One form's sheet; nothing is read while none is open. */
export const useFormSheet = (formId: string | null): ReadOf<FormSheetDto> => useReadOf(formId, readFormSheet);

/** What a press came to: what the server answered, or why it did not go through, in its own words. */
type Pressed<T> = { ok: true; data: T } | { ok: false; message: string };

async function routeAnswer<T>(
  sent: Promise<{ ok: true; data: T } | { ok: false; message: string } | null>,
): Promise<Pressed<T>> {
  const answer = await sent;
  if (answer?.ok) return { ok: true, data: answer.data };
  return { ok: false, message: answer?.message ?? W.failed };
}

/** A press on a form, on one of its links, or on one of its entries: each answers what it came to. */
export const doFormPress = (press: FormPress): Promise<Pressed<FormPressed>> => routeAnswer(sendFormPress(press));
export const doFormLinkPress = (press: FormLinkPress): Promise<Pressed<{ link_id: string }>> =>
  routeAnswer(sendFormLinkPress(press));
export const doFormEntryPress = (press: Exclude<FormRequestPress, { act: "reply" }>): Promise<Pressed<unknown>> =>
  routeAnswer(sendFormRequestPress(press));

/** Whether a draft can be kept as it stands: every question has its words, and a question of choices at least two. */
function draftHolds(draft: FormDescription): boolean {
  if (!draft.heading.trim() || !draft.thanks.trim()) return false;
  return draft.fields.every((field) => {
    if (!field.label.trim()) return false;
    const choices = field.choices ?? [];
    if (choices.some((choice) => !choice.label.trim())) return false;
    return ["service", "one", "several", "when"].includes(field.kind) ? choices.length >= 2 : true;
  });
}

/** A draft as the server takes it: words trimmed, and a line left empty left out. */
function draftToKeep(draft: FormDescription): FormDescription {
  const intro = draft.intro?.trim();
  return {
    ...draft,
    heading: draft.heading.trim(),
    intro: intro || undefined,
    thanks: draft.thanks.trim(),
    fields: draft.fields.map((field) => {
      const help = field.help?.trim();
      return {
        ...field,
        label: field.label.trim(),
        help: help || undefined,
        choices: field.choices?.map((choice) => ({ ...choice, label: choice.label.trim() })),
      };
    }),
  };
}

/** How long after the last change a draft is kept: a word typed is not a request each letter. */
const KEEP_AFTER_MS = 700;

/** A form's draft as its owner changes it: held here as typed, and kept on the server once it rests and holds. */
export interface DraftEditing {
  draft: FormDescription;
  /** A change made in place. */
  change: (next: FormDescription) => void;
  /** The draft set whole and kept at once: AI's question accepted, an Undo, the live form put back. */
  put: (next: FormDescription) => Promise<void>;
  /** Whatever waits to be kept, kept now: before a publish reads the draft. */
  settle: () => Promise<void>;
  /** A change that could not be kept, in the server's words; null while all is kept. */
  unkept: string | null;
}

/**
 * The draft of the form `sheet` holds. What is typed is the page's until it rests; a draft that does not hold (a
 * question with no words) is not sent, and is kept the moment it holds again. A read that lands while a change waits
 * does not take it back.
 */
export function useDraftEditing(sheet: FormSheetDto, after: () => Promise<void>): DraftEditing {
  const [draft, setDraft] = useState(sheet.draft);
  const [unkept, setUnkept] = useState<string | null>(null);
  const waiting = useRef<FormDescription | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formId = sheet.id;
  // The server's draft is taken when nothing typed waits: after a publish, AI's change, a teammate's.
  useEffect(() => {
    if (!waiting.current) setDraft(sheet.draft);
  }, [sheet.draft]);
  const keep = useCallback(
    async (next: FormDescription) => {
      waiting.current = null;
      const kept = await doFormPress({ act: "save", form_id: formId, draft: draftToKeep(next) });
      setUnkept(kept.ok ? null : kept.message);
      await after();
    },
    [formId, after],
  );
  const settle = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (waiting.current && draftHolds(waiting.current)) await keep(waiting.current);
  }, [keep]);
  useEffect(() => () => void settle(), [settle]);
  return {
    draft,
    unkept,
    settle,
    change: (next) => {
      setDraft(next);
      waiting.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void settle(), KEEP_AFTER_MS);
    },
    put: async (next) => {
      if (timer.current) clearTimeout(timer.current);
      setDraft(next);
      await keep(next);
    },
  };
}

/** The workspace's own address word, from the page's path: what its public pages stand under. */
export const workspaceSlugNow = (): string | null => {
  const slug = /^\/w\/([^/?#]+)/.exec(window.location.pathname)?.[1];
  return slug ? decodeURIComponent(slug) : null;
};
