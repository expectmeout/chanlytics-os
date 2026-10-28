/**
 * The person page's hero (moved from legacy/pages/client-profile.jsx, decision 0015, step 5): who they are and where they
 * stand, said once (the name, the line under it, the standing's word with the sentence of what happens next), and the page's
 * acts beside them: the thread, its one primary, and a More menu whose items, words, groups and roles are contracts'
 * `personActs`. What an act does is its hover, never a sentence beside the label, which wrapped and ran past the menu's edge.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode, RefObject } from "react";
import {
  DOUBT_WORDS,
  PERSON_ABOUT_WORDS,
  PERSON_DELETE_WORDS,
  MAILBOX_SENDERS_WORDS,
  MERGE_WORDS,
  NEW_CONVERSATION_WORDS,
  PERSON_CALL_WORDS,
  PERSON_WALK_WORDS,
  PERSON_WASH_WORDS,
  appointmentWords,
  personHeadStateOf,
  proposalMessage,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Face } from "../../kit/face/face";
import { Menu } from "../../kit/menu/menu";
import { Notice } from "../../kit/notice/notice";
import type { MenuGroup, MenuItem } from "../../kit";
import { Confirm } from "../../kit/confirm/confirm";
import { FailedRead } from "../../kit/empty/empty";
import { FieldError } from "../../kit/field-error/field-error";
import { StatePill } from "../../kit/pill/state-pill";
import { Icon } from "../../kit/icon/icon";
import { Wash } from "../../kit/motion/wash";
import { Picker } from "../../kit/picker/picker";
import { RecordDisclosure } from "../../kit/record/disclosure";
import { leaveSheet } from "../../kit/sheet/back";
import { Sheet } from "../../kit/sheet/sheet";
import type { PickerGroup } from "../../kit/picker/picker";
import { gate, navigate, openDealSheet } from "../../legacy-verbs";
import { carryReply } from "../../inbox/carried-reply";
import { openNewConversation } from "../../inbox/new-conversation/store";
import { visitWordHere } from "../../workspace-word";
import { deletePerson, keptOf, mergePerson, notAPerson, settleDoubt } from "../people-detail";
import { NotAPersonSwitches } from "../../settings/connections/left-senders";
import { personExportLink } from "../shell-verbs";
import { BusinessTile, HeadLine, leaveBusiness } from "./business";
import { CallAct } from "./call";
import { PersonName } from "./name";
import { askNoteFocus } from "./notes";
import { NameNotices, putNameBack } from "./signer";
import { MERGE_CLOSED, digitsOf } from "./ctx";
import { combineAsk } from "./sheets/combine";
import type { PageCtx } from "./ctx";
import type { PersonActVM, PersonDoubtVM, PersonRowVM } from "@chanlytics/contracts";
import type { PersonWalk } from "../walk";

/** Each of More's acts by its glyph: one for every act contracts names, so a new act cannot arrive without one. */
const ACT_ICON: Record<PersonActVM["id"], string> = {
  call: "phone",
  text: "chat",
  email: "mail",
  booking: "calendar",
  proposal: "send",
  "start-proposal": "deal",
  "add-to-list": "list",
  "copy-phone": "copy",
  "copy-email": "copy",
  "leave-business": "x",
  download: "download",
  merge: "users",
  "not-a-person": "ban",
  delete: "x",
};

/**
 * A send opens their thread with the words ready; nothing is sent from here. A send with no words (the deal card's, where
 * only an approved message can go) opens the thread and leaves its box alone: the thread offers those.
 */
export function openWith(c: Pick<PageCtx, "p">): (text?: string | null) => void {
  const { p } = c;
  return (text) => {
    const thread = p.openThread;
    if (thread === null) return;
    if (text) carryReply(thread, text);
    navigate(thread);
  };
}

/**
 * Whether the head (and the dock) carry Call: a thread to call about, and someone who has not asked to stop (canvas A, P3
 * and D5). Otherwise Call is More's first row.
 */
