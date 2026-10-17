export function lineCredentialFailure(lastError) {
  return !!lastError && /the line's credentials|missing from the vault/i.test(lastError);
}
export const LINE_CREDENTIALS_SENTENCE = "the vault that keeps the line's credentials";
