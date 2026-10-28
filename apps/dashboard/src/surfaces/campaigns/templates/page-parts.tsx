/**
 * What the Templates page draws around its list (moved from MessagesReal in legacy/pages/messages.jsx, decision 0015):
 * the head's line and act, the search with WhatsApp's sync beside it, the notice about the WhatsApp number, the
 * composer's pane, the starter set's offer, the list with its column names, and the foot. Each is a function that
 * returns its element, called by the page and not drawn as a component of its own, so the page's tree is the tree it was.
 */
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { LIBRARY_STARTER_WORDS, LIBRARY_WORDS } from "@chanlytics/contracts";
import { libraryCount } from "@chanlytics/contracts";
import type { CampaignMessage } from "@chanlytics/contracts";
import type { ApiResult } from "@/client/api";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { gate } from "../../legacy-verbs";
import type { useLegacyToast } from "../../legacy-verbs";
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
import { TplEmailRows, TplEmailsFailed, tplAllApproved, tplHeadTip } from "./emails";
import type { StarterLibrary, VersionDraft } from "./verbs";
import { versionsOfMessage } from "./versions";
import { tplAgo, tplAnd, tplSpell } from "./words";

type Emails = Parameters<typeof tplHeadTip>[0];

interface HeadSubProps {
  listing: TemplateListing;
  messages: readonly CampaignMessage[];
  emails: Emails;
}

/**
 * The line under the head: the page's numbers -- how many, how many approved, how many WhatsApp is still reading --
 * in plain words and nothing to press: the frame's head draws it as a sentence, and under Glass it is hidden where the
 * list is narrow. When it last synced with WhatsApp is the list's own (listBar), beside the search. Templates, never
 * "messages": that word is a thread in the Inbox and a send in a broadcast's numbers. The count is the one Campaigns' home
 * carries on its Library act (contracts libraryCount).
 */
export function headSub({ listing, messages, emails }: HeadSubProps) {
  const { shown, approved, pending } = listing;
  const total = libraryCount(messages, emails.length);
  return (
    <>
      <span className="tabular" data-tip={tplHeadTip(emails)} data-testid="messages-count">
        {total === 0 ? (
          "No template on file yet"
        ) : (
          <>
            <b className="cm-head-n">{total}</b> {total === 1 ? "template" : "templates"}
          </>
        )}
      </span>
      {shown.length > 0 && (
        <>
          <CmDot />
          {/* "7 templates · 7 approved" said the number twice: all of them is "all approved". */}
          <span className="tabular">
            <span className="cm-head-ok">
              {tplAllApproved(approved, shown, emails) ? "all approved" : `${approved} approved`}
            </span>
            {pending ? (
              <>
                , <span className="cm-head-info">{pending} in review</span>
              </>
            ) : null}
          </span>
        </>
      )}
    </>
  );
}

interface HeadRightProps {
  onNew: () => void;
}

/**
 * The head's act: the page's one, drawn as the kit's button, as Playbooks' and Broadcasts' are. It is there whenever the
 * person may act: a message needs no WhatsApp number, so the number is the composer's to ask for, where it says so.
 */
export function headRight({ onNew }: HeadRightProps) {
  return (
    // Said as the kit's act says it (act-words.tsx): "+ New template" where the row holds it, "+ New" where not. A template,
    // never "a message": a message is what a customer gets (broadcasts-honest's word rule).
    <Button variant="primary" onClick={onNew} data-testid="template-new" {...gate("approve", "write a template")}>
      <ActWords icon={<Icon name="plus" size={14} />} words="New template" />
    </Button>
  );
}

interface BarProps {
  q: string;
  setQ: (q: string) => void;
  hasWhatsApp: boolean;
  lastSync: string | null;
  doing: string | null;
  busy: boolean;
  sync: () => Promise<void>;
}

/**
 * The top of the list, as the Inbox's list opens on its search: the box that finds a template by its words, across the
 * list's width, and beside it when the list last synced with WhatsApp -- a STATE the page is in, not a chore the owner
 * remembers: it says when it last looked and presses to look again, and while it looks it is the only control that says
 * it is working (C20). Both were the frame head's (the search in its act, the state in its sentence), which a phone turns
 * into one coral circle and Glass leaves out of the list's reach. The box is the kit's search, as Sequences' beside it is: a
 * plain field here had no glyph and another fill (the sample walk, 18 Oct 2026).
 */
export function listBar({ q, setQ, hasWhatsApp, lastSync, doing, busy, sync }: BarProps) {
  return (
    <div className="tpl-bar">
      <Search label="Search messages" value={q} onChange={setQ} testid="templates-search" />
      {hasWhatsApp && (
        <LinkButton
          className={`tpl-fresh${doing === "sync" ? " is-busy" : ""}`}
          onClick={sync}
          disabled={busy}
          data-testid="sync-templates"
          aria-description="Check WhatsApp for changes"
          {...gate("approve", "sync from WhatsApp")}
        >
          <span className={`tpl-fresh-dot${lastSync ? "" : " never"}`} aria-hidden="true" />
          {/* "Synced 16d ago", the words every tool says it in; "In step with WhatsApp" took the line's room. */}
          {doing === "sync" ? (
            "Checking WhatsApp…"
          ) : lastSync ? (
            <>
              Synced <span className="tpl-fresh-age">{tplAgo(lastSync)}</span>
            </>
          ) : (
            "Never synced"
          )}
          <span className="tpl-fresh-again" aria-hidden="true">
            <Icon name="refresh" size={12} />
          </span>
        </LinkButton>
      )}
    </div>
  );
}

