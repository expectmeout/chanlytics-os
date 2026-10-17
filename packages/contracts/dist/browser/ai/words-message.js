export function wordsMessage(block) {
  return { role: "system", content: [block] };
}
const isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isWordsBlock = (b) => isPlainObject(b) && b.type === "text" && typeof b.text === "string" && Object.keys(b).every((k) => k === "type" || k === "text" || k === "cache_control");
export function isWordsMessage(m) {
  if (!isPlainObject(m)) return false;
  const { role, content, ...rest } = m;
  return role === "system" && Object.keys(rest).length === 0 && Array.isArray(content) && content.length > 0 && content.every(isWordsBlock);
}
export function foldWordsMessages(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.some(isWordsMessage)) return body;
  const out = [];
  for (const m of messages) {
    if (!isWordsMessage(m)) {
      out.push(m);
      continue;
    }
    let at = out.length - 1;
    while (at >= 0 && !(isPlainObject(out.at(at)) && out.at(at).role === "user")) at--;
    const turn = out.at(at);
    if (at < 0 || !isPlainObject(turn)) continue;
    const content = Array.isArray(turn.content) ? turn.content : [{ type: "text", text: typeof turn.content === "string" ? turn.content : "" }];
    out[at] = { ...turn, content: [...content.slice(0, -1), ...m.content, ...content.slice(-1)] };
  }
  return { ...body, messages: out };
}
