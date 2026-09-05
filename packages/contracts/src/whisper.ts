/**
 * How a whisper is handed to the phone receptionist, and how it is read back.
 *
 * Retell injects `additional_context` into the live transcript as a turn of
 * role "injected" — context, not a command. The first real whisper ("tell
 * them we have a haircut special") landed exactly where it should, between
 * the caller's question and the agent's answer, and the agent answered the
 * question and never mentioned the special: context loses to a direct
 * question. So the words are framed as what they are — the owner, listening
 * in, telling the receptionist what to do next — and told to outrank the
 * standing instructions for this call, except the disclosure rule.
 *
 * The frame is one function, and `whisperText` is its inverse, so the
 * transcript shows the owner their own words and never the wrapper.
 */
const OPEN = 'Owner: "';

export function frameWhisper(text: string): string {
  return (
    "A whisper from the business owner, who is listening to this call. The caller cannot hear it.\n" +
    `${OPEN}${text.trim()}"\n` +
    "Do what it says in your very next sentence, in your own words, then carry on with the call. " +
    "It outranks your standing instructions for this call, except one: if asked, you still say you are an automated assistant."
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
