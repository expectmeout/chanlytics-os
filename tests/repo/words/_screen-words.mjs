/**
 * The words that never reach a screen (docs/words.md), as patterns: one home for the list, read by the measures that
 * hold the pages to it (_words.mjs, check:debt) and by the judge of what AI answers (tooling/scripts/eval-ask.mjs).
 *
 * It imports nothing, so a script that only reads an answer takes the list and not the compiler.
 *
 * Only the words that mean one thing are here. docs/words.md also retires words English uses for other things (row,
 * column, record, read, run, job, policy, line, contact, client, held, stopped, link): a pattern cannot tell "a job the
 * business does" from "a job in the queue", so those are each page's pass to judge, read by a person.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */

/**
 * Not inside an id, a path, a class or a member (`thread-row`, `ask_tools`, `/api/threads`, `x.agent`), and not inside
 * a longer word of any language: "botón" holds no bot.
 */
const BEFORE = "(?<![\\p{L}\\p{N}./:#@$_-])";
const AFTER = "(?![\\p{L}\\p{N}/=(_-])";
const words = (alternatives, flags = "giu") => new RegExp(`${BEFORE}(?:${alternatives})${AFTER}`, flags);

/**
 * Each family, by the section of docs/words.md that retires it: its patterns, and what the page says to write instead.
 * A pattern is global, and matches a whole word a person would read.
 */
export const WORD_FAMILIES = {
  ai: {
    says: 'The product\'s AI is called AI, with no article: never Ask, receptionist, agent, assistant, bot, Claude or "the AI".',
    patterns: [
      words("receptionists?|agents?|assistants?|chatbots?|bots?"),
      words("Claude", "gu"),
      // Ask as a name: after another word in its sentence, owning something, or doing something. "Ask Chanlytics",
      // "Ask them to bring it" and a choice called "Ask me first" are the verb, and stay.
      /(?<=[a-z,] )Ask(?![\p{L}\p{N}_-]| (?:Chanlytics|AI|me|you|us|them|him|her|first|before)\b)/gu,
      /(?<![\p{L}\p{N}_-])Ask['’]s(?![\p{L}\p{N}_-])/gu,
      /(?<![\p{L}\p{N}_-]|[a-z,] )Ask (?=(?:is|was|has|had|can|could|will|would|does|did|reads?|writes|wrote|finds|found|answers|answered|drafts|drafted|made|makes|suggests|proposes|needs|knows|uses|sees|says|said|keeps|sends|stays|never|only|also|itself)\b)/gu,
      /(?<![\p{L}\p{N}_-])(?:[Tt]he|[Yy]our) AI(?![\p{L}\p{N}_-]| (?:limit|mark|name)\b)/gu,
    ],
  },
  code: {
    says: "The code's words: say what it means for the owner (Loading, Settings, Chanlytics is on it).",
    patterns: [
      words(
        "tenants?|databases?|servers?|tokens?|prompts?|surfaces?|panes?|render(?:s|ed|ing)?|sync(?:s|ed|ing)?|queue[sd]?|batch(?:es)?|payloads?|webhooks?|config|configurations?|provision(?:s|ed|ing)?|credentials|heartbeats?|veto(?:e?s|ed)?|matrix|action class(?:es)?|slugs?|undefined|env|endpoints?|schemas?|cron|uuid",
      ),
      words("API|RLS|null|the OS", "gu"),
      /(?<![\p{L}\p{N}_-])(?:the|a|AI|language) models?(?![\p{L}\p{N}_-])/giu,
    ],
  },
  provider: {
    says: "A provider's word or name the owner never met: say what it means (Texting approval, Saved message, Didn't reach them).",
    patterns: [
      words("Twilio|Retell|Resend|Apify|Supabase|Vercel|Anthropic|ElevenLabs|MiniMax|OpenAI", "gu"),
      words("templates?|10DLC|carriers?|24-hour window|quality rating|messaging tier"),
      /(?<![\p{L}\p{N}_-])error (?:code )?#?\d{2,}(?![\p{L}\p{N}_-])/giu,
    ],
  },
  retired: {
    says: "One word for each thing: Conversation, Campaign, Lead, Member, Sign in, Turn on, Cold email, Delete, Approve.",
    patterns: [
      words(
        "threads?|sequences?|playbooks?|broadcasts?|prospects?|seats?|log(?:ged|ging)? (?:in|out)|log-?ins?|log-?outs?|enabl(?:e|es|ed|ing)|disabl(?:e|es|ed|ing)|activat(?:e|es|ed|ing)|deactivat(?:e|es|ed|ing)|reach-outs?|outreach|eras(?:e|es|ed|ing)|sign(?:s|ed)? off|last read",
      ),
      /(?<![\p{L}\p{N}_-])your (?:OK|yes|say)(?![\p{L}\p{N}_-])/giu,
    ],
  },
  failure: {
    says: 'A problem says what happened, whether it mends itself and the one thing to do: "Couldn\'t", never could not, unable, failed or error.',
    patterns: [words("could not|unable to|fail(?:s|ed|ure|ures)?|errors?|(?:something )?went wrong|oops")],
  },
};

/** Every family's name, in the order a count prints them. */
export const FAMILIES = Object.keys(WORD_FAMILIES);

/**
 * The words of some families a text says, each with its family: `[{ family, word }]`, in the order the families are
 * given. A text with none gives an empty list.
 */
export function neverOnAScreen(text, families = FAMILIES) {
  const out = [];
  for (const family of families)
    for (const pattern of WORD_FAMILIES[family].patterns)
      for (const m of String(text).matchAll(pattern)) out.push({ family, word: m[0].trim() });
  return out;
}

/** How a brand writes (docs/words.md, "The voice" and "Punctuation, case, numbers, time"), each mark a pattern. */
export const VOICE_MARKS = {
  we: /(?<![\p{L}\p{N}_'’-])(?:[Ww]e(?:['’](?:re|ll|ve|d))?|[Oo]urs?|us)(?![\p{L}\p{N}_-])/gu,
  sorry: /(?<![\p{L}\p{N}_-])(?:sorry|apolog(?:y|ies|i[sz]e)|unfortunately)(?![\p{L}\p{N}_-])/giu,
  click: /(?<![\p{L}\p{N}_-])click(?:s|ed|ing)?(?![\p{L}\p{N}_-])/giu,
  emDash: /—/gu,
  semicolon: /;/gu,
};

/** A line a person reads is long past this many characters, and a paragraph at this many sentences. */
export const LONG_LINE = 120;
export const MANY_SENTENCES = 3;

/** How many sentences a text holds: each full stop, question or exclamation that more words, or the end, follow. */
export const sentencesOf = (text) => (String(text).match(/[.!?](?=\s+\S|\s*$)/gu) ?? []).length;

/** A label that opens with "Your": a possessive the page rarely needs ("Goal", not "Your goal"). */
export const opensWithYour = (text) =>
  /^Your [a-z]/.test(text) && text.split(/\s+/).length <= 5 && !/[.!?]$/.test(text);

/**
 * The marks of the voice a text carries, as counts by mark: we, sorry, click, emDash, semicolon, your, long, sentences.
 * A mark not there is left out.
 */
export function voiceMarksIn(text) {
  const t = String(text);
  const out = {};
  for (const [mark, pattern] of Object.entries(VOICE_MARKS)) {
    const n = (t.match(pattern) ?? []).length;
    if (n) out[mark] = n;
  }
  if (opensWithYour(t)) out.your = 1;
  if (t.length > LONG_LINE) out.long = 1;
  if (sentencesOf(t) >= MANY_SENTENCES) out.sentences = 1;
  return out;
}
