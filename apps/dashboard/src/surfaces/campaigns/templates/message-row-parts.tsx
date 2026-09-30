/**
 * What one message's row draws (moved from MessageRow in legacy/pages/messages.jsx, decision 0015): the closed line
 * (what it is, what sends it, how much of it went out), and the open row (its one language control, the message as a
 * customer reads it, its foot and the verbs that change it). Each is a function that returns its element, called by
 * MessageRow and not drawn as a component of its own, so the row's tree is the tree it was.
 */
import type { ReactNode } from "react";
import type { TemplateDto } from "@/legacy-bridge/surfaces/inbox";
import type { TemplateSentWords } from "@chanlytics/contracts";
import { gate, navigate } from "../../legacy-verbs";
import { confirmPart, statePillPart } from "../../legacy-parts";
import { Icon } from "../../kit/icon/icon";
import { cmRowPress } from "../parts/head";
import { LanguagePicker } from "../parts/picker";
import { MessagePreview } from "../parts/message-preview";
import { TemplateComposer } from "./composer";
import type { TemplateMade } from "./composer-acts";
import type { PresentRow, StarterGroup, TemplateGroup, TemplateRow, TplLang } from "./group";
import type { StarterLibrary } from "./verbs";
import { tplTag, tplTitle } from "./words";

/** Everything a row's parts read: its props, its state and setters, and what it worked out from them. */
export interface RowCtx {
  g: TemplateGroup;
  langs: readonly TplLang[];
  S: StarterLibrary;
  bizName: string | null;
  canAct: boolean;
  busy: boolean;
  doing: string | null;
  open: boolean;
  onOpen: () => void;
  onAdd: (g: StarterGroup, lang: TplLang) => void;
  onRename: (row: TemplateDto, draft: string) => void;
  onHide: (row: TemplateDto) => void;
  onDelete: (row: TemplateDto) => void;
  onWritten?: (g: TemplateGroup, lang: TplLang, made: TemplateMade) => void;
  present: PresentRow[];
  menu: boolean;
  renaming: boolean;
  draft: string;
  arm: boolean;
  adding: string | null;
  sentLang: string | null;
  setMenu: (v: boolean) => void;
  setRenaming: (v: boolean) => void;
  setDraft: (v: string) => void;
  setArm: (v: boolean) => void;
  setAdding: (v: string | null) => void;
  setSentLang: (v: string | null) => void;
  setBack: (v: string | null) => void;
  view: string;
  cur: TemplateRow;
  row: TemplateDto | null;
  starterText: { body: string; footer: string | null } | null;
  source: { ref: { id: string } | { starter: string; from: string }; from: string; name: string } | null;
  mayAdd: boolean;
  note: string | null;
  body: string;
  values: string[] | null;
  footer: string | null;
  words: string;
  use: { words: string; note: string | null; unused: boolean; playbook: string | null; running: boolean } | null;
  sent: TemplateSentWords | null;
  sending: string[];
  pausedWords: string;
  offer: boolean;
  tag: { words: string; tone: string } | null;
  closeMenu: () => void;
  pick: (id: string, choice?: { group?: string }) => void;
  cancelNew: () => void;
}

/**
 * The closed line: a press anywhere on it that is not one of its controls opens it (cmRowPress), as a person's row
 * does. The press that opens it covers the mark and the words -- the part of a row that is not already something you
 * can press. What sends it is its own act, in its own cell; the languages are the open row's.
 */
