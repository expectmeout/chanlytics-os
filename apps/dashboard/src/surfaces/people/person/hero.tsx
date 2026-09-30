/**
 * The person page's hero (moved from legacy/pages/client-profile.jsx, decision 0015, step 5): who they are and where they
 * stand, said once (the name, the line under it, the standing's word with the sentence of what happens next), and the page's
 * acts beside them: the thread, its one primary, and a More menu whose items, words, groups and roles are contracts'
 * `personActs`. What an act does is its hover, never a sentence beside the label, which wrapped and ran past the menu's edge.
 */
import type { ReactNode } from "react";
import { proposalMessage } from "@chanlytics/contracts";
import { Confirm } from "../../kit/confirm/confirm";
import { FailedRead } from "../../kit/empty/empty";
import { MoreMenu } from "../../kit/more-menu/more-menu";
import { StatePill } from "../../kit/pill/state-pill";
import { Icon } from "../../kit/icon/icon";
import { navigate } from "../../legacy-verbs";
import { deletePerson } from "../people-detail";
import { PersonName } from "./name";
import { digitsOf } from "./ctx";
import type { PageCtx } from "./ctx";

const ACT_ICON: Record<string, string> = {
  booking: "calendar",
  proposal: "send",
  call: "phone",
  "copy-phone": "copy",
  "copy-email": "mail",
  delete: "x",
};

/**
 * A send opens their thread with the words ready; nothing is sent from here. A send with no words (the deal card's, where
 * only an approved message can go) opens the thread and leaves its box alone: the thread offers those.
 */
