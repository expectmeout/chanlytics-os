/**
 * How it did and What it brought, under Where it goes (the content loop's pass 2; the journey canvas, Piece cell 10 and
 * PieceDesk cell 32, and the Results board's cells 9 to 11, approved by Ruben on 23 Nov 2026): the place's numbers in
 * one line, a number it does not give said and never a zero, comments as Instagram counts them; the people its posts
 * brought, new ones and known ones apart, each opening their page; and the post's one link, copied or made. Every
 * sentence is contracts' (pieceResultsSaid); this reads `GET files/[id]/results` once the piece has a post up, and again
 * after its link is made. Nothing here moves by itself.
 */
import { useCallback, useEffect, useId, useState } from "react";
import { addressOf, pieceResultsSaid, type BroughtSaid, type PieceResultsDto } from "@chanlytics/contracts";
import { read } from "@/bridge/api";
import { makePiecePostLink } from "@/bridge/verbs/pieces";
import { routeDoor } from "../../../frame-verbs";
import { Button } from "../../../kit/button/button";
import { Face } from "../../../kit/face/face";
import { Icon } from "../../../kit/icon/icon";
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
  newPeople: "New to you",
  known: "People you knew",
} as const;

/** The piece's results, read once it has a post up; null until then, or where the read did not answer. */
function usePieceResults(fileId: string, up: boolean): { data: PieceResultsDto | null; again: () => void } {
  const [data, setData] = useState<PieceResultsDto | null>(null);
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    if (!up) return undefined;
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
  }, [fileId, up, turn]);
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

/** A group of people under its small heading, or nothing where it holds none. */
function BroughtGroup({ title, rows }: { title: string; rows: readonly BroughtSaid[] }) {
  if (rows.length === 0) return null;
  return (
    <>
      <p className="cnv-results-sub">
        {title} · {rows.length}
      </p>
      <div className="cnv-goes">
        {rows.map((row) => (
          <BroughtLine key={row.contactId} row={row} />
        ))}
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

/** How it did, What it brought and its link, for a piece with a post up; nothing before then. */
export function PieceResults({ fileId, upPostId }: { fileId: string; upPostId: string | null }) {
  const titleId = useId();
  const { data, again } = usePieceResults(fileId, upPostId !== null);
  if (!upPostId || !data) return null;
  const shown = pieceResultsSaid(data, viewerClockOf().zone);
  const how = shown.howItDid;
  const brought = shown.whatItBrought;
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
      <p className="cnv-results-nums" data-testid="cnv-brought-head">
        {brought.head}
      </p>
      <BroughtGroup title={RESULTS_WORDS.newPeople} rows={brought.newPeople} />
      <BroughtGroup title={RESULTS_WORDS.known} rows={brought.known} />
      <p className="cnv-note">{brought.fine}</p>
      <PostLink dto={data} fileId={fileId} postId={upPostId} onMade={again} />
    </section>
  );
}
