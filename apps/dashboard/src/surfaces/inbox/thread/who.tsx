/**
 * Who a conversation is with (moved from pages/inbox-thread.jsx, decision 0015): their face beside their name and the
 * line under it (`children`). Where they have a page (`to`), the three are one link to it, as a messaging app's header
 * opens the contact: the whole block is the press, a thumb tall on a phone, and the name underlines under a pointer. The
 * call's own header (conversations-page.tsx) and Live's name are the same door.
 *
 * The face is the kit's Face at its header size, the one avatar a person wears wherever a thread or a call names them
 * (the thread's header, the call's header, Live's panel), told who it is for (`person`: contracts decides a number's glyph
 * from an address's from a name's initials). Its picture slot (`photo`) is where an uploaded photo of a
 * customer, or a company's logo, goes once members can add one: it covers the initials, which show again if the picture
 * does not load. Nothing draws a picture yet; when something does, it passes `photo` here and every place that names a
 * person has it.
 */
import type { ReactNode } from "react";
import { Face, faceTileOf } from "../../kit/face/face";
import { hasRouteDoor, routeDoor } from "../shell";

interface IxWhoProps {
  to?: string | null;
  go?: ((to: string) => void) | null;
  who: string;
  avatar: string;
  photo?: string | null;
  priority?: string | null;
  /** The face in their own hue (the thread's head; contracts' name picks it), where it is the house's grey. */
  hued?: boolean;
  /** What stands on the face's edge: the wire the conversation is on (header.tsx wireBadge). */
  badge?: ReactNode;
  children?: ReactNode;
}

export const IxWho = ({
  to = null,
  go = null,
  who,
  avatar,
  photo = null,
  priority = null,
  hued = false,
  badge = null,
  children,
}: IxWhoProps) => {
  const drawn = (
    <Face
      person={{ name: who, initials: avatar }}
      size="lg"
      photo={photo ?? undefined}
      priority={priority}
      {...(hued ? { hue: faceTileOf(who), className: "ix-th-who-round" } : {})}
    />
  );
  // A badge stands on the face's edge, outside the circle that clips its picture: the two in a box of their own.
  const face = badge ? (
    <span className="ix-th-pic">
      {drawn}
      {badge}
    </span>
  ) : (
    drawn
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