export function openWith(c: PageCtx): (text?: string | null) => void {
  const { p } = c;
  return (text) => {
    const thread = p.openThread;
    if (text && thread !== null) {
      try {
        sessionStorage.setItem(
          "chanlytics-compose",
          JSON.stringify({ threadId: thread.replace(/^inbox\//, ""), text }),
        );
      } catch {
        /* nothing to carry */
      }
    }
    if (thread !== null) navigate(thread);
  };
}

/** Copy a number or an address, and say so. */
function copyOut(c: PageCtx, text: string | null, what: string) {
  try {
    if (navigator.clipboard) void navigator.clipboard.writeText(text ?? "");
  } catch {
    /* a browser that will not */
  }
  c.flash({
    msg: (
      <>
        Copied {what} <b>{text}</b>
      </>
    ),
  });
}

/** The acts the page keeps for its reader's role, as the More menu's items: a few words each, a line between the groups. */
function moreItems(c: PageCtx, compose: (text?: string | null) => void) {
  const { p, canRecord, isOwner, setDel } = c;
  const doAct: Record<string, () => void> = {
    booking: () => {
      if (p.bookingLinkAction.ready) compose(`Here's the link to book your appointment: ${p.bookingLink}`);
      else if (p.openThread !== null) navigate(p.openThread);
    },
    proposal: () => {
      if (p.proposal) compose(proposalMessage(p.proposal.url));
    },
    // The member's own phone rings them, as a lead is called; never the receptionist.
    call: () => {
      window.location.href = `tel:${String(p.phone || "").replace(/[^\d+]/g, "")}`;
    },
    "copy-phone": () => copyOut(c, p.phone, "the number"),
    "copy-email": () => copyOut(c, p.email, "the email"),
    delete: () => setDel({ open: true, typed: "", busy: false, error: null }),
  };
  const acts = (p.acts || []).filter((a) => a.needs === "any" || (a.needs === "record" ? canRecord : isOwner));
  // A few words each, a line between the groups, and what an act does on hover: a sentence beside every label was a
  // block of wrapped words cut off at the menu's edge.
  return acts.flatMap((a, i) => {
    const before = acts[i - 1];
    return [
      ...(before && before.group !== a.group ? [{ divider: true }] : []),
      { label: a.label, title: a.hint || undefined, icon: ACT_ICON[a.id], danger: !!a.danger, onClick: doAct[a.id] },
    ];
  });
}

/** The typed-name confirmation to delete a person: it erases messages, media and recordings and cannot be undone. */
function deleteBox(c: PageCtx) {
  const { p, del, setDel, flash, onBack } = c;
  const typedMatches =
    del.typed.trim() === p.name ||
    (!!p.phone && digitsOf(del.typed).length >= 7 && digitsOf(del.typed) === digitsOf(p.phone));
  const confirmDelete = async () => {
    if (!typedMatches) return;
    setDel((d) => ({ ...d, busy: true, error: null }));
    const r = await deletePerson(p.id);
    if (!r.ok) {
      setDel((d) => ({ ...d, busy: false, error: r.message || "Could not delete this person." }));
      return;
    }
    flash({
      msg: (
        <>
          <b>{p.name}</b> deleted — their messages, media and recordings are gone
        </>
      ),
    });
    onBack();
  };
  return (
    <div className="cl-prof-danger">
      <Confirm
        block
        danger
        typed={p.name}
        value={del.typed}
        onType={(v) => setDel((d) => ({ ...d, typed: v }))}
        ready={typedMatches}
        question="Delete this person?"
        detail={
          <>
            Removes their messages, media and recordings from Chanlytics and stops any reply still queued. This cannot
            be undone. Type <b>{p.name}</b> to confirm.
          </>
        }
        yes="Delete this person"
        busyLabel="Deleting…"
        busy={del.busy}
        error={del.error}
        onYes={() => void confirmDelete()}
        onNo={() => setDel({ open: false, typed: "", busy: false, error: null })}
        testid="delete"
      />
    </div>
  );
}

/** The one line under the name: their channels, their number (unless the number is their name) and since when. */
function idLineOf(c: PageCtx, phoneOnly: boolean): string[] {
  const { p } = c;
  const sinceWords = p.since ? p.since.charAt(0).toLowerCase() + p.since.slice(1) : "";
  return [p.channelWords, phoneOnly ? null : p.phone, sinceWords].filter((x): x is string => !!x);
}

/** Who they are: the face, the name and where they stand, the line under it, and what the read of them says. */
function heroId(c: PageCtx, phoneOnly: boolean) {
  const { p, flash, canRecord, load, error } = c;
  const tone = p.rightNow.tone;
  const idLine = idLineOf(c, phoneOnly);
  return (
    <div className="cl-prof-id">
      <div className="cl-prof-avatar" aria-hidden="true">
        {p.initials}
      </div>
      <div className="cl-prof-titles">
        {/* The name, and beside it where they stand: a dot and the standing's word, its sentence on hover. The sentence is
            said under the line only when it asks for something: "New messages are answered automatically" under every
            answered person said nothing. */}
        <div className="cl-prof-name-line">
          <PersonName p={p} canEdit={canRecord} flash={flash} />
          <span className="cl-prof-now" data-tone={tone} data-testid="person-now" title={p.rightNow.detail}>
            <StatePill kind="standing" value={tone} testid="person-standing" />
          </span>
        </div>
        {idLine.length > 0 && (
          <div className="cl-prof-meta cl-prof-idline" data-testid="person-id-line">
            <div className="cl-prof-idline-run">
              {idLine.map((part) => (
                <span key={part} className="cl-prof-meta-part">
                  {part}
                </span>
              ))}
            </div>
          </div>
        )}
        {tone !== "answering" && (
          <div className="cl-prof-now-why" data-testid="person-now-why">
            {p.rightNow.detail}
          </div>
        )}
        {/* The page is the copy this tab kept and reading it again failed: said, quietly, where it is read, so a copy from
            before a reload is never taken for now. */}
        {error && (
          <FailedRead
            kind="line"
            what="the latest for them"
            why={error}
            body="What is here is from earlier."
            onRetry={load}
            testid="person-stale"
          />
        )}
      </div>
    </div>
  );
}

/** The page's acts: its one primary, their thread, and the More menu. */
function heroActs(c: PageCtx, more: ReturnType<typeof moreItems>): ReactNode {
  const { p, who } = c;
  // The action lives in Right now, beside what needs doing. Its own button is the thread in every state that has one,
  // except a person who opted out: the header's Open thread was their only way in, so it falls back to it.
  const threadCta = p.rightNow.cta || (p.openThread ? { label: "Open the thread", to: p.openThread } : null);
  return (
    <div className="cl-prof-queue-actions">
      {threadCta && (
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => navigate(threadCta.to)}
          data-testid="person-open-thread"
        >
          {threadCta.label}
        </button>
      )}
      {/* Words, not three dots: a ⋯ was too quiet to be found, and it held one thing. */}
      {more.length > 0 && (
        <MoreMenu label="More" title={`More for ${who}`} btnClass="btn btn-sm" items={more} testid="person-more" />
      )}
    </div>
  );
}

/** The hero: Back, who they are, the acts, and the delete question while it is asked. */
export function hero(c: PageCtx, compose: (text?: string | null) => void, phoneOnly: boolean) {
  const more = moreItems(c, compose);
  return (
    <div className="cl-prof-hero">
      {/* On a phone the word goes and the arrow takes a thumb's width: the top bar says People over it. */}
      <button type="button" className="cl-prof-back" onClick={c.onBack} aria-label="Back to People">
        <Icon name="chevron" size={11} style={{ transform: "rotate(180deg)" }} />
        <span className="cl-prof-back-word">People</span>
      </button>
      {heroId(c, phoneOnly)}
      {heroActs(c, more)}
      {c.del.open && deleteBox(c)}
    </div>
  );
}
