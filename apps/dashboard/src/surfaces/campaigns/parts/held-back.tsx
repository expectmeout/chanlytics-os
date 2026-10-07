/**
 * "Who's held back", the one quiet link at the end of a composer's To line (the Campaigns review's item 17): what used to
 * stand as paragraphs under the To row (why people are held, who is, what the yes covers, the rules every send keeps) is
 * one press away, in the kit's popover. Each composer says what it holds -- the broadcast the people and the reasons by
 * count, the playbook the reasons its run counts -- and this is the door and the box they stand in.
 */
import type { ReactNode } from "react";
import { PREVIEW_WORDS } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Popover } from "../../kit/popover/popover";

interface CmHeldBackProps {
  /** The link's test id. */
  testid: string;
  children: ReactNode;
}

/** The quiet link that opens who is held back, and why. */
export function CmHeldBack({ testid, children }: CmHeldBackProps) {
  return (
    <Popover
      label={PREVIEW_WORDS.heldBack}
      align="start"
      className="bc-held-box"
      trigger={
        <LinkButton data-testid={testid}>
          {PREVIEW_WORDS.heldBack} <Icon name="chevron" size={11} />
        </LinkButton>
      }
    >
      {children}
    </Popover>
  );
}
