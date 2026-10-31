/**
 * Where Today stands, said to the frame's head in Glass (the plan's step 5.4, canvas E3): a greeting by the hour to the
 * member by their first name as the page's name, and under it where the day stands. The frame draws the head
 * (kit/head/frame-head.tsx) with the date and time; the page says the greeting and the sentence. The sentence is the view
 * model's own (`headline` with its `detail`, which Ask reads: "2 conversations need you. The oldest has been waiting
 * since 2:26 PM."); the greeting is the only sentence made in the dashboard (today/chrome.ts, where Today's address says it
 * from the frame's first draw, before the page is read, so the head never says "Today" first). It is said with the campaign runs waiting for your word
 * (contracts standingWithRuns), which the page holds and the badge counts: a calm day with a run waiting leads with it, and
 * never says "Nothing needs you" over it (the wiring's second audit, S7-1).
 */
import { standingWithRuns } from "@chanlytics/contracts";
import { useStanding } from "../../kit/head/standing";
import { needsYouOnToday, useNeedsYouParts } from "../../needs-you";
import { useSurface } from "../../use-surface";
import { LISTEN_SEAT, todayGreetingNow } from "../chrome";
import { useTodayOnPhone } from "../phone";
import { useBriefWords } from "./brief-pane";
import { TodayHeadFigures } from "./card";
import { listenButton, useSpeech } from "./listen";

/**
 * Where the day stands, as one sentence: the headline and its detail, each ending as a sentence does (the ladder's
 * singular headline, "One conversation needs you", has no full stop of its own, which contracts owns).
 */
export function todayStanding(standing: { headline: string; detail: string | null }): string {
  const headline = /[.!?]$/.test(standing.headline) ? standing.headline : `${standing.headline}.`;
  return [headline, standing.detail].filter(Boolean).join(" ");
}

/**
 * Today's standing, said to the frame's head as the page draws: the greeting, the same words its address said from the
 * first draw (today/chrome.ts), over the day's sentence, and on a desk the day's four figures at its right (the page heads
 * canvas, H1, 31 Oct 2026). A phone's head is the name alone (kit.css), so the sentence is a desk's; there what now stands
 * under the greeting in the page's own head (phone/head.tsx), and Listen is the page's act,
 * at the greeting's right: the seat the address held for it while Your brief's words are on their way, the button once they
 * are in, nothing where Ask cannot speak. Why a press could not speak is said under the page's head (listen.tsx).
 */
export function useTodayStanding(): void {
  const phone = useTodayOnPhone();
  const vm = useSurface("today");
  // Drawn again when a part of what waits moves (a run approved, a run made), not only when Today is read.
  const live = useNeedsYouParts();
  const words = useBriefWords();
  const line = words && words.sentences.length ? words.text : null;
  const speech = useSpeech(line);
  const standing = vm ? standingWithRuns(vm.standing, needsYouOnToday(vm, live).runs) : undefined;
  const listens = phone && speech.can;
  useStanding({
    stacked: true,
    title: todayGreetingNow(),
    sentence: standing ? todayStanding(standing) : undefined,
    // A desk's act is the day's four figures, at the greeting's right (card.tsx TodayHeadFigures).
    ...(!phone
      ? { act: <TodayHeadFigures /> }
      : listens && line
        ? { act: listenButton(speech, line, "phone") }
        : listens
          ? { seat: LISTEN_SEAT }
          : {}),
  });
}
