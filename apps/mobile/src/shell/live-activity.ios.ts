/**
 * The call activity's side of the bridge on iOS (the PRD, PR 7): the push-to-start token the phone hands out once
 * (iOS 17.2+), which the page registers with the phone's device; and the end of every call activity when the page's
 * Live says no call is in progress.
 */
import { addPushToStartTokenListener } from "expo-widgets";
import CallActivity from "../widgets/CallActivity";

export function listenPushToStart(cb: (token: string) => void): () => void {
  try {
    const sub = addPushToStartTokenListener((e) => {
      if (e.activityPushToStartToken) cb(e.activityPushToStartToken);
    });
    return () => sub.remove();
  } catch {
    return () => {};
  }
}

export async function endCallActivities(): Promise<void> {
  try {
    for (const a of CallActivity.getInstances()) await a.end("immediate");
  } catch {
    /* a phone without activities */
  }
}
