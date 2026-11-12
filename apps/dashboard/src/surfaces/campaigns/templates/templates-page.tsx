/**
 * Campaigns > Messages (the route's `messages`, the path's `templates`): the wording the receptionist and the campaigns
 * send, on each channel, shown as the customer sees it (moved from legacy/pages/messages.jsx, decision 0015). One row per
 * message, in groups a person reads top down (Messages, the canvas of 10 Nov 2026): what needs you, what goes out, what
 * nothing sends now and what was put away, each under its name, the last two folded -- opening, beside the list, on the
 * bubble for the language in view, its channels, its languages, what sends it and what went out, and the verbs an
 * operator has under the menu on its caret. Meta's own sample is never shown; a message the workspace put away is its own
 * group, still on file. A WhatsApp version is approved by WhatsApp
 * whether it is written here or in WhatsApp Manager, an email or a text is ready when it is saved, and a marketing message
 * can only go to people who said yes to offers. Every verb goes through the templates verbs and the surface is re-fetched,
 * so the cards are the server's.
 *
 * A message is a name with a version on each channel it has (One message, every channel, step 1): its row says which
 * ("WhatsApp · Email · Text") and the pane has a switch for them. The email and text rows come from the settings surface
 * beside the WhatsApp ones (`templateVersions`), which no other page reads; a reach-out's emails are their own list, from
 * its chains, and each is a message with an email version that is written in its pane (step 5).
 *
 * The page lists the workspace's messages (the surface's `messages`), not its WhatsApp rows: a message written for email
 * or text alone is a row, and each starter is listed with its words to read (the Messages redesign's step 5): it files
 * itself as a WhatsApp number connects (starter-templates.ts fileStartersOnConnect), or as a sequence first names it, and
 * no banner asks for the set. The number gates only what is WhatsApp's: a WhatsApp version's words, rename, hide and
 * delete, a WhatsApp language. WhatsApp's own list is asked quietly as the page opens (useQuietCheck): no sync button.
 *
 * It is the Inbox's shape (parts/split.tsx): the list in a pane and, while something is open, that thing in a second
 * pane beside it -- a message, a reach-out's email, or New, which is one line to Ask (new-said.tsx: its step 4). On a phone what is open rises over
 * the list in the drawer Campaigns' home opens its own in (home/pane-sheet.tsx; Ruben, 11 Oct 2026: a message took the
 * screen over "like a page"), the list still under it. A message open is the address's (`campaigns/messages/<name>`,
 * contracts messageRoute: a message's one home, the Campaigns wiring review's rule A), written as it opens and closes,
 * replaced and never pushed, as the Inbox writes a thread's, so a link opens it, a reload keeps it, and Back leaves the
 * page. A reach-out's email and New stay the page's own, the email's words being its step's on its sequence.
 *
 * The page is real on every workspace. A demo session draws the same words as a real one, over what it holds; without a
 * read, the waiting line says which of the two is looking.
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  HOUR_MS,
  BAR_LINE_WORDS,
  LIBRARY_WORDS,
  LIFECYCLE_WORDS,
  MESSAGES_ROUTE,
  messageOfRoute,
  messageRoute,
  sequenceRoute,
} from "@chanlytics/contracts";
import type { ReachOutChainDto } from "@chanlytics/contracts";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { canDo, demoSession, gateTitle, navigate, replaceRoute, useFrameToast } from "../../frame-verbs";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { LinkButton } from "../../kit/link-button/link-button";
import { tabDraft } from "../../kit/record/work";
import { usePageSearch } from "../../kit/head/page-search";
import { usePartShown, useSurface } from "../../use-surface";
import { CmHead } from "../parts/head";
import { CmSplit, useCmPhone, type CmView } from "../parts/split";
import { PaneSheet } from "../home/pane-sheet";
import { ReachOutEmailPane } from "../reach-out/email-message";
import { tplEmailOpen, tplEmails, tplEmailsMatching } from "./emails";
import { groupNamed, listingOf, nameOfGroup } from "./group";
import type { TemplateGroup, TplLang } from "./group";
import { MessageRow } from "./message-row";
import { firstView, messageFacts, placeOfMessage } from "./message-row-facts";
import type { MessageSetting } from "./message-row-facts";
import { pageActs } from "./page-acts";
import { headRight, headSub, listBar, matchesOf, numberNotice, templateList } from "./page-parts";
import type { ListFolds, ListGroups } from "./page-parts";
import { NewSaid } from "./new-said";
import { TemplatePane } from "./template-pane";
import { starters as library, syncTemplates } from "./verbs";
import { brainOf } from "./words";

/** No email or text rows read: one array for every draw, so nothing that takes it sees it change. */
const NO_VERSIONS: readonly TemplateDto[] = [];