function callInHead(c: PageCtx): boolean {
  return !!threadCtaOf(c) && !c.p.stopped;
}

/**
 * Text them and Email them (canvas A): their thread where its reply goes on that wire, else a new conversation with them
 * on it, whose sheet says why where it cannot go. A thread on WhatsApp is not where a text goes.
 */
export function writeOn(p: Pick<PageCtx["p"], "id" | "openThread" | "replyVia">, wire: "sms" | "email") {
  if (p.openThread !== null && p.replyVia === (wire === "sms" ? "Text" : "Email")) navigate(p.openThread);
  else openNewConversation(p.id, wire);
}

/**
 * The acts the page keeps for its reader's role, as the kit Menu's groups (canvas A, 3422-3434): reach them, record,
 * and the ends, a few words each and a line between the groups. A send that cannot go is drawn and disabled, its reason
 * on hover and said once under its group.
 */
function moreGroups(c: PageCtx, compose: (text?: string | null) => void): MenuGroup[] {
  const { p, canRecord, isOwner, setDel, setMerge } = c;
  const doAct: Record<string, () => void> = {
    // The member's own phone rings them, as a lead is called; never the receptionist.
    call: () => {
      window.location.href = `tel:${String(p.phone || "").replace(/[^\d+]/g, "")}`;
    },
    text: () => writeOn(p, "sms"),
    email: () => writeOn(p, "email"),
    booking: () => {
      if (p.bookingLinkAction.ready && p.bookingLink)
        compose(appointmentWords(visitWordHere()).bookingLink(p.bookingLink));
      else if (p.openThread !== null) navigate(p.openThread);
    },
    proposal: () => {
      if (p.proposal) compose(proposalMessage(p.proposal.url));
    },
    "start-proposal": () => openDealSheet({ personId: p.id, mode: "propose" }),
    "add-to-list": () => c.setListsOpen(true),
    "leave-business": () => void leaveBusiness(c),
    // The file the route writes, saved where it is opened, as People's export is (page/file-acts.tsx).
    download: () => {
      window.open(personExportLink(p.id), "_self");
    },
    // One question at a time: opening either box closes the other.
    delete: () => {
      setMerge(MERGE_CLOSED);
      setDel({ open: true, typed: "", busy: false, error: null });
    },
    // The same question, the switch already on: their mail stays in the mailbox, then they are deleted.
    "not-a-person": () => {
      setMerge(MERGE_CLOSED);
      setDel({ open: true, typed: "", busy: false, error: null, bot: true });
    },
    merge: () => {
      setDel({ open: false, typed: "", busy: false, error: null });
      setMerge({ ...MERGE_CLOSED, open: true, pick: null });
    },
  };
  // Call is the head's own act (canvas A: Call · Note · More), so the menu does not say it again; where the head has no
  // Call (no thread yet, or they asked to stop), the menu keeps it, first (canvas A, P3).
  const headCalls = callInHead(c);
  const acts = (p.acts || []).filter(
    (a) => (a.id !== "call" || !headCalls) && (a.needs === "any" || (a.needs === "record" ? canRecord : isOwner)),
  );
  const groups: { key: string; items: MenuItem[]; offs: string[] }[] = [];
  for (const a of acts) {
    const words = {
      label: a.label,
      title: a.off || a.hint || undefined,
      glyph: <Icon name={ACT_ICON[a.id]} size={15} />,
    };
    // A copy says so in place and the menu stays open to say it (the kit's copy), never a toast.
    const copied = a.id === "copy-phone" ? p.phone : a.id === "copy-email" ? p.email : null;
    const item: MenuItem =
      copied !== null
        ? { ...words, copy: { text: copied, said: PERSON_ABOUT_WORDS.copied } }
        : {
            ...words,
            tone: a.danger ? "danger" : undefined,
            disabled: !!a.off,
            onSelect: doAct[a.id] ?? (() => {}),
          };
    const last = groups[groups.length - 1];
    if (last && last.key === a.group) last.items.push(item);
    else groups.push({ key: a.group, items: [item], offs: [] });
    if (a.off) groups[groups.length - 1]?.offs.push(a.off);
  }
  // On a phone the ways to reach them are tiles on one line (the kit Menu's `tiles`, the fitted sheets, 14 Oct 2026): the
  // four rows that opened the menu, now one line in the thumb's first reach.
  const tiled = (g: (typeof groups)[number]) => c.phone && g.key === "reach" && g.items.length >= 2;
  // Why the sends cannot go, seen on a touch too: one reason for them all is said once, under its group (they asked to
  // stop); reasons of their own (no yes by text, an address that stopped) are each said on its row, as a second line,
  // or, under tiles, which carry no second line, one after another under the line.
  for (const g of groups) {
    if (new Set(g.offs).size <= 1) continue;
    if (tiled(g)) {
      g.offs = [[...new Set(g.offs)].join(" ")];
      continue;
    }
    g.items = g.items.map((i) => (i.disabled && typeof i.title === "string" ? { ...i, hint: i.title } : i));
    g.offs = [];
  }
  // A call already made, logged without a dial (canvas A, Your call A3): after the copies, or a group of its own.
  if (canRecord && c.call.vm) {
    const past: MenuItem = {
      label: PERSON_CALL_WORDS.logPast,
      glyph: <Icon name="clock" size={15} />,
      onSelect: c.call.logPast,
    };
    const home = groups.find((g) => g.key === "record");
    if (home) home.items.push(past);
    else groups.push({ key: "call", items: [past], offs: [] });
  }
  // Stepping to the person before or after is the top bar's, at every width (PersonWalkNav): More holds what is done to
  // this person alone.
  return groups.map((g) => ({
    items: g.items,
    ...(tiled(g) ? { tiles: true } : {}),
    ...(g.offs[0] ? { caption: g.offs[0] } : {}),
  }));
}

