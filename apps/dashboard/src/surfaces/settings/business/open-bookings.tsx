// Chanlytics — Settings › Business: Booking tool.
//
// One row and one fold for what a business books with (7 Oct 2026). It was two rows, "Calendar it reads" and "Where
// your bookings come from", each sending the owner to the other, beside a booking link a third row held and a "Paste
// the address" press on three other pages. The fold asks one question first, what do you book with, and then draws
// only what that answer has: its calendar link (open-calendar.tsx BtoFeedBox), where the tool gives one or writes
// into the owner's own calendar; its booking emails, where it is a tool of the list (the workspace's address with
// Copy, made here in one press where there is none; the tool's steps; Gmail's confirmation of a forward; the emails
// held for a look, each with Read again and Dismiss). A tool known to give no calendar says so in a sentence and keeps
// the box behind one press; "I book by hand" draws neither part.
//
// The row states what the owner books with (BtoBooksWith) and, under it, a quiet signal each for the link's last read
// (BtoFeedRead) and the emails (BtoBookingsRead: a dot and a phrase). Every sentence is contracts' (calendar-source.ts
// BOOKING_TOOL_WORDS and calendarLinkNote, toCalendarVM's feed.notices, BOOKING_TOOL_STEPS); what is drawn of the
// emails is the Calendar page's own read (calendarNow): no second read, and the board's card says the same.
import { useEffect, useState } from "react";
import type { ComponentProps } from "react";
import {
  BOOKING_TOOL_STEPS,
  BOOKING_TOOL_WORDS,
  BOOKING_TRY_NOTE,
  BOOKS_WITH_CALENDAR,
  GMAIL_FORWARD_NOTE,
  bookingToolName,
  bookingToolOfLink,
  booksWithName,
  booksWithOptions,
  calendarLinkNote,
  calendarLinkShown,
  isBookingTool,
} from "@chanlytics/contracts";
import type { CalendarVM } from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import { RecordCombobox } from "../../kit/record/combobox";
import { gate, navigate } from "../../legacy-verbs";
import type { BtFold } from "./gestures/fold";
import type { CalendarDraft } from "./fold-shapes";
import { BtoFeedBox, btoFeedHost } from "./open-calendar";
import { calendarNow } from "./shell";

/** What BtFold hands its body. */
type FoldFields<D> = Parameters<ComponentProps<typeof BtFold<D>>["body"]>[0];
type Notices = CalendarVM["feed"]["notices"];

/** The calendar's read as it stands, drawn again whenever the Calendar surface lands. */
const useNotices = (): Notices | null => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener("surface:calendar", bump);
    return () => window.removeEventListener("surface:calendar", bump);
  }, []);
  const C = calendarNow() || null;
  return C && C.vm && C.vm.feed ? C.vm.feed.notices : null;
};

/**
 * The row's value: what the owner books with, as the product says it, and beside a tool the place its calendar link is
 * read from. A calendar with no tool behind it is named by that place alone. Only the host of a link is ever stated:
 * the rest of a private address is a secret (open-calendar.tsx btoFeedHost).
 */
export const BtoBooksWith = ({ withWhat, feed }: { withWhat: string; feed: string }) => {
  const name = booksWithName(withWhat);
  const host = feed ? btoFeedHost(feed) : "";
  const words =
    withWhat === BOOKS_WITH_CALENDAR
      ? host || name
      : [name, isBookingTool(withWhat) && host ? host : ""].filter(Boolean).join(" · ");
  return (
    <span className="bt-feed-where" data-testid="bt-bookings-tool">
      {words}
    </span>
  );
};

/**
 * Under the row: one mark and the next thing to do about the tool's emails, in contracts' words (an address to make,
 * a forward to confirm, emails to look at, the last email's age, or waiting for the first). The mark carries its own
 * word (Working, Needs you, Waiting) in its accessible name and under a pointer, as the calendar link's mark does;
 * the colour rides with that word, never alone. Nothing before a tool is named or an email arrived.
 */
