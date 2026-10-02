/**
 * Who a conversation is with (moved from pages/inbox-thread.jsx, decision 0015): their face beside their name and the
 * line under it (`children`). Where they have a page (`to`), the three are one link to it, as a messaging app's header
 * opens the contact: the whole block is the press, a thumb tall on a phone, and the name underlines under a pointer. The
 * call's own header (conversations-page.tsx) and Live's name are the same door.
 *
 * The face is `IxAvatar`, the one a person wears wherever a thread or a call names them: the thread's header, the call's
 * header and Live's panel. Its picture slot (`photo`) is where an uploaded photo of a customer, or a company's logo, goes
 * once members can add one: it covers the initials, which show again if the picture does not load. Nothing draws a
 * picture yet; when something does, it passes `photo` here and every place that names a person has it.
 */
import type { ReactNode, SyntheticEvent } from "react";
import { hasRouteDoor, routeDoor } from "../shell";

interface IxAvatarProps {
  /** Who it stands for, as their initials. */
  initials: string;
  /** A picture over the initials (their photo, their company's logo), by address; none yet. */
  photo?: string | null;
  priority?: string | null;
  /** Hidden from a screen reader where the name beside it, or the link round it, says who. */
  decorative?: boolean;
  className?: string;
}

/** A picture that does not load stands aside, and the initials under it show again (as the kit's Face does). */
function standAside(event: SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.hidden = true;
}

export const IxAvatar = ({ initials, photo = null, priority = null, decorative = true, className }: IxAvatarProps) => (
  <div
    className={className ? `ix-th-avatar ${className}` : "ix-th-avatar"}
    data-priority={priority || undefined}
    aria-hidden={decorative ? "true" : undefined}
  >
    {initials}
    {photo ? (
      <img key={photo} className="face-photo" src={photo} alt="" loading="lazy" decoding="async" onError={standAside} />
    ) : null}
  </div>
);

interface IxWhoProps {
  to?: string | null;
  go?: ((to: string) => void) | null;
  who: string;
  avatar: string;
  photo?: string | null;
  priority?: string | null;
  children?: ReactNode;
}

export const IxWho = ({ to = null, go = null, who, avatar, photo = null, priority = null, children }: IxWhoProps) => {
  const face = <IxAvatar initials={avatar} photo={photo} priority={priority} decorative={!!to} />;
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
