import type { Metadata } from "next";
import type { ReactNode } from "react";
import { pageTitle } from "@chanlytics/contracts";

/** The second step's name in the tab (0013), by the rule the sign-in door's follows. */
export const metadata: Metadata = { title: pageTitle(["Verify"]) };

export default function VerifyLayout({ children }: { children: ReactNode }) {
  return children;
}
