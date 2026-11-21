import { read, workspace } from "@/server/shared/route";
import { readerContext } from "@/server/shared/reader";
import { readAdPreview } from "@/server/ads/preview";
import { AdPreviewQuery } from "@/server/ads/preview-shape";

/**
 * GET /api/v1/ads/preview?version= — Meta's own preview of one version of the workspace's kept ad draft, in each place
 * the ad shows (the Ads plan's 4.6, "The ad as Meta draws it"), with the picture and the words it drew, or why Meta's
 * own can't be had. A read: it makes nothing at Meta and spends nothing. The edge asks Meta (server/ads/preview.ts).
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: AdPreviewQuery,
  handle: ({ ctx, member, input }) => readAdPreview(readerContext(ctx, member), input.version),
});
