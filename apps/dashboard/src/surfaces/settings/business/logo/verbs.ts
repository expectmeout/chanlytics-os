/**
 * The workspace's logo on Settings › Business (00407): keep the picture the page made, take it away, or look for it on
 * the business's own website. The refresh map reads the workspace list again after a save or a removal, so the
 * sidebar's circle, the rail and the switcher wear it as the answer lands; a look stores nothing.
 */
import type { ApiResult } from "@/client/api";
import type { LogoLookupAnswer } from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";

export const logoVerbs = {
  save: (image: string): Promise<ApiResult<{ logo_url: string | null }>> =>
    api()("PUT workspaces/logo", { body: { image }, once: true }),
  remove: (): Promise<ApiResult<{ logo_url: null }>> => api()("DELETE workspaces/logo"),
  lookup: (): Promise<ApiResult<LogoLookupAnswer>> => api()("POST workspaces/logo/lookup"),
};
