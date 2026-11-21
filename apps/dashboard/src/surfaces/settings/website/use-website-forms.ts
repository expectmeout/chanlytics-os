/**
 * A website's forms, read and pressed (00674): one read (`GET website-forms`) says the workspace's keys, when an entry
 * last arrived and where a site sends them. It is read as the row is drawn, again after each press, and again when the
 * owner comes back to the tab, so a site that has just moved shows its key's last use without a reload. A press answers
 * a key made or changed, the key itself shown once, never kept here past its sheet.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { WebsiteFormKeyMade, WebsiteFormsDto } from "@chanlytics/contracts";
import { read } from "@/bridge/api";
import { sendWebsiteKeyPress, type WebsiteKeyAsk } from "@/bridge/verbs/website-forms";
import { WEBSITE_FORM_WORDS } from "./words";

/** Where the read stands: still reading, read, or failed with nothing known. */
type WebsiteFormsRead = { dto: WebsiteFormsDto | null; failed: boolean };

/** The read, again on demand and when the tab is come back to, and the press that changes a key. */
export function useWebsiteForms(): WebsiteFormsRead & {
  press: (ask: WebsiteKeyAsk) => Promise<{ made: WebsiteFormKeyMade | null; ended: boolean } | { refused: string }>;
} {
  const [state, setState] = useState<WebsiteFormsRead>({ dto: null, failed: false });
  const live = useRef(true);
  const again = useCallback(async () => {
    try {
      const dto = await read("GET website-forms");
      if (live.current) setState({ dto, failed: false });
    } catch {
      // What was known stays on screen; only a page that knows nothing says it could not read.
      if (live.current) setState((was) => ({ dto: was.dto, failed: was.dto === null }));
    }
  }, []);
  useEffect(() => {
    live.current = true;
    void again();
    const back = () => {
      if (document.visibilityState === "visible") void again();
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      live.current = false;
      document.removeEventListener("visibilitychange", back);
    };
  }, [again]);
  const press = useCallback(
    async (ask: WebsiteKeyAsk) => {
      const answer = await sendWebsiteKeyPress(ask);
      void again();
      if (answer?.ok) return answer.data;
      // The refusal in the house's words: why it can't be done, or that a press with no answer may have gone (the
      // keys are read again either way, so the list shows where they stand); never "try again" over one that went.
      return { refused: answer?.message ?? WEBSITE_FORM_WORDS.pressUnknown };
    },
    [again],
  );
  return { ...state, press };
}
