/**
 * What is true of a workspace today, on its preview of the Ads: how new people first reached it over the last 30 days, read from
 * People's own report, so the page says the numbers Reports › People says. Nothing is connected and nothing is made up: until it is
 * read the page says it is counting, and where it could not be read it says so and offers again. A demo session draws its sample and
 * reads nothing. Its own read and not Reports' surface, which follows the period Reports shows.
 */
import { useEffect, useState } from "react";
import type { AdsRead } from "@chanlytics/contracts";
import { firstTouchOf } from "@chanlytics/contracts/ads-page";
import { read } from "@/legacy-bridge/api";

export interface FirstTouchHere {
  /** `read` too where nothing is asked for: there is nothing to wait for. */
  state: "reading" | "failed" | "read";
  /** The counts, once read. */
  firstTouch: AdsRead["firstTouch"];
  /** Read again, after one that failed. */
  again: () => void;
}

export function useFirstTouch(on: boolean): FirstTouchHere {
  const [held, setHeld] = useState<AdsRead["firstTouch"] | undefined>(undefined);
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    if (!on) return undefined;
    let live = true;
    read("GET reports/people", { query: { period: "30d" } }).then(
      (dto) => {
        if (live) setHeld(dto.series ? firstTouchOf(dto.series) : null);
      },
      () => {
        if (live) setHeld(null);
      },
    );
    return () => {
      live = false;
    };
  }, [on, asked]);
  const again = () => {
    setHeld(undefined);
    setAsked((n) => n + 1);
  };
  if (!on) return { state: "read", firstTouch: null, again };
  if (held === undefined) return { state: "reading", firstTouch: null, again };
  return { state: held === null ? "failed" : "read", firstTouch: held, again };
}
