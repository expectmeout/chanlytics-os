/**
 * What the Messages page draws around its list (moved from MessagesReal in legacy/pages/messages.jsx, decision 0015):
 * the head's line and act, the search, the notice about the WhatsApp number, and the list in its groups (Needs you,
 * Sending, Ready, Ready-made, Cold emails, Put away: Messages, the canvas of 10 Nov 2026, and the clean list of 13 Nov
 * 2026, whose names are Ruben's). No starter banner and no sync line under the list (its step 5): a starter is there to
 * use and nothing about it is missing, and WhatsApp is asked quietly as the page opens. Each is a function that returns
 * its element, called by the page and not drawn as a component of its own, so the page's tree is the tree it was.
 */
import type { ReactNode } from "react";
import { LIBRARY_WORDS, STARTER_MOMENTS, starterMoment } from "@chanlytics/contracts";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { gate } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { Search } from "../../kit/search/search";
import { ActWords } from "../../kit/head/act-words";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { CmDot } from "../parts/head";
import type { TemplateGroup, TplLang } from "./group";
import { TplEmailRows, TplEmailsFailed } from "./emails";
import type { tplEmails } from "./emails";
import type { MessagePlace } from "./message-row-facts";
import type { StarterLibrary } from "./verbs";
import { versionsOfMessage } from "./versions";
import { TPL_LIST_WORDS } from "./words";

type Emails = ReturnType<typeof tplEmails>;

/**
 * The line under the head: how many messages need you and how many go out, the two things a person opens Messages to
 * know, in plain words and nothing to press; the frame's head draws it as a sentence. Its hover says what the list holds
 * (LIBRARY_WORDS.headTip). It counted every template on file ("15 templates · 12 approved, 1 in review"), a number nobody
 * acts on (Messages, the canvas of 10 Nov 2026).
 */
export function headSub({ need, going }: { need: number; going: number }) {
  return (
    <span className="tabular" data-tip={LIBRARY_WORDS.headTip} data-testid="messages-count">
      {need > 0 ? (
        <>
          <b className="cm-head-n">{TPL_LIST_WORDS.needYou(need)}</b>
          <CmDot />
        </>
      ) : null}
      {TPL_LIST_WORDS.goingOut(going)}
    </span>
  );
}

interface HeadRightProps {
  onNew: () => void;
}

/**
 * The head's act: the page's one, drawn as the kit's button, as Sequences' is. It is there whenever the person may act: a
 * message needs no WhatsApp number, so the number is the composer's to ask for, where it says so.
 */
export function headRight({ onNew }: HeadRightProps) {
  return (
    // Said as the kit's act says it (act-words.tsx): "+ New message" where the row holds it, "+ New" where not. A message,
    // as the tab is called: "template" was a third word for the one thing (Messages, the canvas of 10 Nov 2026).
    <Button variant="primary" onClick={onNew} data-testid="template-new" {...gate("approve", "write a message")}>
      <ActWords icon={<Icon name="plus" size={14} />} words="New message" />
    </Button>
  );
}

interface BarProps {
  q: string;
  setQ: (q: string) => void;
  /** The search is the bar's line (a desk's): the list draws no box of its own. */
  inLine: boolean;
}

/**
 * The top of the list on a phone, as the Inbox's list opens on its search: the box that finds a message by its words,
 * across the list's width. On a desk the box is the bar's line (the page heads canvas, H2, 31 Oct 2026), and the list
 * opens on its first group. When WhatsApp was last asked stood beside it, a press a person had to remember: it is the
 * list's foot now (listFoot), a line that says when it last looked.
 */
export function listBar({ q, setQ, inLine }: BarProps) {
  if (inLine) return null;
  return (
    <div className="tpl-bar">
      <Search label="Search messages" value={q} onChange={setQ} testid="templates-search" />
    </div>
  );
}

/**
 * What a workspace with no WhatsApp number is told, once and quietly: a message needs none, so the Library lists and
 * writes email and text versions all the same, and only its WhatsApp versions wait. A failed read of the numbers is not
 * "no number": say what could not be read.
 */
export function numberNotice(p: { channels: readonly { kind: string }[] | null | undefined; hasWhatsApp: boolean }) {
  // Still being read is never no number: said while the channels read was out, it went a frame later and the list under it
  // moved up (the Campaigns load review, 28 Oct 2026). The page waits for that read (ROUTE_WAITS), so this is a read past its wait.
  if (p.channels === undefined) return null;
  return p.channels === null ? (
    <FailedRead
      kind="card"
      what="your WhatsApp number"
      body="What is on file is below; adding and syncing wait until the number can be read."
      surface="channels"
      testid="messages-channels-failed"
    />
  ) : (
    !p.hasWhatsApp && (
      <EmptyState
        kind="line"
        glyph="phone"
        title={LIBRARY_WORDS.noNumber}
        action={{ label: "Open Connections", to: "admin/integrations" }}
        testid="messages-no-number"
      />
    )
  );
}

/** The words of a message's email and text versions, subject included: what the search reads where WhatsApp has none. */
const ownWordsOf = (g: TemplateGroup, versions: readonly TemplateDto[]): string[] => {
  const has = versionsOfMessage(g, versions);
  return [...has.email, ...has.sms].map((r) => `${r.header || ""} ${r.body_preview || ""}`);
};

/**
 * The search box: a message's title, the name WhatsApp knows it by, and its words in every language on file or in the
 * library, on every channel it is written for (an email's subject and body, a text's). Rows that do not match stand
 * down; the starter set's notice and the fold stay, because they are about the set, not the search.
 */
