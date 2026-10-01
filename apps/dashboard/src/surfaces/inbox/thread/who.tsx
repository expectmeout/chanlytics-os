/**
 * Who a conversation is with (moved from pages/inbox-thread.jsx, decision 0015): their face beside their name and the
 * line under it (`children`). Where they have a page (`to`), the three are one link to it, as a messaging app's header
 * opens the contact: the whole block is the press, a thumb tall on a phone, and the name underlines under a pointer. The
 * call's own header (conversations-page.tsx) and Live's name are the same door.
 */
import type { ReactNode } from "react";
import { hasRouteDoor, routeDoor } from "../shell";

interface IxWhoProps {
  to?: string | null;
  go?: ((to: string) => void) | null;
  who: string;
  avatar: string;
  priority?: string | null;
  children?: ReactNode;
}

export const IxWho = ({ to = null, go = null, who, avatar, priority = null, children }: IxWhoProps) => {
  const face = (
    <div className="ix-th-avatar" data-priority={priority || undefined} aria-hidden={to ? "true" : undefined}>
      {avatar}
    </div>
  );
  if (!to || !hasRouteDoor())
    return (
      <div className="ix-th-who">
        {face}
        <div className="ix-th-id">{children}</div>
      </div>
    );
  return (
    <a className="ix-th-who" {...routeDoor(to, go)} title={`Open ${who} in People`} data-testid="ix-th-person">
      {face}
      <div className="ix-th-id">{children}</div>
    </a>
  );
};