/** A typed-name question in a sheet: what it does in the sheet's body, and the question with its answers in its foot. */
interface SheetAsk {
  body: ReactNode;
  foot: ReactNode;
}

/**
 * The typed-name confirmation to delete a person: it erases messages, media and recordings and cannot be undone. What
 * it does is the sheet's body; the question, the typed name and the two answers are its foot (the kit's Confirm, as a
 * sheet's foot draws it), so the sheet is one pane with one Cancel. Not a person rides it (left-senders.tsx, 00483).
 */
function deleteAsk(c: PageCtx): SheetAsk {
  const { p, del, setDel, flash, onBack } = c;
  const W = PERSON_DELETE_WORDS;
  const typedMatches =
    del.typed.trim() === p.name ||
    (!!p.phone && digitsOf(del.typed).length >= 7 && digitsOf(del.typed) === digitsOf(p.phone));
  const confirmDelete = async () => {
    if (!typedMatches || del.busy) return;
    setDel((d) => ({ ...d, busy: true, error: null }));
    const bot = !!p.email && !!del.bot;
    const r = bot ? await notAPerson(p.id, del.domain ? "domain" : "address") : await deletePerson(p.id);
    if (!r.ok) {
      setDel((d) => ({ ...d, busy: false, error: r.message || W.failed }));
      return;
    }
    flash({ msg: bot ? MAILBOX_SENDERS_WORDS.done(p.name) : W.done(p.name) });
    // The question's sheet stands an entry in the tab's history (Back closes it): taken back first, so the person's
    // Back lands on the list they came from rather than on their page under the sheet.
    await leaveSheet();
    onBack();
  };
  return {
    body: (
      <>
        <p className="cl-prof-ask-detail" data-testid="delete">
          {W.detail}
        </p>
        <NotAPersonSwitches email={p.email} del={del} setDel={setDel} />
      </>
    ),
    foot: (
      <Confirm
        danger
        typed={p.name}
        value={del.typed}
        onType={(v) => setDel((d) => ({ ...d, typed: v }))}
        ready={typedMatches}
        question={W.typed(p.name)}
        yes={W.yes}
        no={W.cancel}
        busyLabel={W.busy}
        busy={del.busy}
        error={del.error}
        onYes={() => void confirmDelete()}
        onNo={() => setDel({ open: false, typed: "", busy: false, error: null })}
        testid="delete"
      />
    ),
  };
}

