/**
 * Whether a sending domain has a DMARC record: at the host, else at a parent down to two labels (RFC 7489's
 * organisational fallback, approximated without the public suffix list). Presence is the rule (the plan's decision
 * 8); "could not read" is null, and is never read as missing.
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
