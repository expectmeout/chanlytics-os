/**
 * What the Messages page draws around its list (moved from MessagesReal in legacy/pages/messages.jsx, decision 0015):
 * the head's line and act, the search, the notice about the WhatsApp number, the composer's pane, the starter set's offer,
 * the list in its groups (Need you, Going out, Not in use, Put away, Cold emails: Messages, the canvas of 10 Nov 2026), and
 * the foot, which says when WhatsApp was last asked. Each is a function that returns its element, called by the page and
 * not drawn as a component of its own, so the page's tree is the tree it was.
 */
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { LIBRARY_STARTER_WORDS, LIBRARY_WORDS } from "@chanlytics/contracts";
import type { CampaignMessage } from "@chanlytics/contracts";
import type { ApiResult } from "@/client/api";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { gate } from "../../frame-verbs";
import type { useFrameToast } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { Search } from "../../kit/search/search";
import { ActWords } from "../../kit/head/act-words";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { CmBanner, CmDot } from "../parts/head";
import { TemplateComposer } from "./composer";
import { customKey } from "./group";
import type { TemplateGroup, TemplateListing, TplLang } from "./group";
import { TplEmailRows, TplEmailsFailed } from "./emails";
import type { tplEmails } from "./emails";
import type { MessagePlace } from "./message-row-facts";
import type { StarterLibrary, VersionDraft } from "./verbs";
import { versionsOfMessage } from "./versions";
import { TPL_LIST_WORDS, tplAgo, tplAnd, tplSpell } from "./words";

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

interface ComposerPaneProps {
  bizName: string | null;
  setComposing: Dispatch<SetStateAction<boolean>>;
  flash: ReturnType<typeof useFrameToast>[1];
  /** Whether the workspace has a WhatsApp number, which a template is written to: the composer says so where it has none. */
  hasWhatsApp: boolean;
  /** Opens a message just made, by its key and its name (its address), as a press on its row does. */
  openMade: (key: string, name: string) => void;
  /** Writes a new message's first version as an email, as the page writes any version (page-acts beginMessage). */
  beginMessage: (draft: VersionDraft) => Promise<ApiResult<unknown> | null>;
  /** What the workspace holds already, whose names a new message may not take. */
  held: { templates: readonly TemplateDto[]; messages: readonly CampaignMessage[] };
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

/**
 * A new message, written here: the composer in the pane beside the list. It asks where the message is sent: what is said
 * once a WhatsApp template is submitted is here, and an email's first version is written as any version is
 * (`beginMessage`), after which the composer gives way to the message, open on its row.
 */
export function composerPane(p: ComposerPaneProps) {
  const { bizName, setComposing, openMade, flash, hasWhatsApp, beginMessage, held } = p;
  return (
    <TemplateComposer
      pane
      numberWhy={hasWhatsApp ? null : LIBRARY_WORDS.writeNeedsNumber}
      onBegin={async (draft) => {
        const r = await beginMessage(draft);
        if (r?.ok) openMade(customKey(draft.name), draft.name);
        return r;
      }}
      namesHeld={[...held.templates.map((t) => t.name), ...held.messages.map((m) => m.name)]}
      businessName={bizName || ""}
      onCancel={() => setComposing(false)}
      onDone={(made) => {
        setComposing(false);
        flash({
          msg: (
            <>
              <b>{made.name}</b> submitted — WhatsApp reviews it; its status shows here
            </>
          ),
        });
      }}
    />
  );
}

interface StartersProps {
  S: StarterLibrary;
  langs: readonly TplLang[];
  busy: boolean;
  addingAll: boolean;
  addStarters: (keys: string[] | null, languages: string[]) => Promise<void>;
  /** Whether a WhatsApp number is there for the set's WhatsApp versions to go to: the notice says which is written now. */
  hasNumber: boolean;
}

/**
 * A workspace with none of the starter set is starting, not broken: it is offered the set, in one notice with its one
 * act, with or without a WhatsApp number (its email and text versions are written at once; its WhatsApp versions wait
 * for a number, contracts LIBRARY_STARTER_WORDS). A workspace part-way through (the set in English, Spanish never added)
 * hears no notice: a run sends one language to everyone on it, so a language never added holds nobody back -- the
 * notice that said "your Spanish-speaking customers get nothing from Win-back" said what the product does not do. What
 * is left to add is a quiet line at the list's foot, and each message's own languages are in its pane.
 */
export function startersOffer({ S, langs, busy, addingAll, addStarters, hasNumber }: StartersProps) {
  return (
    <div className="msg-starters" data-testid="starters">
      <CmBanner
        tone="plain"
        lead={`The starter set is ${tplSpell(S.list.length)} messages for the moments Chanlytics acts on.`}
        act={
          // The page's coral is New template, in its head: the banner's act is the second (two stood side by side).
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              addStarters(
                null,
                langs.map((l) => l.id),
              )
            }
            data-testid="starter-add-all"
            {...gate("approve", "add a starter template")}
          >
            {addingAll ? "Adding…" : "Add the starter set"}
          </Button>
        }
      >
        {LIBRARY_STARTER_WORDS.banner(tplAnd(langs.map((l) => l.label)), hasNumber)}
      </CmBanner>
    </div>
  );
}

