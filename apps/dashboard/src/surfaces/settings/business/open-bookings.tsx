// Chanlytics — Settings › Business: Where your bookings come from.
//
// The fold beside "Calendar it reads" (docs/plans/2026-10-07-bookings-arrive-by-email.md, refinements A to C), in the
// order an owner sets it up: the tool that books them; the workspace's address its booking emails go to, with Copy (or
// the door to make one under Connections, where an address is chosen once); the steps for that tool, drawn as the
// calendar fold draws its guides, with the way to see it work at once; then what waits on the owner: Gmail's
// confirmation of a forward here, with one press, and the notices held for a person, each with Read again and Dismiss.
// The row states the tool (BtoBookingsTool) and, under it, one quiet signal with the next thing to do (BtoBookingsRead:
// a dot and a phrase, as the calendar row's). Every sentence is contracts' (toCalendarVM's feed.notices,
// BOOKING_TOOL_STEPS); what is drawn is the Calendar page's own read (calendarNow): no second read, and the board's
// card says the same.
import { useEffect, useState } from "react";
import type { ComponentProps } from "react";
import {
  BOOKING_TOOL_STEPS,
  BOOKING_TRY_NOTE,
  GMAIL_FORWARD_NOTE,
  bookingToolName,
  bookingToolOptions,
  isBookingTool,
} from "@chanlytics/contracts";
import type { CalendarVM } from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import { RecordCombobox } from "../../kit/record/combobox";
import { navigate } from "../../legacy-verbs";
import type { BtFold } from "./gestures/fold";
import type { BookingsDraft } from "./fold-shapes";
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

/** The row's value: the tool the owner named, as the product says it. */
export const BtoBookingsTool = ({ tool }: { tool: string }) => (
  <span className="bt-feed-where" data-testid="bt-bookings-tool">
    {bookingToolName(tool)}
  </span>
);

/**
 * Under the row: one mark and the next thing to do, in contracts' words (an address to make, a forward to confirm,
 * emails to look at, the last email's age, or waiting for the first). The mark carries its own word (Working, Needs
 * you, Waiting) in its accessible name and under a pointer, as the calendar row's mark does; the colour rides with
 * that word, never alone. Nothing before a tool is named or an email arrived.
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

/** The workspace's address, with Copy; or, for a workspace without one, the door to where one is chosen. */
const BtoBookingsAddress = ({ address }: { address: string | null }) => {
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
  if (!address)
    return (
      <p className="bt-fold-note" data-testid="bto-bookings-address">
        Your workspace has no email address yet.{" "}
        <button
          type="button"
          className={BTO_QUIET}
          onClick={() => navigate("admin/integrations")}
          data-testid="bto-bookings-make"
        >
          Make one under Connections
        </button>
      </p>
    );
  return (
    <p className="bt-fold-note" data-testid="bto-bookings-address">
      Send booking emails to <b className="bt-bookings-address">{address}</b>{" "}
      <button
        type="button"
        className={BTO_QUIET}
        onClick={copy}
        aria-label="Copy the address"
        data-testid="bto-bookings-copy"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </p>
  );
};

/** The steps for the tool named, once, and the way to see it work at once. */
const BtoBookingsSteps = ({ tool }: { tool: string }) => {
  if (!isBookingTool(tool)) return null;
  const guide = BOOKING_TOOL_STEPS[tool];
  return (
    <div className="bt-fold-note bt-feed-guide" data-testid="bto-bookings-steps">
      <b>How to send them here</b>
      <ol>
        {guide.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
        {guide.way === "forward" && <li>{GMAIL_FORWARD_NOTE}</li>}
      </ol>
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

/** The fold: the tool, the address, the steps, and what waits on the owner. Its parts are spaced as the fold spaces them. */
export const BtoBookingsBody = (f: FoldFields<BookingsDraft>) => {
  const n = useNotices();
  const tool = f.draft.tool;
  return (
    <>
      <RecordCombobox
        id="bt-bookings-tool"
        label="Booking tool"
        value={tool || null}
        options={bookingToolOptions()}
        onChange={(v) => f.update((d) => ({ ...d, tool: v }), ["tool"])}
        placeholder="Which tool books your appointments?"
        readOnly={f.readOnly || undefined}
        testid="bto-bookings-tool"
      />
      <BtoBookingsAddress address={n?.address ?? null} />
      {tool ? <BtoBookingsSteps tool={tool} /> : null}
      {n?.forwarding ? <BtoBookingsForwarding forwarding={n.forwarding} /> : null}
      {n ? <BtoBookingsHeld notices={n} /> : null}
    </>
  );
};