/** A record the merge box offers: a People row, or the other record of a doubt. */
type MergeOption = Pick<PersonRowVM, "id" | "name" | "phone" | "email">;

/**
 * Same person? (decision 0034, step 4): each open doubt the door raised on them, as a sentence naming the other record,
 * with its two settlements. Merge opens 0028's box with the other record chosen already (the owner's act); Not the
 * same settles the pair through its own door, as any acting member, and the page is read again with the row gone. Drawn
 * in Reach them, at the number or address it is about (canvas A: a notice lives where its field is).
 */
export function doubtRows(c: PageCtx) {
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
    setMerge({ ...MERGE_CLOSED, open: true, pick: d.otherId });
  };
  return (
    <div className="cl-prof-doubts" role="group" aria-label={DOUBT_WORDS.heading} data-testid="doubts">
      {p.doubts.map((d) => (
        <Notice
          key={d.id}
          label={d.sentence}
          fact={d.sentence}
          act={
            isOwner ? (
              <Button size="sm" title={DOUBT_WORDS.mergeHint} onClick={() => mergeWith(d)} data-testid="doubt-merge">
                {DOUBT_WORDS.merge}
              </Button>
            ) : null
          }
          dismiss={
            canRecord
              ? {
                  label: DOUBT_WORDS.apart,
                  onDismiss: () => void apart(d),
                  busy: doubt.busy === d.id,
                  testid: "doubt-apart",
                }
              : null
          }
          testid="doubt"
        />
      ))}
      {doubt.error && <FieldError message={doubt.error} testid="doubt-error" />}
    </div>
  );
}

/**
 * Two records of one person become one (0028): the other record chosen from People, then the kept person's name typed,
 * as Delete asks. The door is the database's and cannot be undone; what it answers is said as a toast, and the page is
 * read again, whole, with what moved. The pick and what it does are the sheet's body, the question its foot.
 */