export function closedLine(c: RowCtx) {
  const { g, offer, tag, words, use, present, sent, open, onOpen } = c;
  return (
    <div className="msg-row-line" role="presentation" onClick={cmRowPress}>
      <button
        type="button"
        className="msg-row-what"
        onClick={onOpen}
        aria-expanded={open}
        data-row-open
        data-testid="template-open"
      >
        <span
          className="mark msg-row-mark"
          data-kind={offer ? "offer" : "note"}
          data-tip={
            offer
              ? "An offer — WhatsApp calls this marketing, so it only reaches people who said yes to offers."
              : "A note — WhatsApp calls this utility, so it reaches anyone it is sent to."
          }
        >
          <Icon name={offer ? "gift" : "bell"} size={13} />
        </span>
        <span className="msg-row-said">
          <span className="msg-row-titles">
            {/* The name WhatsApp knows it by is the open row's (its foot), not every row's: an owner reads the
                title and the words, and "winback_offer" in type is nothing they act on. */}
            <span className="msg-row-title">{g.title}</span>
            {tag && (
              <span
                className={`pill${tag.tone && tag.tone !== "plain" ? ` pill-${tag.tone}` : ""} msg-tag`}
                data-tone={tag.tone}
                data-testid="template-status"
              >
                {tag.words}
              </span>
            )}
          </span>
          <span className="msg-row-words">{words ? `“${words}”` : g.purpose}</span>
        </span>
      </button>
      {/* What sends it -- every source, not only the playbooks -- and under it,
          what that thing is doing: "runs daily at 10:00", "a run is waiting on
          you", the latest two broadcasts a person sent with it. The server joins
          the three (a playbook names its template, a broadcast names its
          template, the Inbox books by rule) and hands down both lines, so
          "Nothing sends it" is a reading rather than a guess about what it
          could not see. A name missing from the map is usage unread: say nothing. */}
      <span className="msg-row-use">
        {use &&
          (use.unused ? (
            <>
              <span className="msg-use-none" data-testid="template-users">
                <span className="msg-use-ring" aria-hidden="true" />
                Nothing sends it
              </span>
              {!present.length && g.starter && <span className="msg-use-note">not on WhatsApp yet</span>}
            </>
          ) : (
            <>
              <button
                type="button"
                className="msg-use-link"
                onClick={() => navigate(use.playbook ? `outbound/${use.playbook}` : "outbound")}
                data-testid="template-users"
              >
                {use.words}
              </button>
              {use.note && <span className="msg-use-note">{use.note}</span>}
            </>
          ))}
      </span>
      {/* What LEFT, and when the latest did: counted off the people a run sent
          to, which is what Reports calls "Messages sent" -- not a run's
          `recipient_count`, the audience it was scheduled for. "sent" rides the
          count, because a stacked row has no heading and a screen reader never
          hears the heading at all. A message that never went out says so under
          a dash, where a number would be; one never added says that instead. */}
      <span className="msg-row-sent" data-testid="template-sent">
        {sent &&
          (sent.count ? (
            <>
              <span className="msg-row-sent-n">
                {sent.count}
                <span className="msg-row-sent-unit"> sent</span>
              </span>
              {sent.when && (
                <>
                  <span className="msg-row-sent-dot" aria-hidden="true">
                    ·
                  </span>
                  <span className="msg-row-sent-when">{sent.when}</span>
                </>
              )}
            </>
          ) : (
            <>
              <span className="msg-row-sent-n is-none" aria-hidden="true">
                —
              </span>
              <span className="msg-row-sent-never">{sent.when}</span>
            </>
          ))}
      </span>
    </div>
  );
}

/**
 * The one control for a message's languages, where the message is read and written: the language in view with its
 * state drawn (filled approved, dotted in review, struck refused, a dashed ring for none), "+1" for the rest, and
 * every language there is behind it -- one WhatsApp holds, one the library wrote, or a new one to write. It was a
 * column of every closed row ("● EN ⌄" sixteen times), for a choice that changes nothing about who a run reaches:
 * a run sends one language to everyone on it.
 */
