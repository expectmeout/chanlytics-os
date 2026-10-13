/**
 * The kit's copy (kit.css, "Copy"; canvas A, M5): a press that puts words on the clipboard and says so where it was
 * pressed, its label turning to a check and "Copied" for two seconds, never a toast. `useCopied` is the press and the
 * two seconds, which the Menu's copy item shares, so a copy in a menu says it in the menu, which stays open to say it.
 *
 * It draws what the gallery's Copy family draws (tooling/scripts/e2e-harness/kit-gallery.mjs). `className` is for the
 * page's layout, and comes last.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "../button/button";
import { Icon } from "../icon/icon";
import { cx } from "../variants";

/** How long a copy says "Copied" before its label comes back. */
const SAID_FOR_MS = 2_000;

/**
 * A copy's press, and whether it has just copied: the clipboard written, then two seconds of "Copied". It says so only
 * once the clipboard took the words: a browser that refuses leaves the label as it was, never a "Copied" that is not.
 */
export function useCopied(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const said = () => {
    if (!live.current) return;
    setCopied(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), SAID_FOR_MS);
  };
  const copy = (text: string) => {
    try {
      navigator.clipboard?.writeText(text).then(said, () => {});
    } catch {
      /* a browser that will not */
    }
  };
  return [copied, copy];
}

/** What a copy says once it has copied: the check, and its word. */
export function CopiedWords({ said }: { said: string }) {
  return (
    <>
      <Icon name="check" size={12} /> {said}
    </>
  );
}

type CopyButtonProps = {
  /** What it puts on the clipboard. */
  text: string;
  /** What it says at rest ("Copy the link"). */
  label: string;
  /** What it says once it has copied. */
  said?: string;
  className?: string;
  testid?: string;
};

/** Quiet words that copy, and say so in place. */
export function CopyButton({ text, label, said = "Copied", className, testid }: CopyButtonProps) {
  const [copied, copy] = useCopied();
  return (
    <Button
      variant="quiet"
      size="sm"
      className={cx("copy-btn", className)}
      data-copied={copied || undefined}
      onClick={() => copy(text)}
      data-testid={testid}
    >
      {/* The words change in place, so a screen reader hears "Copied" where the press was. */}
      <span aria-live="polite">{copied ? <CopiedWords said={said} /> : label}</span>
    </Button>
  );
}
