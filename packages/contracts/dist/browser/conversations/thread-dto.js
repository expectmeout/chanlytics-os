import { isOptedOutContact } from "../consent/consent.js";
export function messageAt(m) {
  return m.channel_ts ?? m.created_at;
}
const OPERATOR_META_KEYS = ["pricing"];
export function memberMetaOf(meta) {
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) return null;
  const kept = { ...meta };
  for (const key of OPERATOR_META_KEYS) delete kept[key];
  return kept;
}
export function isOptedOut(dto) {
  return isOptedOutContact(dto.contact);
}
