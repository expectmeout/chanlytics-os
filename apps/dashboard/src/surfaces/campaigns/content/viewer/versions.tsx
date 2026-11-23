/**
 * A made video's versions under where it goes (the version board, cell 4; 00708): each version it was drawn as, newest
 * first, with Play, and on an older one "Post this one instead", which approves it again for every place the piece was
 * set for. Nothing where it has one version.
 */
import { useId } from "react";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { fileVerbs } from "../../../files/verbs";
import { VERSION_WORDS, type VersionListed } from "../model/version";

/** Play a version: its own player, in a tab of its own, as the viewer's Open full does. */
const play = (fileId: string): void => {
  void fileVerbs.play(fileId).then((r) => {
    if (r.ok && r.data.player_url) window.open(r.data.player_url, "_blank", "noopener,noreferrer");
  });
};

export function PieceVersions({
  list,
  instead,
  may,
  busy,
}: {
  list: readonly VersionListed[];
  instead: (fileId: string) => void;
  may: boolean;
  busy: boolean;
}) {
  const titleId = useId();
  if (list.length < 2) return null;
  return (
    <section className="cnv-goes-part" aria-labelledby={titleId} data-testid="cnv-versions">
      <h3 className="cnv-sect" id={titleId}>
        {VERSION_WORDS.versions}
      </h3>
      <div className="cnv-goes">
        {list.map((v) => (
          <div key={v.n} className="cnv-goes-line" data-testid={`cnv-version-${v.n}`}>
            <span className="cnv-goes-glyph" aria-hidden="true">
              <Icon name={v.current ? "video" : "play"} size={15} />
            </span>
            <div className="cnv-goes-words">
              <b>{v.title}</b>
              <span className="cnv-goes-said">{v.said}</span>
              {/* The one open plays above; an older one plays in a tab of its own, and may go instead where posts wait. */}
              {v.current ? null : (
                <span className="cnv-goes-acts">
                  <Button size="sm" variant="quiet" onClick={() => play(v.fileId)} data-testid="cnv-version-play">
                    <Icon name="play" size={12} />
                    {VERSION_WORDS.play}
                  </Button>
                  {v.instead && may ? (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => instead(v.fileId)}
                      data-testid="cnv-version-instead"
                    >
                      {VERSION_WORDS.instead}
                    </Button>
                  ) : null}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
