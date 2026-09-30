/**
 * One message, as a row (moved from MessageRow in legacy/pages/messages.jsx, decision 0015): what it is, what sends it
 * and how much of it went out -- the things you scan sixteen of at once. The message itself, its languages and the
 * verbs that change it are in the row it opens (message-row-parts.tsx).
 *
 * It was a card carrying the whole bubble, and sixteen of those is about three thousand pixels of chat nobody can
 * compare. The words are still the point, so a line of them rides the row and the WHOLE message -- heading, what varies
 * per person, footer, buttons -- is one press away, for one message at a time.
 */
import { useState } from "react";
import type { TemplateDto } from "@/legacy-bridge/surfaces/inbox";
import type { TemplateMade } from "./composer-acts";
import type { PresentRow, StarterGroup, TemplateGroup, TplLang } from "./group";
import { firstLang, languageFacts, lineWords, marksOf, usageOf, wordsOf } from "./message-row-facts";
import { closedLine, langBar, openRow } from "./message-row-parts";
import type { RowCtx } from "./message-row-parts";
import type { StarterLibrary } from "./verbs";

interface MessageRowProps {
  g: TemplateGroup;
  langs: readonly TplLang[];
  bizName: string | null;
  canAct: boolean;
  canAdd?: boolean;
  addWhy?: string | null;
  busy: boolean;
  doing?: string | null;
  S: StarterLibrary;
  open?: boolean;
  onOpen: () => void;
  onAdd: (g: StarterGroup, lang: TplLang) => void;
  onRename: (row: TemplateDto, draft: string) => void;
  onHide: (row: TemplateDto) => void;
  onDelete: (row: TemplateDto) => void;
  onWritten?: (g: TemplateGroup, lang: TplLang, made: TemplateMade) => void;
}

export function MessageRow({
  g,
  langs,
  bizName,
  canAct,
  canAdd = false,
  addWhy = null,
  busy,
  doing = null,
  S,
  open = false,
  onOpen,
  onAdd,
  onRename,
  onHide,
  onDelete,
  onWritten,
}: MessageRowProps) {
  const present = g.rows.filter((r): r is PresentRow => !!r.row);
  const [langId, setLangId] = useState(firstLang(present, langs));
  // The language that was in view before one nobody has written was picked: the
  // words a translation is written from, and where Cancel goes back to.
  const [back, setBack] = useState<string | null>(null);
  // A language picked from "Translate into": the one being written now. Only a
  // language picked there is ever written -- one that simply stopped being on
  // file (deleted, or gone with a sync) is not a request to write it again.
  const [adding, setAdding] = useState<string | null>(null);
  // A language just sent to WhatsApp, until its row arrives with the next read:
  // the fold says it went, rather than offering the same words to send twice.
  const [sentLang, setSentLang] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [arm, setArm] = useState(false);
  const lang = languageFacts({ g, langs, S, canAdd, present, langId, back, adding, sentLang });
  const { view, row, written, starterText, fromRow, untranslatable } = lang;
  const { body, values, footer } = wordsOf({ g, S, row, starterText, view });
  const closeMenu = () => {
    setMenu(false);
    setRenaming(false);
    setArm(false);
  };
  const usage = usageOf({ g, present, row });
  const marks = marksOf({ g, row, usage });
  const words = lineWords({ g, S, row, starterText, fromRow, view });
  const note =
    addWhy ||
    (untranslatable
      ? `Chanlytics can’t write this one in another language: ${untranslatable}. Add its other languages in WhatsApp Manager.`
      : null);
  const pick = (id: string, choice?: { group?: string }) => {
    if (id !== view) {
      // Back to a language that exists, never to one that was only being drafted.
      if (row || written) setBack(view);
      setLangId(id);
    }
    // Picked from "Translate into": the one language this row may now write.
    setAdding(choice && choice.group === "add" ? id : null);
    closeMenu();
  };
  const cancelNew = () => {
    setLangId(back || firstLang(present, langs));
    setBack(null);
    setAdding(null);
  };
  const c: RowCtx = {
    ...lang,
    ...usage,
    ...marks,
    g,
    langs,
    S,
    bizName,
    canAct,
    busy,
    doing,
    open,
    onOpen,
    onAdd,
    onRename,
    onHide,
    onDelete,
    onWritten,
    present,
    menu,
    renaming,
    draft,
    arm,
    adding,
    sentLang,
    setMenu,
    setRenaming,
    setDraft,
    setArm,
    setAdding,
    setSentLang,
    setBack,
    note,
    body,
    values,
    footer,
    words,
    closeMenu,
    pick,
    cancelNew,
  };
  // The one control for a message's languages is made with the row, open or not: an open row places it.
  const bar = langBar(c);
  return (
    <div
      className={`msg-row${open ? " is-open" : ""}${marks.attn ? " is-attn" : ""}${marks.dim ? " is-dim" : ""}${row && row.hidden_at ? " is-hidden" : ""}`}
      data-template={usage.gName || undefined}
      data-testid={g.starter ? "starter-row" : "custom-row"}
    >
      {/* A press anywhere on the line that is not one of its controls opens it (cmRowPress), as a person's row does. */}
      {closedLine(c)}
      {/* A refusal was a `title=` on the language button and a tail on the meta
          line: 10px, and on a touch screen nowhere at all. It is the row's own
          line now, in the tone of a refusal -- and on the ROW rather than in the
          fold, because a message that cannot be sent should not have to be
          opened to say so. */}
      {/* A message WhatsApp approved that this product still cannot put on the
          wire: the composers do not offer it, so its row says why rather than
          leaving it looking available. */}
      {row && row.blocked && (
        <p className="bc-excl-hint warn" data-testid="template-blocked">
          Can&rsquo;t be sent from here: it has {row.blocked}. It still works in WhatsApp Manager.
        </p>
      )}
      {row && row.meta_status === "rejected" && row.rejected_reason && (
        <p className="bc-excl-hint danger" data-testid="template-rejected">
          WhatsApp refused this one: {String(row.rejected_reason).toLowerCase().replace(/_/g, " ")}. Change the words
          and send it back.
        </p>
      )}
      {open && openRow(c, bar)}
    </div>
  );
}
