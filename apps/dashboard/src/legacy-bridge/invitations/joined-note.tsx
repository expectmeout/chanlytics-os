"use client";

/**
 * Says "You joined Harbor" when the shell's one accept (accept.ts) seated the person in a workspace, in the shell's
 * toast. Drawn beside the shell (LegacyApp.tsx), as the frame's head is: the news is the shell's, not any page's, and it can
 * come from the page that is gone (the home sends a tab to its workspace after the accept), so the words wait in the tab
 * until a page that is mounted takes them.
 */
import { useEffect, useRef } from "react";
import { useLegacyToast } from "@/surfaces/legacy-verbs";
import { JOINED_EVENT, takeJoinedWords } from "./accept";

export function JoinedNote() {
  const [toast, flash] = useLegacyToast();
  // The toast's flash is a new function each render; the listeners below keep the latest.
  const say = useRef(flash);
  say.current = flash;
  useEffect(() => {
    const speak = () => {
      const words = takeJoinedWords();
      if (words) say.current({ msg: words, tone: "ok", once: "joined" });
    };
    speak();
    window.addEventListener(JOINED_EVENT, speak);
    return () => window.removeEventListener(JOINED_EVENT, speak);
  }, []);
  return <>{toast}</>;
}
