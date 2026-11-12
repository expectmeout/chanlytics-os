/**
 * Ask's card to put a made post up (contracts content/publish.ts): the post small, as it is, beside where it goes and when,
 * and the caption that goes with it, said once (a story shows none, so where only a story goes there is none to say). Its
 * press is the card's own Post, through each place's door; Open goes to the post in Campaigns › Content.
 */
import { fileViewOf, postPublishOf, type AskProposal } from "@chanlytics/contracts";

export function AskPublishCard({ p }: { p: AskProposal }) {
  const publish = postPublishOf(p.payload ?? {});
  const captioned = !!publish.caption && (publish.places.includes("google") || publish.as === "picture");
  return (
    <div className="ask-card-change ask-publish" data-testid="ask-publish">
      <img className="ask-publish-picture" src={`${fileViewOf(publish.file_id)}?w=240`} alt="" loading="lazy" />
      <div className="ask-publish-words">
        <p className="ask-card-summary">{p.summary}</p>
        {captioned ? (
          <p className="ask-publish-caption" data-testid="ask-publish-caption">
            {publish.caption}
          </p>
        ) : null}
      </div>
    </div>
  );
}
