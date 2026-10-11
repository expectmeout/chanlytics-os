/**
 * A running campaign's sentence, in its drawer (Ruben, 11 Oct 2026, "Option B": a running campaign changes in place):
 * "Every day at [10:00 AM], a [WhatsApp] to [everyone with an appointment tomorrow], [without asking you]." Each word that
 * can change is pressed and chosen there, and the change is saved at once, alone (the route takes one field of a playbook
 * and answers what it held), with Undo in the toast that says it; the moment and the message are Edit's. The people are
 * the word that opens them in People; the rule opens Autonomy. A role that may not change it reads the same sentence.
 * It stood as five lines of a word and a fact each (Next run, Who, When, Goes by, Rules). Apart from card-detail.tsx, which
 * draws the rest of the drawer and holds its verbs.
 */
import { LIFECYCLE_WORDS, PLAYBOOK_CAP_CHOICES, appointmentWords, triggerOf } from "@chanlytics/contracts";
import type { AppointmentWord, ConsentChannel, LifecycleSentence } from "@chanlytics/contracts";
import { navigate } from "../../legacy-verbs";
import { Picker, Token } from "../../kit/picker/picker";
import { cmTick } from "../parts/channels";
import { cmChevron, cmNumbers } from "../parts/picks";
import { CmRuleWord, cmRuleOf } from "../parts/rule";
import { CmViaWord } from "../parts/send-by";
import type { cardViaOf } from "./card-channels";
import type { PlaybookCardVM } from "./surface";
import { PB_CADENCES, PB_GAPS, pbHour, pbHours, pbWith } from "./words";

/** One field of a playbook changed in place: what the route is sent, what it held before, and what the toast says. */
export interface CardChange {
  body: { run_hour?: number; cap_per_run?: number; gap_days?: number; cadence_days?: number };
  was: { run_hour?: number; cap_per_run?: number; gap_days?: number; cadence_days?: number };
  said: LifecycleSentence;
}

interface CardSentenceProps {
  p: PlaybookCardVM;
  word: AppointmentWord;
  /** Whether the role may change it: a viewer reads the words, and none of them opens. */
  canAct: boolean;
  busy: boolean;
  via: ReturnType<typeof cardViaOf>;
  /** Where its people are, in People or the Pipeline. */
  listRoute: string;
  onChange: (c: CardChange) => void;
  onChannels: (next: readonly ConsentChannel[]) => void;
}

/** The hour it runs at, chosen in place. */
function hourWord({ p, canAct, busy, onChange }: CardSentenceProps) {
  const S = LIFECYCLE_WORDS.compose.sentence.saved;
  return (
    <Picker
      label="The hour it runs at"
      value={String(p.run_hour)}
      onValueChange={(h) =>
        Number(h) === p.run_hour
          ? undefined
          : onChange({
              body: { run_hour: Number(h) },
              was: { run_hour: p.run_hour },
              said: S.hour(p.name, pbHour(Number(h))),
            })
      }
      groups={cmNumbers(pbHours().map((h) => ({ v: h, t: pbHour(h) })))}
      chevron={cmChevron()}
      inline
      readOnly={!canAct || busy}
      data-testid="pb-hour"
    />
  );
}

/** The most one run sends, chosen in place. */
function capWord({ p, canAct, busy, onChange }: CardSentenceProps) {
  const S = LIFECYCLE_WORDS.compose.sentence.saved;
  return (
    <Picker
      label="The most one run sends"
      value={String(p.cap_per_run)}
      onValueChange={(n) =>
        Number(n) === p.cap_per_run
          ? undefined
          : onChange({
              body: { cap_per_run: Number(n) },
              was: { cap_per_run: p.cap_per_run },
              said: S.cap(p.name, Number(n)),
            })
      }
      groups={cmNumbers(pbWith(PLAYBOOK_CAP_CHOICES, p.cap_per_run).map((n) => ({ v: n, t: String(n) })))}
      chevron={cmChevron()}
      inline
      readOnly={!canAct || busy}
      data-testid="pb-cap"
    />
  );
}

