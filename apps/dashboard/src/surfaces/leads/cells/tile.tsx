/**
 * The tile (D5, D6), moved from legacy/pages/leads-cells.jsx (decision 0015): the business's own mark where it has one,
 * else the listing's photo, else initials on a tint the kind of business decides. The three are stacked rather than
 * chosen, so a mark that fails to load simply uncovers the photo under it and a photo that fails uncovers the initials --
 * no state, and never a broken frame.
 */
import type { SyntheticEvent } from "react";
import type { LeadRowVM } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";

export const LeadTile = ({
  l,
  size = 48,
  onExpand,
}: {
  l: Pick<LeadRowVM, "id" | "name" | "tile">;
  size?: number;
  onExpand?: ((id: string) => void) | null;
}) => {
  const hide = (e: SyntheticEvent<HTMLImageElement> | null | undefined) => {
    const t = e && e.currentTarget;
    if (t && t.style) t.style.display = "none";
  };
  const cls = `ld-tile tint-${l.tile.tint}`;
  const layers = (
    <>
      {l.tile.image ? (
        <img className="ph" src={l.tile.image} alt="" loading="lazy" decoding="async" onError={hide} />
      ) : null}
      {l.tile.logo ? <img className="lg" src={l.tile.logo} alt="" loading="lazy" onError={hide} /> : null}
    </>
  );
  if (!onExpand)
    return (
      <span className={cls} style={{ width: size, height: size }} aria-hidden="true">
        <span className="ld-tile-initials">{l.tile.initials}</span>
        {layers}
      </span>
    );
  return (
    <button
      type="button"
      className={cls}
      style={{ width: size, height: size }}
      aria-label={`Expand ${l.name}`}
      data-testid="lead-photo"
      onClick={(e) => {
        e.stopPropagation();
        onExpand(l.id);
      }}
    >
      <span className="ld-tile-initials" aria-hidden="true">
        {l.tile.initials}
      </span>
      {layers}
      <span className="ld-tile-expand" aria-hidden="true">
        <Icon name="external" size={8} />
      </span>
    </button>
  );
};
