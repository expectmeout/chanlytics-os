/**
 * What every section's head on Today shares (8 Nov 2026: five kinds of head, a small label outside one card and titles
 * inside the others, a pill under one, a word in another, a chevron in a third). A head is its name (`tz-name`), one quiet
 * fact (`tz-fact`) and at its right edge one press: a word and › goes to a page, this door; a chevron, with a word where
 * it says more, opens here. Each head wears the classes, and zones.css draws them.
 */
import { Icon } from "../../kit/icon/icon";
import { routeDoor } from "../../frame-verbs";
import { doorGlyph } from "../shell";

/** The door at the right of a section's head. Called, not drawn. */
export function zoneDoor(to: string, label: string, testid?: string) {
  return (
    <a className="tz-door" {...routeDoor(to)} data-testid={testid}>
      {label}
      <Icon name={doorGlyph()} size={12} />
    </a>
  );
}
