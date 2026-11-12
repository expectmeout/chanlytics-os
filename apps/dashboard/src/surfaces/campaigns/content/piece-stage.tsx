/**
 * An open piece's picture, on the stage (the content canvas, "Opening a piece"): a video's player with its poster first
 * (files/video-player.tsx), a made post in the shape chosen, Files' own frame (files/post-frame.tsx) with Files' own choice
 * of shape under it, or a photo of the library as it is. Each is Files' part, drawn on a dark ground at the piece's own
 * shape and no taller than the screen leaves it.
 */
import { POST_SHAPES, POST_WORDS, fileViewOf, type FileDto, type PostShapeName } from "@chanlytics/contracts";
import { Picture } from "../../files/photo";
import { PostChoice } from "../../files/post-choice";
import { PostFrame } from "../../files/post-frame";
import { postShapeAddress } from "../../files/post-shapes";
import { VideoOpened } from "../../files/video-player";
import { tileShapeOf } from "./model/tiles";

export function PieceStage({
  file,
  said,
  shape,
  choose,
}: {
  file: FileDto;
  said: string;
  /** A post's shape on show: what Save saves. */
  shape: PostShapeName;
  /** The choice of shape, offered while nothing is being written under the picture; null hides it. */
  choose: ((shape: PostShapeName) => void) | null;
}) {
  if (file.kind === "video")
    return (
      <div className="cnv-stage" data-shape={tileShapeOf(file)} data-testid="cnv-stage">
        <VideoOpened file={file} said={said} />
      </div>
    );
  const alt = file.line ?? said;
  // A photo of the library is itself: no shapes, which a post Ask made has.
  if (file.source !== "made")
    return (
      <div className="cnv-stage" data-shape={tileShapeOf(file)} data-testid="cnv-stage">
        <Picture src={`${fileViewOf(file.id)}?w=1280`} alt={alt} name={said} big />
      </div>
    );
  return (
    <>
      <div className="cnv-stage" data-shape={shape === "square" ? "square" : "tall"} data-testid="cnv-stage">
        <PostFrame src={postShapeAddress(file.id, shape)} shape={shape} alt={alt} waiting={alt} />
      </div>
      {choose ? (
        <PostChoice
          label={POST_WORDS.shapesSaid}
          options={POST_SHAPES}
          words={POST_WORDS.shapes}
          value={shape}
          choose={choose}
          testid="cnv-shape"
        />
      ) : null}
    </>
  );
}
