/**
 * New ad, step 2: the ad. What it is about, the photo or post, the words, how the chat starts, and how it will look; the parts
 * a platform and a door take are picked here (Google has no photo and shows its own words, the page it opens and what people
 * search; TikTok takes a video and no words; a form takes its details; Meta takes a photo or a video or a post, words, and
 * "Let Meta adjust"). Under the preview, who the ad is shown as. Nothing spends.
 */
import { PreviewBlock } from "./step-preview";
import {
  AboutSec,
  AdjustRow,
  ChatSec,
  FormSec,
  GoogleWords,
  MediaSec,
  OpensSec,
  PostsSec,
  SearchSec,
  ShownAsRow,
  WordsSec,
} from "./step-ad-parts";
import type { StepProps } from "./new-bits";

export function StepAd(p: StepProps) {
  const { platform, door, postId, postMode } = p.state.draft;
  // The words are the photo path's: a post used as it is brings its own caption, and Google and TikTok write theirs elsewhere.
  const words = platform === "meta" && (postId === null || postMode === "new-words");
  return (
    <>
      <AboutSec {...p} />
      {platform === "meta" ? <MediaSec {...p} /> : null}
      {platform === "google" ? null : <PostsSec {...p} />}
      {words ? <WordsSec {...p} /> : null}
      {platform === "google" ? <GoogleWords {...p} /> : null}
      {platform === "google" ? <OpensSec {...p} /> : null}
      {platform === "google" ? <SearchSec {...p} /> : null}
      {door === "whatsapp" ? <ChatSec {...p} /> : null}
      {door === "form" ? <FormSec {...p} /> : null}
      {platform === "meta" ? <AdjustRow {...p} /> : null}
      <PreviewBlock vm={p.vm} frame={p.state.extra.frame} onFrame={(frame) => p.setExtra({ frame })} />
      <ShownAsRow {...p} />
    </>
  );
}
