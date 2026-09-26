/**
 * Reach out's identities (Part 3), derived from what they are, so a retry meets its own row: a send is its run and its
 * lead; the email an attempt writes is its send and its number (E4). A deferred send's next attempt is a new row under a
 * new Resend idempotency key, which a key's 24 hours at Resend would otherwise answer with the first one's reply. Over
 * Web Crypto, as leads/ids.ts, so this package knows no runtime.
 */
const enc = new TextEncoder();
const hex = (buf: ArrayBuffer): string => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** A uuid, version 5-shaped, from the SHA-1 of a name: stable across invocations. */
async function v5(name: string): Promise<string> {
  const h = hex(await crypto.subtle.digest("SHA-1", enc.encode(name)));
  const v = `${h.slice(0, 12)}5${h.slice(13, 16)}${((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 32)}`;
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20, 32)}`;
}

export const sendIdFor = (runId: string, leadId: string): Promise<string> => v5(`reach_out_send:${runId}:${leadId}`);
export const sendMessageId = (sendId: string, attempt: number): Promise<string> =>
  v5(`reach_out_email:${sendId}:${attempt}`);
