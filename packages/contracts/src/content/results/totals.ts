/**
 * What a week's or a report's posts brought, counted once (the content loop PRD's 9.3, Appendix A.8): posts up, reached
 * as each place reports it, conversations (people who wrote about a post, once each), booked from a post and it helped
 * (content's own lines), and the total: each booking any touch helped or answered counted once, listing what touched it,
 * by its state, new people and known ones apart. Ads keep their own lines and labels; a booking may show in both views,
 * which are never added together. Pure: handed posts, touches from every home, and visits.
 */
import { creditFor, creditOf, type CreditSubject, type CreditVisit } from "./credit";
import type { CreditClass } from "./sets";
import type { ContentWeekDto } from "./dtos";
import type { RecordedTouch } from "./touch";

/** A post as the totals read it: its id, and its reach as its place reported it (null where none was given). */
export interface PostReach {
  post_id: string;
  reach: number | null;
}

/** A visit as the totals read it. */
export type VisitCounted = CreditVisit & { id: string };

/** One booking in the total: the visit, its state, and every thing that touched it with its class. */
export interface CountedBooking {
  visitId: string;
  status: CreditVisit["status"];
  newPerson: boolean;
  touched: Array<CreditSubject & { class: Exclude<CreditClass, "none"> }>;
}

/** One post's own lines: its reach, the people who wrote about it, and the bookings it answered or helped. */
interface PostTotals {
  post_id: string;
  reached: number | null;
  conversations: number;
  direct: number;
  assisted: number;
}

export interface ContentTotals {
  postsUp: number;
  reached: number | null;
  conversations: number;
  direct: number;
  assisted: number;
  bookings: CountedBooking[];
  byStatus: { booked: number; kept: number; missed: number; cancelled: number };
  people: { new: number; known: number };
  /** Each post's own lines, in the order the posts were handed. A booking two posts touched is in both, and once above. */
  byPost: PostTotals[];
}

const isPost = (subject: CreditSubject) => subject.type === "post";

/** One booking counted once: what touched it, from the person's touches; null for one nothing helped or answered. */
function countedOf(visit: VisitCounted, touches: readonly RecordedTouch[]): CountedBooking | null {
  const mine = touches.filter((touch) => touch.contact_id === visit.contact_id);
  const credit = creditOf(visit, mine);
  const subjects = [...(credit.direct ? [credit.direct] : []), ...credit.assisted];
  const touched = subjects.flatMap((subject) => {
    const klass = creditFor(subject, credit);
    return klass === "none" ? [] : [{ ...subject, class: klass }];
  });
  if (touched.length === 0 || !touched.some(isPost)) return null;
  return { visitId: visit.id, status: visit.status, newPerson: mine.some((touch) => touch.new_person), touched };
}

/** What these posts brought: their own lines, and the total counted once. */
export function contentTotalsOf(world: {
  posts: readonly PostReach[];
  touches: readonly RecordedTouch[];
  visits: readonly VisitCounted[];
}): ContentTotals {
  const reaches = world.posts.flatMap((post) => (post.reach === null ? [] : [post.reach]));
  const postIds = new Set(world.posts.map((post) => post.post_id));
  const aboutPosts = world.touches.filter((touch) => isPost(touch.subject) && postIds.has(touch.subject.id));
  const bookings = world.visits.flatMap((visit) => countedOf(visit, world.touches) ?? []);
  const postClass = (booking: CountedBooking, klass: "direct" | "assisted") =>
    booking.touched.some((t) => isPost(t) && postIds.has(t.id) && t.class === klass);
  const byStatus = { booked: 0, kept: 0, missed: 0, cancelled: 0 };
  for (const booking of bookings) if (booking.status !== "proposed") byStatus[booking.status] += 1;
  const newPeople = bookings.filter((booking) => booking.newPerson).length;
  const ofPost = (postId: string, klass: "direct" | "assisted") =>
    bookings.filter((booking) => booking.touched.some((t) => isPost(t) && t.id === postId && t.class === klass)).length;
  const byPost = world.posts.map((post): PostTotals => ({
    post_id: post.post_id,
    reached: post.reach,
    conversations: new Set(
      aboutPosts.flatMap((touch) => (touch.subject.id === post.post_id && touch.contact_id ? [touch.contact_id] : [])),
    ).size,
    direct: ofPost(post.post_id, "direct"),
    assisted: ofPost(post.post_id, "assisted"),
  }));
  return {
    postsUp: world.posts.length,
    reached: reaches.length ? reaches.reduce((sum, value) => sum + value, 0) : null,
    conversations: new Set(aboutPosts.flatMap((touch) => (touch.contact_id ? [touch.contact_id] : []))).size,
    direct: bookings.filter((booking) => postClass(booking, "direct")).length,
    assisted: bookings.filter((booking) => !postClass(booking, "direct") && postClass(booking, "assisted")).length,
    bookings,
    byStatus,
    people: { new: newPeople, known: bookings.length - newPeople },
    byPost,
  };
}

/** A window's totals as the wire carries them to the week's line and to Reports (what the list of bookings leaves out). */
export function contentWeekOf(totals: ContentTotals, days: number): ContentWeekDto {
  return {
    days,
    posts_up: totals.postsUp,
    reached: totals.reached,
    conversations: totals.conversations,
    direct: totals.direct,
    assisted: totals.assisted,
  };
}

/** The week's line as Today's weekly card says it; null for a week with no post up. */
export function contentWeekSaid(week: ContentWeekDto): { title: string; line: string } | null {
  if (week.posts_up === 0) return null;
  const parts = [
    `${week.posts_up} up`,
    ...(week.reached !== null ? [`${week.reached.toLocaleString("en-US")} reached`] : []),
    ...(week.direct ? [`${week.direct} booked from a post`] : []),
    ...(week.assisted ? [`${week.assisted} it helped`] : []),
  ];
  const title = week.conversations
    ? `Your posts brought ${week.conversations} conversation${week.conversations === 1 ? "" : "s"} last week.`
    : "Your posts went up last week.";
  return { title, line: parts.join(" · ") };
}
