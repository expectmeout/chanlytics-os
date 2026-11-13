import type { Page, Route } from "@playwright/test";
import type { ContentMadeDto, ContentPageDto, FileDto, PostDto, PostPlace } from "../../packages/contracts/src/index";

/**
 * Campaigns › Content with made posts in it, whatever the workspace holds and with nothing written anywhere: the page's own
 * read (GET content), a piece's record (GET files/[id]) and its picture are answered in the browser from the pieces a spec
 * names, and so is every press on one of them (a post, Don't post, Change time, a caption kept), which never leaves the
 * browser. What a press changed is held, so the page's next read shows it, as the app's own would.
 *
 * Why answered here: a post is public, and the suite's workspace has no Instagram or Google to post to and no made post to
 * open. The routes themselves are run by the node suite (tests/instagram, tests/files); what only a browser shows is the
 * sheet as it ships, pressed and typed in as a person does.
 */

/** A file of this helper's own: no workspace holds one of these ids. */
const fileId = (n: number) => `ffffffff-0000-4000-8000-${String(n).padStart(12, "0")}`;
const postId = (n: number) => `dddddddd-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OURS = /^ffffffff-0000-4000-8000-/;
const hoursAhead = (n: number) => new Date(Date.now() + n * 3_600_000).toISOString();
const now = () => new Date().toISOString();

/** One pixel, for a piece's picture: the tile and the stage are drawn at the size the file says. */
const PICTURE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** A post Ask made from a photo, kept and ready, with the posts it holds (newest first). */
export function madePost(n: number, name: string, posts: PostDto[] = []): ContentMadeDto {
  const file: FileDto = {
    id: fileId(n),
    kind: "image",
    status: "filed",
    source: "made",
    name,
    bytes: 240_000,
    width: 1080,
    height: 1350,
    seconds: null,
    media_status: null,
    sound_said: null,
    shows: "graphic",
    who_in_it: "not_asked",
    people: null,
    look_status: "done",
    line: "A post made from a photo.",
    issues: [],
    looks_like_stock: false,
    created_at: new Date(Date.now() - n * 60_000).toISOString(),
  };
  return { file, posts };
}

/** A post set for a time ahead at a place, waiting for it. */
export function postSet(n: number, place: PostPlace, over: Partial<PostDto> & { hours: number }): PostDto {
  const { hours, ...rest } = over;
  return {
    id: postId(n),
    place,
    kind: "picture",
    caption: null,
    status: "queued",
    held_reason: null,
    permalink: null,
    scheduled_for: hoursAhead(hours),
    published_at: null,
    error: null,
    created_at: now(),
    ...rest,
  };
}

/** A press that reached a door, as it left the page. */
export interface Pressed {
  method: string;
  /** The door, as the app names it: `files/[id]/instagram`. */
  route: string;
  fileId: string;
  body: Record<string, unknown>;
}

/** What the page was given and what it pressed, for a spec to hold it to. */
export interface ContentMade {
  /** Every press on a piece, in the order it left. */
  pressed: Pressed[];
  /** The presses that reached one door. */
  at: (method: string, route: string) => Pressed[];
  /** A piece's caption as it is kept now. */
  captionOf: (fileId: string) => string | null;
  /**
   * Hold the answer to a caption being kept (PATCH files/[id]) until `release` is called: a save still on its way while
   * the next press is made, as a slow network leaves it.
   */
  holdCaptionSaves: () => { release: () => void };
}

const SOON_MS = 2 * 60_000;
const waits = (p: PostDto) => p.status === "queued" && Date.parse(p.scheduled_for) - Date.now() > SOON_MS;
const answer = (route: Route, data: unknown, status = 200) => route.fulfill({ status, json: { ok: true, data } });
const refuse = (route: Route, status: number, code: string, message: string) =>
  route.fulfill({ status, json: { ok: false, error: { code, message } } });

/** What GET content answers: All's tiles, or a view's lines, from the pieces as they stand. */
function pageOf(pieces: readonly ContentMadeDto[], query: URLSearchParams): ContentPageDto {
  const view = (query.get("view") ?? "all") as ContentPageDto["view"];
  const all = pieces.flatMap((m) => m.posts.map((post) => ({ post, file: m.file })));
  const lines =
    view === "scheduled"
      ? all.filter((l) => waits(l.post))
      : view === "posted"
        ? all.filter((l) => l.post.status === "published")
        : [];
  return {
    view,
    making: [],
    made: view === "all" ? [...pieces] : [],
    lines,
    next: null,
    tally: {
      made: pieces.length,
      posted: all.filter((l) => l.post.status === "published").length,
      needs: 0,
      making: 0,
      scheduled: all.filter((l) => waits(l.post)).length,
      library: 0,
      aside: 0,
    },
    ideas: [],
    needsOne: null,
    about: null,
  };
}

/** A piece's own record (GET files/[id]): how it was made, its caption, and both places connected and able to take it. */
function recordOf(piece: ContentMadeDto, caption: string | null) {
  return {
    file: piece.file,
    made: {
      from: { id: fileId(900), name: "front-window" },
      plan: {
        file_id: fileId(900),
        line: "Saturdays fill first",
        over: null,
        under: "Two chairs left this week",
        book: true,
        words_at: "bottom",
        voice: "modern",
        layout: "band",
        language: "en",
        people_agreed: false,
        at: null,
      },
      caption,
    },
    google: { connected: true, posted: null },
    instagram: { can: "yes", posts: piece.posts.filter((p) => p.place === "instagram") },
    // Every place's, as the record answers them (server posts/record.ts), and none put up by hand.
    posts: piece.posts,
    by_hand: null,
  };
}

/**
 * Answer the Content page from `made`, and every press on one of its pieces. Called before the page is opened, so the read
 * the document's head starts is answered here too.
 */
export async function contentMade(page: Page, made: ContentMadeDto[]): Promise<ContentMade> {
  const pieces = made.map((m) => ({ file: m.file, posts: [...m.posts] }));
  const captions = new Map<string, string | null>();
  const pressed: Pressed[] = [];
  let sent = 100;
  let held: Promise<void> | null = null;

  /** A press on a piece, answered as its door would: the piece's posts changed, so the next read says so. */
  const press = async (route: Route, piece: ContentMadeDto, door: string | undefined) => {
    const request = route.request();
    const method = request.method();
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
    pressed.push({ method, route: `files/[id]${door ? `/${door}` : ""}`, fileId: piece.file.id, body });
    const place = door === "instagram" || door === "google" ? door : null;
    if (method === "PATCH" && !door) {
      if (held) await held;
      if (typeof body.caption === "string") captions.set(piece.file.id, body.caption.trim() || null);
      return answer(route, { id: piece.file.id });
    }
    if (method === "PATCH" && door === "posts") {
      const post = piece.posts.find((p) => p.id === body.post_id);
      if (!post || !waits(post)) return refuse(route, 409, "conflict", "Its time can't change now.");
      post.scheduled_for = String(body.when);
      return answer(route, { moved: true });
    }
    if (method === "DELETE" && place && typeof body.post_id === "string") {
      const post = piece.posts.find((p) => p.id === body.post_id);
      if (post) post.status = "pulled";
      return answer(route, { pulled: true });
    }
    if (method === "POST" && place) {
      // The door keeps the words it is handed on the piece, in the same step (server posts/caption.ts keepPostWords).
      const words = place === "google" ? body.summary : body.caption;
      if (typeof words === "string" && words.trim()) captions.set(piece.file.id, words.trim());
      const when = typeof body.when === "string" ? body.when : null;
      const later = when !== null && Date.parse(when) - Date.now() > SOON_MS;
      sent += 1;
      const post: PostDto = {
        ...postSet(sent, place, { hours: 0 }),
        kind: place === "instagram" && body.as === "story" ? "story" : "picture",
        caption: typeof words === "string" ? words : null,
        scheduled_for: when ?? now(),
        // Google is up at the press; Instagram goes up through its own steps, and one with a time waits for it.
        ...(place === "google" && !later ? { status: "published" as const, published_at: now() } : {}),
      };
      piece.posts.unshift(post);
      if (place === "instagram") return answer(route, { post_id: post.id, status: "queued" });
      return answer(
        route,
        later
          ? { name: null, search_url: null, state: "scheduled" }
          : { name: `locations/1/localPosts/${sent}`, search_url: null, state: "LIVE" },
      );
    }
    return refuse(route, 404, "not_found", "That isn't here.");
  };

  await page.route(/\/api\/v1\/(content|files\/[^?]+)(\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\/v1\//, "");
    const method = route.request().method();
    if (path === "content")
      return method === "GET" ? answer(route, pageOf(pieces, url.searchParams)) : route.fallback();
    const named = /^files\/([0-9a-f-]{36})(?:\/([a-z]+))?$/.exec(path);
    // A file of the workspace's own, or a door this helper holds none of: the app's to answer.
    if (!named || !OURS.test(named[1] ?? "")) return route.fallback();
    const [, id, door] = named;
    const piece = pieces.find((m) => m.file.id === id);
    if (method === "GET" && door === "view") return route.fulfill({ contentType: "image/png", body: PICTURE });
    if (!piece) return refuse(route, 404, "not_found", "That file isn't here.");
    if (method === "GET" && !door) return answer(route, recordOf(piece, captions.get(piece.file.id) ?? null));
    if (method === "GET") return refuse(route, 404, "not_found", "That isn't here.");
    return press(route, piece, door);
  });

  return {
    pressed,
    at: (method, route) => pressed.filter((p) => p.method === method && p.route === route),
    captionOf: (id) => captions.get(id) ?? null,
    holdCaptionSaves: () => {
      let release = () => {};
      held = new Promise<void>((done) => {
        release = done;
      });
      return {
        release: () => {
          held = null;
          release();
        },
      };
    },
  };
}
