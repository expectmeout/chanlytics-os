import { read, workspace } from "@/server/route";
import { consentQr } from "@/server/people/consent-qr";

/**
 * GET /api/v1/consent/qr — the code a customer scans to say yes to offers,
 * as an SVG. It encodes one link, the workspace's own WhatsApp number with
 * the opt-in words, and nothing a caller chooses; a workspace with no
 * active number has nothing to say yes to.
 *
 * The handle is consentQr in src/server/people/consent-qr.ts: the route is its declaration (who may, how often), the
 * verb is what it does.
 */
export const GET = read({
  scope: workspace,
  handle: ({ ctx, member }) => consentQr(ctx, member),
});