/**
 * The list's groups, each with its messages in the order they came (the starter set's, then the workspace's own): where
 * each stands is placeOfMessage's reading of it.
 */
function messageGroupsOf(
  listed: readonly TemplateGroup[],
  read: ReadonlyMap<string, { setting: MessageSetting }>,
): ListGroups {
  const of = (place: MessageSetting["place"]) => listed.filter((g) => read.get(g.key)?.setting.place === place);
  return { need: of("need"), going: of("going"), idle: of("idle"), away: of("away") };
}

/** What each message's row and its pane's head read of it, worked out once: the language it opens on, and where it stands. */
function readEach(every: readonly TemplateGroup[], langs: readonly TplLang[], versions: readonly TemplateDto[]) {
  const read = new Map<string, { facts: ReturnType<typeof messageFacts>; setting: MessageSetting }>();
  for (const g of every) {
    const facts = messageFacts({ g, langs, S: library, versions, view: firstView(g, langs) });
    read.set(g.key, { facts, setting: placeOfMessage(g, facts) });
  }
  return read;
}

/** A message's row, from what was read of it once: nothing for one that was not read. */
function messageCard(read: ReturnType<typeof readEach>, shownKey: string | null, openOne: (key: string) => void) {
  return (group: TemplateGroup) => {
    const it = read.get(group.key);
    return it ? (
      <MessageRow
        key={group.key}
        g={group}
        facts={it.facts}
        setting={it.setting}
        open={shownKey === group.key}
        onOpen={() => openOne(group.key)}
      />
    ) : null;
  };
}

/** The page has read nothing yet, or is a session with no workspace to read. */
function readingNow(view: CmView | undefined) {
  return (
    <div className="reports" data-testid="messages-real" ref={view?.ref} data-slide={view?.slide}>
      <div className="cm-standing">{demoSession() ? LIBRARY_WORDS.demo : LIBRARY_WORDS.reading}</div>
    </div>
  );
}

/** The templates could not be read: said, with the way to read them again. */
function couldntLoad(view: CmView | undefined) {
  return (
    <div className="reports" data-testid="messages-real" ref={view?.ref} data-slide={view?.slide}>
      <div className="cm-standing">{LIBRARY_WORDS.failed}</div>
      <div className="rp-body">
        <FailedRead
          kind="card"
          what={LIBRARY_WORDS.failedWhat}
          body={LIBRARY_WORDS.failedBody}
          surface="settings"
          testid="messages-failed"
        />
      </div>
    </div>
  );
}

/** What the page holds as it is used: the act under way, what is open, what the search holds, and the toast. */
function usePageState() {
  // Which act is under way, if any: every control waits for it, and only the one pressed says it is working. The ref
  // holds the guard before the page has drawn the state.
  const [doing, setDoing] = useState<string | null>(null);
  const doingRef = useRef<string | null>(null);
  // A message half-written when the page was left opens again as the page does: the tab kept its words (the
  // composer's own useUnsavedWork, under "new").
  const [composing, setComposing] = useState(() => !!tabDraft("template", "new"));
  // Which of the list's groups stand open: Not in use's own (null) opens it where nothing else is there to read.
  const [folds, setFolds] = useState<ListFolds>({ idle: null, away: false, emails: true });
  // Which reach-out email is open, by its key, in the pane beside the list (a message open is the address's). One thing open
  // at a time: the words of two messages side by side is the wall this page stopped being.
  const [openKey, setOpenKey] = useState<string | null>(null);
  // A message pressed, by its key and the address it was pressed at, shown until its own address lands.
  const [pressed, setPressed] = useState<{ key: string; at: string } | null>(null);
  // What the search box holds: the rows whose words have it stay, the rest stand down.
  const [q, setQ] = useState("");
  // On a desk the box is the bar's line (page-search.ts); a phone keeps its box over the list.
  const inLine = usePageSearch({ label: BAR_LINE_WORDS.messages, value: q, onValue: setQ, testid: "templates-search" });
  const [toastNode, flash] = useFrameToast();
  return {
    doing,
    setDoing,
    doingRef,
    composing,
    setComposing,
    folds,
    setFolds,
    openKey,
    setOpenKey,
    pressed,
    setPressed,
    q,
    setQ,
    inLine,
    toastNode,
    flash,
  };
}

