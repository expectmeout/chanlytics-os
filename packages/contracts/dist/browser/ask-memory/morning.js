export const ASK_MORNING_CARDS_MAX = 3;
export const ASK_MORNING_QUESTION = "Good morning. Look at my day: what needs me now, what is due, what happened since yesterday, and what you remember about the business, and the lead finder's ideas if Leads has any. Then give me at most three things to do first, each as a card I can approve, and say in one short sentence why each comes first. If nothing needs me, say so in one sentence and make no card.";
export const ASK_MORNING_WORDS = {
  title: "Ask for you",
  sub: "What Ask would do first today",
  writing: "Ask is looking at your day.",
  failed: "Ask could not look at your day just now.",
  open: "Open in Ask",
  approve: "Approve",
  notNow: "Not now",
  dismissed: "Let go",
  quiet: "Nothing needs you first today.",
  /** The member's own bell line when the morning's cards wait (kind ask_cards). */
  bell: (cards) => ({
    title: cards === 1 ? "Ask has one thing for you today" : `Ask has ${cards} things for you today`,
    body: "It waits on Today, to approve or let go."
  })
};
