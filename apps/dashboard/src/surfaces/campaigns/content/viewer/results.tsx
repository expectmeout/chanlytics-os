/**
 * How it did and What it brought, under Where it goes (the content loop's pass 2; the journey canvas, Piece cell 10 and
 * PieceDesk cell 32, and the Results board's cells 9 to 11, approved by Ruben on 23 Nov 2026): the place's numbers in
 * one line, a number it does not give said and never a zero, comments as Instagram counts them; the people its posts
 * brought, new ones and known ones apart, each opening their page; and the post's one link, copied or made. Every
 * sentence is contracts' (pieceResultsSaid); this reads `GET files/[id]/results` once the piece has a post up, and again
 * after its link is made. Nothing here moves by itself.
 */
import { Fragment, useCallback, useEffect, useId, useState } from "react";
import {
  addressOf,
  broughtChainOf,
  type ChainOpens,
  type PieceAdDto,
  pieceResultLineOf,
  pieceResultsSaid,
  type BroughtSaid,
  type PieceResultsDto,
  type ResultLinePart,
} from "@chanlytics/contracts";
import { read } from "@/bridge/api";
import { makePiecePostLink } from "@/bridge/verbs/pieces";
import { routeDoor } from "../../../frame-verbs";
import { Button } from "../../../kit/button/button";
import { Face } from "../../../kit/face/face";
import { Icon } from "../../../kit/icon/icon";
import { AdsBrought } from "./ads-on-piece";
import { viewerClockOf } from "./clock";

/** What the part says of a link, by where it lands. */
const LINK_WORDS = {
  title: "Its link",
  chat: "Opens a chat with you",
  booking: "Opens your booking page",
  none: "A link that opens a chat with you",
  made: "Made when you ask for it",
  make: "Make its link",
  copy: "Copy",
  copied: "Copied",
  opened: (n: number) => `Opened ${n === 1 ? "once" : `${n.toLocaleString("en-US")} times`}`,
  chatNote: "Put it in your profile or on a printed card: a booking asked for from it is put down to this post.",
  bookingNote: "Bookings made on your booking page can't be traced to a post. Opens are opens, not people.",
} as const;

/** The part's headings, as the canvas draws them. */
const RESULTS_WORDS = {
  howItDid: "How it did",
  brought: "What it brought",
  fromPost: "From the post",
  chainOpen: "How they got here",
  chainClose: "Hide",
  fromAd: (booked: boolean) => (booked ? "Wrote from the ad · booked" : "Wrote from the ad"),
  once: "Someone who wrote from both counts once, under the first.",
  newPeople: "New to you",
  known: "People you knew",
} as const;

/** A piece's results as its route answers them: the post's, and the ads made from it apart (pass 6). */
type PieceResultsRead = PieceResultsDto & {
  ads?: readonly PieceAdDto[];
  ad_people?: readonly { id: string; name: string; first_at: string; booked: boolean }[];
};

/** The piece's results and how to read them again (after its link is made). */
interface PieceResultsHeld {
  data: PieceResultsRead | null;
  again: () => void;
}

/**
 * The piece's results, read once for a piece AI made (its posts' numbers, and the ads made from it); null until then, or
 * where the read did not answer. The sheet reads it once and hands it to Where it goes and to its own part.
 */
export function usePieceResults(fileId: string, on: boolean): PieceResultsHeld {
  const [data, setData] = useState<PieceResultsRead | null>(null);
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    if (!on) return undefined;
    let live = true;
    read("GET files/[id]/results", { params: { id: fileId } }).then(
      (answer) => {
        if (live) setData(answer);
      },
      () => {
        if (live) setData(null);
      },
    );
    return () => {
      live = false;
    };
  }, [fileId, on, turn]);
  return { data, again: useCallback(() => setTurn((n) => n + 1), []) };
}

/** One person the piece brought: their initials, their name, what they did; opens their page. */
function BroughtLine({ row }: { row: BroughtSaid }) {
  const initials = row.name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <a
      className="cnv-goes-line cnv-brought"
      {...routeDoor(addressOf({ kind: "person", id: row.contactId }))}
      data-testid="cnv-brought"
    >
      <Face person={{ name: row.name, initials }} size="sm" />
      <span className="cnv-goes-words">
        <b>{row.name}</b>
        <span className="cnv-goes-said">{row.line}</span>
      </span>
    </a>
  );
}

/** A person's chain, as the piece says it. */
type Chain = NonNullable<ReturnType<typeof broughtChainOf>>;

/** Where a step of a chain opens: the conversation in Inbox, or the visit in Calendar on its day. */
const chainDoorOf = (opens: ChainOpens): string =>
  opens.kind === "conversation"
    ? addressOf({ kind: "conversation", id: opens.id })
    : addressOf({ kind: "visit", id: opens.id, day: opens.day });