/** The days before the same person hears it again (a month's offer: how often they hear it), chosen in place. */
function gapWord({ p, canAct, busy, onChange }: CardSentenceProps) {
  const S = LIFECYCLE_WORDS.compose.sentence.saved;
  const monthly = p.trigger === "everyone_monthly";
  const days = monthly ? p.cadence_days : p.gap_days;
  return (
    <Picker
      label={monthly ? "How often the same person hears it" : "The days before the same person hears it again"}
      value={String(days)}
      onValueChange={(n) =>
        Number(n) === days
          ? undefined
          : onChange(
              monthly
                ? {
                    body: { cadence_days: Number(n) },
                    was: { cadence_days: p.cadence_days },
                    said: S.gap(p.name, Number(n)),
                  }
                : { body: { gap_days: Number(n) }, was: { gap_days: p.gap_days }, said: S.gap(p.name, Number(n)) },
            )
      }
      groups={cmNumbers(pbWith(monthly ? PB_CADENCES : PB_GAPS, days).map((n) => ({ v: n, t: `${n} days` })))}
      chevron={cmChevron()}
      inline
      readOnly={!canAct || busy}
      data-testid="pb-gap"
    />
  );
}

/** What the people's word says of them on a hover: who they are counted from, and where a press opens them. */
function whoTip(kind: string | undefined, word: AppointmentWord): string {
  if (kind === "visit")
    return `Everyone with a recorded yes — the day's ${appointmentWords(word).many} are picked from them · click to open them in People`;
  if (kind === "deal")
    return "The proposals waiting with nothing back — before their links, their follow-ups and the week's breath · click to open them in the Pipeline";
  return "The list this campaign watches — before the gap and the week's breath · click to open it in People";
}

/** Who it goes to, the word that opens them: a moment's people, a list by its name. */
function whoWord({ p, word, listRoute }: CardSentenceProps) {
  const S = LIFECYCLE_WORDS.compose.sentence;
  const who = p.trigger === "saved_list" ? `everyone on ${p.triggerLabel}` : S.who(p.trigger, word);
  return (
    <Token
      onClick={() => navigate(listRoute)}
      data-tip={whoTip(triggerOf(p.trigger)?.kind, word)}
      data-testid="pb-audience"
    >
      {who}
    </Token>
  );
}

export function CardSentence(props: CardSentenceProps) {
  const { p, canAct, busy, via, onChannels } = props;
  const kind = triggerOf(p.trigger)?.kind;
  const visits = kind === "visit";
  const deal = kind === "deal";
  const S = LIFECYCLE_WORDS.compose.sentence;
  // A reach-out's step goes by email alone, and one that runs nothing here has no channels to switch (card-channels.tsx).
  const channels = !(p.off || kind === "reach_out");
  return (
    <p className="cm-recipe" data-testid="pb-recipe">
      {S.everyDay} {hourWord(props)}, a{" "}
      {channels ? (
        <CmViaWord
          ticks={canAct && !busy ? via.ticks : via.ticks.map((t) => ({ ...t, fixed: true }))}
          label={LIFECYCLE_WORDS.channels.goesBy}
          busy={busy}
          onTick={(channel, on) => onChannels(cmTick(via.kept, channel, on))}
          testid="pb-via"
        />
      ) : (
        "message"
      )}{" "}
      to {whoWord(props)}
      {visits ? null : <>, up to {capWord(props)} a run</>}
      {cmRuleOf(p.policy_class) ? (
        <>
          , <CmRuleWord cls={p.policy_class} testid="pb-rules-line" />
        </>
      ) : null}
      .{visits ? null : deal ? " One message per proposal." : <> Never twice in {gapWord(props)}.</>}
    </p>
  );
}
