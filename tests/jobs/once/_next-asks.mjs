/**
 * Every handler that writes a job of its own kind for its own subject while it runs, with the ask it writes (the plan
 * "Prove it works", handed on to lane 7 by lane 5). Read from each handler by hand on 28 Nov 2026: `running` is the
 * payload of the job that asks, `next` the payload it writes, each as the code builds it. The two tests beside this file
 * hold every pair to the ledger's own rule, in memory and on a real database: the ask is written beside the job that
 * wrote it, under a key of its own.
 *
 * `writer` is the handler's key in tests/jobs/writers/_job-writers.mjs, which the syntax tree holds to every place a job
 * is written, so a writer that moves or goes takes its row here with it. A new handler that asks for its own next run
 * adds its row; one that forgets is caught where it runs (packages/jobs schedule.ts refuses the ask out loud).
 *
 * Not here, and why: a kind with no once-only key is never refused (broadcast_send's next batch, outbound_send's
 * retry, line_provision's next step, lead_check, lead_round_start, push_receipts). lead_collect's key is kept past its
 * job's end and keyed by the minute on purpose: a second poll inside one minute is refused by design, and the leads
 * clock takes the run up. copy_return, file_shelve, erasure_finish and the kinds a clock hands out ask for no next run
 * of their own: a second asker joins the one in flight.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
const POST = "11111111-1111-4111-8111-111111111111";
const send = (more = {}) => ({ post_id: POST, attempt: "1", ...more });
const piece = (step, tick) => ({ piece_id: "piece-1", step, tick: String(tick) });
const digest = (step) => ({ file_id: "file-1", step, edition: "3" });
const walk = (step) => ({ source_id: "source-1", run: "4", step, walk: "first" });
const read = (stage) => ({ message_id: "message-1", ...(stage ? { stage } : {}) });
const insta = (more) => ({ handle: "harbor", ...more });

export const NEXT_ASKS = [
  // A post's send (lane 5, 00728): each ask-again counts itself, both counters always written.
  {
    writer: "apps/edge/lib/instagram/post-send.ts|post_publish",
    what: "a version of its piece is being made: asked again a minute on",
    kind: "post_publish",
    running: send(),
    next: send({ wait: "1", unread: "0" }),
  },
  {
    writer: "apps/edge/lib/instagram/post-send.ts|post_publish",
    what: "still being made: the second wait",
    kind: "post_publish",
    running: send({ wait: "1", unread: "0" }),
    next: send({ wait: "2", unread: "0" }),
  },
  {
    writer: "apps/edge/lib/instagram/post-send.ts|post_publish",
    what: "its opening could not be read: asked again a minute on",
    kind: "post_publish",
    running: send(),
    next: send({ wait: "0", unread: "1" }),
  },
  {
    writer: "apps/edge/lib/instagram/post-send.ts|post_publish",
    what: "its opening unread after a wait for a version",
    kind: "post_publish",
    running: send({ wait: "1", unread: "0" }),
    next: send({ wait: "1", unread: "1" }),
  },
  {
    writer: "apps/edge/lib/google/post-later.ts|post_google",
    what: "its opening could not be read: asked again a minute on",
    kind: "post_google",
    running: send(),
    next: send({ unread: "1" }),
  },
  {
    writer: "apps/edge/lib/google/post-later.ts|post_google",
    what: "unread again: the second ask",
    kind: "post_google",
    running: send({ unread: "1" }),
    next: send({ unread: "2" }),
  },
  {
    writer: "apps/edge/lib/google/post-later.ts|post_google",
    what: "Google was too busy: its second and last ask, ten minutes on",
    kind: "post_google",
    running: send(),
    next: send({ attempt: "2" }),
  },
  // A take-down a place gave no answer to: asked again, further apart each time.
  {
    writer: "apps/edge/lib/content/take-down.ts|post_take_down",
    what: "no answer from the place: the next ask",
    kind: "post_take_down",
    running: { action_id: "action-1", attempt: "1" },
    next: { action_id: "action-1", attempt: "2" },
  },
  {
    writer: "apps/edge/lib/content/take-down.ts|post_take_down",
    what: "after the owner's 'I deleted it': the place read again",
    kind: "post_take_down",
    running: { action_id: "action-1", attempt: "2", by_hand: "yes" },
    next: { action_id: "action-1", attempt: "3", by_hand: "yes" },
  },
  // A video being made: a step that must wait puts its own next tick on the ledger.
  {
    writer: "apps/edge/lib/files/piece-make.ts|piece_make",
    what: "its clips are not ready: the start asked again",
    kind: "piece_make",
    running: piece("start", 1),
    next: piece("start", 2),
  },
  {
    writer: "apps/edge/lib/files/piece-make.ts|piece_make",
    what: "the machine is started: its first wait",
    kind: "piece_make",
    running: piece("start", 1),
    next: piece("wait", 1),
  },
  {
    writer: "apps/edge/lib/files/piece-make.ts|piece_make",
    what: "still drawing: the next wait",
    kind: "piece_make",
    running: piece("wait", 1),
    next: piece("wait", 2),
  },
  {
    writer: "apps/edge/lib/files/piece-make.ts|piece_make",
    what: "drawn again after a stall: a start from inside a wait",
    kind: "piece_make",
    running: piece("wait", 3),
    next: piece("start", 1),
  },
  // A video made ready one step a run: each step schedules the one after it.
  ...[
    ["sheet", "audio"],
    ["audio", "words"],
    ["words", "note"],
    ["note", "look"],
  ].map(([from, to]) => ({
    writer: "apps/edge/lib/files/video-digest.ts|video_digest",
    what: `the step after ${from}`,
    kind: "video_digest",
    running: digest(from),
    next: digest(to),
  })),
  // A connection's history, a part at a time.
  {
    writer: "apps/edge/lib/imports/history-import.ts|history_import",
    what: "the next part of a mailbox's run",
    kind: "history_import",
    running: { source: "mailbox", seq: "1:1", connection_id: "mailbox-1" },
    next: { source: "mailbox", seq: "1:2", connection_id: "mailbox-1" },
  },
  // An Instagram account's read: started, then asked after until it is done.
  {
    writer: "apps/edge/lib/imports/instagram-read.ts|instagram_read",
    what: "the run is started: asked after",
    kind: "instagram_read",
    running: insta({ step: "start", try: "0" }),
    next: insta({ step: "collect", try: "1", run_id: "run-1", dataset_id: "data-1" }),
  },
  {
    writer: "apps/edge/lib/imports/instagram-read.ts|instagram_read",
    what: "still running: asked after again",
    kind: "instagram_read",
    running: insta({ step: "collect", try: "1", run_id: "run-1", dataset_id: "data-1" }),
    next: insta({ step: "collect", try: "2", run_id: "run-1", dataset_id: "data-1" }),
  },
  // A watched folder's walk: a number counts on, and a step the clock named starts counting.
  {
    writer: "apps/edge/lib/files/sources/walk.ts|source_walk",
    what: "the step after this one",
    kind: "source_walk",
    running: walk("1"),
    next: walk("2"),
  },
  {
    writer: "apps/edge/lib/files/sources/walk.ts|source_walk",
    what: "a step the clock named, carried on",
    kind: "source_walk",
    running: walk("again-29400000"),
    next: walk("again-29400000.1"),
  },
  // A reach-out's reply, read in stages: its draft, a later re-read, the note its step arrives with.
  ...[
    [null, "draft"],
    [null, "reread-1"],
    [null, "ahead"],
    ["reread-1", "reread-2"],
  ].map(([from, to]) => ({
    writer: "packages/jobs/src/handlers/reply-read.ts|reply_read",
    what: `${to}, from ${from ?? "the first read"}`,
    kind: "reply_read",
    running: read(from),
    next: read(to),
  })),
];