/** Edit the reach-out, from one of its emails: its sequence's record, where a sequence to leads is written (18 Oct 2026). */
const changeChain = (c: ReachOutChainDto) => navigate(sequenceRoute(c.root_id));

/**
 * The page's own acts stay where they are for every role and say who may (gate); a message's rename, hide and delete stay
 * with those who may, and whoever may not is told so where there is a number to hold messages.
 */
function roleHint(canAct: boolean, hasWhatsApp: boolean): ReactNode {
  if (canAct || !hasWhatsApp) return null;
  return (
    <span className="bc-excl-hint" data-testid="messages-role">
      {gateTitle("approve", "rename, put away or delete a message")}
    </span>
  );
}

/** A message the address names that the workspace no longer holds: said, with the way back to the list. */
function messageGone(onClose: () => void) {
  const W = LIFECYCLE_WORDS.messageGone;
  return (
    <EmptyState
      kind="line"
      title={W.title}
      body={
        <>
          {W.body}{" "}
          <LinkButton onClick={onClose} data-testid="tpl-message-gone-back">
            {LIBRARY_WORDS.title}
          </LinkButton>
        </>
      }
      testid="tpl-message-gone"
    />
  );
}

/** The message the address opens, by its name (contracts messageOfRoute): a door to one reached while the composer was open
 * opens it, the composer's words kept in the tab. */
function useNamedMessage(route: string, setComposing: (on: boolean) => void): string | null {
  const named = messageOfRoute(route);
  useEffect(() => {
    if (named) setComposing(false);
  }, [named, setComposing]);
  return named;
}

/**
 * What is open, and the presses that open and close it: a message by its address (replaced, so Back leaves the page), a
 * reach-out's email and the composer by the page's own state, one at a time. The composer gives way to a message (its
 * words are kept in the tab, and come back with New), as New gives way to the message.
 */
function messageOpener(
  at: { route: string; named: string | null },
  groups: readonly TemplateGroup[],
  st: Pick<ReturnType<typeof usePageState>, "openKey" | "setOpenKey" | "setComposing" | "pressed" | "setPressed">,
) {
  const { route, named } = at;
  // The message open: the address's, else one pressed at this address whose own has not landed yet (shown at once, and
  // let go as the address moves, which is the truth again).
  const pressed = st.pressed && st.pressed.at === route ? groups.find((g) => g.key === st.pressed?.key) : undefined;
  const routed = named ? groupNamed(groups, named) : (pressed ?? null);
  const shownKey = routed ? routed.key : named ? null : st.openKey;
  const leaveMessage = () => {
    st.setPressed(null);
    if (named) replaceRoute(MESSAGES_ROUTE);
  };
  const openOne = (key: string) => {
    st.setComposing(false);
    const g = groups.find((x) => x.key === key);
    const closing = shownKey === key;
    if (g) {
      st.setOpenKey(null);
      st.setPressed(closing ? null : { key, at: route });
      replaceRoute(closing ? MESSAGES_ROUTE : messageRoute(nameOfGroup(g)));
      return;
    }
    leaveMessage();
    st.setOpenKey(closing ? null : key);
  };
  const startNew = () => {
    st.setOpenKey(null);
    leaveMessage();
    st.setComposing(true);
  };
  const closeOpen = () => {
    st.setOpenKey(null);
    leaveMessage();
  };
  // A message the composer just made, opened as a press opens one: its address, and the message shown until it lands.
  const openMade = (key: string, name: string) => {
    st.setComposing(false);
    st.setOpenKey(null);
    st.setPressed({ key, at: route });
    replaceRoute(messageRoute(name));
  };
  // What the list lights as open: the message, else the email open here.
  return { routed, shownKey, openOne, startNew, closeOpen, openMade };
}

