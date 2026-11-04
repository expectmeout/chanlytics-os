/**
 * A box that stands on a phone's keys rises with them in one glide: an open thread's reply box (mobile.css), as Ask's
 * field does (ask/hooks.ts ahSlide). The screen makes the keys' room at once as a field in it is focused (keyboard.ts:
 * kb-expected, --kb-last), so the browser finds the field above where the keys land and lifts nothing. Drawn as it
 * stood, the box went up by the whole room in one frame, and the conversation with it (336px of an iPhone's keyboard
 * and 50 of Safari's address over it; 3 Nov 2026). What the eye sees is played over the keys' own beat instead: a still
 * copy of the box that React never holds goes from where the box stood to where it stands, the box itself held clear
 * meanwhile (its field keeps the focus and takes what is typed), and the box that scrolls what stands above it reaches
 * down to the copy's top and is given its place back as the copy rises, so the conversation goes up with it (the
 * thread's scroll to its end holds the newest message on its foot). The box has no ground of its own (the page's light
 * is under it, mobile.css), so nothing else need keep step with a copy the compositor moves. A translate on the box
 * itself would not do: the browser reads where the field is drawn to decide whether to lift the page. Under reduced
 * motion it is simply there.
 */
import { typesIn } from "./keyboard";
import { motionReduced } from "./swipe";

/** The keys' own beat on iOS: what they take to rise (ask/hooks.ts AH_KEYS_MS, mobile.css's 250ms). */
const KEYS_MS = 250;
/** The copy is let go a beat after it has landed, over the box it covers. */
const LANDED_MS = 30;

/** A copy nothing reaches: no id or test id, hidden from a screen reader, its fields holding what the box's hold. */
function stillCopy(box: HTMLElement): HTMLElement {
  const copy = box.cloneNode(true) as HTMLElement;
  copy.setAttribute("aria-hidden", "true");
  copy.inert = true;
  for (const el of [copy, ...Array.from(copy.querySelectorAll("[id], [data-testid]"))]) {
    el.removeAttribute("id");
    el.removeAttribute("data-testid");
  }
  const copied = copy.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>("textarea, input");
  box.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>("textarea, input").forEach((field, i) => {
    if (copied[i]) copied[i].value = field.value;
  });
  return copy;
}

/** The box from where it stood to where the room put it, `along` reaching down to it as it goes; nothing where it did not rise. */
function rise(box: HTMLElement, from: DOMRect, along: HTMLElement | null) {
  const screen = box.parentElement;
  const now = screen && box.isConnected ? box.getBoundingClientRect() : null;
  const by = now ? now.bottom - from.bottom : 0;
  if (!screen || !now || by > -2) return;
  const at = screen.getBoundingClientRect();
  const copy = stillCopy(box);
  Object.assign(copy.style, {
    position: "absolute",
    top: `${now.top - at.top}px`,
    left: `${now.left - at.left}px`,
    width: `${now.width}px`,
    margin: "0",
    pointerEvents: "none",
    transition: "none",
    translate: `0 ${-by}px`,
  });
  screen.appendChild(copy);
  box.style.opacity = "0";
  if (along) {
    along.style.transition = "none";
    along.style.marginBottom = `${by}px`;
  }
  void copy.offsetHeight;
  const beat = `${KEYS_MS}ms var(--ease-out)`;
  copy.style.transition = `translate ${beat}`;
  copy.style.translate = "0 0";
  if (along) {
    along.style.transition = `margin-bottom ${beat}`;
    along.style.marginBottom = "0px";
  }
  let landed = false;
  const land = () => {
    if (landed) return;
    landed = true;
    box.removeEventListener("focusout", land);
    copy.remove();
    box.style.removeProperty("opacity");
    if (along) {
      along.style.removeProperty("transition");
      along.style.removeProperty("margin-bottom");
    }
  };
  // Landed, or the focus gone from the box before it (sent, or the keys put away): the box is itself again at once.
  setTimeout(land, KEYS_MS + LANDED_MS);
  box.addEventListener("focusout", land);
}

/**
 * As `target`, a field in `box`, takes the focus: where the box stands is read now, before the screen makes the keys'
 * room, and a frame later, once it is made, the box rises into it (watchKeyboard hears the focus after the page does).
 * Not while the keys are up already: a field the focus moves to then needs no room.
 */
export function riseWithKeys(target: EventTarget | null, box: HTMLElement | null, along: HTMLElement | null): void {
  if (!box || !box.parentElement || !typesIn(target) || motionReduced()) return;
  if (document.documentElement.classList.contains("kb-up") || typeof requestAnimationFrame !== "function") return;
  const from = box.getBoundingClientRect();
  requestAnimationFrame(() => rise(box, from, along));
}
