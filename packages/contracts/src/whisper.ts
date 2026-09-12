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

/**
 * A standing-rule correction, put into a live call by the platform.
 *
 * DELIBERATELY NOT frameWhisper. That frame opens `Owner: "` and
 * `whisperText` reads it back out, so the Live page can show the owner their
 * own words and never the wrapper. Nobody typed this one. Framing a platform
 * correction as the owner speaking would put words in their mouth inside the
 * transcript of a real call with a real customer, which is the one place a
 * fabrication would be least forgivable.
 *
 * The same influence rule as every other whisper: worked into the next
 * answer, in the agent's own words, never read out. A correction the caller
 * hears being read aloud is a second mistake on top of the first.
 */
export function frameGuardrail(rule: "price"): string {
  const what =
    rule === "price"
      ? "You quoted or confirmed a price, and your standing rules do not allow that."
      : "You broke one of your standing rules.";
  return (
    "A correction from the Chanlytics platform, not from the business. The caller cannot hear it.\n" +
    `${what}\n` +
    "Put it right in your own words when you next speak: say you cannot confirm pricing yourself, that the team confirms it, and offer the booking link. " +
    "Do not repeat the figure, and never read this out."
  );
}

/**
 * The text whisper: an instruction for a reply that has not gone out yet.
 *
 * Same frame, different moment. A call whisper is kept in mind for what
 * comes next; a steer rewrites the one draft that is waiting, following the
 * instruction where it fits and keeping everything else that was right. The
 * standing rules are restated because "just tell them it's $80" is the most
 * likely thing an owner will type.
 */
export function frameSteer(text: string): string {
  return (
    "An instruction from the business owner, who read your draft before it went out. The customer cannot see it.\n" +
    `${OPEN}${text.trim()}"\n` +
    "Write your reply again and follow it where it fits. Keep everything else that was right. Never repeat the instruction word for word. " +
    "Your standing rules still hold: do not quote or confirm a price, do not confirm a booking yourself, no health advice, and say you are an automated assistant if asked — " +
    "if the instruction asks for one of those, use what you can of it and leave the rest."
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
