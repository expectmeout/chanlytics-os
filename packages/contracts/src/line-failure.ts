/**
 * A failure at the vault that keeps a line's credentials, told from a
 * carrier's failure by the saga's own words (edge/lib/lines.ts: "reading the
 * line's credentials", "keeping the line's credentials"; lines-saga.ts: "the
 * subaccount's token is missing from the vault"). On the row it looked like
 * any other stopped setup and offered the same Retry, which ran into the
 * same wall until a person restored the credentials. Its own module so the
 * Setup rows and the capability status can both read it without a cycle.
 */
export function lineCredentialFailure(lastError: string | null | undefined): boolean {
  return !!lastError && /the line's credentials|missing from the vault/i.test(lastError);
}

export const LINE_CREDENTIALS_SENTENCE = "the vault that keeps the line's credentials";
