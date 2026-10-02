/**
 * The kit's face (kit.css, "Face"): a person, a lead or a conversation, as their initials in a circle; a glyph for
 * someone known by a number or an address; and a picture over the initials, which show again when it does not load.
 * It is the one avatar: the thread's header, a call's header and Live's panel draw it at `lg`, a list's row at its own
 * size, and the photo of a customer or a company's logo, once members can add one, is passed as `photo` here and
 * reaches every place that names a person.
 * A face is decoration, hidden from a screen reader: the name beside it says who. `className` is for the page's
 * layout, and comes last; the ref reaches the element.
 *
 * It draws what the gallery's Face family draws, entry for entry (tooling/scripts/e2e-harness/kit-gallery.mjs;
 * tooling/scripts/tests/styles/kit-components.test.mjs holds the two together).
 */
import type { ComponentPropsWithRef, ReactElement, SyntheticEvent } from "react";
import { cx, variants } from "../variants";

const faceClasses = variants({
  base: "face",
  variants: { holds: { initials: "", glyph: "face-glyph" }, size: { lg: "face-lg" } },
});

/** Who it stands for: their initials, or a glyph (the Icon, at 12px) for someone known by a number or an address. */
type FaceHolds = { initials: string; glyph?: undefined } | { glyph: ReactElement; initials?: undefined };

/** A span's attributes, but the face's own: its words, the initials, and its hiding from a screen reader. */
type FaceSpan = Omit<ComponentPropsWithRef<"span">, "children" | "aria-hidden">;

/**
 * A face: who it stands for, a picture over them or none, a size where it is not the row's (`lg` is a header's, 36px),
 * and the priority of the thread it stands for (`P1` rings it in the accent under Classic; Glass draws no ring).
 */
export type FaceProps = FaceHolds & { photo?: string; size?: "lg"; priority?: string | null } & FaceSpan;

/** A picture that does not load stands aside, and the initials under it show again, as People's row does. */
function standAside(event: SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.hidden = true;
}

/** A face, its picture keyed by its address: a row that comes to hold someone else draws their picture afresh. */
export function Face({ initials, glyph, photo, size, priority, className, ...span }: FaceProps) {
  const classes = cx(faceClasses({ holds: glyph === undefined ? "initials" : "glyph", size }), className);
  return (
    <span {...span} {...(priority ? { "data-priority": priority } : {})} className={classes} aria-hidden="true">
      {glyph ?? initials}
      {photo === undefined ? null : (
        <img
          key={photo}
          className="face-photo"
          src={photo}
          alt=""
          loading="lazy"
          decoding="async"
          onError={standAside}
        />
      )}
    </span>
  );
}
