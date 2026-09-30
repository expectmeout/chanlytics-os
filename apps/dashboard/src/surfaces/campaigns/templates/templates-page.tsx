/**
 * Campaigns > Templates: the wording the receptionist and the campaigns send on WhatsApp, shown as the customer sees it
 * (moved from legacy/pages/messages.jsx, decision 0015). One row per message -- the starter set in the library's order,
 * then what the workspace wrote or synced -- opening on the bubble for the language in view, its languages (approved,
 * in review, or one tap to add), and the verbs an operator has under a menu. Meta's own sample is never shown; a
 * template the workspace hid sits under a fold, still on file. Written here or in WhatsApp Manager, WhatsApp approves
 * either way; a marketing template can only go to people who said yes to offers. Every verb goes through the templates
 * verbs and the surface is re-fetched, so the cards are the server's.
 *
 * The page is real on every workspace. A demo session draws the same words as a real one, over what it holds; without a
 * read, the waiting line says which of the two is looking.
 */
import { useRef, useState } from "react";
import { canDo, demoSession, gateTitle, useLegacyToast } from "../../legacy-verbs";
import { tabDraft } from "../../legacy-parts";
import { FailedRead } from "../../kit/empty/empty";
import { useSurface } from "../../use-surface";
import { CmHead } from "../parts/head";
import { tplEmails, tplEmailsMatching } from "./emails";
import { listingOf } from "./group";
import type { TemplateGroup } from "./group";
import { MessageRow } from "./message-row";
import { pageActs } from "./page-acts";
import {
  TplFoot,
  composerSheet,
  headRight,
  headSub,
  matchesOf,
  numberNotice,
  startersOffer,
  templateList,
} from "./page-parts";
import { starters as library } from "./verbs";
import { brainOf } from "./words";

/** The page has read nothing yet, or is a session with no workspace to read. */
function readingNow() {
  return (
    <div className="reports" data-testid="messages-real">
      <div className="cm-standing">
        {demoSession()
          ? "Templates reads a real workspace — what WhatsApp has approved for it."
          : "Reading your templates…"}
      </div>
    </div>
  );
}

/** The templates could not be read: said, with the way to read them again. */
function couldntLoad() {
  return (
    <div className="reports" data-testid="messages-real">
      <div className="cm-standing">Your templates couldn&rsquo;t be loaded right now</div>
      <div className="rp-body">
        <FailedRead
          kind="card"
          what="your templates"
          body="The receptionist keeps sending; this page just can't show them at the moment."
          surface="settings"
          testid="messages-failed"
        />
      </div>
    </div>
  );
}

