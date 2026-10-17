export const count = (n) => n.toLocaleString("en-US");
export const CHIPS_SHOWN = 3;
export function chipsMoreWords(n) {
  return `+${count(n)}`;
}
export const pluralGrouped = (n, one, many) => `${count(n)} ${n === 1 ? one : many}`;