/** The list's groups, in the order a person asks about them, each with the messages that stand in it. */
export type ListGroups = Record<MessagePlace, readonly TemplateGroup[]>;

/** A group folded under its name, or open; Not in use's null is its own: open where nothing needs you and nothing goes out. */
export type ListFolds = { idle: boolean | null; away: boolean; emails: boolean };

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
 * The list, in its groups: what needs you, what goes out, a cold email sequence's emails (which a sequence sends, so they
 * stand with what goes out), what nothing sends now and what was put away, each under its name. The first three stand
 * open; the last two fold, Not in use open where nothing needs you and nothing goes out. A search opens every group and
 * keeps the rows whose words have it.
 */
export function templateList(p: ListProps) {
  const { groups, listEmails, openKey, onOpenKey, card, folds, onFold, needle, q } = p;
  const searching = needle !== "";
  const idleOpen = searching || (folds.idle ?? (groups.need.length === 0 && groups.going.length === 0));
  const listed = groups.need.length + groups.going.length + groups.idle.length + groups.away.length + listEmails.length;
  const of = (place: MessagePlace) => ({ place, n: groups[place].length, rows: () => groups[place].map(card), onFold });
  return (
    <section className="msg-section" data-testid="templates">
      {listGroup({ ...of("need"), fold: null, open: true })}
      {listGroup({ ...of("going"), fold: null, open: true })}
      {listGroup({
        place: "emails",
        n: listEmails.length,
        rows: () => <TplEmailRows emails={listEmails} openKey={openKey} onOpenKey={onOpenKey} />,
        fold: "emails",
        open: searching || folds.emails,
        onFold,
      })}
      {listGroup({ ...of("idle"), fold: "idle", open: idleOpen })}
      {listGroup({ ...of("away"), fold: "away", open: searching || folds.away })}
      {needle && listed === 0 && (
        <EmptyState kind="line" title={TPL_LIST_WORDS.noMatch(q.trim())} testid="templates-no-match" />
      )}
      <TplEmailsFailed />
    </section>
  );
}

interface ListFootProps {
  listing: TemplateListing;
  partialSet: boolean;
  busy: boolean;
  addingAll: boolean;
  addStarters: (keys: string[] | null, languages: string[]) => Promise<void>;
  /** WhatsApp's number is there to ask, and when its messages were last read from it. */
  hasWhatsApp: boolean;
  doing: string | null;
  sync: () => Promise<void>;
}

/**
 * When WhatsApp was last asked about the workspace's messages, quietly, at the list's foot: a STATE the page is in, which
 * a press asks again (WhatsApp tells the app its answer on a message by itself; this reads the messages made in WhatsApp's
 * own tools). While it asks, it is the only control that says it is working (C20).
 */
function syncLine({ listing, doing, busy, sync }: Pick<ListFootProps, "listing" | "doing" | "busy" | "sync">) {
  const ago = listing.lastSync ? tplAgo(listing.lastSync) : null;
  return (
    <LinkButton
      className={`tpl-fresh${doing === "sync" ? " is-busy" : ""}`}
      onClick={sync}
      disabled={busy}
      data-testid="sync-templates"
      aria-description={TPL_LIST_WORDS.checkAgain}
      {...gate("approve", "check WhatsApp for changes")}
    >
      <span className={`tpl-fresh-dot${listing.lastSync ? "" : " never"}`} aria-hidden="true" />
      {doing === "sync" ? TPL_LIST_WORDS.checking : ago ? TPL_LIST_WORDS.checked(ago) : TPL_LIST_WORDS.neverChecked}
      <span className="tpl-fresh-again" aria-hidden="true">
        <Icon name="refresh" size={12} />
      </span>
    </LinkButton>
  );
}

/**
 * Under the list: the starter set's languages not yet added, as one quiet act, and when WhatsApp was last asked. How long
 * WhatsApp takes to read a new one is the head's hover and the composer's line; said here too, it was the page's third
 * time. What the workspace put away is a group of the list now, under its name.
 */
export function listFoot(p: ListFootProps) {
  const { listing, partialSet, busy, addingAll, addStarters, hasWhatsApp } = p;
  const { langs, leftToAdd } = listing;
  if (!partialSet && !hasWhatsApp) return null;
  return (
    <footer className="msg-foot">
      {partialSet && (
        <LinkButton
          disabled={busy}
          onClick={() =>
            addStarters(
              null,
              langs.map((l) => l.id),
            )
          }
          data-tip={leftToAdd}
          aria-description={leftToAdd}
          data-testid="starter-add-all"
          {...gate("approve", "add a starter message")}
        >
          <Icon name="plus" size={12} />
          {addingAll ? "Adding…" : "Add the rest of the starter set"}
        </LinkButton>
      )}
      {hasWhatsApp ? syncLine(p) : null}
    </footer>
  );
}
