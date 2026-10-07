/**
 * The lists this member pinned to Today (moved from pages/dashboard-a-week.jsx, decision 0015, step 4).
 */
import type { PeopleListsLike } from "@chanlytics/contracts";
import { appNavigate, borrowed, pinnedLists, useMoved } from "../shell";

// The lists this member pinned to Today (decision 0009: any list is a door here, built-in or their own), each with its
// count from People, the page it opens. One quiet row, drawn only when something is pinned; a list that isn't here now
// is left out (contracts todayPins), and comes back with its list.
export const TodayPins = () => {
  useMoved("people");
  const P = borrowed<PeopleListsLike>("__PEOPLE");
  if (!P) return null;
  const pins = pinnedLists();
  if (!pins || !pins.length) return null;
  return (
    <section className="tsec tp" data-testid="today-pins" aria-label="Your lists">
      <span className="tp-lead">Your lists</span>
      {/* A list's name is the chip, with its button inside; its count is the tally (the one badge system). */}
      {pins.map((p) => (
        <span key={p.token} className="chip tp-pin" data-testid="today-pin">
          <button type="button" onClick={() => appNavigate(p.to)} title={`Open ${p.label} on People`}>
            {p.label}
          </button>
          {p.count !== null && <span className="tally tabular">{p.count}</span>}
        </span>
      ))}
    </section>
  );
};
