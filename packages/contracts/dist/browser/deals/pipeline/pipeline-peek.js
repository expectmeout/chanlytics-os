import { isIdentifierName } from "../../conversations/thread-contact.js";
import { dealIsOpen } from "../deal-vm.js";
import { emailFactWords, repliesWords } from "../../people/person-reach.js";
import { GROUP_WORDS, PIPELINE_WORDS } from "./pipeline-words.js";
export function pipelinePeekOf(row, group, deals = null) {
  const p = row.person;
  const facts = [];
  if (p.lastContact.label) facts.push({ id: "heard", words: p.lastContact.label });
  if (p.quote) facts.push({ id: "quote", words: `\u201C${p.quote}\u201D` });
  if (p.nextVisit) facts.push({ id: "next", words: `Coming up \xB7 ${p.nextVisit}` });
  const n = row.next;
  const known = deals ?? (p.deal ? [p.deal] : []);
  const onCard = !!n?.dealId && known.some((d) => d.id === n.dealId && dealIsOpen(d));
  if (n && !onCard) facts.push({ id: "step", words: `${PIPELINE_WORDS.columns.next} \xB7 ${n.words} \xB7 ${n.when}` });
  return {
    id: row.id,
    dealId: row.deal?.id ?? null,
    name: row.name,
    initials: p.initials,
    numeric: isIdentifierName(row.name),
    stopped: p.stopped,
    sub: row.service ? `${GROUP_WORDS[group]} \xB7 ${row.service}` : GROUP_WORDS[group],
    facts,
    thread: p.threadId
  };
}
export function pipelinePeekDetail(p) {
  const W = PIPELINE_WORDS.peek.reach;
  const reach = [];
  if (p.phone && !(p.consent && p.consent.dnc)) {
    const dial = p.phone.replace(/[^\d+]/g, "");
    reach.push({ id: "phone", label: W.phone, words: p.phone, call: dial ? `tel:${dial}` : null, copy: p.phone });
  }
  if (p.email)
    reach.push({
      id: "email",
      label: W.email,
      words: emailFactWords(p.email, p.emailSuppressed),
      call: null,
      copy: p.email
    });
  const replies = p.hasChat ? repliesWords(p.replyVia, p.replyWindow, { optedOut: p.stopped, who: p.name, emailStopped: p.emailSuppressed }) : null;
  if (replies) reach.push({ id: "replies", label: W.replies, words: replies, call: null, copy: null });
  const history = p.timeline.filter((t) => t.kind === "deal" && !t.ahead).sort((a, b) => b.ts - a.ts).slice(0, 3).map((t) => ({ id: t.id, words: t.text, when: t.day }));
  return { reach, history };
}
