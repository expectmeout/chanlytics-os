/**
 * FieldError, the one way a field says what is wrong with it (moved whole from data-bits.jsx, decision 0015: the kit's
 * one implementation, which seed-globals publishes as window.FieldError for the pages that still read it).
 *
 * Six forms coloured their own hint red inline, one had a class of its own, and none was announced. One sentence under
 * the box it belongs to, read out as it appears, with the id the box names:
 *
 *   <input aria-invalid={error ? true : undefined} aria-describedby={error ? "list-name-error" : undefined} />
 *   <FieldError id="list-name-error" message={error} />
 */
import type { ReactNode } from "react";
import { Icon } from "../icon/icon";

interface FieldErrorProps {
  id?: string | null;
  message?: ReactNode;
  testid?: string | null;
}

/** What is wrong with a field, drawn only when there is something to say. */
export function FieldError({ id = null, message = null, testid = null }: FieldErrorProps) {
  if (!message) return null;
  return (
    <span className="field-error" id={id || undefined} role="alert" data-testid={testid || undefined}>
      <Icon name="alert" size={11} />
      <span className="field-error-words">{message}</span>
    </span>
  );
}
