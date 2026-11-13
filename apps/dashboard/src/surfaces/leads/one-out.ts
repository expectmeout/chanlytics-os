/**
 * A read out once at a time for its name: asked for again under the same name while it is out, the one out answers, and
 * nothing more is asked. Leads' Load more asks so by its view and cursor, and the take of what a refresh offered by its view
 * (surface.ts): the page's own guard is React state, which two presses in one moment both read as free, and the client
 * shares an identical read for two seconds only (client/api.ts), so a slow page was asked for twice.
 */
export function oneOut<T>(): (name: string, start: () => Promise<T>) => Promise<T> {
  let out: { name: string; landed: Promise<T> } | null = null;
  return (name, start) => {
    if (out?.name === name) return out.landed;
    const landed = start().finally(() => {
      if (out?.landed === landed) out = null;
    });
    out = { name, landed };
    return landed;
  };
}