export const BtoBookingsRead = () => {
  const n = useNotices();
  if (!n || !n.row) return null;
  return (
    <span className="bt-feed" data-testid="bt-bookings-read" data-tone={n.row.tone}>
      <span
        className="bt-feed-dot"
        role="img"
        aria-label={n.row.label}
        data-tip={n.row.label}
        data-tone={n.row.tone}
        data-testid="bt-bookings-state"
      />
      <span className="bt-feed-when">{n.row.words}</span>
    </span>
  );
};

/** How long the Copy press says "Copied" before it offers again. */
const BTO_COPIED_MS = 1500;

/**
 * A quiet press of this fold's, in the tab's own markup, as its other folds write a button (open.tsx's "Add a closed
 * day"): the classes the kit's Button gives a small quiet one. The kit's Button is not taken here until Settings moves
 * to the kit whole (eslint.config.mjs lists the folder as pending): this tab loads with the shell, and the shell's
 * first import of that module made the bundler split a chunk four pages share with it, so Broadcasts, Campaigns,
 * People and Templates each fetched a second copy of it, 12,758 bytes gzipped (against main's own build, 7 Oct 2026).
 */
const BTO_QUIET = "btn btn-sm btn-ghost";

/**
 * A workspace with no address yet: the one its name gives, made in one press (the route Connections' own form calls,
 * with the business's name beside it), and the door to Connections for an owner who wants another. It said "Make one
 * under Connections" and nothing else, which sent the owner to another page in the middle of this one. An address is
 * chosen once, so the press says what it is for besides, and that it stays.
 */
const BtoBookingsNoAddress = ({ suggested, name }: { suggested: string | null; name: string }) => {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const make = async () => {
    if (!suggested) return;
    setBusy(true);
    setProblem(null);
    try {
      const r = await api()("POST mailboxes", {
        body: { local_part: suggested.slice(0, suggested.indexOf("@")), from_name: name },
      });
      // Made: the Calendar is read again (refresh-map.ts), and the address stands here with its Copy.
      if (!r.ok) setProblem(r.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bt-bookings-held" data-testid="bto-bookings-address">
      <p className="bt-fold-note">
        Your workspace has no email address yet, and booking emails need one to arrive at.
        {suggested ? " Customers can write to it too, and it cannot be changed later." : ""}
      </p>
      <span className="bt-bookings-acts">
        {suggested ? (
          <button
            type="button"
            className="btn btn-sm"
            onClick={make}
            disabled={busy}
            data-testid="bto-bookings-make"
            {...gate("team", "set up email")}
          >
            {busy ? "Making it…" : `Use ${suggested}`}
          </button>
        ) : null}
        <button
          type="button"
          className={BTO_QUIET}
          onClick={() => navigate("admin/integrations")}
          data-testid="bto-bookings-choose"
        >
          {suggested ? "Choose another" : "Make one under Connections"}
        </button>
      </span>
      {problem ? (
        <p className="bt-fold-note bt-fold-refused" role="alert" data-testid="bto-bookings-make-refused">
          {problem}
        </p>
      ) : null}
    </div>
  );
};

/** The workspace's address, with Copy; or, for a workspace without one, the press that makes it. */
const BtoBookingsAddress = ({ notices, name }: { notices: Notices | null; name: string }) => {
  const address = notices?.address ?? null;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), BTO_COPIED_MS);
    } catch {
      // The address is on screen to copy by hand.
    }
  };
  if (!address) return <BtoBookingsNoAddress suggested={notices?.suggested ?? null} name={name} />;
  return (
    <div className="bt-bookings-held" data-testid="bto-bookings-address">
      <p className="bt-fold-note">Send your booking emails to this address.</p>
      <span className="bt-fold-line">
        <b className="bt-bookings-address">{address}</b>
        <button
          type="button"
          className={BTO_QUIET}
          onClick={copy}
          aria-label="Copy the address"
          data-testid="bto-bookings-copy"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </span>
    </div>
  );
};

/**
 * The steps for the tool named, and the way to see it work at once. Open while they are still to do; folded behind
 * their title once an email has become an appointment, when they are a thing to look up and no longer a thing to read.
 */
