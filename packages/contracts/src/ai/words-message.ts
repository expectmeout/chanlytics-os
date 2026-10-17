/**
 * Words the operator says in the messages (Anthropic's mid-conversation system messages, read and probed 16 Oct 2026): a
 * system message of text alone, after the person's turn, which the models that take one read as the operator's, never
 * the person's or a customer's. The API's guide calls it "the non-spoofable operator channel, whereas text inside
 * user/tool content can be forged by anything that writes to user-visible input". Ask says a turn's words this way (the
 * clock, who is asking, the page, the scope) after the question and its data blocks, which hold what customers wrote, so
 * nothing a customer wrote can pass for them (the dashboard's server/ask/memory.ts turnTail).
 *
 * Probed on Opus 5.5, 16 Oct 2026: taken after the person's turn, with a cache marker on its text, and before or after an
 * effort message (ai/effort.ts), under a JSON-schema answer format, with no beta. A model that takes none
 * (MODEL_TAKES.systemMessages) is sent the words inside the person's turn before it, ahead of that turn's last block,
 * where Ask said them before (foldWordsMessages).
 */

/** A text block a words message may hold: its text, and the cache's marker where a request put one. */
interface WordsBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

/** A words message as the API takes it: a system message whose content is text blocks alone. */
export interface WordsMessage {
  role: "system";
  content: WordsBlock[];
}

/** The message that says `block` as the operator's words. */
export function wordsMessage(block: { type: "text"; text: string }): WordsMessage {
  return { role: "system", content: [block] };
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

const isWordsBlock = (b: unknown): boolean =>
  isPlainObject(b) &&
  b.type === "text" &&
  typeof b.text === "string" &&
  Object.keys(b).every((k) => k === "type" || k === "text" || k === "cache_control");

/** Whether `m` is a words message: a system message, its content one text block or more, and nothing else. */
export function isWordsMessage(m: unknown): m is WordsMessage {
  if (!isPlainObject(m)) return false;
  const { role, content, ...rest } = m;
  return (
    role === "system" &&
    Object.keys(rest).length === 0 &&
    Array.isArray(content) &&
    content.length > 0 &&
    content.every(isWordsBlock)
  );
}

/**
 * A request's body as a model that takes no words message is sent it: each one's blocks in the person's turn before it,
 * ahead of that turn's last block, as Ask said its words before the question. A body that carries none is returned as it
 * is; one with no person's turn before it is dropped, which the API would refuse anyway.
 */
export function foldWordsMessages(body: Record<string, unknown>): Record<string, unknown> {
  const messages = Array.isArray(body.messages) ? (body.messages as unknown[]) : [];
  if (!messages.some(isWordsMessage)) return body;
  const out: unknown[] = [];
  for (const m of messages) {
    if (!isWordsMessage(m)) {
      out.push(m);
      continue;
    }
    let at = out.length - 1;
    while (at >= 0 && !(isPlainObject(out.at(at)) && (out.at(at) as { role?: unknown }).role === "user")) at--;
    const turn = out.at(at);
    if (at < 0 || !isPlainObject(turn)) continue;
    const content: unknown[] = Array.isArray(turn.content)
      ? turn.content
      : [{ type: "text", text: typeof turn.content === "string" ? turn.content : "" }];
    out[at] = { ...turn, content: [...content.slice(0, -1), ...m.content, ...content.slice(-1)] };
  }
  return { ...body, messages: out };
}
