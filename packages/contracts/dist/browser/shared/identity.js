export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value) {
  return UUID.test(String(value ?? ""));
}
export function asTenantId(value) {
  if (!isUuid(value)) throw new TypeError("A tenant id is a uuid.");
  return value;
}
export function asContactId(value) {
  if (!isUuid(value)) throw new TypeError("A contact id is a uuid.");
  return value;
}
