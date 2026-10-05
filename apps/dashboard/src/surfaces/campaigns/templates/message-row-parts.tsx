/**
 * What one message draws (moved from MessageRow in legacy/pages/messages.jsx, decision 0015): the closed line in the list
 * (what it is, what sends it, how much of it went out), and what it opens into, in the pane beside the list
 * (parts/split.tsx): its one language control, the message as a customer reads it, its foot, and the verbs that change it,
 * which are the pane head's menu. Each is a function that returns its element, called by the row and the pane and not
 * drawn as a component of its own, so their trees are the trees they were.
 */
import type { ReactNode } from "react";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { refusedWords } from "@chanlytics/contracts";
import type { TemplateSentWords } from "@chanlytics/contracts";
import { gate, navigate } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Field } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { StatePill } from "../../kit/pill/state-pill";
import { Menu } from "../../kit/menu/menu";
import type { MenuGroup } from "../../kit/menu/menu";
import { Picker } from "../../kit/picker/picker";
import { cmRowPress } from "../parts/head";
import { CmLangGlyph, cmLanguageSearch, cmLanguages } from "../parts/picker";
import { cmChevron } from "../parts/picks";
import { MessagePreview } from "../parts/message-preview";
import { TemplateComposer } from "./composer";
import type { TemplateMade } from "./composer-acts";
import type { PresentRow, StarterGroup, TemplateGroup, TemplateRow, TplLang } from "./group";
import type { StarterLibrary } from "./verbs";
import { tplTag, tplTitle } from "./words";

/** What a closed line reads: the message, the words that stand for it, what sends it and how much went out. */
export interface LineCtx {
  g: TemplateGroup;
  offer: boolean;
  /** The mark it wears where it is not marketing's or utility's (a reach-out's email wears the mail's). */
  mark?: ReactNode;
  tag: { words: string; tone: string } | null;
  words: string;
  /** The channels it has a version on, as a row says them ("WhatsApp · Email · Text"); null where it has none. */
  channels: string | null;
  use: { words: string; note: string | null; unused: boolean; playbook: string | null } | null;
  present: PresentRow[];
  sent: TemplateSentWords | null;
  open: boolean;
  onOpen: () => void;
}

/** Everything the open message's parts read: its props, its state and setters, and what it worked out from them. */
export interface RowCtx {
  g: TemplateGroup;
  langs: readonly TplLang[];
  S: StarterLibrary;
  bizName: string | null;
  canAct: boolean;
  busy: boolean;
  doing: string | null;
  onAdd: (g: StarterGroup, lang: TplLang) => void;
  onRename: (row: TemplateDto, draft: string) => void;
  onHide: (row: TemplateDto) => void;
  onDelete: (row: TemplateDto) => void;
  onWritten?: (g: TemplateGroup, lang: TplLang, made: TemplateMade) => void;
  present: PresentRow[];
  renaming: boolean;
  draft: string;
  arm: boolean;
  adding: string | null;
  sentLang: string | null;
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
  sending: string[];
  pausedWords: string;
  closeActs: () => void;
  pick: (id: string, choice?: { group?: string }) => void;
  cancelNew: () => void;
}

/**
 * Marketing or utility, as a mark (.mark): the glyph says which (a gift, a bell) and the tip says what it means for who
 * it reaches. The row wears it, and so does the pane's head.
 */
export function tplMark(offer: boolean) {
  return (
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
  );
}

/**
 * What a row says of its message when something is wrong with it: a message WhatsApp approved that this product still
 * cannot put on the wire (the composers do not offer it, so its row says why rather than leaving it looking available),
 * and one WhatsApp refused. A refusal was a `title=` on the language button and a tail on the meta line: 10px, and on a
 * touch screen nowhere at all. It is the row's own line, in the tone of a refusal -- and on the ROW rather than in the
 * pane, because a message that cannot be sent should not have to be opened to say so; opened, the pane says it of the
 * language in view.
 */
export function rowHints(row: TemplateDto | null) {
  // WhatsApp's own reason, in the one sentence contracts says it in (refusedWords).
  const refused = row && row.meta_status === "rejected" ? refusedWords(row.rejected_reason) : null;
  return (
    <>
      {row && row.blocked && (
        <p className="bc-excl-hint warn" data-testid="template-blocked">
          Can&rsquo;t be sent from here: it has {row.blocked}. It still works in WhatsApp Manager.
        </p>
      )}
      {refused && (
        <p className="bc-excl-hint danger" data-testid="template-rejected">
          {refused}
        </p>
      )}
    </>
  );
}