export function langBar(c: RowCtx) {
  const { g, langs, S, present, view, row, mayAdd, note, pick } = c;
  // The languages the one chip opens (contracts messageLanguageChoices): the ones WhatsApp holds with their state, the
  // ones the starter library has written, and every other language WhatsApp takes when one may be added.
  const codes = present.map((r) => r.lang.id);
  const starter = g.starter;
  const choices = S.languageChoices({
    onFile: present.map((r) => ({ language: r.lang.id, meta_status: r.row.meta_status })),
    ready: starter ? langs.map((l) => l.id).filter((id) => starter.texts && starter.texts[id]) : [],
    canAdd: mayAdd,
  });
  return (
    <div className="msg-lang">
      <span className="msg-lang-k" aria-hidden="true">
        Language
      </span>
      <LanguagePicker
        value={view}
        choices={choices}
        groups={S.languageGroups}
        status={row ? row.meta_status : null}
        tag={tplTag(view, codes)}
        more={codes.filter((code) => code !== view).length}
        label={`Language for ${g.title}`}
        note={note}
        onPick={pick}
        testid="template-lang"
      />
    </div>
  );
}

/**
 * A language nobody has written: the message is written in it here, from the words of the language that was in view --
 * by the assistant, as a draft to read and change -- and goes to WhatsApp as the same message in one more language, the
 * same name, slots and button. Picked, it starts; Cancel goes back to the language that was in view.
 */
function newLanguage(c: RowCtx) {
  const { g, bizName, view, cur, source, mayAdd, adding, note, sentLang } = c;
  const { setSentLang, setAdding, setBack, cancelNew, onWritten } = c;
  return sentLang === view ? (
    <p className="msg-new-sent" role="status" data-testid="template-new-sent">
      <Icon name="check" size={13} /> {cur.lang.label} went to WhatsApp for review — it shows here in a moment.
    </p>
  ) : mayAdd && source && adding === view ? (
    <TemplateComposer
      key={view}
      businessName={bizName || ""}
      translate={{ ref: source.ref, from: source.from, name: source.name, language: view, title: g.title }}
      onCancel={cancelNew}
      onDone={(made) => {
        setSentLang(view);
        setAdding(null);
        setBack(null);
        if (onWritten) onWritten(g, cur.lang, made);
      }}
    />
  ) : (
    <p className="bc-excl-hint" data-testid="template-new-refused">
      Not on WhatsApp in {cur.lang.label}.{note ? ` ${note}` : ""}
    </p>
  );
}

/** The foot of an open message: what it is called at WhatsApp, its rating, the act that adds a language, and its menu. */
function cardFoot(c: RowCtx) {
  const { g, busy, doing, canAct, menu, row, cur, starterText, onAdd, setMenu } = c;
  const StatePill = statePillPart();
  return (
    <div className="msg-card-foot">
      {row ? (
        <span className="msg-card-meta">
          {row.name}
          {row.category ? ` · ${row.category}` : ""}
          {row.source === "chanlytics" ? " · made here" : " · from WhatsApp Manager"}
        </span>
      ) : (
        <span className="msg-card-meta">Not on WhatsApp in {cur.lang.label} yet — the words WhatsApp would review</span>
      )}
      {/* The rating WhatsApp gives the template in view, as of the last sync; nothing when none was synced. */}
      {row && row.quality && (
        <StatePill kind="template_quality" value={String(row.quality).toUpperCase()} testid="template-quality" />
      )}
      {/* The language the library has written and the workspace never added,
          offered where its words already are: the picker puts that language
          in view, and this adds it as it is -- no assistant, no draft. */}
      {!row && g.starter && starterText && (
        <button
          className="btn btn-sm"
          disabled={busy}
          onClick={() => onAdd(g, cur.lang)}
          data-testid="starter-add"
          {...gate("approve", "add a starter template")}
        >
          {doing === `add:${g.starter.key}:${cur.lang.id}` ? "Adding…" : `Add ${cur.lang.label}`}
        </button>
      )}
      <span className="msg-card-spacer" />
      {row && canAct && !menu && (
        <button
          className="cl-bucket-link msg-row-more"
          onClick={() => setMenu(true)}
          aria-label={`More for ${g.title}`}
          data-testid="template-menu"
        >
          ···
        </button>
      )}
    </div>
  );
}