const BtoBookingsSteps = ({ tool, working }: { tool: string; working: boolean }) => {
  if (!isBookingTool(tool)) return null;
  const guide = BOOKING_TOOL_STEPS[tool];
  const steps = (
    <ol>
      {guide.steps.map((s) => (
        <li key={s}>{s}</li>
      ))}
      {guide.way === "forward" && <li>{GMAIL_FORWARD_NOTE}</li>}
    </ol>
  );
  if (working)
    return (
      <details className="bt-feed-guides" data-testid="bto-bookings-steps">
        <summary className="bt-link">How to send them here</summary>
        <div className="bt-feed-guide">{steps}</div>
      </details>
    );
  return (
    <div className="bt-fold-note bt-feed-guide" data-testid="bto-bookings-steps">
      <b>How to send them here</b>
      {steps}
      <span>{BOOKING_TRY_NOTE}</span>
    </div>
  );
};

/** Gmail's confirmation of a forward here, waiting on the owner: the code, and one press. */
const BtoBookingsForwarding = ({ forwarding }: { forwarding: NonNullable<Notices["forwarding"]> }) => (
  <p className="bt-fold-note" role="status" data-testid="bto-bookings-forwarding">
    <b>Gmail asks you to confirm the forward</b> from {forwarding.account}: code <b>{forwarding.code}</b>.{" "}
    {forwarding.link ? (
      <a className="btn btn-sm btn-primary" href={forwarding.link} target="_blank" rel="noopener">
        Confirm in Gmail
      </a>
    ) : (
      "Enter it under Gmail › Settings › Forwarding."
    )}
  </p>
);