function mergeAsk(c: PageCtx): SheetAsk {
  const { p, merge, setMerge, others, flash, load } = c;
  // People's other rows, and the other record of each doubt (0034 step 4) People has not read or does not list. Two
  // records of one human at a business, offered by their notice, are asked as Combine's question (sheets/combine.tsx).
  const rows: MergeOption[] = [
    ...(others ?? []),
    ...p.doubts
      .filter((d) => !(others ?? []).some((o) => o.id === d.otherId))
      .map((d) => ({ id: d.otherId, name: d.other, phone: d.phone, email: d.email })),
  ];
  const other = rows.find((r) => r.id === merge.pick) ?? null;
  const keptName = p.name;
  // Two records of one name are told apart by what else the row says (a number, an address).
  const said = (r: MergeOption) => [r.phone, r.email].filter(Boolean).join(" · ");
  const nameOf = (r: MergeOption) =>
    rows.some((o) => o.id !== r.id && o.name === r.name) && said(r) ? `${r.name} (${said(r)})` : r.name;
  const typedMatches =
    merge.typed.trim() === keptName ||
    (!!p.phone && digitsOf(merge.typed).length >= 7 && digitsOf(merge.typed) === digitsOf(p.phone));
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
    flash({ msg: kept === p.id ? MERGE_WORDS.done(p.name, nameOf(other)) : MERGE_WORDS.done(nameOf(other), p.name) });
    setMerge(MERGE_CLOSED);
    // The door kept the other record (a pair it takes as one human, 0052): this record is gone, and theirs is the page.
    if (kept !== p.id) navigate(`clients/${kept}`);
    else load();
  };
  const name = other ? nameOf(other) : "the other record";
  return {
    body: (
      <div className="cl-prof-merge" data-testid="merge">
        <span className="cl-prof-merge-pick">
          {MERGE_WORDS.pick}
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
        </span>
        <p className="cl-prof-ask-detail">
          {MERGE_WORDS.lead(keptName, name)} {MERGE_WORDS.typed(keptName)}
        </p>
        <RecordDisclosure id="merge-more" label={MERGE_WORDS.more} testid="merge-more">
          <p className="cl-prof-ask-detail">{MERGE_WORDS.rest(name)}</p>
        </RecordDisclosure>
      </div>
    ),
    foot: (
      <Confirm
        danger
        typed={keptName}
        value={merge.typed}
        onType={(v) => setMerge((m) => ({ ...m, typed: v }))}
        ready={!!other && typedMatches}
        question={MERGE_WORDS.question(keptName, name)}
        yes={MERGE_WORDS.yes}
        no={PERSON_DELETE_WORDS.cancel}
        busyLabel={MERGE_WORDS.busy}
        busy={merge.busy}
        error={merge.error}
        onYes={() => void confirmMerge()}
        onNo={() => setMerge(MERGE_CLOSED)}
        testid="merge"
      />
    ),
  };
}

/**
 * What stands under the name, by its row (canvas A): the business's line (or, on a phone, that it was removed: a desk's
 * rail says that beside the head), and the notices under it, or a stand-in's story where no notice waits.
 */
function headLineOf(c: PageCtx, row: "line" | "notice"): ReactNode {
  const line = c.p.head.line;
  const notices = c.p.notices.some((n) => n.home === "name");
  if (row === "notice") return notices ? <NameNotices c={c} /> : line?.kind === "origin" ? <HeadLine c={c} /> : null;
  if (!line || line.kind === "origin" || (line.kind === "gone" && !c.phone)) return null;
  return <HeadLine c={c} />;
}

/**
 * Who they are (canvas A's head): the face and the name with its pencil, the business's line under the name, the one
 * state, and its sentence, said once. Where each stands is the stylesheet's: on a desk the state and its sentence under
 * the face and the name; on a phone the state under the name, beside the face, and the sentence across the head. How
 * to reach them and since when are the rail's (About on a phone), never a line under the name again.
 */
function heroId(c: PageCtx) {
  const { p, flash, canRecord, load, error } = c;
  const head = personHeadStateOf(p);
  return (
    <div className="cl-prof-id">
      {p.head.face.kind === "tile" ? (
        <BusinessTile face={p.head.face} size="xl" />
      ) : (
        <Face person={{ name: p.name, initials: p.initials }} size="xl" />
      )}
      <div className="cl-prof-name-line">
        <PersonName p={p} canEdit={canRecord} flash={flash} onPutBack={() => void putNameBack(c)} />
      </div>
      {/* The business (a door to its sheet) under the name, or that it was removed, which a desk's rail says instead
          (0052). A sign-off waiting, or a record to combine with, is a notice of its own row; a stand-in's story stands
          there when none is waiting. */}
      <div className="cl-prof-headline">{headLineOf(c, "line")}</div>
      <div className="cl-prof-notices">{headLineOf(c, "notice")}</div>
      {/* The one state (canvas A): theirs as People's row says it, a dot and its word, amber only for what needs
          someone; the receptionist's standing is Messages and receptionist's. */}
      <span className="cl-prof-now" data-state={head.state} data-testid="person-now">
        <Wash scope={p.id} value={head.state} said={PERSON_WASH_WORDS.state(head.word)}>
          <StatePill kind="person" value={head.state} label={head.word} testid="person-standing" />
        </Wash>
      </span>
      {/* Its sentence, said once, always. */}
      {head.sentence ? (
        <div className="cl-prof-now-why" data-testid="person-now-why">
          {head.sentence}
        </div>
      ) : null}
      {/* The page is the copy this tab kept and reading it again failed: said, quietly, where it is read, so a copy from
          before a reload is never taken for now. */}
      {error && (
        <div className="cl-prof-stale">
          <FailedRead
            kind="line"
            what="the latest for them"
            why={error}
            body="What is here is from earlier."
            onRetry={load}
            testid="person-stale"
          />
        </div>
      )}
    </div>
  );
}

