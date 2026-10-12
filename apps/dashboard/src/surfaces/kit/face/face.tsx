/**
 * The kit's face (kit.css, "Face"): a person, a lead or a conversation, as their initials in a circle; a glyph for
 * someone known by a number or an address; and a picture over the initials, which show again when it does not load.
 * It is the one avatar: the thread's header, a call's header and Live's panel draw it at `lg`, a list's row at its own
 * size, and the photo of a customer or a company's logo, once members can add one, is passed as `photo` here and
 * reaches every place that names a person. A lead's own mark (a logo that is contained on its plate, never cropped to
 * the circle) is `mark`, over its photo.
 *
 * A person's face is told as `person` (their name as the page says it, and their initials): contracts decides what it
 * draws (personFaceOf, over the one test of a name that is only an identifier), so no page holds the rule. A person with a
 * name is their initials; one known only by a number is the phone glyph and one known only by an address the mail glyph,
 * on every page that names a person (D1-face-number, D1-face-email). `initials` and `glyph` stay for what is not a person
 * (a lead's tile, a teammate, a step); both are drawn by the same classes.
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
import { personFaceOf } from "@chanlytics/contracts";
import type { ComponentPropsWithRef, ReactElement, SyntheticEvent } from "react";
import { Icon } from "../icon/icon";
import { cx, variants } from "../variants";

const faceClasses = variants({
  base: "face",
  variants: { holds: { initials: "", glyph: "face-glyph" }, size: { sm: "face-sm", lg: "face-lg", xl: "face-xl" } },
});

/**
 * A person, by what the page knows of them: their name as it says it (the number or the address itself when nobody has
 * named them) and their initials where the view model has them (else contracts derives them from the name).
 */
export type FacePerson = { name: string; initials?: string };

/** What a person's glyph says to a pointer: it stands for a number or an address nobody has put a name to. */
const NO_NAME_YET = "No name yet";

/**
 * Who it stands for: a person (`person`, which contracts reads), or their initials, or a glyph (the Icon, at 12px) for
 * what is not a person's name. Exactly one.
 */
type FaceHolds =
  | { initials: string; glyph?: undefined; person?: undefined }
  | { glyph: ReactElement; initials?: undefined; person?: undefined }
  | { person: FacePerson; initials?: undefined; glyph?: undefined };

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

/**
 * What the face holds: the glyph it was given, or initials, or, for a person, what contracts says they are (personFaceOf):
 * their initials when they have a name, else the one glyph of what names them, a number's or an address's. `nameless` is
 * the person known only by that.
 */
function heldOf(who: { initials?: string; glyph?: ReactElement; person?: FacePerson }): {
  initials?: string;
  glyph?: ReactElement;
  nameless: boolean;
} {
  if (who.glyph !== undefined) return { glyph: who.glyph, nameless: false };
  if (who.person === undefined) return { initials: who.initials, nameless: false };
  const face = personFaceOf(who.person.name, who.person.initials);
  if (face.glyph === null) return { initials: face.initials, nameless: false };
  return { glyph: <Icon name={face.glyph} size={12} />, nameless: true };
}

/** A face, its picture keyed by its address: a row that comes to hold someone else draws their picture afresh. */
export function Face({ initials, glyph, person, photo, mark, size, priority, pick, className, ...span }: FaceProps) {
  const held = heldOf({ initials, glyph, person });
  const classes = cx(faceClasses({ holds: held.glyph === undefined ? "initials" : "glyph", size }), className);
  return (
    <span
      {...(held.nameless ? { title: NO_NAME_YET } : {})}
      {...span}
      {...(priority ? { "data-priority": priority } : {})}
      {...(pick ? { "data-pick": pick } : {})}
      className={classes}
      aria-hidden="true"
    >
      {held.glyph ?? <span>{held.initials}</span>}
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
