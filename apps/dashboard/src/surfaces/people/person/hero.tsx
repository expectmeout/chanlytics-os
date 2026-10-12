/**
 * The person page's hero (moved from legacy/pages/client-profile.jsx, decision 0015, step 5): who they are and where they
 * stand, said once (the name, the line under it, the standing's word with the sentence of what happens next), and the page's
 * acts beside them: the thread, its one primary, and a More menu whose items, words, groups and roles are contracts'
 * `personActs`. What an act does is its hover, never a sentence beside the label, which wrapped and ran past the menu's edge.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import {
  DOUBT_WORDS,
  MERGE_WORDS,
  NEW_CONVERSATION_WORDS,
  appointmentWords,
  proposalMessage,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Face } from "../../kit/face/face";
import { Menu } from "../../kit/menu/menu";
import type { MenuGroup, MenuItem } from "../../kit";
import { Confirm } from "../../kit/confirm/confirm";
import { FailedRead } from "../../kit/empty/empty";
import { FieldError } from "../../kit/field-error/field-error";
import { StatePill } from "../../kit/pill/state-pill";
import { Icon } from "../../kit/icon/icon";
import { Picker } from "../../kit/picker/picker";
import type { PickerGroup } from "../../kit/picker/picker";
import { gate, navigate } from "../../legacy-verbs";
import { carryReply } from "../../inbox/carried-reply";
import { openNewConversation } from "../../inbox/new-conversation/store";
import { visitWordHere } from "../../visit-line";
import { deletePerson, keptOf, mergePerson, settleDoubt } from "../people-detail";
import { BusinessTile, HeadLine } from "./business";
import { PersonName } from "./name";
import { NameNotices, putNameBack } from "./signer";
import { digitsOf } from "./ctx";
import type { PageCtx } from "./ctx";
import type { PersonDoubtVM, PersonRowVM } from "@chanlytics/contracts";

const ACT_ICON: Record<string, string> = {
  booking: "calendar",
  proposal: "send",
  call: "phone",
  "copy-phone": "copy",
  "copy-email": "mail",
  merge: "users",
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
    if (thread === null) return;
    if (text) carryReply(thread, text);
    navigate(thread);
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

/** The acts the page keeps for its reader's role, as the kit Menu's groups: a few words each, a line between the groups. */
function moreGroups(c: PageCtx, compose: (text?: string | null) => void): MenuGroup[] {
  const { p, canRecord, isOwner, setDel, setMerge } = c;
  const doAct: Record<string, () => void> = {
    booking: () => {
      if (p.bookingLinkAction.ready && p.bookingLink)
        compose(appointmentWords(visitWordHere()).bookingLink(p.bookingLink));
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
    // One question at a time: opening either box closes the other.
    delete: () => {
      setMerge({ open: false, pick: null, typed: "", busy: false, error: null });
      setDel({ open: true, typed: "", busy: false, error: null });
    },
    merge: () => {
      setDel({ open: false, typed: "", busy: false, error: null });
      setMerge({ open: true, pick: null, typed: "", busy: false, error: null });
    },
  };
  // Call is the head's own act now (canvas A: Call · Note · More), so the menu does not say it again.
  const acts = (p.acts || []).filter(
    (a) => a.id !== "call" && (a.needs === "any" || (a.needs === "record" ? canRecord : isOwner)),
  );
  // A few words each, a line between the groups, and what an act does on hover: a sentence beside every label was a
  // block of wrapped words cut off at the menu's edge.
  const groups: { key: string; items: MenuItem[] }[] = [];
  for (const a of acts) {
    const glyph = ACT_ICON[a.id];
    const item: MenuItem = {
      label: a.label,
      title: a.hint || undefined,
      glyph: glyph ? <Icon name={glyph} size={13} /> : undefined,
      tone: a.danger ? "danger" : undefined,
      onSelect: doAct[a.id] ?? (() => {}),
    };
    const last = groups[groups.length - 1];
    if (last && last.key === a.group) last.items.push(item);
    else groups.push({ key: a.group, items: [item] });
  }
  return groups.map((g) => ({ items: g.items }));
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

/** A record the merge box offers: a People row, or the other record of a doubt. */
type MergeOption = Pick<PersonRowVM, "id" | "name" | "phone" | "email">;

/**
 * Same person? (decision 0034, step 4): each open doubt the door raised on them, as a sentence naming the other record,
 * with its two settlements. Merge opens 0028's box with the other record chosen already (the owner's act); Not the
 * same settles the pair through its own door, as any acting member, and the page is read again with the row gone.
 */
function doubtRows(c: PageCtx) {
  const { p, isOwner, canRecord, doubt, setDoubt, setDel, setMerge, flash, load } = c;
  if (!p.doubts.length) return null;
  const apart = async (d: PersonDoubtVM) => {
    if (doubt.busy) return;
    setDoubt({ busy: d.id, error: null });
    const r = await settleDoubt(p.id, d.id);
    if (!r.ok) {
      setDoubt({ busy: null, error: r.message || DOUBT_WORDS.apartFailed });
      return;
    }
    setDoubt({ busy: null, error: null });
    flash({ msg: DOUBT_WORDS.apartDone(d.other) });
    load();
  };
  const mergeWith = (d: PersonDoubtVM) => {
    setDel({ open: false, typed: "", busy: false, error: null });
    setMerge({ open: true, pick: d.otherId, typed: "", busy: false, error: null });
  };
  return (
    <div className="cl-prof-doubts" role="group" aria-label={DOUBT_WORDS.heading} data-testid="doubts">
      {p.doubts.map((d) => (
        <div className="cl-prof-doubt" key={d.id} data-testid="doubt">
          <span>{d.sentence}</span>
          {isOwner && (
            <Button size="sm" title={DOUBT_WORDS.mergeHint} onClick={() => mergeWith(d)} data-testid="doubt-merge">
              {DOUBT_WORDS.merge}
            </Button>
          )}
          {canRecord && (
            <Button
              size="sm"
              variant="quiet"
              title={DOUBT_WORDS.apartHint}
              disabled={doubt.busy !== null}
              onClick={() => void apart(d)}
              data-testid="doubt-apart"
            >
              {doubt.busy === d.id ? DOUBT_WORDS.apartBusy : DOUBT_WORDS.apart}
            </Button>
          )}
        </div>
      ))}
      {doubt.error && <FieldError message={doubt.error} testid="doubt-error" />}
    </div>
  );
}

/**
 * Two records of one person become one (0028): the other record chosen from People, then the kept person's name typed,
 * as Delete asks. The door is the database's and cannot be undone; what it answers is said as a toast, and the page is
 * read again, whole, with what moved.
 */
function mergeBox(c: PageCtx) {
  const { p, merge, setMerge, others, flash, load } = c;
  // People's other rows, and the other record of each doubt (0034 step 4) People has not read or does not list.
  // Combine (0052): the people at the same business a notice offers to combine with, which People's rows do not offer (two
  // addresses), and which the door takes as one human.
  const combineIds = new Set(p.notices.flatMap((n) => (n.act.do.kind === "combine" ? [n.act.do.otherId] : [])));
  const atBusiness: MergeOption[] = (p.business?.people ?? [])
    .filter((x) => combineIds.has(x.id))
    .map((x) => ({ id: x.id, name: x.name, phone: null, email: null }));
  const rows: MergeOption[] = [
    ...(others ?? []),
    ...p.doubts
      .filter((d) => !(others ?? []).some((o) => o.id === d.otherId))
      .map((d) => ({ id: d.otherId, name: d.other, phone: d.phone, email: d.email })),
    ...atBusiness.filter((x) => !(others ?? []).some((o) => o.id === x.id)),
  ];
  const other = rows.find((r) => r.id === merge.pick) ?? null;
  // From a stand-in's page, the person who answered is the one kept: their name is the one typed.
  const keepsOther = !!other && p.standIn && combineIds.has(other.id);
  const keptName = keepsOther && other ? other.name : p.name;
  // Two records of one name are told apart by what else the row says (a number, an address).
  const said = (r: MergeOption) => [r.phone, r.email].filter(Boolean).join(" · ");
  const nameOf = (r: MergeOption) =>
    rows.some((o) => o.id !== r.id && o.name === r.name) && said(r) ? `${r.name} (${said(r)})` : r.name;
  const typedMatches =
    merge.typed.trim() === keptName ||
    (!keepsOther && !!p.phone && digitsOf(merge.typed).length >= 7 && digitsOf(merge.typed) === digitsOf(p.phone));
  const groups: PickerGroup<string>[] = [
    {
      options: rows.map((r) => ({ value: r.id, label: r.name, sub: said(r) || undefined })),
    },
  ];
  const confirmMerge = async () => {
    if (!other || !typedMatches || merge.busy) return;
    setMerge((m) => ({ ...m, busy: true, error: null }));
    const r = await mergePerson(p.id, other.id);
    if (!r.ok) {
      setMerge((m) => ({ ...m, busy: false, error: r.message || "Could not merge these records." }));
      return;
    }
    const kept = keptOf(r.data, p.id);
    flash({ msg: kept === p.id ? MERGE_WORDS.done(p.name, nameOf(other)) : MERGE_WORDS.done(keptName, p.name) });
    setMerge({ open: false, pick: null, typed: "", busy: false, error: null });
    // Combined into the person who answered: this record is gone, and their page is the one to be on.
    if (kept !== p.id) navigate(`clients/${kept}`);
    else load();
  };
  const name = other ? (keepsOther ? p.name : nameOf(other)) : "the other record";
  return (
    <div className="cl-prof-danger" data-testid="merge">
      <div>
        {MERGE_WORDS.pick}{" "}
        <Picker
          label={MERGE_WORDS.pick}
          value={merge.pick}
          onValueChange={(v) => setMerge((m) => ({ ...m, pick: v, error: null }))}
          groups={groups}
          placeholder={MERGE_WORDS.pickNone}
          chevron={<Icon name="chevron-down" size={11} />}
          search={{
            glass: <Icon name="search" size={12} />,
            placeholder: MERGE_WORDS.pickPlaceholder,
            empty: MERGE_WORDS.pickEmpty,
            match: (o, q) => `${o.label} ${o.sub ?? ""}`.toLowerCase().includes(q.toLowerCase()),
          }}
          note={others === null ? MERGE_WORDS.pickReading : undefined}
          readOnly={merge.busy}
          data-testid="merge-pick"
        />
      </div>
      <Confirm
        block
        danger
        typed={keptName}
        value={merge.typed}
        onType={(v) => setMerge((m) => ({ ...m, typed: v }))}
        ready={!!other && typedMatches}
        question={MERGE_WORDS.question(keptName, name)}
        detail={
          <>
            {MERGE_WORDS.detail(keptName, name)} {MERGE_WORDS.typed(keptName)}
          </>
        }
        yes={MERGE_WORDS.yes}
        busyLabel={MERGE_WORDS.busy}
        busy={merge.busy}
        error={merge.error}
        onYes={() => void confirmMerge()}
        onNo={() => setMerge({ open: false, pick: null, typed: "", busy: false, error: null })}
        testid="merge"
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
      {p.head.face.kind === "tile" ? (
        <BusinessTile face={p.head.face} size="xl" />
      ) : (
        <Face person={{ name: p.name, initials: p.initials }} size="xl" />
      )}
      <div className="cl-prof-titles">
        {/* The name, and beside it where they stand: a dot and the standing's word, its sentence on hover. The sentence is
            said under the line only when it asks for something: "New messages are answered automatically" under every
            answered person said nothing. */}
        <div className="cl-prof-name-line">
          <PersonName p={p} canEdit={canRecord} flash={flash} onPutBack={() => void putNameBack(c)} />
          <span className="cl-prof-now" data-tone={tone} data-testid="person-now" title={p.rightNow.detail}>
            <StatePill kind="standing" value={tone} testid="person-standing" />
          </span>
        </div>
        {/* A sign-off waiting, or a record to combine with, takes the line under the name; else the business (a door
            to its sheet), a stand-in's story, or that the business was removed (0052). */}
        {p.notices.some((n) => n.home === "name") ? <NameNotices c={c} /> : <HeadLine c={c} />}
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

/** Note: Overview's composer, brought into view and focused (canvas A, the head's acts). */
function toTheNote(c: PageCtx) {
  c.goTab("overview");
  requestAnimationFrame(() => {
    const box = document.querySelector<HTMLElement>('[data-testid="person-notes-input"]');
    if (!box) return;
    box.scrollIntoView({ block: "center" });
    box.focus();
  });
}

/** Their number to ring from the member's own phone, or, for someone at a business with none of their own, the listing's. */
function telOf(c: PageCtx): string | null {
  const own = String(c.p.phone || "").replace(/[^d+]/g, "");
  if (own) return `tel:${own}`;
  return c.p.business?.phone?.tel ?? null;
}

/**
 * The page's one primary: their thread in every state that has one (Right now's act where it says one), except a person who
 * opted out, whose header's Open thread was their only way in.
 */
function threadCtaOf(c: PageCtx): { label: string; to: string } | null {
  const { p } = c;
  return p.rightNow.cta || (p.openThread ? { label: "Open the thread", to: p.openThread } : null);
}

/** The page's acts: its one primary, their thread; then Call, Note and the More menu. */
function heroActs(c: PageCtx, more: MenuGroup[]): ReactNode {
  const { p, who } = c;
  const tel = telOf(c);
  // The action lives in Right now, beside what needs doing. Its own button is the thread in every state that has one,
  // except a person who opted out: the header's Open thread was their only way in, so it falls back to it.
  const threadCta = threadCtaOf(c);
  return (
    <div className="cl-prof-queue-actions" data-testid="person-acts">
      {threadCta && (
        <Button size="lg" variant="primary" onClick={() => navigate(threadCta.to)} data-testid="person-open-thread">
          {threadCta.label}
        </Button>
      )}
      {/* Someone with no thread had no way to be written to from here: the door to begin one (the Inbox's New
          conversation, opened on them where they stand), which says what can go to them and why not. */}
      {!threadCta && (
        <Button
          size="lg"
          variant="primary"
          onClick={() => openNewConversation(p.id)}
          data-testid="person-start-conversation"
          {...gate("approve", NEW_CONVERSATION_WORDS.gate)}
        >
          {NEW_CONVERSATION_WORDS.personDoor}
        </Button>
      )}
      <div className="cl-prof-acts-row">
        {/* The member's own phone rings them, as a lead is called; never the receptionist. */}
        {tel ? (
          <Button size="sm" href={tel} data-testid="person-call">
            <Icon name="phone" size={12} /> Call
          </Button>
        ) : null}
        {c.canRecord ? (
          <Button size="sm" onClick={() => toTheNote(c)} data-testid="person-note-act">
            <Icon name="edit" size={12} /> Note
          </Button>
        ) : null}
        {/* Words, not three dots: a ⋯ was too quiet to be found, and it held one thing. */}
        {more.length > 0 && (
          <Menu
            label={`More for ${who}`}
            groups={more}
            trigger={
              <Button size="sm" title={`More for ${who}`} data-testid="person-more">
                More <Icon name="chevron-down" size={10} />
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}

/**
 * The head, at the top of the identity rail (canvas A): Back, who they are, the acts, the doubts the door raised on them,
 * and the delete or merge question while it is asked.
 */
export function hero(c: PageCtx, phoneOnly: boolean) {
  const more = moreGroups(c, c.compose);
  return (
    <div className="cl-prof-hero cl-prof-head">
      {/* On a phone the word goes and the arrow takes a thumb's width: the top bar says People over it. */}
      <Button variant="quiet" size="sm" className="cl-prof-back" onClick={c.onBack} aria-label="Back to People">
        <Icon name="chevron" size={11} style={{ transform: "rotate(180deg)" }} />
        <span className="cl-prof-back-word">People</span>
      </Button>
      {heroId(c, phoneOnly)}
      {heroActs(c, more)}
      {doubtRows(c)}
      {c.del.open && deleteBox(c)}
      {c.merge.open && mergeBox(c)}
    </div>
  );
}

/**
 * The phone's foot dock (canvas A): once the head's acts have scrolled away, the same acts at the foot, one 52px capsule of
 * the control layer's glass (the kit's docked capsule): the thread, then Call, Note and More as circles. Gone again as
 * the head's acts come back on screen; never on a desk, where the rail keeps them in view. Drawn on the body: the page's
 * scroller is a container (`.cl-profile`), which a fixed bar inside it would be placed in, at the foot of its content.
 */
export function PhoneDock({ c }: { c: PageCtx }) {
  const [away, setAway] = useState(false);
  useEffect(() => {
    if (!c.phone || typeof IntersectionObserver === "undefined") return undefined;
    const acts = document.querySelector('[data-testid="person-acts"]');
    if (!acts) return undefined;
    const watch = new IntersectionObserver(([seen]) => setAway(!!seen && !seen.isIntersecting));
    watch.observe(acts);
    return () => watch.disconnect();
  }, [c.phone]);
  if (!c.phone || !away) return null;
  const cta = threadCtaOf(c);
  const tel = telOf(c);
  const more = moreGroups(c, c.compose);
  return createPortal(
    <div
      className="cl-prof-dock capsule"
      data-dock
      role="toolbar"
      aria-label={`Acts for ${c.who}`}
      data-testid="person-dock"
    >
      {cta ? (
        <Button variant="primary" className="cl-prof-dock-lead" onClick={() => navigate(cta.to)}>
          {cta.label}
        </Button>
      ) : (
        <Button
          variant="primary"
          className="cl-prof-dock-lead"
          onClick={() => openNewConversation(c.p.id)}
          {...gate("approve", NEW_CONVERSATION_WORDS.gate)}
        >
          {NEW_CONVERSATION_WORDS.personDoor}
        </Button>
      )}
      {tel ? (
        <Button iconOnly aria-label="Call" href={tel}>
          <Icon name="phone" size={15} />
        </Button>
      ) : null}
      {c.canRecord ? (
        <Button iconOnly aria-label="Note" onClick={() => toTheNote(c)}>
          <Icon name="edit" size={15} />
        </Button>
      ) : null}
      {more.length > 0 ? (
        <Menu
          label={`More for ${c.who}`}
          groups={more}
          trigger={
            <Button iconOnly aria-label={`More for ${c.who}`}>
              <Icon name="more" size={15} />
            </Button>
          }
        />
      ) : null}
    </div>,
    document.body,
  );
}
