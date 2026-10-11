/**
 * A drawer's lines (Ruben, 11 Oct 2026: Campaigns' drawers made "like we did with others", Settings' sheets): one inset of
 * lines, a hairline between them, as Settings' sheets draw a list of settings (settings.css `.bt-lines`): a campaign's
 * runs, each opening as itself on Sent. The surface is the kit's (Panel, inset and flush); the page lays the lines out.
 */
import type { ReactNode } from "react";
import { Panel } from "../../kit/panel/panel";

/** The lines' inset. */
export function CmLines({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <Panel variant="inset" size="flush" className="cm-lines" data-testid={testid}>
      {children}
    </Panel>
  );
}
