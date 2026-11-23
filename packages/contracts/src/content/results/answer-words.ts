/**
 * What a public answer to a comment says where it stands (the content loop PRD's 12.4; docs/words.md): AI's draft, a
 * comment AI could not answer safely, an answer on its way, up, or one that did not go, and the one thing to do. A
 * place's own word for a refusal is never shown. A leaf: Inbox's comment and the job read it, nothing else rides along.
 */
export const COMMENT_ANSWER_WORDS = {
  /** Instagram took the answer. */
  sent: "Answered on Instagram",
  /** The business answered in the Instagram app, not from here. */
  byHand: "You answered on Instagram",
  /** The owner pressed Send and Instagram is being asked. */
  sending: "Answering on Instagram",
  /** Instagram refused it, in the house's words. */
  refused: "Instagram didn't take this answer. Change the words, or send it again.",
  /** The account is not connected now. */
  disconnected: "Instagram needs connecting again. The answer waits here.",
  /** No answer came back: it may be up. Never sent twice blind. */
  unknown: "Instagram didn't say whether this went up. Look under the comment before sending it again.",
  /** AI drafted nothing for this one. */
  noDraft: "AI hasn't written an answer. Write one, or leave it.",
  /** The post was taken down, so there is nothing to answer under. */
  postDown: "The post is down, so it can't be answered there.",
} as const;
