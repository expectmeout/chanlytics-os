import { createHash } from "node:crypto";

/** A rate key from a value nobody should read back out of the store. */
export const hashKey = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

/** The network a request came from: the first forwarded address, else the proxy's, else "unknown". */
export function ipOf(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const first = fwd ? fwd.split(",")[0].trim() : "";
  return first || req.headers.get("x-real-ip") || "unknown";
}
