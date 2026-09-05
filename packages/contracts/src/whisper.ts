/**
 * How a whisper is handed to the phone receptionist, and how it is read back.
 *
 * Retell injects `additional_context` into the live transcript as a turn of
 * role "injected" — context, not a command. The first real whisper ("tell
 * them we have a haircut special") landed exactly where it should, between
 * the caller's question and the agent's answer, and the agent answered the
 * question and never mentioned the special: context loses to a direct
 * question. So the words are framed as what they are — the owner, listening
 * in, telling the receptionist something to keep in mind from here on.
 *
 * Influence, never force. The owner's rule (2026-09-05): a whisper shapes
 * what the receptionist says WHEN IT FITS — not word for word, not
 * necessarily in the very next sentence (a conditional whisper, "if they
 * mention X, say Y", waits for X), and never outside the standing rules: it
 * does not make the agent quote a price, confirm a booking, or drop the AI
 * disclosure because someone whispered one. The first frame said "outranks
 * your standing instructions" and "your very next sentence"; both were
 * wrong for the same reason "tell them we have a haircut special" was a bad
 * test — the price rule is the default every workspace starts with.
 *
 * The frame is one function, and `whisperText` is its inverse, so the
 * transcript shows the owner their own words and never the wrapper.
 */
const OPEN = 'Owner: "';

export function frameWhisper(text: string): string {
  return (
    "A whisper from the business owner, who is listening to this call. The caller cannot hear it.\n" +
    `${OPEN}${text.trim()}"\n` +
    "Keep it in mind from here on and use it in your own words when it fits: in your next answer if it applies now, later if it is conditional " +
    "(for example, only if the caller brings something up). Never read it out word for word, and do not force it into an answer where it does not belong. " +
    "Your standing rules still hold: do not quote or confirm a price, do not confirm a booking yourself, and say you are an automated assistant if asked — " +
    "if the whisper asks for one of those, use what you can of it and leave the rest."
  );
}

/** The owner's own words out of an injected turn — framed or not. */
export function whisperText(content: string | null | undefined): string {
  const c = (content ?? "").replace(/\r\n/g, "\n");
  const at = c.indexOf(OPEN);
  if (at === -1) return c.trim();
  const rest = c.slice(at + OPEN.length);
  const close = rest.indexOf('"\n');
  return (close === -1 ? rest.replace(/"$/, "") : rest.slice(0, close)).trim();
}