/**
 * Note: the Notes pane's composer, its pane drawn where they have no note yet (canvas A), brought into view and focused
 * as soon as it is on the page (notes.tsx askNoteFocus).
 */
function toTheNote(c: PageCtx) {
  c.setComposing(true);
  c.goTab("overview");
  askNoteFocus();
}

/**
 * The page's one primary: their thread in every state that has one (Right now's act where it says one), except a person who
 * opted out, whose header's Open thread was their only way in.
 */
export function threadCtaOf(c: Pick<PageCtx, "p">): { label: string; to: string } | null {
  const { p } = c;
  return p.rightNow.cta || (p.openThread ? { label: "Open the thread", to: p.openThread } : null);
}

/** The page's acts: its one primary, their thread; then Call, Note and the More menu. */
function heroActs(c: PageCtx, more: MenuGroup[]): ReactNode {
  const { p, who } = c;
  // The action lives in Right now, beside what needs doing. Its own button is the thread in every state that has one,
  // except a person who opted out: the header's Open thread was their only way in, so it falls back to it.
  const threadCta = threadCtaOf(c);
  return (
    <div className="cl-prof-queue-actions" data-testid="person-acts">
      {threadCta && (
        <Button
          size={c.phone ? "touch" : "lg"}
          variant="primary"
          onClick={() => navigate(threadCta.to)}
          data-testid="person-open-thread"
        >
          {threadCta.label}
        </Button>
      )}
      {/* Someone with no thread had no way to be written to from here: the door to begin one (the Inbox's New
          conversation, opened on them where they stand), which says what can go to them and why not. */}
      {!threadCta && (
        <Button
          size={c.phone ? "touch" : "lg"}
          variant="primary"
          onClick={() => openNewConversation(p.id)}
          data-testid="person-start-conversation"
          {...gate("approve", NEW_CONVERSATION_WORDS.gate)}
        >
          {NEW_CONVERSATION_WORDS.personDoor}
        </Button>
      )}
      {/* The member's own phone rings them, as a lead is called; never the receptionist. Then: how did it go? On a desk
          Call, Note and More are words on a line under the thread; on a phone three 44px circles beside it (canvas A). */}
      <div className="cl-prof-acts-row">
        {callInHead(c) ? <CallAct c={c} /> : null}
        {c.canRecord ? noteAct(c) : null}
        {more.length > 0 && (
          <Menu
            label={`More for ${who}`}
            groups={more}
            trigger={
              c.phone ? (
                <Button
                  iconOnly
                  size="touch"
                  variant="glass"
                  aria-label={`More for ${who}`}
                  title="More"
                  data-testid="person-more"
                >
                  <Icon name="more" size={18} />
                </Button>
              ) : (
                <Button size="sm" title={`More for ${who}`} data-testid="person-more">
                  More <Icon name="chevron-down" size={10} />
                </Button>
              )
            }
          />
        )}
      </div>
    </div>
  );
}

/** Note: the word on a desk, the note's circle on a phone; either brings Overview's composer into view. */
function noteAct(c: PageCtx) {
  return c.phone ? (
    <Button
      iconOnly
      size="touch"
      variant="glass"
      aria-label="Note"
      title="Note"
      onClick={() => toTheNote(c)}
      data-testid="person-note-act"
    >
      <Icon name="note" size={16} />
    </Button>
  ) : (
    <Button size="sm" onClick={() => toTheNote(c)} data-testid="person-note-act">
      Note
    </Button>
  );
}

