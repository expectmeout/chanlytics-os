/**
 * A made post that is up on the business's Instagram (decision 0121): how it went up, and where to see it. A post is made, and
 * stopped, in Content's one sheet (Post it, campaigns/content/post-both.tsx); this is the door its row keeps to the post once
 * it is up.
 */
import { ON_INSTAGRAM, type PostDto } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";

/** Where the post that is up on Instagram is: as what it went up, and where to see it. */
export function PostOnInstagram({ post }: { post: PostDto }) {
  return (
    <div className="files-made-from" data-testid="post-on-instagram" data-status={post.status}>
      <span className="files-from">
        {ON_INSTAGRAM.status[post.status]}, {ON_INSTAGRAM.kind[post.kind]}
      </span>
      {post.status === "published" && post.permalink ? (
        <Button
          size="text"
          variant="quiet"
          href={post.permalink}
          target="_blank"
          rel="noreferrer"
          data-testid="post-instagram-see"
        >
          {ON_INSTAGRAM.see}
          <Icon name="external" size={11} />
        </Button>
      ) : null}
    </div>
  );
}
