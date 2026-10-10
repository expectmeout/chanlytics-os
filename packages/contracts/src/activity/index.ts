/** The activity log's reading: its families, what it may be narrowed to, and how its rows fold into lines. */
export {
  ACTIVITY_FAMILIES,
  ACTIVITY_PROBLEM_KINDS,
  ACTIVITY_SPANS,
  ACTIVITY_SPAN_DAYS,
  ACTIVITY_ACTORS,
  ACTIVITY_PAGE_WORDS,
  activityFamily,
  activityFamilyKinds,
  activityKindGroups,
  isActivityFamily,
} from "./families";
export type { ActivityFamily, ActivityKindGroup, ActivitySpan, ActivityActor } from "./families";
export { activityTone } from "./tones";
export { ACTIVITY_FOLD_KINDS, activityDoor, activityLines, activityMemberWords, activityRowsForLines } from "./lines";
export type { ActivityFoldRow, ActivityLineVM } from "./lines";