/**
 * A person who booked, with their chain under them (pass 6; the canvas's Loop3): one press opens the steps that took
 * them from the post to the chair, each opening its own record, and the line that says where it ends.
 */
function BroughtChain({ row, chain }: { row: BroughtSaid; chain: Chain }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <div className="cnv-brx" data-open={open || undefined} data-testid="cnv-brought-chain">
      <BroughtLine row={row} />
      <Button
        variant="quiet"
        size="sm"
        className="cnv-brx-press"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((was) => !was)}
        data-testid="cnv-chain-open"
      >
        <Icon name={open ? "chevron-up" : "chevron-down"} size={13} />
        {open ? RESULTS_WORDS.chainClose : RESULTS_WORDS.chainOpen}
      </Button>
      {open ? (
        <div id={listId}>
          <ol className="cnv-chain">
            {chain.steps.map((step) => (
              <li key={`${step.words}-${step.when}`} data-done={step.done || undefined}>
                {step.opens ? (
                  <a {...routeDoor(chainDoorOf(step.opens))} data-testid="cnv-chain-step">
                    <span>
                      {step.words} <span className="cnv-chain-when">· {step.when}</span>
                    </span>
                    <Icon name="chevron" size={11} />
                  </a>
                ) : (
                  <span data-testid="cnv-chain-step">
                    {step.words} <span className="cnv-chain-when">· {step.when}</span>
                  </span>
                )}
              </li>
            ))}
          </ol>
          {chain.fine ? <p className="cnv-note">{chain.fine}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/** A group of people under its small heading, or nothing where it holds none; one who booked opens their chain. */
function BroughtGroup({
  title,
  rows,
  chains = new Map(),
}: {
  title: string;
  rows: readonly BroughtSaid[];
  chains?: ReadonlyMap<string, Chain>;
}) {
  if (rows.length === 0) return null;
  return (
    <>
      <p className="cnv-results-sub">
        {title} · {rows.length}
      </p>
      <div className="cnv-goes">
        {rows.map((row) => {
          const chain = chains.get(row.contactId);
          return chain ? (
            <BroughtChain key={row.contactId} row={row} chain={chain} />
          ) : (
            <BroughtLine key={row.contactId} row={row} />
          );
        })}
      </div>
    </>
  );
}

/** The post's one link: where it lands, how often it was opened, and Copy; or one press to make it. */
function PostLink({
  dto,
  fileId,
  postId,
  onMade,
}: {
  dto: PieceResultsDto;
  fileId: string;
  postId: string;
  onMade: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const link = dto.link;
  const copy = () => {
    if (!link || typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(`${window.location.origin}/l/${link.code}`).then(() => setCopied(true));
  };
  const make = async () => {
    setBusy(true);
    await makePiecePostLink(fileId, postId);
    setBusy(false);
    onMade();
  };
  const lands = link?.lands === "booking" ? "booking" : "chat";
  return (
    <>
      <h3 className="cnv-sect cnv-results-head">{LINK_WORDS.title}</h3>
      <div className="cnv-goes">
        <div className="cnv-goes-line" data-testid="cnv-post-link">
          <span className="cnv-goes-glyph" aria-hidden="true">
            <Icon name={lands === "booking" ? "calendar" : "chat"} size={15} />
          </span>
          <span className="cnv-goes-words">
            <b>{link ? LINK_WORDS[lands] : LINK_WORDS.none}</b>
            <span className="cnv-goes-said">{link ? LINK_WORDS.opened(link.opens) : LINK_WORDS.made}</span>
            <span className="cnv-goes-acts">
              {link ? (
                <Button size="sm" onClick={copy} data-testid="cnv-post-link-copy">
                  {copied ? LINK_WORDS.copied : LINK_WORDS.copy}
                </Button>
              ) : (
                <Button size="sm" onClick={() => void make()} disabled={busy} data-testid="cnv-post-link-make">
                  {LINK_WORDS.make}
                </Button>
              )}
            </span>
          </span>
        </div>
      </div>
      {link ? <p className="cnv-note">{lands === "booking" ? LINK_WORDS.bookingNote : LINK_WORDS.chatNote}</p> : null}
    </>
  );
}

/** The one line, its numbers set apart: on the piece's foot and in New ad's band (the canvas's Loop1). */
export function ResultLine({ parts }: { parts: readonly ResultLinePart[] }) {
  return (
    <p className="cnv-res" data-testid="cnv-res">
      <Icon name="chart" size={15} />
      <span>
        {parts.map((part, nth) =>
          typeof part === "string" ? <Fragment key={nth}>{part}</Fragment> : <b key={nth}>{part.number}</b>,
        )}
      </span>
    </p>
  );
}

/**
 * What a piece's posts already did, in one line right above Run as an ad (the content loop's pass 6; the canvas's Loop1,
 * approved by Ruben on 24 Nov 2026): read once a post of it went up, said in the past once it was taken down; nothing
 * before one went up.
 */
export function PieceResultLine({
  fileId,
  upPostId,
  down,
}: {
  fileId: string;
  upPostId: string | null;
  down: boolean;
}) {
  const { data } = usePieceResults(fileId, upPostId !== null);
  const parts = upPostId && data ? pieceResultLineOf(data, { down, nowMs: Date.now() }) : null;
  return parts ? <ResultLine parts={parts} /> : null;
}

/**
 * The people its post and its ads brought, each once, under what they wrote from first (pass 6; the canvas's Loop2): one
 * who wrote from the ad first leaves the post's rows, one who wrote from the post first is not an ad's row. Everyone an
 * ad brought first got in touch through it, so they are new to the business.
 */
function broughtApartOf(
  data: PieceResultsRead,
  brought: { newPeople: readonly BroughtSaid[]; known: readonly BroughtSaid[] },
): { post: { newPeople: BroughtSaid[]; known: BroughtSaid[] }; ad: BroughtSaid[] } {
  const postAt = new Map(data.people.map((person) => [person.contact_id, person.touched_at]));
  const adPeople = data.ad_people ?? [];
  const adFirst = new Set(
    adPeople.filter((one) => (postAt.get(one.id) ?? one.first_at) > one.first_at).map((one) => one.id),
  );
  const keep = (rows: readonly BroughtSaid[]) => rows.filter((row) => !adFirst.has(row.contactId));
  return {
    post: { newPeople: keep(brought.newPeople), known: keep(brought.known) },
    ad: adPeople
      .filter((one) => !postAt.has(one.id) || adFirst.has(one.id))
      .map((one) => ({ contactId: one.id, name: one.name, line: RESULTS_WORDS.fromAd(one.booked) })),
  };
}

/**
 * How it did, What it brought and its link, for a piece with a post up; nothing before then. Where it also ran as an ad,
 * What it brought says the post and the ad apart (pass 6; the canvas's Loop2), each person once, under what they wrote
 * from first.
 */
export function PieceResults({
  fileId,
  upPostId,
  held,
}: {
  fileId: string;
  upPostId: string | null;
  held: PieceResultsHeld;
}) {
  const titleId = useId();
  const { data, again } = held;
  if (!upPostId || !data) return null;
  const shown = pieceResultsSaid(data, viewerClockOf().zone, Date.now());
  const how = shown.howItDid;
  const brought = shown.whatItBrought;
  const people = broughtApartOf(data, brought);
  const zone = viewerClockOf().zone;
  const kind = (data.posts[0]?.kind ?? "picture") === "picture" ? "post" : (data.posts[0]?.kind ?? "post");
  const chains = new Map(
    data.people.flatMap((person) => {
      const chain = broughtChainOf(person, kind, zone);
      return chain ? [[person.contact_id, chain] as const] : [];
    }),
  );
  return (
    <section className="cnv-goes-part cnv-results" aria-labelledby={titleId} data-testid="cnv-results">
      <h3 className="cnv-sect" id={titleId}>
        {RESULTS_WORDS.howItDid}
      </h3>
      {how.lines.map((line) => (
        <p key={line} className="cnv-results-nums">
          {line}
        </p>
      ))}
      {how.missing.map((line) => (
        <p key={line} className="cnv-results-nums" data-missing="true">
          {line}
        </p>
      ))}
      {how.fine ? <p className="cnv-note">{how.fine}</p> : null}
      <h3 className="cnv-sect cnv-results-head">{RESULTS_WORDS.brought}</h3>
      {data.ads && data.ads.length > 0 ? <p className="cnv-results-sub">{RESULTS_WORDS.fromPost}</p> : null}
      <p className="cnv-results-nums" data-testid="cnv-brought-head">
        {brought.head}
      </p>
      <AdsBrought ads={data.ads} />
      <BroughtGroup title={RESULTS_WORDS.newPeople} rows={[...people.post.newPeople, ...people.ad]} chains={chains} />
      <BroughtGroup title={RESULTS_WORDS.known} rows={people.post.known} chains={chains} />
      {people.ad.length > 0 ? <p className="cnv-note">{RESULTS_WORDS.once}</p> : null}
      <p className="cnv-note">{brought.fine}</p>
      <PostLink dto={data} fileId={fileId} postId={upPostId} onMade={again} />
    </section>
  );
}
