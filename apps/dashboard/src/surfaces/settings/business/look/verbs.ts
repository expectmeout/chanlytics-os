/**
 * The workspace's colour on Settings › Business (00490, decision 0075): keep the one picked, or take it away. The
 * refresh map reads the workspace list again after either, so the row and the preview wear it as the answer lands.
 */
import type { ApiResult } from "@/client/api";
import { api } from "@/legacy-bridge/api";

export const lookVerbs = {
  save: (accent: string): Promise<ApiResult<{ accent: string | null }>> =>
    api()("PUT workspaces/accent", { body: { accent }, once: true }),
  remove: (): Promise<ApiResult<{ accent: string | null }>> => api()("DELETE workspaces/accent"),
};