/**
 * The closed line: a press anywhere on it that is not one of its controls opens it (cmRowPress), as a person's row
 * does. The press that opens it covers the mark and the words -- the part of a row that is not already something you
 * can press. What sends it is its own act, in its own cell; the languages are the pane's.
 */
export function closedLine(c: LineCtx) {
  const { g, offer, mark, tag, words, channels, use, present, sent, open, onOpen } = c;
  return (
    <div className="msg-row-line" role="presentation" onClick={cmRowPress}>
      <LinkButton
        className="msg-row-what"
        onClick={onOpen}
        aria-expanded={open}
        data-row-open
        data-testid="template-open"
      >
        {mark ?? tplMark(offer)}
        <span className="msg-row-said">
          <span className="msg-row-titles">
            {/* The name WhatsApp knows it by is the pane's (its foot), not every row's: an owner reads the
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
          {/* Where it can go, quietly: the channels it has a version on, said from contracts' words. */}
          {channels && (
            <span className="msg-row-channels" data-testid="template-channels">
              {channels}
            </span>
          )}
        </span>
      </LinkButton>
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
              <LinkButton
                className="msg-use-link"
                onClick={() => navigate(use.playbook ? `outbound/${use.playbook}` : "outbound")}
                data-testid="template-users"
              >
                {use.words}
              </LinkButton>
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
 * a run sends one language to everyone.
 */
export function langBar(c: RowCtx) {
  const { g, langs, S, present, view, row, mayAdd, note, pick } = c;
  // The languages the one chip opens (contracts messageLanguageChoices): the ones WhatsApp holds with their state, the
  // ones the starter library has written, and every other language WhatsApp takes when one may be added.
  const codes = present.map((r) => r.lang.id);
  const more = codes.filter((code) => code !== view).length;
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
      <Picker
        label={`Language for ${g.title}`}
        value={view}
        onValueChange={(id) =>
          pick(
            id,
            choices.find((c) => c.id === id),
          )
        }
        groups={cmLanguages(choices, S.languageGroups)}
        chevron={cmChevron()}
        face={
          <>
            <CmLangGlyph status={row ? row.meta_status : null} size={12} />
            {tplTag(view, codes)}
            {more > 0 ? ` +${more}` : null}
          </>
        }
        {...(choices.length > 7 ? { search: cmLanguageSearch(choices) } : {})}
        {...(note ? { note } : {})}
        data-testid="template-lang"
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

/** The foot of an open message: what it is called at WhatsApp, its rating, and the act that adds a language. */
function cardFoot(c: RowCtx) {
  const { g, busy, doing, row, cur, starterText, onAdd } = c;
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
        <Button
          size="sm"
          disabled={busy}
          onClick={() => onAdd(g, cur.lang)}
          data-testid="starter-add"
          {...gate("approve", "add a starter template")}
        >
          {doing === `add:${g.starter.key}:${cur.lang.id}` ? "Adding…" : `Add ${cur.lang.label}`}
        </Button>
      )}
    </div>
  );
}

/**
 * What the pane's menu has begun, in the body: the new name being typed, or the question a delete asks (a running
 * playbook refuses it, and the question is not asked). Rename, Hide and Delete are the menu's; a delete asks first.
 */
