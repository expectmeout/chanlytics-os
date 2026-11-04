/**
 * Since when they have been in touch, as a person's page says it and a thread's sheet says it again after their address:
 * a leaf of its own, so the sheet loads one line of words and not the page's cards (3 Nov 2026: read from
 * person-cards.ts, it put 27 KB on the first load of the Inbox and of Conversations).
 */
import type { PersonRowVM } from "./person-row";

/** "Since Jul 14" / "Since before Aug 27" / "" */
export function sinceWords(base: PersonRowVM): string {
  return base.firstContact.label === "—"
    ? ""
    : base.firstContact.estimate
      ? `Since ${base.firstContact.label.charAt(0).toLowerCase()}${base.firstContact.label.slice(1)}`
      : `Since ${base.firstContact.label}`;
}
