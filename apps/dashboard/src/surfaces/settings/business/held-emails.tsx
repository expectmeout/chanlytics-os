/**
 * The booking emails held for a person (docs/plans/2026-10-07-bookings-arrive-by-email.md, refinement C): each with its
 * subject, its tool and when it came, why it was held, and its two presses. One list, from the Calendar's read, drawn by
 * the Calendar's card ("Look at them" opens it in the kit's sheet) and by Settings' Booking tool fold, whatever that fold
 * says the business books with (Ruben, 20 Oct 2026: the card's door opened the picker, and the picker drew no email
 * until a tool was picked in it).
 */
import { useState } from "react";
import { bookingEmailsHeldWords, type CalendarVM } from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Sheet } from "../../kit/sheet/sheet";

type Notices = CalendarVM["feed"]["notices"];

/**
 * The held ones, each with why and its two presses; the route's refusal, if any, under the list. `head` says the count
 * over them, where nothing else does (the sheet's title says it there).
 */
export function HeldBookingEmails({ notices, head = true }: { notices: Notices; head?: boolean }) {
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
      {head ? (
        <p className="bt-fold-note">
          <b>{bookingEmailsHeldWords(notices.held)}</b>
        </p>
      ) : null}
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
              <Button size="sm" variant="quiet" disabled={busy === h.id} onClick={() => act(h.id, "read-again")}>
                Read again
              </Button>
              <Button size="sm" variant="quiet" disabled={busy === h.id} onClick={() => act(h.id, "dismiss")}>
                Dismiss
              </Button>
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
}

/**
 * The card's "Look at them", over the board: the held emails themselves in the kit's sheet, named by their count. It
 * closes by itself once the last of them is read again or dismissed, since there is nothing left in it to look at.
 */
export function heldEmailsSheet(p: { open: boolean; onClose: () => void; notices: Notices }) {
  return (
    <Sheet
      open={p.open && p.notices.heldList.length > 0}
      onClose={p.onClose}
      title={bookingEmailsHeldWords(p.notices.held)}
      close={{ label: "Close", glyph: <Icon name="x" size={13} /> }}
      testid="cal-held-emails"
    >
      <HeldBookingEmails notices={p.notices} head={false} />
    </Sheet>
  );
}
