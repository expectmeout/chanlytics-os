/**
 * Mark all kept, at To do's foot (the loose end of decision 0123): yesterday's visits nobody has marked, said kept with one
 * press where they all came. The thank-you the day after waits for that word, so a day the owner never marks one by one
 * thanks nobody; this is the one press for it. Asked first, in a question that says how many and what follows, since a
 * Kept cannot be taken back to unmarked (only changed to Missed, visit by visit). Each goes through the door a single Kept
 * goes through (POST calendar/visits/kept), so each keeps its rules and raises its own event, and the page's readers are
 * read again behind it (the refresh map's `visits`).
 */
import { useState } from "react";
import { NEED_YOU_WORDS as W, VISIT_ASK_WORDS, appointmentWords, type AppointmentWord } from "@chanlytics/contracts";
import { Button } from "../../kit";
import { Confirm } from "../../kit/confirm/confirm";
import { sayVisitsKept } from "../../visit-line";
import { gate } from "../shell";
import type { NeedYouRowsCtx } from "./people-rows";

/** What the press came to, in the toast's words: how many, the ones refused, and the thank-you that follows. */
function keptWords(said: Awaited<ReturnType<typeof sayVisitsKept>>): string {
  if (!said.ok) return said.message;
  const { marked, unchanged, refused, why, follows } = said.data;
  return [
    marked + unchanged ? W.visit.allKept.done(marked + unchanged) : "",
    refused ? W.visit.allKept.refused(refused, why ?? "") : "",
    follows ? W.visit.thanks(follows.name, follows.when, follows.asks) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The press and its question, where two or more of yesterday's visits wait to be marked and the member may say so; nothing
 * otherwise (one is its own row's Kept). `ids` are every one of them (contracts todayVisitsAsked `markIds`), the ones past
 * To do's three among them.
 */
export function KeptAll({
  ids,
  word,
  ctx,
}: {
  ids: readonly string[];
  word: AppointmentWord;
  ctx: Pick<NeedYouRowsCtx, "may" | "flash">;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!ctx.may || ids.length < 2) return null;
  const n = ids.length;
  const yes = async () => {
    setBusy(true);
    const said = await sayVisitsKept(ids);
    setBusy(false);
    setAsking(false);
    const wholly = said.ok && said.data.refused === 0;
    ctx.flash({ tone: wholly ? "ok" : said.ok && said.data.marked ? "warn" : "danger", msg: <>{keptWords(said)}</> });
  };
  return (
    <div className="ny-kept-all" data-testid="today-kept-all">
      {asking ? (
        <Confirm
          block
          question={W.visit.allKept.ask(n, appointmentWords(word).many)}
          detail={W.visit.allKept.detail}
          yes={W.visit.allKept.yes}
          no={W.visit.allKept.no}
          busy={busy}
          onYes={() => void yes()}
          onNo={() => setAsking(false)}
          testid="today-kept-all-ask"
        />
      ) : (
        <Button
          variant="quiet"
          size="sm"
          onClick={() => setAsking(true)}
          data-testid="today-kept-all-press"
          {...gate("approve", VISIT_ASK_WORDS.gate)}
        >
          {W.visit.allKept.act(n)}
        </Button>
      )}
    </div>
  );
}