/**
 * Stepping to the person before or after them in the People view they were opened from (0052, canvas A): "‹ 4 of 24 ›" in
 * the top bar's row, beside the frame's ‹ People on a desk and a capsule of the control layer's glass in the bell's place
 * on a phone (the page's standing, person-real.tsx; components.css). J and K step too, on a desk. The page turns toward
 * the side it steps (walk.ts noteStep).
 */
export function PersonWalkNav({
  walk: w,
  step,
  words = PERSON_WALK_WORDS,
}: {
  walk: PersonWalk;
  step: (to: string) => void;
  /** What it walks, where it is not people: the Pipeline's deal sheet walks deals. */
  words?: { label: string; at: (at: number, of: number) => string; next: string; previous: string };
}) {
  const W = words;
  const go = (to: string | null) => () => {
    if (to) step(to);
  };
  return (
    <nav className="cl-prof-walk" aria-label={W.label} data-testid="person-walk">
      <Button
        variant="quiet"
        size="sm"
        iconOnly
        aria-label={W.previous}
        title={W.previous}
        disabled={!w.prev}
        onClick={go(w.prev)}
        data-testid="person-walk-prev"
      >
        <Icon name="chevron" size={12} className="icon-turned" />
      </Button>
      <span className="cl-prof-walk-at tabular">{W.at(w.at, w.of)}</span>
      <Button
        variant="quiet"
        size="sm"
        iconOnly
        aria-label={W.next}
        title={W.next}
        disabled={!w.next}
        onClick={go(w.next)}
        data-testid="person-walk-next"
      >
        <Icon name="chevron" size={12} />
      </Button>
    </nav>
  );
}

/**
 * The head, at the top of the identity rail (canvas A): Back, where they stand in the list they were opened from, who they
 * are, the acts, the doubts the door raised on them, and the delete or merge question while it is asked.
 */
export function hero(c: PageCtx) {
  const more = moreGroups(c, c.compose);
  // Delete and Merge ask in the kit's sheet (canvas A): a side pane on a desk, from the foot on a phone, what each does in
  // its body and its typed question in its foot; drawn while open, so the head keeps its height under them.
  const del = c.del.open ? deleteAsk(c) : null;
  // Given the pair a Combine notice offered, the sheet asks Combine's question (sheets/combine.tsx); otherwise Merge's.
  const combine = c.merge.open && c.merge.combine ? combineAsk(c) : null;
  const merge = combine ?? (c.merge.open ? mergeAsk(c) : null);
  return (
    <div className="cl-prof-hero cl-prof-head">
      {/* The way back is the top bar's, ‹ People, at every width (the page's standing, person-real.tsx). */}
      {heroId(c)}
      {heroActs(c, more)}
      <Sheet
        backCloses
        open={c.del.open}
        onClose={() => c.setDel({ open: false, typed: "", busy: false, error: null })}
        title={PERSON_DELETE_WORDS.title}
        close={{ label: "Close", glyph: <Icon name="x" size={13} /> }}
        foot={del?.foot}
        footCloses
        testid="person-delete-sheet"
      >
        {del?.body}
      </Sheet>
      <Sheet
        backCloses
        open={c.merge.open}
        onClose={() => {
          if (!c.merge.busy) c.setMerge(MERGE_CLOSED);
        }}
        title={combine ? combine.title : MERGE_WORDS.act.replace(/…$/, "")}
        sub={combine?.sub}
        close={{ label: "Close", glyph: <Icon name="x" size={13} /> }}
        foot={merge?.foot}
        footCloses
        testid="person-merge-sheet"
      >
        {merge?.body}
      </Sheet>
    </div>
  );
}

