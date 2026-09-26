/**
 * What DNS says of a sending domain. Whether it has a DMARC record: at the host, else at a parent down to two labels
 * (RFC 7489's organisational fallback, approximated without the public suffix list). Presence is the rule (the plan's
 * decision 8); "could not read" is null, and is never read as missing. And whether its DKIM key is published, which
 * says whose domain it is (dkimPublished).
 */
import { Resolver } from "node:dns/promises";
import { dmarcOf } from "../packages/channels.js";

export type TxtResolver = (name: string) => Promise<string[][]>;

const systemResolver: TxtResolver = (name) => {
  const r = new Resolver({ timeout: 3000, tries: 2 });
  return r.resolveTxt(name);
};
let resolver: TxtResolver = systemResolver;

/** For tests: the resolver every read uses; null puts the system's back. */
export function setTxtResolver(r: TxtResolver | null): void {
  resolver = r ?? systemResolver;
}

/** A name with no TXT at all, or no such name: an answer. Anything else is DNS not answering. */
const NO_RECORD = new Set(["ENODATA", "ENOTFOUND"]);

/**
 * Whether a domain's DKIM record, as the provider gave it to its holder, is published in DNS: true when a TXT at its
 * name carries its key, false when none does, null when DNS could not be read. A published key is the holder's own
 * work at their registrar, and is never taken from them (sending-domains.ts takeOver); "could not read" is never
 * read as "not published".
 */
export async function dkimPublished(
  host: string,
  records: ReadonlyArray<{ label?: string; type?: string; name?: string; value?: string }>,
  resolve: TxtResolver = resolver,
): Promise<boolean | null> {
  const dkim = records.filter(
    (r) => r.label?.toUpperCase() === "DKIM" && r.type?.toUpperCase() === "TXT" && r.name && r.value,
  );
  // The key is what identifies it: a registrar or a holder may publish it with other tags beside it (v=DKIM1; k=rsa).
  const keyOf = (s: string) => {
    const t = s.replace(/\s+/g, "").replace(/^"|"$/g, "");
    return /(?:^|;)p=([^;]*)/i.exec(t)?.[1] ?? t;
  };
  let unread = false;
  for (const r of dkim) {
    const n = r.name!.trim().toLowerCase().replace(/\.$/, "");
    // A name the provider gave whole, or relative to where it is published: for a subdomain host
    // (mail.getharbor.com) the provider may give it relative to the registered domain (resend._domainkey.mail), so it is
    // looked for under the host and each parent down to two labels, as DMARC is.
    const labels = host.split(".");
    const names =
      n === host || n.endsWith(`.${host}`)
        ? [n]
        : labels.slice(0, Math.max(1, labels.length - 1)).map((_, i) => `${n}.${labels.slice(i).join(".")}`);
    for (const name of names) {
      try {
        if ((await resolve(name)).some((chunks) => keyOf(chunks.join("")) === keyOf(r.value!))) return true;
      } catch (e) {
        if (!NO_RECORD.has((e as { code?: string }).code ?? "")) unread = true;
      }
    }
  }
  return unread ? null : false;
}

export async function readDmarc(host: string, resolve: TxtResolver = resolver): Promise<"found" | "missing" | null> {
  const labels = host.split(".");
  for (let i = 0; i <= labels.length - 2; i++) {
    const name = `_dmarc.${labels.slice(i).join(".")}`;
    try {
      if (dmarcOf(await resolve(name)) === "found") return "found";
    } catch (e) {
      if (!NO_RECORD.has((e as { code?: string }).code ?? "")) return null;
    }
  }
  return "missing";
}
