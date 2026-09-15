import type { Metadata } from "next";
import type { ReactNode } from "react";
import { pageTitle } from "@chanlytics/contracts";

/**
 * The sign-in door's name in the tab. The page is a client component, which cannot name itself, so the tab said
 * "Chanlytics OS", the app's own title (the wiring audit's N14). Named by the rule the app's own tabs follow.
 */
export const metadata: Metadata = { title: pageTitle(["Sign in"]) };

export default function SignInLayout({ children }: { children: ReactNode }) {
  return children;
}
