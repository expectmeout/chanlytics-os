export function emailSubjectOf(m) {
  const email = m.meta?.email;
  return typeof email?.subject === "string" && email.subject.trim() ? email.subject.trim() : null;
}
export function emailLeftOutOf(meta) {
  const email = meta?.email;
  if (!email) return null;
  const files = Array.isArray(email.attachments) ? email.attachments : [];
  const unnamed = typeof email.more_attachments === "number" && email.more_attachments > 0 ? email.more_attachments : 0;
  const names = files.map((f) => f?.filename).filter((n) => typeof n === "string" && n.trim().length > 0);
  const total = files.length + unnamed;
  const said = [];
  if (total) {
    const rest = total - names.length;
    const listed = names.length ? `: ${names.join(", ")}${rest > 0 ? ` and ${rest} more` : ""}` : "";
    said.push(`${total === 1 ? "1 attachment was" : `${total} attachments were`} not kept${listed}.`);
  }
  if (email.truncated === true) said.push("This email was longer than Chanlytics keeps; the rest was left out.");
  return said.length ? said.join(" ") : null;
}
const QUOTE_BLOCK = /^[ \t]*(?:(?:-{2,}[ \t]*Original Message[ \t]*-{2,})|(?:_{5,})|(?:>[ \t]?))/m;
const QUOTE_ATTRIBUTION = /\bOn\b[\s\S]{0,240}?\bwrote:[ \t]*(?=\r?\n|>)/;
export function splitQuotedReply(body) {
  const cuts = [QUOTE_ATTRIBUTION.exec(body), QUOTE_BLOCK.exec(body)].filter((m) => m !== null).map((m) => m.index);
  if (cuts.length === 0) return { text: body, quoted: null };
  const cut = Math.min(...cuts);
  const text = body.slice(0, cut).trim();
  const quoted = body.slice(cut).trim();
  if (!text || !quoted) return { text: body, quoted: null };
  return { text, quoted };
}
const SIG_DASHES = /^--\s*$/;
const IMAGE_STAND_IN = /\[image:[^\]\n]*\]/i;
const LABELLED = /^[A-Za-z][\w ./-]{0,30}:\s+\S/;
const SIGN_OFF = /^(thanks|thank you|many thanks|best|best regards|kind regards|regards|warm regards|warmly|cheers|sincerely|talk soon|all the best|take care|gracias|saludos|un saludo|atentamente)\b[^.?]*$/i;
const CONTACT = /(https?:\/\/|www\.|\b[\w-]+\.(com|io|co|net|org|agency|us|ca|uk|app|dev|info|biz)\b|@[\w-]+\.|\+?\d[\d\s().-]{6,}\d)/i;
const NAME_LIKE = /^[A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){0,3}$/u;
const SENT_FROM = /^(sent from my\b|get outlook for\b|enviado desde mi\b)/i;
const SIG_MAX_LINES = 8;
const SIG_LINE_MAX = 90;
const SIG_LINE_PARTS = 3;
const blankLine = (l) => l.trim() === "";
function namesSender(line, fromName) {
  if (!fromName || /[?!]/.test(line) || line.split(/\s+/).length > 5) return false;
  const words = fromName.toLowerCase().split(/[^\p{L}'’-]+/u).filter((w) => w.length > 1);
  const said = line.toLowerCase();
  return words.some((w) => said.includes(w));
}
function signatureStart(lines, fromName) {
  const first = lines.findIndex((l) => !blankLine(l));
  if (first < 0) return null;
  const dashes = lines.findIndex((l, i) => i > first && SIG_DASHES.test(l));
  if (dashes > 0) return dashes;
  const lineAt = (i) => (lines.at(i) ?? "").trim();
  let last = lines.length - 1;
  while (last > first && !lineAt(last)) last--;
  if (last > first && SENT_FROM.test(lineAt(last))) return last;
  let blank = last;
  while (blank > first && lineAt(blank)) blank--;
  if (blank <= first) return null;
  const block = lines.slice(blank + 1, last + 1).map((l) => l.trim());
  if (block.length > SIG_MAX_LINES || block.some((l) => l.length > SIG_LINE_MAX || LABELLED.test(l))) return null;
  const [head = "", ...rest] = block;
  const signedOff = SIGN_OFF.test(head) || head.endsWith(",");
  const card = signedOff ? rest : block;
  const [name = "", ...under] = card;
  if (!name) return null;
  const pictured = card.some((l) => IMAGE_STAND_IN.test(l));
  const named = card.length >= 2 && namesSender(name, fromName);
  const shaped = NAME_LIKE.test(name) && under.some((l) => CONTACT.test(l));
  return pictured || named || shaped ? blank + 1 + (signedOff ? 1 : 0) : null;
}
const bareAddress = (s) => s.toLowerCase().replace(/^(https?:\/\/|mailto:)/, "").replace(/^www\./, "").replace(/\/$/, "");
export function tidyEmailWords(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const kept = [];
  for (const line of lines) {
    const pictured = IMAGE_STAND_IN.test(line);
    const tidy = line.replace(/\[image:[^\]\n]*\](?:[ \t]*<(?:https?:|mailto:)[^>\s]*>)?/gi, "").replace(/(\S+)[ \t]*<((?:https?:\/\/|mailto:)[^>\s]+)>/gi, (_, word, url) => {
      const address = url.replace(/^mailto:/i, "");
      return bareAddress(word) === bareAddress(url) ? address : `${word} ${address}`;
    }).replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/gi, (_, url) => url.replace(/^mailto:/i, "")).replace(/[ \t]+$/, "");
    if (pictured && blankLine(tidy)) continue;
    kept.push(blankLine(tidy) ? "" : tidy);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
export function emailPartsOf(body, fromName) {
  const { text, quoted } = splitQuotedReply(body.replace(/\r\n?/g, "\n"));
  const lines = text.split("\n");
  const at = fromName === null ? null : signatureStart(lines, fromName);
  const said = tidyEmailWords(at === null ? text : lines.slice(0, at).join("\n"));
  if (at === null || !said)
    return { said: tidyEmailWords(text), signature: null, quoted: quoted && tidyEmailWords(quoted) };
  const signed = lines.slice(SIG_DASHES.test(lines.at(at) ?? "") ? at + 1 : at).join("\n");
  return { said, signature: tidyEmailWords(signed) || null, quoted: quoted && tidyEmailWords(quoted) };
}
export function emailSignatureLine(signature) {
  return signature.split(/\n|[ \t]+\|[ \t]+/).map((p) => p.trim()).filter(Boolean).slice(0, SIG_LINE_PARTS).join(" \xB7 ");
}
const REPLY_PREFIX = /^((re|fwd?|fw|aw|sv|tr)\s*:\s*)+/i;
const subjectKey = (s) => s.replace(REPLY_PREFIX, "").trim().toLowerCase();
export function emailSubjectsOf(messages) {
  let thread = null;
  let key = "";
  const changed = /* @__PURE__ */ new Map();
  for (const m of messages) {
    const subject = m.channel === "email" ? emailSubjectOf(m) : null;
    if (!subject) continue;
    if (thread === null) thread = emailTopicOf(m);
    else if (subjectKey(subject) !== key) changed.set(m.id, subject);
    key = subjectKey(subject);
  }
  return { thread, changed };
}
export function emailTopicOf(m) {
  const subject = m.channel === "email" ? emailSubjectOf(m) : null;
  return subject ? subject.replace(REPLY_PREFIX, "").trim() || subject : null;
}
export function emailFromNameOf(m) {
  if (m.sender !== "customer") return null;
  const name = m.meta?.email?.from_name;
  return typeof name === "string" && name.trim() ? name.trim() : "";
}
