/** Android has no Live Activities: no token, nothing to end. (live-activity.ios.ts is the iOS side.) */
export function listenPushToStart(_cb: (token: string) => void): () => void {
  return () => {};
}
export async function endCallActivities(): Promise<void> {}