interface ComposerPaneProps {
  bizName: string | null;
  setComposing: Dispatch<SetStateAction<boolean>>;
  flash: ReturnType<typeof useLegacyToast>[1];
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

interface ListProps {
  listed: number;
  listStarters: TemplateGroup[];
  listCustom: TemplateGroup[];
  listEmails: Emails;
  openKey: string | null;
  onOpenKey: (key: string) => void;
  card: (g: TemplateGroup) => ReactNode;
  needle: string;
  q: string;
}

/** The list: what each column of a row is, once, above them, then the messages, the emails and what is said of none. */
export function templateList(p: ListProps) {
  const { listed, listStarters, listCustom, listEmails, openKey, onOpenKey, card } = p;
  const { needle, q } = p;
  return (
    <section className="msg-section" data-testid="templates">
      <div className="msg-list">
        {/* What each column of a row is, once, above them -- the way the People
            and Leads tables name theirs. Inside the list, not above it: the list
            is the container the row's columns are measured against. The first
            cell is the mark's, and has no heading. */}
        {listed > 0 && (
          <div className="msg-list-head" aria-hidden="true">
            <span />
            <span>The message</span>
            <span>Sent by</span>
            <span className="msg-list-head-sent">Sent</span>
          </div>
        )}
        {listStarters.map(card)}
        {listCustom.map(card)}
        <TplEmailRows emails={listEmails} openKey={openKey} onOpenKey={onOpenKey} />
      </div>
      {needle && listed === 0 && (
        <EmptyState kind="line" title={`No template’s words have “${q.trim()}” in them.`} testid="templates-no-match" />
      )}
      <TplEmailsFailed />
    </section>
  );
}

interface TplFootProps {
  partialSet: boolean;
  busy: boolean;
  onAddRest: () => void;
  leftToAdd: string;
  addingAll: boolean;
  hidden: number;
  showHidden: boolean;
  setShowHidden: Dispatch<SetStateAction<boolean>>;
}

// The foot of the list: the starter set's languages not yet added, as one quiet act, and what the workspace kept out
// of the composers, folded and still on file. How long WhatsApp takes to read a new one is the head's hover and the
// composer's line; said here too, it was the page's third time. Moved whole out of MessagesReal.
const TplFoot = ({
  partialSet,
  busy,
  onAddRest,
  leftToAdd,
  addingAll,
  hidden,
  showHidden,
  setShowHidden,
}: TplFootProps) => (
  <footer className="msg-foot">
    {partialSet && (
      <LinkButton
        disabled={busy}
        onClick={onAddRest}
        data-tip={leftToAdd}
        aria-description={leftToAdd}
        data-testid="starter-add-all"
        {...gate("approve", "add a starter template")}
      >
        <Icon name="plus" size={12} />
        {addingAll ? "Adding…" : "Add the rest of the starter set"}
      </LinkButton>
    )}
    {hidden > 0 && (
      <span className="msg-foot-fold" data-testid="templates-fold">
        <LinkButton onClick={() => setShowHidden((v) => !v)} aria-expanded={showHidden} data-testid="templates-hidden">
          <Icon name={showHidden ? "chevron-up" : "chevron-down"} size={12} />
          Not in the composers · <span className="tabular">{hidden}</span> · still on file
        </LinkButton>
      </span>
    )}
  </footer>
);

interface ListFootProps {
  listing: TemplateListing;
  partialSet: boolean;
  busy: boolean;
  addingAll: boolean;
  addStarters: (keys: string[] | null, languages: string[]) => Promise<void>;
  showHidden: boolean;
  setShowHidden: Dispatch<SetStateAction<boolean>>;
  card: (g: TemplateGroup) => ReactNode;
}

/** Under the list: its foot, and what the workspace kept out of the composers while the fold is open. */
export function listFoot(p: ListFootProps) {
  const { listing, partialSet, busy, addingAll, addStarters, showHidden, setShowHidden, card } = p;
  const { hiddenMessages, hiddenGroups, langs, leftToAdd } = listing;
  return (
    <>
      {(partialSet || hiddenMessages.length > 0) && (
        <TplFoot
          partialSet={partialSet}
          busy={busy}
          onAddRest={() =>
            addStarters(
              null,
              langs.map((l) => l.id),
            )
          }
          leftToAdd={leftToAdd}
          addingAll={addingAll}
          hidden={hiddenMessages.length}
          showHidden={showHidden}
          setShowHidden={setShowHidden}
        />
      )}
      {showHidden && hiddenGroups.length > 0 && (
        <div className="msg-list msg-list-hidden">{hiddenGroups.map(card)}</div>
      )}
    </>
  );
}