/** The notices held for a person, each with why and its two presses; the route's refusal, if any, under the list. */
const BtoBookingsHeld = ({ notices }: { notices: Notices }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  if (notices.heldList.length === 0) return null;
  // Read again, or dismiss: the route answers, and the write re-reads the Calendar by the refresh map (refresh-map.ts,
  // AFTER), as every write does, so the list says what is left when the press comes back.
  const act = async (id: string, verb: "read-again" | "dismiss") => {
    setBusy(id);
    setProblem(null);
    try {
      const r =
        verb === "read-again"
          ? await api()("POST calendar/notices/[id]/read-again", { params: { id }, body: {} })
          : await api()("POST calendar/notices/[id]/dismiss", { params: { id }, body: {} });
      if (!r.ok) setProblem(r.message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="bt-bookings-held" data-testid="bto-bookings-held">
      <p className="bt-fold-note">
        <b>{notices.held === 1 ? "One booking email needs a look." : `${notices.held} booking emails need a look.`}</b>
      </p>
      {notices.heldList.map((h) => {
        const meta = [h.tool, h.receivedAgo].filter(Boolean).join(" · ");
        return (
          <div key={h.id} className="bt-bookings-notice" data-testid="bto-bookings-held-row">
            {/* The sender waits under a pointer: who it came from matters only when the subject is not enough. */}
            <span className="bt-fold-note" title={h.from ?? undefined}>
              <b>{h.subject ?? "(no subject)"}</b>
              {meta ? ` · ${meta}` : ""}
            </span>
            <span className="bt-fold-note">{h.reason}</span>
            <span className="bt-bookings-acts">
              <button
                type="button"
                className={BTO_QUIET}
                disabled={busy === h.id}
                onClick={() => act(h.id, "read-again")}
              >
                Read again
              </button>
              <button type="button" className={BTO_QUIET} disabled={busy === h.id} onClick={() => act(h.id, "dismiss")}>
                Dismiss
              </button>
            </span>
          </div>
        );
      })}
      {problem ? (
        <p className="bt-fold-note bt-fold-refused" role="alert" data-testid="bto-bookings-refused">
          {problem}
        </p>
      ) : null}
    </div>
  );
};

/** A part of the fold: what it is, and in a few words what it is for. */
const BtoPartHead = ({ title, why }: { title: string; why: string }) => (
  <p className="bt-fold-head">
    <b>{title}</b> <span>{why}</span>
  </p>
);

/** What the fold's parts are drawn from: the fold's own fields, and what the card knows beside them. */
interface PartProps {
  f: FoldFields<CalendarDraft>;
  /** The link's address as stored (masked for anyone but an owner), "" for none. */
  stored: string;
  /** Whether the receptionist has a booking link to send (contracts offersBookingLink). */
  offers: boolean;
}

/**
 * The calendar link, for what the owner books with: its box where that answer has a link to give; a sentence, and the
 * box behind one press, where the tool is known to give none; a sentence alone where there is nothing to read
 * (contracts calendarLinkShown and calendarLinkNote). A link typed or stored is always drawn.
 */
const BtoLinkPart = ({ f, stored, offers }: PartProps) => {
  const [asked, setAsked] = useState(false);
  const d = f.draft;
  const held = !!String(d.ical_url || "").trim() || !!stored;
  const shown = asked ? "shown" : calendarLinkShown(d.with, held);
  const note = calendarLinkNote(d.with, offers);
  if (shown !== "shown")
    return (
      <p className="bt-fold-note" data-testid="bto-link-note">
        {note}
        {shown === "offered" && !f.readOnly ? (
          <>
            {" "}
            <button type="button" className="bt-link" onClick={() => setAsked(true)} data-testid="bto-link-anyway">
              {BOOKING_TOOL_WORDS.link.anyway}
            </button>
          </>
        ) : null}
      </p>
    );
  return (
    <div className="bt-fold-part" data-testid="bto-link">
      <BtoPartHead title={BOOKING_TOOL_WORDS.link.title} why={BOOKING_TOOL_WORDS.link.why} />
      <BtoFeedBox
        url={d.ical_url}
        onUrl={(v) => f.update((x) => ({ ...x, ical_url: v }), ["ical_url"])}
        problem={f.problems.ical_url || null}
        readOnly={!!f.readOnly}
        stored={stored}
        offers={offers}
        note={note}
      />
    </div>
  );
};

/** The tool's booking emails: where to send them, how, and what waits on the owner. */
const BtoEmailsPart = ({ tool, name }: { tool: string; name: string }) => {
  const n = useNotices();
  return (
    <div className="bt-fold-part" data-testid="bto-emails">
      <BtoPartHead title={BOOKING_TOOL_WORDS.emails.title} why={BOOKING_TOOL_WORDS.emails.why} />
      <BtoBookingsAddress notices={n} name={name} />
      {/* The steps name "the address above": drawn once there is one. */}
      {n?.address ? <BtoBookingsSteps tool={tool} working={n.state === "working"} /> : null}
      {n?.forwarding ? <BtoBookingsForwarding forwarding={n.forwarding} /> : null}
      {n ? <BtoBookingsHeld notices={n} /> : null}
    </div>
  );
};

/**
 * The fold: what the owner books with, then only what that answer has. With nothing said yet and a booking link on a
 * platform the product knows, the tool is offered by name (contracts bookingToolOfLink): the owner said where
 * customers book, and is not asked which tool that is.
 */
export const BtoSourceBody = ({
  f,
  stored,
  offers,
  bookingLink,
  name,
}: PartProps & { bookingLink: string; name: string }) => {
  const d = f.draft;
  const guess = d.with ? null : bookingToolOfLink(bookingLink);
  const pick = (v: string) => f.update((x) => ({ ...x, with: v }), ["with"]);
  return (
    <>
      <RecordCombobox
        id="bt-bookings-tool"
        label={BOOKING_TOOL_WORDS.label}
        value={d.with || null}
        options={booksWithOptions()}
        onChange={pick}
        placeholder={BOOKING_TOOL_WORDS.placeholder}
        readOnly={f.readOnly || undefined}
        testid="bto-bookings-tool"
      />
      {guess && !f.readOnly ? (
        <p className="bt-fold-note" data-testid="bto-bookings-guess">
          Your booking link is on {bookingToolName(guess)}.{" "}
          <button type="button" className={BTO_QUIET} onClick={() => pick(guess)}>
            Use {bookingToolName(guess)}
          </button>
        </p>
      ) : null}
      {d.with ? <BtoLinkPart f={f} stored={stored} offers={offers} /> : null}
      {isBookingTool(d.with) ? <BtoEmailsPart tool={d.with} name={name} /> : null}
    </>
  );
};
