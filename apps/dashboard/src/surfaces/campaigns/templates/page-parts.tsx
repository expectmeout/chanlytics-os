/**
 * What the Templates page draws around its list (moved from MessagesReal in legacy/pages/messages.jsx, decision 0015):
 * the head's line and tools, the notice about the WhatsApp number, the starter set's offer, the list with its column
 * names, and the foot. Each is a function that returns its element (TplFoot is the JSX's own component), called by the
 * page and not drawn as a component of its own, so the page's tree is the tree it was.
 */
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { ChannelVM } from "@chanlytics/contracts";
import { gate } from "../../legacy-verbs";
import type { useLegacyToast } from "../../legacy-verbs";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { CmBanner, CmDot } from "../parts/head";
import { TemplateComposer } from "./composer";
import type { TemplateGroup, TemplateListing, TplLang } from "./group";
import { TplEmailRows, TplNothing, tplAllApproved, tplHeadTip } from "./emails";
import type { StarterLibrary } from "./verbs";
import { tplAgo, tplAnd, tplSpell } from "./words";

type Emails = Parameters<typeof tplHeadTip>[0];

interface HeadSubProps {
  listing: TemplateListing;
  emails: Emails;
  hasWhatsApp: boolean;
  doing: string | null;
  busy: boolean;
  sync: () => Promise<void>;
}

/**
 * The line under the head: the page's numbers -- how many, how many approved, how many WhatsApp is still reading --
 * and when it last synced with WhatsApp, which is a STATE the page is in, not a chore the owner remembers: it says
 * when it last looked and presses to look again, and while it looks it is the only control that says it is working
 * (C20). Templates, never "messages": that word is a thread in the Inbox and a send in a broadcast's numbers.
 */
