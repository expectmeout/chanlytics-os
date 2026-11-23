/**
 * Reports' Content lens, as the page says it (00696; the content loop PRD's 9.3 and Appendix A.8; the journey canvas's
 * Results board, cells 12 and 13, approved by Ruben on 23 Nov 2026): one sentence of what the window's posts brought;
 * four figures (posts up, reached as the places report it, conversations, booked); every booking counted once by its
 * state, new people and known ones apart; what the counts mean; and each post's own line. A reach no place gave is said
 * as not given, never 0. A window with no post up says so, and draws no row of zeros. The noun for a booking is the
 * workspace's own word for an appointment; the verb is "booked" (docs/words.md). Pure, and the lens's alone.
 */
import { CREDIT_WINDOW_DAYS, groupedPlural, type AppointmentWord, type ContentReportDto } from "@chanlytics/contracts";

/** One figure of the lens: what it is, its number, and what sits under it. */
interface ContentFigure {
  id: "posts_up" | "reached" | "conversations" | "booked";
  label: string;
  value: string;
  meta: string | null;
}

/** The lens's words, or what it says where nothing went up. */
type ContentReportSaid =
  | { empty: true; title: string; body: string }
  | {
      empty: false;
      head: string;
      figures: ContentFigure[];
      /** "Every booking, counted once": its heading, its lines. */
      counted: { title: string; lines: string[] };
      fine: string;
      /** "By post": each post, its title and kind, and its own line. */
      byPost: { title: string; rows: Array<{ id: string; name: string; line: string }> };
    };

const KIND_NAMED: Readonly<Record<string, string>> = { reel: "reel", story: "story", picture: "post" };

const n = (count: number): string => count.toLocaleString("en-US");

/** A post's own line: its reach, the people it brought, the bookings it answered and helped; what it has. */
function postLine(post: ContentReportDto["by_post"][number]): string {
  const parts = [
    post.reached !== null ? `${n(post.reached)} reached` : "Reach not given",
    post.conversations ? groupedPlural(post.conversations, "conversation", "conversations") : null,
    post.direct ? `${n(post.direct)} booked from this post` : null,
    post.assisted ? `${n(post.assisted)} it helped` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

/** The lens's words for its window, in the workspace's word for a booking. */
export function contentReportSaid(dto: ContentReportDto, word: AppointmentWord): ContentReportSaid {
  if (dto.posts_up === 0)
    return {
      empty: true,
      title: "Nothing posted in these days.",
      body: "Once a post is up, what it brought shows here.",
    };
  const nouns = `${word}s`;
  const head = `Your posts brought ${groupedPlural(dto.conversations, "conversation", "conversations")} and ${groupedPlural(dto.total, word, nouns)}.`;
  const kinds = new Map<string, number>();
  for (const post of dto.by_post) kinds.set(post.kind, (kinds.get(post.kind) ?? 0) + 1);
  const kindsLine = [...kinds.entries()]
    .map(([kind, count]) => groupedPlural(count, KIND_NAMED[kind] ?? "post", `${KIND_NAMED[kind] ?? "post"}s`))
    .join(" · ");
  const booked = [
    dto.direct ? `${n(dto.direct)} from a post` : null,
    dto.assisted ? `${n(dto.assisted)} it helped` : null,
  ];
  return {
    empty: false,
    head,
    figures: [
      { id: "posts_up", label: "Posts up", value: n(dto.posts_up), meta: kindsLine || null },
      {
        id: "reached",
        label: "Reached",
        value: dto.reached !== null ? n(dto.reached) : "Not given",
        meta: "as Instagram counts it",
      },
      {
        id: "conversations",
        label: "Conversations",
        value: n(dto.conversations),
        meta: "people who wrote about a post",
      },
      { id: "booked", label: "Booked", value: n(dto.total), meta: booked.filter(Boolean).join(" · ") || null },
    ],
    counted: {
      title: `Every ${word}, counted once`,
      lines: [
        `${groupedPlural(dto.total, word, nouns)} · ${n(dto.by_status.booked)} booked · ${n(dto.by_status.kept)} kept · ${n(dto.by_status.missed)} missed · ${n(dto.by_status.cancelled)} cancelled`,
        `New to you · ${n(dto.people.new)} · People you knew · ${n(dto.people.known)}`,
      ],
    },
    fine: [
      dto.with_an_ad
        ? `${groupedPlural(dto.with_an_ad, "was", "were")} touched by an ad too: in Ads' count and here, and once in this total.`
        : null,
      `"It helped" counts a reply or a comment in the ${CREDIT_WINDOW_DAYS} days before someone booked another way.`,
      `${nouns.charAt(0).toUpperCase()}${nouns.slice(1)} made on your booking page can't be traced to a post.`,
    ]
      .filter(Boolean)
      .join(" "),
    byPost: {
      title: "By post",
      rows: dto.by_post.map((post) => ({
        id: post.post_id,
        name: `${post.title ?? "A post"} · ${KIND_NAMED[post.kind] ?? "post"}`,
        line: postLine(post),
      })),
    },
  };
}
