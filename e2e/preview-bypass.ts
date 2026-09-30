import { request, type FullConfig } from "@playwright/test";

/**
 * Past a Vercel preview's deployment protection, once: one request with the project's automation secret asks Vercel
 * to set its bypass cookie, and the cookie is saved where playwright.config.ts has every page open with it. Only this
 * request carries the secret; the pages carry the cookie, which Vercel scopes to the preview's own host.
 */
export default async function previewBypass(config: FullConfig): Promise<void> {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const { baseURL, storageState } = config.projects[0].use;
  if (!secret || !baseURL || typeof storageState !== "string") return;
  const context = await request.newContext({ baseURL });
  const res = await context.get("/", {
    headers: { "x-vercel-protection-bypass": secret, "x-vercel-set-bypass-cookie": "true" },
    maxRedirects: 0,
  });
  if (res.status() === 401 || res.status() === 403)
    throw new Error(
      `the preview refused the bypass (${res.status()}): is VERCEL_AUTOMATION_BYPASS_SECRET this project's?`,
    );
  await context.storageState({ path: storageState });
  await context.dispose();
}
