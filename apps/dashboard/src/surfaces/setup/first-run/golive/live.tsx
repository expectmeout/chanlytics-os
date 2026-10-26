/**
 * You're live (decision 0073, canvas 5C, 5C·a–5C·c): what answers now and since when, and Ask's first three moves, each
 * waiting for the owner's yes (the yes itself first: every message the business starts needs one), with what is still
 * connecting or left for later said once, and the press beside it: WhatsApp chosen and not connected, its steps in place
 * (going live never waits on it); WhatsApp left for later, back to Where it answers, where it is chosen. Below them, what
 * was set up (FrLive: the four lines with their Change, the greeting word for word, and what it will and won't do). The
 * step's onward is Open Today, which switches calls on (the page's Finish, with the "you're live" email).
 */
import type { ReactNode } from "react";
import {
  FIRST_RUN_HELPERS,
  firstRunStepRoute,
  type FirstRunGoLiveVM,
  type WhatsappChoice,
} from "@chanlytics/contracts";
import type { LegacyFlash } from "../../../legacy-verbs";
import { WhatsappSteps } from "./whatsapp";

const LW = FIRST_RUN_HELPERS.goLiveWords.live;

type LiveNote = NonNullable<FirstRunGoLiveVM["live"]>["notes"][number];

/** A note's press: Meta's steps in place, or the way back to Where it answers. */
function noteAct(o: {
  n: LiveNote;
  whatsapp: WhatsappChoice | null;
  waNumber: string | null;
  flash: (f: LegacyFlash) => void;
  go: (to: string) => void;
}): ReactNode {
  const { n } = o;
  if (!n.act) return null;
  if (n.act.kind === "connect") return <WhatsappSteps choice={o.whatsapp} number={o.waNumber} flash={o.flash} />;
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={() => o.go(firstRunStepRoute("channels"))}
      data-testid="fr-live-whatsapp-choose"
    >
      {n.act.label}
    </button>
  );
}

export function FrYoureLive({
  live,
  leave,
  go,
  whatsapp,
  waNumber,
  flash,
  summary,
}: {
  live: NonNullable<FirstRunGoLiveVM["live"]>;
  leave: (to: string) => void;
  go: (to: string) => void;
  /** Where it answers' WhatsApp choice, and the number it is kept on, for its steps. */
  whatsapp: WhatsappChoice | null;
  waNumber: string | null;
  flash: (f: LegacyFlash) => void;
  /** What was set up (FrLive), drawn under the moves. */
  summary: ReactNode;
}) {
  return (
    <div className="fr-golive fr-live" data-testid="fr-youre-live">
      <div className="panel fr-pane" data-testid="fr-live-now">
        {live.since ? <span className="fr-label">{live.since}</span> : null}
        <p className="fr-sentence" data-testid="fr-live-channels">
          {live.channels}
        </p>
      </div>
      {live.notes.map((n) => (
        <div key={n.key} className="panel fr-pane fr-note-pane" data-note={n.key} data-testid={`fr-live-${n.key}`}>
          <span className="fr-sentence">{n.title}</span>
          <span className="fr-detail">{n.says}</span>
          {noteAct({ n, whatsapp, waNumber, flash, go })}
        </div>
      ))}
      <section className="fr-moves" aria-labelledby="fr-moves-title" data-testid="fr-moves">
        <h2 className="fr-sub" id="fr-moves-title">
          {LW.movesTitle}
        </h2>
        <p className="fr-detail">{LW.movesLead}</p>
        <ul className="fr-move-list">
          {live.moves.map((m) => (
            <li key={m.key} className="panel fr-move" data-testid={`fr-move-${m.key}`}>
              <span className="fr-move-words">
                <b>{m.title}</b>
                <span className="fr-detail">{m.says}</span>
              </span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => leave(m.to)}
                data-testid={`fr-move-go-${m.key}`}
              >
                {m.act}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <div className="fr-links">
        <button type="button" className="link-btn" onClick={() => leave(LW.briefTo)} data-testid="fr-live-brief">
          {LW.brief}
        </button>
        <button type="button" className="link-btn" onClick={() => leave(LW.teamTo)} data-testid="fr-live-team">
          {LW.team}
        </button>
      </div>
      {summary}
    </div>
  );
}
