import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LEAD_PREVIEW_WORDS as W, pageTitle } from "@chanlytics/contracts";
import SignupScreen from "@/auth/SignupScreen";
import { previewForSignup } from "@/server/previews/claim";

/**
 * Make it mine (decision 0079, L4): a lead's own receptionist's sign-up, the page its preview's Make it mine opens. The
 * sign-up screen (src/auth/SignupScreen.tsx), drawn with the preview read on the server by its token alone
 * (server/previews/claim.ts): whose receptionist is waiting, and the address it was sent to filled in, in the page's
 * first paint. The link stands for an invite code; the code that follows sign-up claims the preview, and someone
 * signed in already makes it theirs with one press.
 *
 * Public by the proxy's `/preview/` prefix, and a token that names nothing is Not found before this renders
 * (public-page-gate.ts). One that can no longer be made theirs (someone's own, ended) goes back to its page, which says
 * which. Never indexed, and it sends no referrer: the token is the link's whole authority.
 */
export const metadata: Metadata = {
  title: pageTitle([W.mine]),
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// Rendered for each request: it reads its token's row before anything is drawn, as the preview's page does. Under
// cacheComponents a page that reads before it draws may block, and this says it may.
export const instant = false;

export default async function MakeItMinePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const said = await previewForSignup(token);
  if (!said) redirect(`/preview/${encodeURIComponent(token)}`);
  return <SignupScreen preview={{ token, ...said }} />;
}