/** How long WhatsApp's own list of messages is left before the page asks it again as it opens. */
const QUIET_CHECK_MS = HOUR_MS;
/** Asked once a visit at most: a page opened again in it reads what that asking brought. */
let checkedThisVisit = false;

/**
 * WhatsApp asked quietly as the page opens (the Messages redesign's step 5: no sync button): its answer on a message
 * written here comes by itself (waba-events), so this reads only what was made or changed in WhatsApp's own tools, where
 * the list was last read over an hour ago, for whoever may. Nothing is said: what changed is in the list once read again.
 */
function useQuietCheck(may: boolean, templates: readonly TemplateDto[] | null | undefined) {
  const synced = (templates ?? []).reduce<string | null>(
    (m, t) => (t.synced_at && (!m || t.synced_at > m) ? t.synced_at : m),
    null,
  );
  useEffect(() => {
    if (!may || checkedThisVisit) return;
    if (synced && Date.now() - Date.parse(synced) < QUIET_CHECK_MS) return;
    checkedThisVisit = true;
    // A check that did not answer leaves the list as it was read: the next visit asks again.
    void syncTemplates();
  }, [may, synced]);
}

function MessagesReal({ view, route }: { view?: CmView; route: string }) {
  // The settings surface holds the templates, the numbers and what sends and went out; a reach-out's emails are their
  // own surface (Part 4 PR 8): their rows draw when they land.
  const settings = useSurface("settings");
  const chains = useSurface("reach_outs");
  const templates = settings ? settings.templatesAll : undefined;
  const messages = settings?.messages;
  // The workspace's email and text rows (not a reach-out's): each message finds its own among them. Unread is none.
  const versions = settings?.templateVersions ?? NO_VERSIONS;
  const S = library;
  const state = usePageState();
  const phone = useCmPhone();
  const { doing, setDoing, doingRef, composing, setComposing, folds, setFolds } = state;
  const { openKey, q, setQ, inLine, toastNode, flash } = state;
  const named = useNamedMessage(route, setComposing);
  const busy = doing !== null;
  // Who may add, change or remove a message: the role store's answer, View-as included.
  const canAct = canDo("approve");
  // The numbers, from the channels read (surfaces/channels/surface.ts): undefined while it is read, null where it failed.
  const channels = useSurface("channels")?.rows;
  const hasWhatsApp = (channels || []).some((c) => c.kind === "whatsapp");
  const bizName = brainOf(settings ? settings.settings : undefined).business_name || null;
  // Messages' first part (client/page-speed.ts, contracts PRIMARY_PART): its list, drawn once the settings read is in, or
  // what could not be read. Shown beside Sequences under Campaigns' one mount, it is timed from the press that showed it.
  usePartShown("templates", "list", templates !== undefined && messages !== undefined);
  useQuietCheck(hasWhatsApp && canAct && !!templates, templates);

  if (templates === undefined || messages === undefined) return readingNow(view);
  if (templates === null || messages === null) return couldntLoad(view);

  const listing = listingOf(templates, messages, S);
  const { langs, starters, customGroups, hiddenGroups } = listing;
  const acts = pageActs({ doingRef, setDoing, flash });
  const { rename, toggleHidden, remove, addStarters, written } = acts;
  // A new language is written and sent from the pane that opened it, by whoever may
  // add a template and only with a number to add it to; anyone else is told why in
  // the picker, where the languages it cannot add would have been. (An email's or a text's
  // version of a message needs no number: only a WhatsApp version does.)
  const addWhy = !hasWhatsApp ? LIBRARY_WORDS.addNeedsNumber : !canAct ? gateTitle("approve", "add a language") : null;
  const every = [...starters, ...customGroups, ...hiddenGroups];
  const { routed, shownKey, openOne, startNew, closeOpen } = messageOpener({ route, named }, every, state);
  const read = readEach(every, langs, versions);
  const card = messageCard(read, shownKey, openOne);

  const needle = q.trim().toLowerCase();
  const matches = matchesOf(needle, langs, S, versions);
  const groups = messageGroupsOf(every.filter(matches), read);
  // A cold email sequence's emails (Reach out Part 4 PR 8, R19): contracts' rows over the chains, found by their words too.
  const emails = tplEmails(chains);
  const listEmails = tplEmailsMatching(emails, needle);

  // What is open beside the list: the composer, a message or a reach-out's email. A message the address names that the
  // list no longer has (deleted, or a number that went) says so.
  const openGroup = routed;
  const openEmail = named || openGroup ? null : tplEmailOpen(emails, openKey);
  const pane = composing ? (
    <NewSaid onClose={() => setComposing(false)} />
  ) : openGroup ? (
    <TemplatePane
      key={openGroup.key}
      g={openGroup}
      langs={langs}
      bizName={bizName}
      canAct={canAct && hasWhatsApp}
      canAdd={canAct && hasWhatsApp}
      addWhy={addWhy}
      busy={busy}
      doing={doing}
      S={S}
      onClose={closeOpen}
      onAdd={(gg, lang) => addStarters([gg.starter.key], [lang.id])}
      onRename={rename}
      onHide={toggleHidden}
      onDelete={remove}
      onWritten={written}
      versions={versions}
      canWrite={canAct}
      onSaveVersion={acts.saveVersion}
      onRemoveVersion={acts.removeVersion}
      onSendWords={acts.sendWords}
    />
  ) : named ? (
    messageGone(closeOpen)
  ) : openEmail ? (
    <ReachOutEmailPane
      key={`e:${openEmail.step_id}`}
      t={openEmail}
      busy={busy}
      onSave={acts.saveEmail}
      onClose={closeOpen}
      onEdit={changeChain}
    />
  ) : null;

  const list = (
    <div className="cm-page tpl-wrap">
      {/* Messages is a view of Campaigns beside Sequences (decision 0060, D4): its head is Campaigns', the strip under it
          saying the view, with its line beside the name and New by the strip, as Sequences' head is. */}
      <CmHead
        quiet
        title={LIBRARY_WORDS.title}
        testid="messages-standing"
        sub={headSub({ need: groups.need.length, going: groups.going.length })}
        right={headRight({ onNew: startNew })}
      />
      {/* The top of the list on a phone, as the Inbox's opens: the search. A desk's is the bar's line. */}
      {listBar({ q, setQ, inLine })}
      {roleHint(canAct, hasWhatsApp)}
      {numberNotice({ channels, hasWhatsApp })}
      {templateList({
        groups,
        listEmails,
        openKey: shownKey,
        onOpenKey: openOne,
        card,
        folds,
        onFold: (group, open) => setFolds((was) => ({ ...was, [group]: open })),
        needle,
        q,
      })}
    </div>
  );

  // The list in its pane, and what is open beside it -- a message, an email or the composer (parts/split.tsx); on a
  // phone, over it in the drawer.
  return (
    <>
      <CmSplit className="tpl-page" testid="messages-real" list={list} open={phone ? null : pane} view={view} />
      {phone ? phoneDrawer({ pane, composing, onClose: composing ? () => setComposing(false) : closeOpen }) : null}
      {toastNode}
    </>
  );
}

