/**
 * Settings › Content's seven lines (the content loop PRD's 21.1; the approved boards, Settings 1-5): what posts are for, how
 * often, quiet days, languages, the look, offers, and "before anything posts". Each is a sentence with what is set in it;
 * a line the owner said in their own words shows their words. Nothing here is a row to pick from: CONTENT_GOALS is what
 * the database holds, and a line is changed by saying it again (AI reads it: the look too, since pass 4's brand kit), or,
 * for the offers and the rung, where they are kept. Pure, so the pane and AI say each line the same way.
 */
import type { ContentGoal } from "./sets";
import type { WeekPageDto } from "./week-page";
import type { cadenceOf } from "./week";
import { claimsStanding } from "./claims";

/** How a line is changed: its sentence said again, its offers one by one, or the page that keeps it. */
export type ContentLineEdit = "words" | "offers" | "page";

export interface ContentLineView {
  key: "goals" | "cadence" | "quiet_days" | "languages" | "look" | "offers" | "rung";
  label: string;
  words: string;
  edit: ContentLineEdit;
  /** Where a line changed on another page is changed: Autonomy for the rung. */
  to: string | null;
  /** The colours a line shows beside its words: the look's, as swatches; none for every other line. */
  colours?: string[];
}

/** A goal as a sentence says it. */
const GOAL_SAID: Record<ContentGoal, string> = {
  fill_slow_days: "fill the days that have room",
  introduce_service: "show what's new",
  repeat_visits: "bring back people who haven't been in a while",
  awareness: "be seen by people nearby",
  reviews: "earn reviews",
};

const DAY_NAMES: Record<string, string> = {
  sun: "Sundays",
  mon: "Mondays",
  tue: "Tuesdays",
  wed: "Wednesdays",
  thu: "Thursdays",
  fri: "Fridays",
  sat: "Saturdays",
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
  fr: "French",
  it: "Italian",
  de: "German",
};

/** "a, b and c". */
const listed = (parts: readonly string[]): string =>
  parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

const capital = (words: string): string => (words ? words[0]?.toUpperCase() + words.slice(1) : words);

/** "2 reels", "a post", none for 0. */
function countSaid(count: number, one: string, many: string): string | null {
  if (count <= 0) return null;
  return count === 1 ? `a ${one}` : `${count} ${many}`;
}

/** How often, said from the most of each kind a week: "Up to 2 reels and a post on Instagram, and a post on Google, each week." */
export function cadenceSaid(cadence: ReturnType<typeof cadenceOf>): string {
  const instagram = [
    countSaid(cadence.instagram.reel[1], "reel", "reels"),
    countSaid(cadence.instagram.picture[1], "post", "posts"),
    countSaid(cadence.instagram.story[1], "story", "stories"),
  ].filter((part): part is string => !!part);
  const google = countSaid(cadence.google.picture[1], "post", "posts");
  const places = [
    instagram.length ? `${listed(instagram)} on Instagram` : null,
    google ? `${google} on Google` : null,
  ].filter((part): part is string => !!part);
  if (places.length === 0) return "Nothing goes up on its own.";
  return `Up to ${places.join(", and ")}, each week. Fewer when the clips are thin.`;
}

/** Approve the week's rung as Settings › Content says it (00714): the Autonomy pane is where it is moved. */
const RUNG_SAID = {
  ask: "AI asks you first.",
  veto: "AI holds the week and puts it up at 8:00 AM unless you stop it.",
  auto: "AI approves the week as soon as it is ready.",
} as const;

/** The rung read as one of the three; any other (or none read) asks. */
const rungSaid = (rung: string | null | undefined): string =>
  rung === "veto" ? RUNG_SAID.veto : rung === "auto" ? RUNG_SAID.auto : RUNG_SAID.ask;

/** The lines, as set and as said. */
export function contentLinesOf(
  page: Pick<WeekPageDto, "goals" | "cadence" | "quiet_days" | "languages" | "claims" | "lines" | "look" | "rung">,
  today: string,
): ContentLineView[] {
  const own = page.lines;
  const goals = page.goals.map((g) => g.detail ?? GOAL_SAID[g.goal]);
  const offers = claimsStanding(
    page.claims.filter((c) => c.kind === "offer"),
    today,
  ).map((c) => `${c.text}${c.valid_until ? `, until ${c.valid_until}` : ", no end date"}.`);
  return [
    {
      key: "goals",
      label: "What posts are for",
      words:
        own.goals ??
        (goals.length ? `${capital(listed(goals))}.` : "Be seen by people nearby, and fill the days that have room."),
      edit: "words",
      to: null,
    },
    { key: "cadence", label: "How often", words: own.cadence ?? cadenceSaid(page.cadence), edit: "words", to: null },
    {
      key: "quiet_days",
      label: "Quiet days",
      words:
        own.quiet_days ??
        (page.quiet_days.length
          ? `Nothing posts on ${listed(page.quiet_days.map((d) => DAY_NAMES[d] ?? d))}.`
          : "Posts can go up any day."),
      edit: "words",
      to: null,
    },
    {
      key: "languages",
      label: "Languages",
      words:
        own.languages ??
        `Captions in ${listed((page.languages.length ? page.languages : ["en"]).map((l) => LANGUAGE_NAMES[l.slice(0, 2)] ?? l))}.`,
      edit: "words",
      to: null,
    },
    // Said in words since pass 4's brand kit: AI reads the sentence into the kit, and its colours show beside it. A page
    // from a server a deploy behind holds no look: the line then says where the colour and logo are set, as it did.
    page.look
      ? {
          key: "look",
          label: "The look",
          words: own.look ?? page.look.words,
          edit: "words",
          to: null,
          colours: page.look.colours,
        }
      : {
          key: "look",
          label: "The look",
          words: "Your colour and logo, as Details sets them.",
          edit: "page",
          to: "settings/workspace",
        },
    {
      key: "offers",
      label: "Offers",
      words: offers.length ? offers.join(" ") : "No offers. A post promises none.",
      edit: "offers",
      to: null,
    },
    { key: "rung", label: "Before anything posts", words: rungSaid(page.rung), edit: "page", to: "settings/autonomy" },
  ];
}
