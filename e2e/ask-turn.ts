import { expect, type Page, type Route } from "@playwright/test";

/**
 * A turn of Ask answered in the page, so a spec can draw every state of an answer with no model behind it: the question
 * goes nowhere and spends nothing (e2e/session.ts refuses the doors that would), and every other write is held here too,
 * so a card pressed changes nothing in the workspace. The page, the bridge and the reads are real.
 *
 * The three cards are campaigns as `playbook-card.ts` makes them: the same sheet, with what holds them apart, the rows
 * that are aside, and a line each.
 */

/** What holds all three: WhatsApp's review, on every campaign whose message has a WhatsApp version not yet on file. */
export const WHATSAPP_REVIEW =
  "WhatsApp waits: its WhatsApp version goes to WhatsApp for review when you approve, and that cannot be taken back. Its runs hold those people until WhatsApp approves it.";

const campaign = (n: number, title: string, line: string, moment: string, runs: string, reaches: string) => ({
  id: `e2e-card-${n}`,
  kind: "playbook",
  needs: "operator",
  title: `Campaign: ${title}`,
  summary: `${moment} · ${runs} · ${reaches} · each run waits for you on Today.`,
  line,
  payload: { trigger: "quiet_30", name: title, channels: ["whatsapp"] },
  undo: "Pause it",
  made_at: new Date().toISOString(),
  sheet: {
    holds: [WHATSAPP_REVIEW],
    rows: [
      { label: "Moment", value: moment },
      { label: "Runs", value: runs },
      { label: "Reaches", value: reaches },
      { label: "Goes by", value: "On WhatsApp" },
      { label: "Sends", value: "Each run waits for you on Today", aside: true },
    ],
  },
});

/** The first card's facts: what goes out, when, to whom and by what channel, each to be seen before its Approve. */
export const FIRST_CARD_SAYS = ["The day before an appointment", "Daily, 10:00 AM", "6 people tomorrow", "On WhatsApp"];
const NEXT = ["Change the reminder's hour?", "Why the reminder first?"];

/** The turn: the answer says the warning again, as a model may, and offers two next questions. */
function threeCards() {
  const headline = "Nobody hears from you around an appointment yet, so three campaigns would cover the gaps.";
  const detail = [
    "The day before: a reminder, which cuts no-shows the most",
    "The day after: a thank-you with your review link",
    "After 30 quiet days: a win-back with your booking link",
    WHATSAPP_REVIEW,
    "Approve the reminder first: it is the one that pays back fastest.",
  ].join("\n");
  const at = Date.now();
  return {
    headline,
    detail,
    message: {
      id: `e2e-m${at}`,
      role: "assistant",
      text: `${headline}\n${detail}`,
      at: new Date(at).toISOString(),
      atMs: at,
      citations: [],
      followups: NEXT,
      navigate: null,
      proposals: [
        campaign(
          1,
          "Reminder",
          "Reminds tomorrow's 6 appointments, 10:00 AM, by WhatsApp",
          FIRST_CARD_SAYS[0],
          FIRST_CARD_SAYS[1],
          FIRST_CARD_SAYS[2],
        ),
        campaign(
          2,
          "Thank-you",
          "Follows up with everyone the day after their appointment, 11:00 AM, by WhatsApp",
          "The day after an appointment",
          "Daily, 11:00 AM",
          "Nobody today",
        ),
        campaign(
          3,
          "Win-back",
          "Invites back 14 people quiet for 30 days, 10:00 AM, by WhatsApp",
          "Nothing heard in 30 days",
          "Daily, 10:00 AM, up to 25",
          "14 people today",
        ),
      ],
      language: "en",
      ungrounded: false,
      tools: [],
      latencyMs: 1,
      rounds: 1,
      failed: false,
      answer: {
        v: 2,
        form: "structured",
        say: { headline, detail },
        show: { figures: [], items: [], breakdown: null },
        do: { open: null, next: NEXT },
        language: "en",
      },
    },
  };
}

/** Every write the page tries answered here with an empty ok: a card's press, its outcome, a warm, a morning, and the boot's invitations, which it reads as nobody seated. */
export async function holdWrites(page: Page): Promise<void> {
  await page.route(/\/api\/v1\//, (route: Route) => {
    if (route.request().method() === "GET") return route.fallback();
    const data = route.request().url().includes("/me/invitations/accept") ? { joined: [] } : {};
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data }) });
  });
}

/** The next question answered with the three cards, as the turn's stream sends one. */
export async function answerWithThreeCards(page: Page): Promise<void> {
  await page.route(/\/api\/v1\/ask(\?|$)/, async (route: Route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const turn = threeCards();
    const lines = [
      { t: "thread", id: "e2e-thread", title: "set up a campaign" },
      { t: "say", headline: turn.headline, detail: turn.detail },
      { t: "final", message: turn.message },
    ];
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
    });
  });
}

/** The next question dropped on its way, as a lost connection drops it: a failed turn. */
export async function dropTheTurn(page: Page): Promise<void> {
  await page.route(/\/api\/v1\/ask(\?|$)/, (route: Route) =>
    route.request().method() === "POST" ? route.abort() : route.fallback(),
  );
}

/** Asks the Line, typed, once its field is there. */
export async function askLine(page: Page, question: string): Promise<void> {
  const field = page.getByTestId("ask-input");
  await expect(field).toBeVisible();
  await field.fill(question);
  await field.press("Enter");
}