/**
 * What is open, on a phone: over the list in the drawer Campaigns' home opens its own in, whose Close asks the composer
 * first about what was written (its foot has no Cancel). A message's own head is the drawer's one head: no "Messages"
 * over its name (the message sheet's canvas, 12 Nov 2026).
 */
function phoneDrawer({ pane, composing, onClose }: { pane: ReactNode; composing: boolean; onClose: () => void }) {
  return (
    <PaneSheet
      open={pane !== null}
      title={LIBRARY_WORDS.title}
      onClose={onClose}
      askFirst={composing}
      bare={!composing}
      testid="tpl-drawer"
    >
      {pane}
    </PaneSheet>
  );
}

/**
 * Messages, over what the settings and reach-out surfaces hold, as Campaigns draws it (home/route.tsx): a view kept beside
 * Sequences under Campaigns' one mount, `view` the deck's seat, its side and whether it is shown (parts/split.tsx
 * CmView), at `route`, the address it was last at (`campaigns/messages`, or a message open in it). Its code is a chunk of
 * Campaigns' own (home/campaigns-code.tsx), so no page's first load carries it.
 */
export function TemplatesPage({ view, route = MESSAGES_ROUTE }: { view?: CmView; route?: string } = {}) {
  return <MessagesReal view={view} route={route} />;
}