export function headSub({ listing, emails, hasWhatsApp, doing, busy, sync }: HeadSubProps) {
  const { shown, approved, pending, lastSync } = listing;
  return (
    <>
      <span className="tabular" data-tip={tplHeadTip(emails)} data-testid="messages-count">
        {shown.length + emails.length === 0 ? (
          "No template on file yet"
        ) : (
          <>
            <b className="cm-head-n">{shown.length + emails.length}</b>{" "}
            {shown.length + emails.length === 1 ? "template" : "templates"}
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
      {hasWhatsApp && (
        <>
          <CmDot />
          {/* eslint-disable-next-line jsx-a11y-x/role-supports-aria-props -- as the JSX drew it (decision 0015) */}
          <button
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
          </button>
        </>
      )}
    </>
  );
}

interface HeadRightProps {
  q: string;
  setQ: (q: string) => void;
  hasWhatsApp: boolean;
  setComposing: Dispatch<SetStateAction<boolean>>;
}

interface ComposerSheetProps {
  bizName: string | null;
  setComposing: Dispatch<SetStateAction<boolean>>;
  flash: ReturnType<typeof useLegacyToast>[1];
}

/** The head's tools: the search over the words, and the page's one act. */
export function headRight({ q, setQ, hasWhatsApp, setComposing }: HeadRightProps) {
  return (
    <>
      <label className="cm-search">
        <Icon name="search" size={13} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the words"
          aria-label="Search the templates' words"
          data-testid="templates-search"
        />
      </label>
      {hasWhatsApp && (
        <button
          className="btn btn-primary"
          onClick={() => setComposing((c) => !c)}
          data-testid="template-new"
          {...gate("approve", "write a template")}
        >
          <Icon name="plus" size={12} />{" "}
          <span>
            New<span className="cm-act-noun"> template</span>
          </span>
        </button>
      )}
    </>
  );
}

/** A failed read of the numbers is not "no number": say what could not be read. */
export function numberNotice(p: { channels: ChannelVM[] | null | undefined; hasWhatsApp: boolean }) {
  return p.channels === null ? (
    <FailedRead
      kind="card"
      what="your WhatsApp number"
      body="What is on file is below; adding and syncing wait until the number can be read."
      surface="settings"
      testid="messages-channels-failed"
    />
  ) : (
    !p.hasWhatsApp && (
      <EmptyState
        kind="card"
        glyph="phone"
        title="Connect a WhatsApp number first"
        body="Templates belong to a number's account."
        action={{ label: "Open Connections", to: "admin/integrations" }}
        testid="messages-no-number"
      />
    )
  );
}

/**
 * The search box: a message's title, the name WhatsApp knows it by, and its words in every language on file or in the
 * library. Rows that do not match stand down; the starter set's notice and the fold stay, because they are about the
 * set, not the search.
 */
export const matchesOf = (needle: string, langs: readonly TplLang[], S: StarterLibrary) => (g: TemplateGroup) =>
  !needle ||
  [
    g.title,
    g.starter ? g.starter.name : "",
    ...g.rows.map(({ row: r }) => (r ? `${r.name} ${r.body_preview || ""}` : "")),
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

/** A new message, written here: the composer in a card over the list, and what is said once it is submitted. */
export function composerSheet({ bizName, setComposing, flash }: ComposerSheetProps) {
  return (
    <section className="fl-card rp2-card" data-testid="messages-composer">
      <TemplateComposer
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
    </section>
  );
}

interface StartersProps {
  S: StarterLibrary;
  langs: readonly TplLang[];
  busy: boolean;
  addingAll: boolean;
  addStarters: (keys: string[] | null, languages: string[]) => Promise<void>;
}

/**
 * A workspace with none of the starter set is starting, not broken: it is offered the set, in one notice with its one
 * act. A workspace part-way through (the set in English, Spanish never added) hears no notice: a run sends one language
 * to everyone on it, so a language never added holds nobody back -- the notice that said "your Spanish-speaking
 * customers get nothing from Win-back" said what the product does not do. What is left to add is a quiet line at the
 * list's foot, and each message's own languages are in its open row.
 */
export function startersOffer({ S, langs, busy, addingAll, addStarters }: StartersProps) {
  return (
    <div className="msg-starters" data-testid="starters">
      <CmBanner
        tone="plain"
        lead={`The starter set is ${tplSpell(S.list.length)} messages for the moments Chanlytics acts on.`}
        act={
          <button
            className="btn btn-primary"
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
          </button>
        }
      >
        In {tplAnd(langs.map((l) => l.label))} — WhatsApp reviews each, usually within minutes.
      </CmBanner>
    </div>
  );
}

interface ListProps {
  listed: number;
  listStarters: TemplateGroup[];
  listCustom: TemplateGroup[];
  listEmails: Emails;
  emails: Emails;
  openKey: string | null;
  setOpenKey: Dispatch<SetStateAction<string | null>>;
  card: (g: TemplateGroup) => ReactNode;
  needle: string;
  q: string;
  hasWhatsApp: boolean;
  customN: number;
}

/** The list: what each column of a row is, once, above them, then the messages, the emails and what is said of none. */
export function templateList(p: ListProps) {
  const { listed, listStarters, listCustom, listEmails, emails, openKey, setOpenKey, card } = p;
  const { needle, q, hasWhatsApp, customN } = p;
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
            <span>What sends it</span>
            <span className="msg-list-head-sent">Sent</span>
          </div>
        )}
        {listStarters.map(card)}
        {listCustom.map(card)}
        <TplEmailRows emails={listEmails} openKey={openKey} setOpenKey={setOpenKey} />
      </div>
      {needle && listed === 0 && (
        <EmptyState kind="line" title={`No template’s words have “${q.trim()}” in them.`} testid="templates-no-match" />
      )}
      <TplNothing hasWhatsApp={hasWhatsApp} customN={customN} emails={emails} />
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
export const TplFoot = ({
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
      // eslint-disable-next-line jsx-a11y-x/role-supports-aria-props -- as the JSX drew it (decision 0015)
      <button
        className="msg-fold-toggle"
        disabled={busy}
        onClick={onAddRest}
        data-tip={leftToAdd}
        aria-description={leftToAdd}
        data-testid="starter-add-all"
        {...gate("approve", "add a starter template")}
      >
        <Icon name="plus" size={12} />
        {addingAll ? "Adding…" : "Add the rest of the starter set"}
      </button>
    )}
    {hidden > 0 && (
      <span className="msg-foot-fold" data-testid="templates-fold">
        <button
          className="msg-fold-toggle"
          onClick={() => setShowHidden((v) => !v)}
          aria-expanded={showHidden}
          data-testid="templates-hidden"
        >
          <Icon name={showHidden ? "chevron-up" : "chevron-down"} size={12} />
          Not in the composers · <span className="tabular">{hidden}</span> · still on file
        </button>
      </span>
    )}
  </footer>
);
