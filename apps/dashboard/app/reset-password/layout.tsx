import type { Metadata } from "next";
import type { ReactNode } from "react";
import { pageTitle, PASSWORD_WORDS } from "@chanlytics/contracts";

/**
 * The reset door's name in the tab. The page is a client component, which cannot name itself, so the tab said
 * "Chanlytics OS", the app's own title -- the wiring audit's N14, closed for sign-in and sign-up and left open
 * here because this was the one door without a layout of its own. It takes the heading's own words from
 * contracts rather than spelling them a second time, so the tab and the h1 cannot drift apart.
 */
export const metadata: Metadata = { title: pageTitle([PASSWORD_WORDS.resetTitle]) };

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
