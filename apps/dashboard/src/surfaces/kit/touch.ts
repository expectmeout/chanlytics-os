/**
 * What the kit knows of a finger (Ruben, 8 October 2026: on a phone nothing that opens puts a person in a field by
 * itself, and everything that rises from the bottom edge goes back down by a pull).
 *
 * `onTouchScreen` is the house's one test for a touch screen, the one app/globals.css sizes every field by
 * (`pointer: coarse`): the pointer a person mostly uses is a finger. It is not a width: a narrow window on a desk
 * still has its keys, and a tablet held wide still has a keyboard that rises.
 *
 * `focusAsDrawn` is whether a text field may take focus as it is drawn. Not on a touch screen: a field that took focus
 * by itself raised the keyboard over a sheet the person had not read yet, and the phone moved the page to it. There a
 * sheet opens with itself in focus (the kit's Sheet, RecordSheet), and a tap on a field begins the typing. A mouse
 * and keys keep the field ready. An editor a press opened to type one value in place (a rename, a search its button
 * reveals) does not ask this: the press was the request to type.
 *
 * `onAPhone` is the kit's one phone width (kit.css, 900px), where its Sheet and its Menu rise from the bottom edge.
 *
 * `keepTouch` gives a gesture's handlers that keep a touch to themselves. What is drawn on the document's body is
 * still the child, to React, of whatever drew it, so its touch reaches that one's handlers too: a pull on a menu
 * opened from inside a sheet, a drawer or an open thread was read by the sheet, the drawer or the thread as well.
 */
const media = (query: string): boolean =>
  typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(query).matches;

export const onTouchScreen = (): boolean => media("(pointer: coarse)");

export const focusAsDrawn = (): boolean => !onTouchScreen();

export const onAPhone = (): boolean => media("(max-width: 900px)");

/** What a touch handler is handed, as far as this needs to know it. */
interface Touched {
  stopPropagation?: () => void;
}

export function keepTouch<H extends object>(handlers: H): H {
  const kept: Record<string, unknown> = {};
  for (const [name, handle] of Object.entries(handlers)) {
    kept[name] =
      typeof handle === "function"
        ? (e: Touched) => {
            e.stopPropagation?.();
            (handle as (e: Touched) => void)(e);
          }
        : handle;
  }
  return kept as H;
}
