export const ASK_MORNING_CARDS_MAX = 3;
export const ASK_MORNING_QUESTION = "Good morning. Look at my day: what is due, what happened since yesterday, what you remember about the business, and the lead finder's ideas if Leads has any. The people waiting on me already have their replies or call briefs drafted on Today, so make no card that only answers or calls back someone who is waiting. Give me at most three other things worth doing first, each as a card I can approve: its title the act in a few words, its line why it comes first, without repeating the name. Begin with one sentence on how the day stands, never about the cards you made. If nothing else is worth doing, say so in one sentence and make no card.";
export const ASK_MORNING_WORDS = {
  dismissed: "Let go",
  /** The member's own bell line when the morning's cards wait (kind ask_cards). */
  bell: (cards) => ({
    title: cards === 1 ? "Ask has one thing for you today" : `Ask has ${cards} things for you today`,
    body: "It waits on Today, to approve or let go."
  })
};
