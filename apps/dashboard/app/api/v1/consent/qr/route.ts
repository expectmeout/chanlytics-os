import { read, workspace } from "@/server/shared/route";
import { findConsentQr } from "@/server/people/consent-qr";

/**
 * GET /api/v1/consent/qr — the code a customer scans to say yes to offers,
 * as an SVG. It encodes one link, the workspace's own WhatsApp number with
 * the opt-in words, and nothing a caller chooses; a workspace with no
 * active number has nothing to say yes to.
 *
 * The handle is findConsentQr in src/server/people/consent-qr.ts: the route is its declaration (who may, how often), the
 * verb is what it does.
 */
export const GET = read({
  scope: workspace,
  handle: ({ ctx, member }) => findConsentQr(ctx, member),
});
