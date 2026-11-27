/**
 * The bell leaves the way it came, at every width. A popover React lets go of is put back as a still copy and played
 * out (kit/motion/leaving.ts leaveOverlay, `[data-leaving]`); the bell's popover had a leaving rule only under a phone's width, so
 * on any wider screen the copy kept the popover's own entrance, `route-in`, and came in again from nothing as the
 * popover went: the bell closed, came back for 180ms, and went (Ruben, 9 Oct 2026, seen frame by frame). Its leaving
 * is one rule outside every media query, which plays what the popover says it leaves by (`--tbn-out`): route-out, the
 * entrance's mirror. On a phone the notes are the kit's one sheet (notif-popover.tsx), which leaves as every kit sheet does
 * (kit.css `.sheet[data-leaving]`; 25 Nov 2026).
 *
 * Asked of the frame's sheets as a browser draws them (tests/_css.mjs cascadeOf), at each width the popover is drawn at.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cascadeOf, element, frameSheets } from "../_css.mjs";

/** The animation's name: the first word of the shorthand as the build prints it. */
const nameOf = (animation) => (animation ?? "").split(" ")[0];

/** The bell's popover, as the topbar draws it. */
const popover = (state = "") => element(".app-root", ".topbar", ".tbn-wrap", `.tbn-place${state}`);

test("the bell's popover leaves by one rule at every width it is drawn at: the entrance's mirror", () => {
  for (const width of [1440, 1100, 901, 900, 721]) {
    const at = cascadeOf(frameSheets(), { width });
    assert.equal(nameOf(at.style(popover()).animation), "route-in", `${width}px: the popover comes in by route-in`);
    assert.equal(
      nameOf(at.style(popover('[data-leaving="true"]')).animation),
      "route-out",
      `${width}px: and its still copy goes by route-out, the same fade the other way, never the entrance again`,
    );
  }
  const frames = cascadeOf(frameSheets());
  for (const k of ["route-in", "route-out"]) assert.ok(frames.keyframes(k), `${k} is defined`);
});

test("the bell held open wears the pressed look, which the wash over the page would otherwise keep from it", () => {
  // What a pointer on it draws: the wash over the page keeps the pointer off it, so held open it read idle.
  const desk = cascadeOf(frameSheets());
  const bell = (state) => desk.style(element(".app-root", ".topbar", `button.tb-bell${state}`));
  const held = bell('[aria-expanded="true"]');
  const pointed = bell(":hover");
  assert.deepEqual(
    [held.color, held["background-color"]],
    [pointed.color, pointed["background-color"]],
    "held open, it is drawn as a pointer on it draws it",
  );
  assert.notEqual(held.color, bell("").color, "and not as it rests");
});
