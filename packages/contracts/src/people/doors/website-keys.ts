/**
 * A website's keys for its forms (00675, 00709), as the website connection in Campaigns › Forms reads and shows them,
 * and the one rule for whether a key still works. Apart from website-form.ts (the door's body and its words) so a page
 * that shows the keys carries none of that. Pure.
 */
import type { FormSiteDto } from "../../forms/outside";

/** A key as it is kept: from when it is refused, or never. */
interface WebsiteKeyEnd {
  ends_at: string | null;
}

/**
 * Whether a key still works at `nowMs`: it has no end, or its end is still ahead (a key changed works a day more; a key
 * ended stops at once). The door asks it of the key a form came with, and Settings of the keys it lists.
 */
export function websiteKeyWorks(key: WebsiteKeyEnd, nowMs: number): boolean {
  return !key.ends_at || Date.parse(key.ends_at) > nowMs;
}

/**
 * What the website connection in Campaigns › Forms shows (GET website-forms; 00675, 00709): each site the business sends
 * entries from, where it stands, its keys that still work (never a key itself, which is shown once, when it is made)
 * and the forms found on it; when an entry last arrived, where a site's server sends them, and whether this member may
 * make, change or end a key.
 */
export interface WebsiteFormsDto {
  sites: FormSiteDto[];
  last_received_at: string | null;
  /** The door a site's server posts each form to, and the workspace it names. */
  door: { address: string; workspace: string };
  can_change: boolean;
}

/** A key just made, or made in place of another: the key itself, shown this once and never again. */
export interface WebsiteFormKeyMade {
  id: string;
  name: string;
  key: string;
}
