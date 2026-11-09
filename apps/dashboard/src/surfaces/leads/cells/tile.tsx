/**
 * The tile (D5, D6), moved from legacy/pages/leads-cells.jsx (decision 0015): the business's own mark where it has one,
 * else the listing's photo, else initials on a face's own fill. The three are stacked rather than
 * chosen, so a mark that fails to load simply uncovers the photo under it and a photo that fails uncovers the initials --
 * no state, and never a broken frame.
 */
import type { CSSProperties, SyntheticEvent } from "react";
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
  const cls = "ld-tile";
  // Its size as the caller asks it, said as a property the stylesheet reads (leads.css .ld-tile), so a table at its
  // compact height can set its own over it: a width written here outranks every rule.
  const sized = { "--tile": `${size}px` } as CSSProperties;
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
      <span className={cls} style={sized} aria-hidden="true">
        <span className="ld-tile-initials">{l.tile.initials}</span>
        {layers}
      </span>
    );
  return (
    <button
      type="button"
      className={cls}
      style={sized}
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
