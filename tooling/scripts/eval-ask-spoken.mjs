/**
 * The spoken turn, for eval-ask.mjs --spoken (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §4, §7): one
 * case asked the way the agent asks it, so the gate measures what a person would hear. A voice session is minted as
 * the eval member (POST ask/voice, the cookie's; the edge of the deployment must hold the agent's key, so this runs
 * only where voice is set up), the brain door is called as the vendor calls it (the agent's secret in its header, the
 * session in the extra body, one user message), its chunks are read as the vendor reads them and timed (the first
 * speakable chunk, the first sentence, the end), the stored turn is read off the thread (the same answer the chat
 * draws), and the session is ended. The judge's spoken rules, pure, are beside it: what reads aloud has no id, no
 * route, no bracketed tag, and opens with a short clause (an early comma) when it runs long.
 */

/** The vendor's buffer words, as the door sends them while the model is quiet: not speakable words. */
const BUFFER_WORDS = /^(?:\.\.\.\s?)+$/;
/** A read's label as the door speaks it: words, an ellipsis, one space. */
const LABEL = /^[^.!?…]{1,80}…\s$/;
const SENTENCE_END = /[.!?](?=\s|$)/;
/** How many words a headline may run before its first comma, where it has more than that (the spoken register). */
const CLAUSE_WORDS = 8;

/** The chat-completions stream as the vendor reads it: each chunk's content, in order, [DONE] excluded. */
export function readSpoken(sseText) {
  const contents = [];
  for (const frame of sseText.split("\n\n")) {
    const line = frame.trim();
    if (!line.startsWith("data: ")) continue;
    const data = line.slice("data: ".length);
    if (data === "[DONE]") break;
    try {
      const c = JSON.parse(data)?.choices?.[0]?.delta?.content;
      if (typeof c === "string") contents.push(c);
    } catch {
      /* a torn frame at the end of a broken stream */
    }
  }
  return contents;
}

/** Whether a chunk carries words the voice would speak as the answer: not a label, not the buffer words. */
export const speakable = (content) => !!content && !BUFFER_WORDS.test(content) && !LABEL.test(content);

/** The answer's words as spoken: labels and buffer words out. */
export function spokenText(contents) {
  return contents.filter(speakable).join("").replace(/\s+/g, " ").trim();
}

/**
 * The judge's spoken rules over the stored turn's Say (contracts AskAnswer.say): what reads aloud carries no id (a
 * uuid, a conversation or call id), no route, no bracketed tag, and a headline longer than CLAUSE_WORDS words opens
 * with a clause and a comma inside them.
 */
export function spokenFails(final) {
  const fails = [];
  const say = final?.answer?.say;
  if (!say) return fails;
  const text = `${say.headline} ${say.detail}`.trim();
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text)) fails.push("SPOKEN: an id is spoken");
  if (/\b(?:conv|call|th|cv|ld|c)_[A-Za-z0-9]{6,}\b/.test(text)) fails.push("SPOKEN: a provider's id is spoken");
  if (/(?:^|\s)\/?(?:w\/|inbox\/|clients\/|calendar\/|reports\b|admin\/|people\/)/.test(text))
    fails.push("SPOKEN: a route is spoken");
  if (/\[[^\]]{1,40}\]/.test(text)) fails.push("SPOKEN: a bracketed tag is spoken");
  const words = say.headline.trim().split(/\s+/).filter(Boolean);
  if (words.length > CLAUSE_WORDS && !words.slice(0, CLAUSE_WORDS).some((w) => w.endsWith(",")))
    fails.push(`SPOKEN: the headline runs ${words.length} words with no comma in its first ${CLAUSE_WORDS}`);
  return fails;
}

const scopedUrl = (base, path, ws) =>
  `${base}${path}${ws ? `${path.includes("?") ? "&" : "?"}workspace=${encodeURIComponent(ws)}` : ""}`;

/**
 * One spoken turn: the session, the door, the thread, the end. Shaped as eval-ask.mjs's `ask` answers, plus what
 * only a spoken turn has: the words as spoken and when the first sentence was whole.
 */
export async function askSpoken(
  base,
  cookie,
  secret,
  { text, surface, page = null, threadId = null, scope = null },
  ws,
) {
  const origin = new URL(base).origin;
  const same = { "content-type": "application/json", cookie, origin };
  const minted = await fetch(scopedUrl(base, "/api/v1/ask/voice", ws), {
    method: "POST",
    headers: same,
    body: JSON.stringify({
      thread_id: threadId,
      scope,
      surface,
      ...(page ? { context: page.context } : {}),
      language: "en",
    }),
  });
  const started = await minted.json().catch(() => null);
  if (!minted.ok || !started?.ok)
    throw new Error(`voice ${minted.status}: ${JSON.stringify(started?.error ?? "").slice(0, 300)}`);
  const { session, thread_id: thread } = started.data;

  const t0 = Date.now();
  let firstMs = null;
  let firstTraceMs = null;
  let firstSentenceMs = null;
  let said = "";
  const contents = [];
  try {
    const res = await fetch(`${base}/api/ask/voice/llm/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-chanlytics-agent": secret },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "" },
          { role: "user", content: text },
        ],
        model: "custom-llm",
        stream: true,
        elevenlabs_extra_body: { chanlytics_session: session },
      }),
    });
    if (!res.ok || !res.body)
      throw new Error(`brain door ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let carry = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      carry += dec.decode(value, { stream: true });
      const frames = carry.split("\n\n");
      carry = frames.pop() ?? "";
      for (const c of readSpoken(frames.join("\n\n") + "\n\n")) {
        contents.push(c);
        const now = Date.now() - t0;
        if (firstTraceMs === null && LABEL.test(c)) firstTraceMs = now;
        if (!speakable(c)) continue;
        if (firstMs === null) firstMs = now;
        said += c;
        if (firstSentenceMs === null && SENTENCE_END.test(said)) firstSentenceMs = now;
      }
    }
  } finally {
    // The session ended whatever the door answered: a row left open is a row the sweep would wait a day for.
    await fetch(scopedUrl(base, "/api/v1/ask/voice/end", ws), {
      method: "POST",
      headers: same,
      body: JSON.stringify({ session }),
    }).catch(() => {});
  }
  const ms = Date.now() - t0;

  // The stored turn: the answer the chat draws, with its figures and cards, which the voice spoke only the Say of.
  const read = await fetch(scopedUrl(base, `/api/v1/ask/threads/${thread}`, ws), { headers: same });
  const body = await read.json().catch(() => null);
  const messages = body?.data?.messages ?? [];
  const final = [...messages].reverse().find((m) => m.role === "assistant") ?? null;
  return {
    events: [],
    final,
    threadId: thread,
    ms,
    firstMs: firstMs ?? ms,
    firstTraceMs,
    firstSentenceMs,
    deltas: contents.length,
    spoken: spokenText(contents),
  };
}
