/**
 * What code decides before the judge (PRD §7.2): the phone as E.164 with
 * placeholders dropped, whether the listing's number is also on the site,
 * the registrable host, the state as its code, and the candidate emails
 * through contracts' cleaner. Nothing here is asked of the model.
 */
import { cleanEmailCandidates, isSiteRoot, siteHost, stateCode, usPhone } from "@chanlytics/contracts";
import type { MapsPlace } from "./cards";

export interface CleanPlace {
  raw: MapsPlace;
  phone: string | null;
  /** 0 none, 1 the listing, 2 the listing's number is on their site too. */
  phoneSources: 0 | 1 | 2;
  host: string | null;
  /** Whether the listing's website is that host's root, not a page under it (00237); null without a host. */
  root: boolean | null;
  region: string | null;
  emails: string[];
  dropped: { email: string; why: string }[];
}

export function cleanPlace(raw: MapsPlace): CleanPlace {
  const phone = usPhone(raw.phoneRaw);
  const onSite = phone !== null && raw.sitePhones.some((s) => usPhone(s) === phone);
  const host = siteHost(raw.website);
  const { kept, dropped } = cleanEmailCandidates(raw.emails, host);
  return {
    raw,
    phone,
    phoneSources: phone ? (onSite ? 2 : 1) : 0,
    host,
    root: host ? isSiteRoot(raw.website) : null,
    region: stateCode(raw.state),
    emails: kept.slice(0, 10),
    dropped,
  };
}
