import type { Metadata } from "next";
import type { ReactNode } from "react";
import { pageTitle } from "@chanlytics/contracts";

/**
 * The sign-up door's name in the tab. The page is a client component, which cannot name itself, so the tab said
 * "Chanlytics OS", the app's own title (the wiring audit's N14). Its headings change with the step and the posture;
 * the tab names the door. Named by the rule the app's own tabs follow.
 */
export const metadata: Metadata = { title: pageTitle(["Sign up"]) };

export default function SignUpLayout({ children }: { children: ReactNode }) {
  return children;
}