/** The phone's top bar's height (components.css, the phone's head): what the head scrolls under before it is away. */
const BAR_PX = 44;

/**
 * Whether what a watcher watches has gone up past the top of what shows (its root's, under the bar where a margin says so),
 * as the page's scroll takes it: not where it went out at a side. A thumb carrying the person's page back to People takes
 * the head off the screen across, and the dock came up as the page went, taking the tab bar and Ask's circle down under it
 * until People landed (Ruben, 20 Oct 2026: "on swipe back it flickers").
 */
const scrolledAway = (seen: IntersectionObserverEntry | undefined): boolean =>
  !!seen && !seen.isIntersecting && seen.boundingClientRect.bottom <= (seen.rootBounds?.top ?? 0) + 1;

/**
 * Whether the head's name has scrolled away under a phone's top bar (canvas A's hand-off: the bar then says it, the kit
 * head's `bar`). Watched once the head is drawn; never on a desk. The name is found inside the page's own element, never
 * the document: a step to the person before or after (‹ ›) mounts a new page while the one leaving is put back before it
 * as a still copy, every class kept (view-deck.ts adopt), and the copy's name was the one watched until the copy went,
 * so the bar never named the person stepped to (Ruben, 23 Oct 2026).
 */
export function useNameAway(phone: boolean, drawn: boolean, page: RefObject<HTMLElement | null>): boolean {
  const [away, setAway] = useState(false);
  useEffect(() => {
    setAway(false);
    if (!phone || !drawn || typeof IntersectionObserver === "undefined") return undefined;
    const name = page.current?.querySelector(".cl-prof-hero .cl-prof-name-line");
    if (!name) return undefined;
    // Away once it is under the bar, not only once it has left the screen.
    const watch = new IntersectionObserver(([seen]) => setAway(scrolledAway(seen)), {
      rootMargin: `-${BAR_PX}px 0px 0px 0px`,
    });
    watch.observe(name);
    return () => watch.disconnect();
  }, [phone, drawn, page]);
  return away;
}

/**
 * The phone's foot dock (canvas A): once the head's acts have scrolled away, the same acts at the foot, one 52px capsule of
 * the control layer's glass (the kit's docked capsule): the thread, then Call, Note and More as circles. Gone again as
 * the head's acts come back on screen; never on a desk, where the rail keeps them in view. Drawn on the body: the page's
 * scroller is a container (`.cl-profile`), which a fixed bar inside it would be placed in, at the foot of its content.
 * The acts are found inside the page's own element, as the name is (useNameAway).
 */
export function PhoneDock({ c }: { c: PageCtx }) {
  const [away, setAway] = useState(false);
  const page = c.page;
  useEffect(() => {
    if (!c.phone || typeof IntersectionObserver === "undefined") return undefined;
    const acts = page.current?.querySelector('[data-testid="person-acts"]');
    if (!acts) return undefined;
    const watch = new IntersectionObserver(([seen]) => setAway(scrolledAway(seen)));
    watch.observe(acts);
    return () => watch.disconnect();
  }, [c.phone, page]);
  if (!c.phone || !away) return null;
  const cta = threadCtaOf(c);
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
      {/* The circles are bare inside the dock's glass (canvas A, M2): no glass on glass. */}
      {callInHead(c) ? <CallAct c={c} dock /> : null}
      {c.canRecord ? (
        <Button iconOnly size="touch" variant="quiet" aria-label="Note" onClick={() => toTheNote(c)}>
          <Icon name="note" size={16} />
        </Button>
      ) : null}
      {more.length > 0 ? (
        <Menu
          label={`More for ${c.who}`}
          groups={more}
          trigger={
            <Button iconOnly size="touch" variant="quiet" aria-label={`More for ${c.who}`}>
              <Icon name="more" size={18} />
            </Button>
          }
        />
      ) : null}
    </div>,
    document.body,
  );
}
