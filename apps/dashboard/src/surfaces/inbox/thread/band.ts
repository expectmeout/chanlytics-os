/**
 * Where a real thread offers the call back (moved from pages/inbox-thread.jsx, decision 0015): the one place it is
 * offered, whichever part of the thread draws it.
 */
import { mayApproveOrNoRoles } from "./shell-thread";
import type { Thread } from "../types";

// The call is offered once. On a thread the receptionist could not finish by phone, the line under the conversation
// dials and claims it in one press: "I'll call them" only claimed it, and the reply box carried a second Call back
// that only dialled, under a banner telling you to call them back, under a sentence telling you the same. Anywhere
// else on such a thread the reply box carries the call, and for a caller who opted out -- whose reply box offers
// nothing to send -- the header does.
export const ixDockDials = (t: Thread | null | undefined): boolean =>
  !!(
    t &&
    t.real &&
    t.phone &&
    t.primaryChannel === "phone" &&
    t.state === "escalated" &&
    !t.takenOver &&
    !t.claimedByOther &&
    mayApproveOrNoRoles()
  );

// Whether the thread's status band offers the call back: the one place it is offered, whichever button it is -- the
// number itself, or taking the thread for a teammate who may not dial it from here. The reply box and the header
// offered their own beside it, so a teammate without approve saw two Call backs saying two different things.
export const ixBandCallBack = (t: Thread | null | undefined): boolean =>
  !!(
    t &&
    t.real &&
    t.state === "escalated" &&
    !t.takenOver &&
    !t.claimedByOther &&
    (ixDockDials(t) || t.primaryChannel === "phone")
  );
