/**
 * The lists this member pinned to Today (moved from pages/dashboard-a-week.jsx, decision 0015, step 4). Their counts are
 * People's lists' (people-lists.ts, its rules and their schemas), which the row asks for as Today's page loads, beside
 * People's read it waits for anyway: read off the window, the frame installed them for every page's first load (the
 * loadability review, 19 Oct 2026).
 */
import { LIST_GROUP_WORDS, type PeopleListsLike } from "@chanlytics/contracts";
import { codeOnce } from "@/lib/code-once";
import { useCode } from "@/lib/use-code";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { appNavigate, borrowed, doorGlyph, useMoved } from "../shell";

/** People's lists' code: asked for once, as Today's page loads; a fetch that failed is asked for again as the row draws. */
const listsCode = codeOnce(() => import("../../people/people-lists"));

/** People's lists' code is in (a test draws the row once it is). */
export const pinsReady: Promise<void> = listsCode().then(
  () => undefined,
  () => undefined,
);

// The lists this member pinned to Today (decision 0009: any list is a door here, built-in or their own), each with its
// count (Today's own read of them, People's until it lands) and the page it opens. A pane of the bento as the day's card is:
// its head with the door to People, and each list a figure in the card's own shape, the count over the list's name, the
// figure itself the press (Ruben, 20 Oct 2026: a quiet row of chips under the cards read as unfinished). Drawn only when
// something is pinned; a list that isn't here now is left out (contracts todayPins), and comes back with its list.
export const TodayPins = () => {
  useMoved("people");
  // Their counts, read on Today (today/pins-surface.ts; R10).
  useMoved("today_pins");
  const lists = useCode(listsCode, true).loaded;
  const P = borrowed<PeopleListsLike>("__PEOPLE");
  if (!P || !lists) return null;
  const pins = lists.lists.pinned();
  if (!pins.length) return null;
  return (
    <section className="tsec tp" data-testid="today-pins" aria-labelledby="today-pins-title">
      <div className="tc-head">
        {/* Any list pins here, one of the ready-made ones or one of your own (decision 0009): the pane is named for the pin. */}
        <h2 className="tc-title" id="today-pins-title">
          {LIST_GROUP_WORDS.pinned}
        </h2>
        <Button variant="quiet" size="sm" aria-label="Open People" onClick={() => appNavigate("clients")}>
          People <Icon name={doorGlyph()} size={11} />
        </Button>
      </div>
      <div className="tc-figs">
        {pins.map((p) => (
          <div key={p.token} className="tc-fig" data-testid="today-pin">
            <button
              type="button"
              className="tc-fig-btn"
              onClick={() => appNavigate(p.to)}
              aria-label={`Open ${p.label} on People`}
            >
              {/* A list People can't count says so with a dash, never a zero it doesn't know. */}
              <span className="tc-fig-n tabular">{p.count ?? "—"}</span>
              <span className="tc-fig-w">{p.label}</span>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
};