function MessagesReal() {
  // The settings surface holds the templates, the numbers and what sends and went out; a reach-out's emails are their
  // own surface (Part 4 PR 8): their rows draw when they land.
  const settings = useSurface("settings");
  const chains = useSurface("reach_outs");
  const templates = settings ? settings.templatesAll : undefined;
  const S = library;
  // Which act is under way, if any: every control waits for it, and only the one pressed says it is working. The ref
  // holds the guard before the page has drawn the state.
  const [doing, setDoing] = useState<string | null>(null);
  const doingRef = useRef<string | null>(null);
  const busy = doing !== null;
  // A message half-written when the page was left opens again as the page does: the tab kept its words (the
  // composer's own useUnsavedWork, under "new").
  const [composing, setComposing] = useState(() => !!tabDraft("template", "new"));
  const [showHidden, setShowHidden] = useState(false);
  // Which message is open, by its key. One at a time: the words of two
  // messages side by side is the wall this page stopped being.
  const [openKey, setOpenKey] = useState<string | null>(null);
  // What the search box holds: the rows whose words have it stay, the rest stand down.
  const [q, setQ] = useState("");
  const [toastNode, flash] = useLegacyToast();
  // Who may add, change or remove a message: the role store's answer, View-as included.
  const canAct = canDo("approve");
  const channels = settings ? settings.channels : undefined;
  const hasWhatsApp = (channels || []).some((c) => c.kind === "whatsapp");
  const bizName = brainOf(settings ? settings.settings : undefined).business_name || null;

  if (templates === undefined) return readingNow();
  if (templates === null) return couldntLoad();

  const listing = listingOf(templates, S);
  const { langs, starters, hiddenRows, customGroups, hiddenGroups, missingTotal, allMissing } = listing;
  const partialSet = !!(hasWhatsApp && missingTotal > 0 && !allMissing);
  const addingAll = doing === `add:all:${langs.map((l) => l.id).join(",")}`;
  const { rename, toggleHidden, remove, addStarters, sync, written } = pageActs({ doingRef, setDoing, flash });
  // A new language is written and sent from the row that opened it, by whoever may
  // add a template and only with a number to add it to; anyone else is told why in
  // the picker, where the languages it cannot add would have been.
  const addWhy = !hasWhatsApp
    ? "Connect a WhatsApp number to add a language."
    : !canAct
      ? gateTitle("approve", "add a language")
      : null;
  const card = (g: TemplateGroup) => (
    <MessageRow
      key={g.key}
      g={g}
      langs={langs}
      bizName={bizName}
      canAct={canAct && hasWhatsApp}
      canAdd={canAct && hasWhatsApp}
      addWhy={addWhy}
      busy={busy}
      doing={doing}
      S={S}
      open={openKey === g.key}
      onOpen={() => setOpenKey((k) => (k === g.key ? null : g.key))}
      onAdd={(gg, lang) => addStarters([gg.starter.key], [lang.id])}
      onRename={rename}
      onHide={toggleHidden}
      onDelete={remove}
      onWritten={written}
    />
  );

  const needle = q.trim().toLowerCase();
  const matches = matchesOf(needle, langs, S);
  const listStarters = hasWhatsApp ? starters.filter(matches) : [];
  const listCustom = customGroups.filter(matches);
  // A reach-out's emails (Reach out Part 4 PR 8, R19): contracts' rows over the chains, found by their words too.
  const emails = tplEmails(chains);
  const listEmails = tplEmailsMatching(emails, needle);
  const listed = listStarters.length + listCustom.length + listEmails.length;
  return (
    <div className="reports tpl-page" data-testid="messages-real">
      <div className="rp-body cm-page">
        {/* One line, the way every Campaigns tab opens: the tab says "Templates", so the
            name is a screen reader's alone (CmHead quiet). */}
        <CmHead
          title="Templates"
          quiet
          testid="messages-standing"
          sub={headSub({ listing, emails, hasWhatsApp, doing, busy, sync })}
          right={headRight({ q, setQ, hasWhatsApp, setComposing })}
        />
        {/* The page's own acts stay where they are for every role and say who may
            (gate); a message's rename, hide and delete stay with those who may. */}
        {!canAct && hasWhatsApp && (
          <span className="bc-excl-hint" data-testid="messages-role">
            {gateTitle("approve", "rename, hide or delete a template")}
          </span>
        )}
        {numberNotice({ channels, hasWhatsApp })}
        {composing && composerSheet({ bizName, setComposing, flash })}
        {hasWhatsApp && allMissing && startersOffer({ S, langs, busy, addingAll, addStarters })}
        {templateList({
          listed,
          listStarters,
          listCustom,
          listEmails,
          emails,
          openKey,
          setOpenKey,
          card,
          needle,
          q,
          hasWhatsApp,
          customN: customGroups.length,
        })}
        {(partialSet || hiddenRows.length > 0) && (
          <TplFoot
            partialSet={partialSet}
            busy={busy}
            onAddRest={() =>
              addStarters(
                null,
                langs.map((l) => l.id),
              )
            }
            leftToAdd={listing.leftToAdd}
            addingAll={addingAll}
            hidden={hiddenRows.length}
            showHidden={showHidden}
            setShowHidden={setShowHidden}
          />
        )}
        {showHidden && hiddenGroups.length > 0 && (
          <div className="msg-list msg-list-hidden">{hiddenGroups.map(card)}</div>
        )}
      </div>
      {toastNode}
    </div>
  );
}

/** The page, over what the settings and reach-out surfaces hold: no props, the address is its route's. */
export function TemplatesPage() {
  return <MessagesReal />;
}