function cardActs(c: RowCtx, row: TemplateDto) {
  const { S, busy, cur, renaming, draft, arm, sending, pausedWords } = c;
  const { closeActs, setRenaming, setDraft, setArm, setSentLang, setAdding, onRename, onDelete } = c;
  return (
    <div className="msg-card-acts" data-testid="template-row">
      {renaming ? (
        <span className="tpl-rename" data-testid="template-rename-form">
          <Field
            className="tpl-rename-name"
            aria-label="The message's new name"
            value={draft}
            maxLength={60}
            // eslint-disable-next-line jsx-a11y-x/no-autofocus -- as the JSX drew it (decision 0015)
            autoFocus
            placeholder={tplTitle({ name: row.name })}
            onValueChange={setDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onRename(row, draft);
                closeActs();
              }
              // This Escape is the form's: the pane's own Escape (the page's) leaves the page it is in.
              if (e.key === "Escape") {
                e.preventDefault();
                setRenaming(false);
              }
            }}
            data-testid="template-title"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => {
              onRename(row, draft);
              closeActs();
            }}
            data-testid="template-title-save"
          >
            Save
          </Button>
          <Button variant="quiet" size="sm" onClick={() => setRenaming(false)}>
            Cancel
          </Button>
        </span>
      ) : arm && sending.length > 0 ? (
        // A running playbook still sends it: the route refuses the delete, so the question is not asked.
        <div className="msg-delete-held" role="status" data-testid="template-delete-held">
          <span>{S.stillSends(sending)}</span>
          <Button
            variant="quiet"
            size="sm"
            onClick={() => {
              closeActs();
              navigate("outbound");
            }}
          >
            Open Campaigns
          </Button>
          <Button variant="quiet" size="sm" onClick={() => setArm(false)}>
            Keep it
          </Button>
        </div>
      ) : (
        <Confirm
          question={`Delete “${tplTitle(row)}” in ${cur.lang.label}?`}
          detail={`It leaves WhatsApp; sends that use it fail from now on.${pausedWords}`}
          yes="Yes, delete"
          danger
          busy={busy}
          onYes={() => {
            closeActs();
            setSentLang(null);
            setAdding(null);
            onDelete(row);
          }}
          onNo={() => setArm(false)}
          testid="template-delete"
        />
      )}
    </div>
  );
}

/**
 * The menu in the pane's head: rename it, hide it (or show it again) and delete it, for the members who may. The kit's
 * Menu takes no test id of an item, so each item's own is among the props it hands its button (`gate`, which is spread
 * there): the ids the rows' links carried stay.
 */
export function paneMenu(c: RowCtx) {
  const { g, row, canAct, busy, setDraft, setRenaming, setArm, onHide } = c;
  if (!row || !canAct) return null;
  const hidden = !!row.hidden_at;
  const groups: MenuGroup[] = [
    {
      items: [
        {
          label: "Rename",
          glyph: <Icon name="pencil" size={13} />,
          title: "Call it something in your own words — WhatsApp keeps its name",
          disabled: busy,
          gate: { "data-testid": "template-rename" },
          onSelect: () => {
            setDraft(row.title || "");
            setArm(false);
            setRenaming(true);
          },
        },
        {
          label: hidden ? "Show" : "Hide",
          glyph: <Icon name="eye" size={13} />,
          title: hidden ? "Offer it in the composers again" : "Keep it on file, out of the composers",
          disabled: busy,
          gate: { "data-testid": "template-hide" },
          onSelect: () => onHide(row),
        },
        {
          label: "Delete",
          glyph: <Icon name="x" size={13} />,
          tone: "danger",
          disabled: busy,
          gate: { "data-testid": "template-delete" },
          onSelect: () => {
            setRenaming(false);
            setArm(true);
          },
        },
      ],
    },
  ];
  return (
    <Menu
      trigger={
        <Button
          iconOnly
          variant="quiet"
          size="sm"
          aria-label={`More for ${g.title}`}
          title={`More for ${g.title}`}
          data-testid="template-menu"
        >
          <Icon name="more" size={13} />
        </Button>
      }
      groups={groups}
    />
  );
}

/** The message as it is read where it is: the words as a customer sees them, then the foot, then what a verb has begun. */
function readPane(c: RowCtx) {
  const { bizName, row, body, values, footer, renaming, arm } = c;
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
      {(renaming || arm) && row && cardActs(c, row)}
    </>
  );
}

/**
 * The open message, in the pane's body: its one language control first, where it stays whichever language is picked --
 * one panel, so the control keeps its place and its focus when a pick moves between a language on file and one being
 * written (two panels remounted it, and a keyboard's focus fell to the page). With the channel switch on an email or a
 * text, the same panel holds that version (`version`) where WhatsApp's words were.
 */
export function openRow(c: RowCtx, bar: ReactNode, version: ReactNode = null) {
  const { row, starterText } = c;
  return (
    <div className="msg-row-open tpl-read" data-testid="template-open-body">
      {bar}
      {version ?? (
        <>
          {rowHints(row)}
          {!row && !starterText ? newLanguage(c) : readPane(c)}
        </>
      )}
    </div>
  );
}
