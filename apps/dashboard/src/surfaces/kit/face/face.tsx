/**
 * The kit's face (kit.css, "Face"): a person, a lead or a conversation, as their initials in a circle; a glyph for
 * someone known by a number or an address; and a picture over the initials, which show again when it does not load.
 * It is the one avatar: the thread's header, a call's header and Live's panel draw it at `lg`, a list's row at its own
 * size, and the photo of a customer or a company's logo, once members can add one, is passed as `photo` here and
 * reaches every place that names a person. A lead's own mark (a logo that is contained on its plate, never cropped to
 * the circle) is `mark`, over its photo.
 *
 * A row's face can be its checkbox (People's phone row: a tap there selects): `pick` says a selection is under way, the
 * face a ring, and that this one is in it, the face the ink with its tick. The press itself is the page's (a box lies
 * over the face, a thumb wide and unseen); the face only shows where it stands.
 *
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
  variants: { holds: { initials: "", glyph: "face-glyph" }, size: { sm: "face-sm", lg: "face-lg", xl: "face-xl" } },
});

/** Who it stands for: their initials, or a glyph (the Icon, at 12px) for someone known by a number or an address. */
type FaceHolds = { initials: string; glyph?: undefined } | { glyph: ReactElement; initials?: undefined };

/** A span's attributes, but the face's own: its words, the initials, and its hiding from a screen reader. */
type FaceSpan = Omit<ComponentPropsWithRef<"span">, "children" | "aria-hidden">;

/**
 * A face: who it stands for, a picture over them or none, a mark over that or none, a size where it is not the phone
 * row's 32px (`sm` is a desk row's, 28px; `lg` a header's, 36px; `xl` a page's head, 48px), the priority of the thread it
 * stands for (`P1` rings it in the accent under Classic; Glass draws no ring), and, where it is a row's checkbox, whether
 * a selection is under way (`choose`) and this one is in it (`chosen`).
 */
export type FaceProps = FaceHolds & {
  photo?: string;
  mark?: string;
  size?: "sm" | "lg" | "xl";
  priority?: string | null;
  pick?: "choose" | "chosen";
} & FaceSpan;

/** A picture that does not load stands aside, and the initials under it show again, as People's row does. */
function standAside(event: SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.hidden = true;
}

/** A face, its picture keyed by its address: a row that comes to hold someone else draws their picture afresh. */
export function Face({ initials, glyph, photo, mark, size, priority, pick, className, ...span }: FaceProps) {
  const classes = cx(faceClasses({ holds: glyph === undefined ? "initials" : "glyph", size }), className);
  return (
    <span
      {...span}
      {...(priority ? { "data-priority": priority } : {})}
      {...(pick ? { "data-pick": pick } : {})}
      className={classes}
      aria-hidden="true"
    >
      {glyph ?? <span>{initials}</span>}
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
      {mark === undefined ? null : (
        <img
          key={`mark:${mark}`}
          className="face-photo face-mark"
          src={mark}
          alt=""
          loading="lazy"
          decoding="async"
          onError={standAside}
        />
      )}
    </span>
  );
}