export const matchesOf =
  (needle: string, langs: readonly TplLang[], S: StarterLibrary, versions: readonly TemplateDto[]) =>
  (g: TemplateGroup) =>
    !needle ||
    [
      g.title,
      g.starter ? g.starter.name : "",
      ...g.rows.map(({ row: r }) => (r ? `${r.name} ${r.body_preview || ""}` : "")),
      ...ownWordsOf(g, versions),
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle) ||
    !!(
      g.starter &&
      langs.some((l) =>
        String(S.text(g.starter, l.id)?.body || "")
          .toLowerCase()
          .includes(needle),
      )
    );

/** The list's groups, in the order a person asks about them, each with the messages that stand in it. */
export type ListGroups = Record<MessagePlace, readonly TemplateGroup[]>;

/**
 * A group folded under its name, or open. Ready's null is its own: open where nothing needs you and nothing is sending.
 * Ready-made's too: open where the business has nothing else to read, which is a new one's whole list.
 */
export type ListFolds = { idle: boolean | null; made: boolean | null; away: boolean; emails: boolean };

interface ListProps {
  groups: ListGroups;
  listEmails: Emails;
  openKey: string | null;
  onOpenKey: (key: string) => void;
  card: (g: TemplateGroup) => ReactNode;
  /** Which groups stand open; a search opens every one, as what it finds may be in any. */
  folds: ListFolds;
  /** A group's head pressed: it stands open, or folded, from now on. */
  onFold: (group: keyof ListFolds, open: boolean) => void;
  needle: string;
  q: string;
}

/** A group's name over its rows: a press that folds it where it folds, its name alone where it does not. */
function groupHead({
  name,
  n,
  fold,
  open,
  onFold,
}: {
  name: string;
  n: number;
  fold: keyof ListFolds | null;
  open: boolean;
  onFold: ListProps["onFold"];
}) {
  if (!fold)
    return (
      <h3 className="msg-group-head">
        <span className="msg-group-name">{name}</span>
      </h3>
    );
  return (
    <LinkButton
      className="msg-group-head"
      onClick={() => onFold(fold, !open)}
      aria-expanded={open}
      aria-label={TPL_LIST_WORDS.fold(name, n)}
      data-testid={fold === "away" ? "templates-hidden" : `templates-fold-${fold}`}
    >
      <span className="msg-group-name">{name}</span>
      <span className="msg-group-n tabular">{n}</span>
      <Icon name={open ? "chevron-up" : "chevron-down"} size={12} />
    </LinkButton>
  );
}

/** One group: its name, and while it stands open, its rows. Nothing at all where it holds none. */
function listGroup({
  place,
  n,
  rows,
  fold,
  open,
  onFold,
}: {
  place: MessagePlace | "emails";
  n: number;
  rows: () => ReactNode;
  fold: keyof ListFolds | null;
  open: boolean;
  onFold: ListProps["onFold"];
}) {
  if (n === 0) return null;
  const name = TPL_LIST_WORDS[place];
  return (
    <div className="msg-group" data-place={place} data-testid={`templates-${place}`}>
      {groupHead({ name, n, fold, open, onFold })}
      {open ? <div className="msg-list">{rows()}</div> : null}
    </div>
  );
}

/**
 * The ready-made starters under what each is for (contracts starterMoment), the moments in their order and a moment
 * with none drawing nothing: each name stands among the rows, so a row is the list's own child as every other is.
 */
function madeRows(made: readonly TemplateGroup[], card: ListProps["card"]): ReactNode {
  return STARTER_MOMENTS.flatMap((moment) => {
    const of = made.filter((g) => g.starter && starterMoment(g.starter) === moment);
    if (!of.length) return [];
    return [
      <h4 className="msg-moment" key={moment} data-testid={`templates-moment-${moment}`}>
        {TPL_LIST_WORDS.moments[moment]}
      </h4>,
      ...of.map(card),
    ];
  });
}

/**
 * The list, in its groups: what needs you, what something sends, the business's own that nothing sends, the starters
 * nothing sends under what each is for, a cold email sequence's emails, and what was put away, each under its name.
 * The first two stand open; the rest fold, Ready open where nothing needs you and nothing is sending, and Ready-made
 * where the business has nothing else to read. A search opens every group and keeps the rows whose words have it.
 */
export function templateList(p: ListProps) {
  const { groups, listEmails, openKey, onOpenKey, card, folds, onFold, needle, q } = p;
  const searching = needle !== "";
  const busy = groups.need.length + groups.going.length;
  const idleOpen = searching || (folds.idle ?? busy === 0);
  const madeOpen = searching || (folds.made ?? busy + groups.idle.length === 0);
  const listed = busy + groups.idle.length + groups.made.length + groups.away.length + listEmails.length;
  const of = (place: MessagePlace) => ({ place, n: groups[place].length, rows: () => groups[place].map(card), onFold });
  return (
    <section className="msg-section" data-testid="templates">
      {listGroup({ ...of("need"), fold: null, open: true })}
      {listGroup({ ...of("going"), fold: null, open: true })}
      {listGroup({ ...of("idle"), fold: "idle", open: idleOpen })}
      {listGroup({ ...of("made"), rows: () => madeRows(groups.made, card), fold: "made", open: madeOpen })}
      {listGroup({
        place: "emails",
        n: listEmails.length,
        rows: () => <TplEmailRows emails={listEmails} openKey={openKey} onOpenKey={onOpenKey} />,
        fold: "emails",
        open: searching || folds.emails,
        onFold,
      })}
      {listGroup({ ...of("away"), fold: "away", open: searching || folds.away })}
      {needle && listed === 0 && (
        <EmptyState kind="line" title={TPL_LIST_WORDS.noMatch(q.trim())} testid="templates-no-match" />
      )}
      <TplEmailsFailed />
    </section>
  );
}
