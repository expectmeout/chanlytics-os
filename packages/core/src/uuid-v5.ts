/**
 * A uuid, version 5-shaped, from the SHA-1 of a name: the same name makes the same id in any runtime, so a row derived
 * from what it is (a lead search's run, a reach-out's run or send) is made once, and a replay meets it. Over Web
 * Crypto, so this package knows no runtime. The lead runner's ids (leads/ids.ts) and Reach out's
 * (campaigns/reach-out-ids.ts) are both this.
 */
import { utf8Encoder, hexOf } from "@chanlytics/contracts";

export async function uuidV5(name: string): Promise<string> {
  const h = hexOf(await crypto.subtle.digest("SHA-1", utf8Encoder.encode(name)));
  const v = `${h.slice(0, 12)}5${h.slice(13, 16)}${((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 32)}`;
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20, 32)}`;
}