/** What an open message's menu offers: rename, hide or delete it (a delete asks first, and a running playbook refuses it). */
function cardActs(c: RowCtx, row: TemplateDto) {
  const { S, busy, cur, renaming, draft, arm, sending, pausedWords } = c;
  const { closeMenu, setRenaming, setDraft, setArm, setSentLang, setAdding, onRename, onHide, onDelete } = c;
  const Confirm = confirmPart();
  return (
    <div className="msg-card-acts" data-testid="template-row">
      {renaming ? (
        <span className="tpl-rename" data-testid="template-rename-form">
          <input
            className="bc-subject"
            value={draft}
            maxLength={60}
            // eslint-disable-next-line jsx-a11y-x/no-autofocus -- as the JSX drew it (decision 0015)
            autoFocus
            placeholder={tplTitle({ name: row.name })}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onRename(row, draft);
                closeMenu();
              }
              if (e.key === "Escape") setRenaming(false);
            }}
            data-testid="template-title"
          />
          <button
            className="btn btn-sm btn-primary"
            disabled={busy}
            onClick={() => {
              onRename(row, draft);
              closeMenu();
            }}
            data-testid="template-title-save"
          >
            Save
          </button>
          <button className="cl-bucket-link" onClick={() => setRenaming(false)}>
            Cancel
          </button>
        </span>
      ) : arm && sending.length > 0 ? (
        // A running playbook still sends it: the route refuses the delete, so the question is not asked.
        <div className="msg-delete-held" role="status" data-testid="template-delete-held">
          <span>{S.stillSends(sending)}</span>
          <button
            className="cl-bucket-link"
            onClick={() => {
              closeMenu();
              navigate("outbound");
            }}
          >
            Open Playbooks
          </button>
          <button className="cl-bucket-link" onClick={() => setArm(false)}>
            Keep it
          </button>
        </div>
      ) : arm ? (
        <Confirm
          question={`Delete “${tplTitle(row)}” in ${cur.lang.label}?`}
          detail={`It leaves WhatsApp; sends that use it fail from now on.${pausedWords}`}
          yes="Yes, delete"
          danger
          busy={busy}
          onYes={() => {
            closeMenu();
            setSentLang(null);
            setAdding(null);
            onDelete(row);
          }}
          onNo={() => setArm(false)}
          testid="template-delete"
        />
      ) : (
        <>
          <button
            className="cl-bucket-link"
            disabled={busy}
            onClick={() => {
              setDraft(row.title || "");
              setRenaming(true);
            }}
            title="Call it something in your own words — WhatsApp keeps its name"
            data-testid="template-rename"
          >
            Rename
          </button>
          <button
            className="cl-bucket-link"
            disabled={busy}
            onClick={() => {
              closeMenu();
              onHide(row);
            }}
            title={row.hidden_at ? "Offer it in the composers again" : "Keep it on file, out of the composers"}
            data-testid="template-hide"
          >
            {row.hidden_at ? "Show" : "Hide"}
          </button>
          <button
            className="cl-bucket-link danger"
            disabled={busy}
            onClick={() => setArm(true)}
            data-testid="template-delete"
          >
            Delete
          </button>
          <button className="cl-bucket-link" onClick={closeMenu}>
            Close
          </button>
        </>
      )}
    </div>
  );
}

/** The message as it is read where it is: the words as a customer sees them, then the foot, then the menu when it is open. */
function readPane(c: RowCtx) {
  const { bizName, row, menu, body, values, footer } = c;
  return (
    <>
      <MessagePreview
        from={bizName || "Your business"}
        body={body}
        values={values}
        header={row ? row.header : null}
        footer={footer}
        buttons={row ? row.buttons : null}
        compact
      />
      {cardFoot(c)}
      {menu && row && cardActs(c, row)}
    </>
  );
}

/**
 * The open row: its one language control first, where it stays whichever language is picked -- one panel, so the
 * control keeps its place and its focus when a pick moves between a language on file and one being written (two panels
 * remounted it, and a keyboard's focus fell to the page).
 */
export function openRow(c: RowCtx, bar: ReactNode) {
  const { row, starterText } = c;
  return (
    <div className="msg-row-open" data-testid="template-open-body">
      {bar}
      {!row && !starterText ? newLanguage(c) : readPane(c)}
    </div>
  );
}
