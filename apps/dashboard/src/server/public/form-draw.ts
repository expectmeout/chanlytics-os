import "server-only";

/**
 * A hosted form as a visitor sees it (the Forms plan, 3.7 and 3.12; the canvas's Visitor board): the form, each mistake
 * beside its field, the thank-you, and what a closed form says. Its own small HTML, as the unsubscribe page is
 * (link-page.ts): no app bundle, the business's logo and colour, light or dark as the visitor's phone is set, in the
 * form's own language. It works with scripts blocked: a plain form posts, and the same page comes back with what is
 * wrong or the thank-you. The few lines of script it carries only send without leaving the page, keep what was typed
 * when a send fails and send again by themselves, and remember that it was sent. Nothing is checked in the browser:
 * the one rule is the server's (contracts readFormAnswers).
 *
 * Every field has its label, a mistake is announced where it stands, a choice is a finger wide, and nothing moves for
 * someone who asked for less. Drawing only: what is read and kept is form-page.ts.
 */
import {
  accentOf,
  CHOICE_KINDS,
  escapeHtml,
  fillWords,
  FORM_LIMITS,
  frameAncestorsOf,
  type FormDescription,
  type FormField,
  type FormPageWords,
} from "@chanlytics/contracts";
import type { FormTimesShown } from "./form-times";
import type { LinkPageLook } from "./link-page";

/** The page's paper and ink, light and dark, with the business's colour on the press and the chosen choice. */
const FORM_STYLE = `
:root{--bg:oklch(0.985 0.003 80);--field:oklch(1 0 0);--line:oklch(0.9 0.005 80);--ink:oklch(0.18 0.01 260);
--muted:oklch(0.42 0.01 260);--accent:oklch(0.52 0.19 25);--on-accent:#fff;--bad:oklch(0.5 0.19 27);--wa:#1f8f4e;
--on-wa:#fff;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:oklch(0.16 0.005 260);--field:oklch(0.21 0.006 260);
--line:oklch(0.3 0.008 260);--ink:oklch(0.96 0.004 80);--muted:oklch(0.74 0.008 260);--bad:oklch(0.78 0.14 25);
--wa:#2fbf6b;--on-wa:#04230f}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 "Geist","Inter",-apple-system,BlinkMacSystemFont,sans-serif}
main{max-width:560px;margin:0 auto;padding:28px 22px 12px}
.mark{display:block;height:40px;width:auto;margin:0 0 18px}
.who{margin:0 0 18px;font-weight:650}
h1{font-size:1.65rem;line-height:1.12;letter-spacing:-.02em;margin:0;text-wrap:balance}
.lead{margin:8px 0 0;color:var(--muted)}
.q{margin:20px 0 0;border:0;padding:0;min-width:0}
.q>label,.q>legend{display:block;font-weight:600;font-size:.92rem;padding:0}
.q em{font-style:normal;font-weight:400;color:var(--muted);font-size:.82rem;margin-left:5px}
.q small{display:block;color:var(--muted);font-size:.82rem;margin-top:1px}
input[type=text],input[type=email],input[type=tel],textarea{display:block;width:100%;margin-top:7px;min-height:48px;
padding:11px 14px;border:1px solid var(--line);border-radius:12px;background:var(--field);color:var(--ink);font:inherit}
textarea{min-height:92px;resize:vertical}
input:focus-visible,textarea:focus-visible,.opt input:focus-visible+span,button:focus-visible,a:focus-visible{
outline:2px solid var(--accent);outline-offset:2px}
[aria-invalid=true]{border-color:var(--bad);box-shadow:0 0 0 1px var(--bad)}
.opts{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.opt{position:relative;display:inline-flex}
.opt input{position:absolute;opacity:0;inset:0;width:100%;height:100%;margin:0;cursor:pointer}
.opt span{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border:1px solid var(--line);
border-radius:22px;background:var(--field)}
.opt input:checked+span{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent);font-weight:600}
.day{margin:12px 0 0;font-size:.82rem;font-weight:600;color:var(--muted)}
.day+.opts{margin-top:6px}
.opts.times .opt span{min-width:92px;justify-content:center;font-variant-numeric:tabular-nums}
.book{display:flex;align-items:center;gap:12px;min-height:56px;margin-top:8px;padding:11px 14px;border:1px solid var(--line);
border-radius:14px;background:var(--field);color:var(--ink);text-decoration:none}
.book>span:first-child{flex:1}.book b{display:block;font-weight:600}.book small{display:block;color:var(--muted);font-size:.82rem}
.bad,.fix{margin:6px 0 0;font-size:.86rem}
.bad{color:var(--bad)}
.fix{color:var(--muted)}
.lnk{font:inherit;color:var(--ink);background:none;border:0;padding:0;text-decoration:underline;cursor:pointer}
.go{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:52px;margin:24px 0 0;border:0;
border-radius:26px;background:var(--accent);color:var(--on-accent);font:inherit;font-weight:650;cursor:pointer;
text-decoration:none}
.go[disabled]{opacity:.6}
.go.wa{background:var(--wa);color:var(--on-wa)}
.sub{margin:12px 0 0;color:var(--muted);font-size:.86rem;text-align:center}
.sub b,.done b{color:var(--ink);font-weight:600}
.note{margin:18px 0 0;padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:var(--field);
color:var(--muted);font-size:.9rem}
.note b{display:block;color:var(--ink);font-weight:600}
.done{margin:44px 0 0;text-align:center}
.done .lead{margin-top:10px}
.tick{width:56px;height:56px;margin:0 auto 18px;border-radius:50%;display:grid;place-items:center;
background:color-mix(in oklch,var(--accent) 14%,transparent);color:var(--accent)}
.card{margin:18px 0 0;padding:14px 16px;border:1px solid var(--line);border-radius:16px;color:var(--muted);font-size:.9rem}
.card b{color:var(--ink)}
.card a{color:inherit}
.more{display:block;margin:16px 0 0;text-align:center;color:var(--muted);font-size:.9rem}
.test{margin:0;padding:9px 16px;text-align:center;font-size:.8rem;background:color-mix(in oklch,var(--accent) 13%,transparent)}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
footer{max-width:560px;margin:0 auto;padding:18px 22px 28px;display:flex;justify-content:space-between;gap:12px;
font-size:.78rem;color:var(--muted)}
footer a{color:inherit}
[hidden]{display:none}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

/**
 * The page's few lines of script: a send that stays on the page, what was typed kept when it fails and sent again by
 * itself, a page opened again after sending shown as sent, and the press saying it asks for a time once one is picked.
 * Everything it draws is the server's own answer.
 */
const FORM_SCRIPT = `(function(){var m=document.querySelector('main'),K='sent:'+location.pathname,tries=0;
try{if(/[?&]again=1/.test(location.search))sessionStorage.removeItem(K);var s=sessionStorage.getItem(K);if(s)m.innerHTML=s}catch(e){}
function wire(){var f=m.querySelector('form');if(f)f.addEventListener('submit',function(e){e.preventDefault();send(f,e.submitter)})}
function send(f,by){var b=f.querySelector('.go'),d=new FormData(f);if(by&&by.name)d.set(by.name,by.value);
b.disabled=true;if(!b.dataset.say)b.dataset.say=b.textContent;b.textContent=f.dataset.sending;
fetch(f.action,{method:'POST',headers:{'x-form':'1'},body:new URLSearchParams(d)}).then(function(r){
if(r.status>=500)throw 0;return r.text().then(function(t){m.innerHTML=t;wire();
var again=m.querySelector('template[data-again]');if(again)try{sessionStorage.setItem(K,again.innerHTML)}catch(e){}
var first=m.querySelector('[data-first]')||m.querySelector('h1');if(first){first.tabIndex=first.tabIndex||-1;first.focus()}
scrollTo(0,first&&first.matches('[data-first]')?first.getBoundingClientRect().top+scrollY-90:0)})}).catch(function(){
b.disabled=false;b.textContent=f.dataset.again;var n=f.querySelector('.unsent');if(n)n.hidden=false;
var once=function(){removeEventListener('online',once);clearTimeout(t);if(m.contains(f))send(f)};
addEventListener('online',once);var t=setTimeout(function(){if(++tries<10&&navigator.onLine!==false)once()},8000)})}
m.addEventListener('change',function(e){var t=e.target,b=m.querySelector('.go[data-ask]');
if(b&&t.closest&&t.closest('[data-times]'))b.textContent=t.value?b.dataset.ask:b.dataset.plain});
wire()})();`;

/**
 * The few lines a page framed in a business's own site adds (F4): it tells the page around it how tall it is, so the
 * frame grows with the form and nothing scrolls inside it, and takes the campaign labels of that page's address from
 * the small script beside the frame (/f/fit.js), only from a site the form may show on. Without either script the
 * frame keeps its height and scrolls inside, and the form still sends.
 */
const frameScriptOf = (sites: readonly string[]): string =>
  `(function(){if(parent===window)return;var S=${JSON.stringify(frameAncestorsOf(sites).filter((s) => s.startsWith("https://")))};
function tell(){try{parent.postMessage({chanlytics:'form',height:Math.ceil(document.documentElement.getBoundingClientRect().height)},'*')}catch(e){}}
if(window.ResizeObserver)new ResizeObserver(tell).observe(document.documentElement);else addEventListener('resize',tell);
addEventListener('load',tell);tell();
addEventListener('message',function(e){if(e.source!==parent||S.indexOf(e.origin)<0||!e.data||e.data.chanlytics!=='labels')return;
var f=document.querySelector('main form'),l=e.data.labels||{};if(!f)return;
['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function(n){var v=l[n];
if(typeof v!=='string'||!v||f.querySelector('[name="'+n+'"]'))return;var i=document.createElement('input');
i.type='hidden';i.name=n;i.value=v.slice(0,120);f.appendChild(i)})})})();`;

/** How a link that leaves the form opens: beside it where the form is framed in another site's page, else in place. */
const outward = (frame: Pick<FormPageFrame, "framed">): string =>
  frame.framed ? ` target="_blank" rel="noopener"` : "";

const TICK = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const SHUT = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M8 12h8"/></svg>`;

/** The business at the top of the page: its logo, else its name. */
function businessMarkOf(look: Pick<LinkPageLook, "business" | "logo_url">, business: string): string {
  if (look.logo_url)
    return `<img class="mark" src="${escapeHtml(look.logo_url)}" alt="${escapeHtml(business)}" height="40">`;
  return `<p class="who">${escapeHtml(business)}</p>`;
}

/** The page's style, with the business's colour where it has one. */
function styleOf(look: Pick<LinkPageLook, "accent">): string {
  if (!look.accent) return FORM_STYLE;
  const accent = accentOf(look);
  return `${FORM_STYLE}\n:root{--accent:${accent};--on-accent:#fff}\n@media (prefers-color-scheme:dark){:root{--accent:${accent};--on-accent:#fff}}`;
}

/** What a page of the form is drawn from, whatever it shows. */
export interface FormPageFrame {
  look: LinkPageLook;
  business: string;
  /** The business's own page, which holds who they are and their terms; null where it has none to open. */
  businessHref: string | null;
  lang: string;
  heading: string;
  intro: string | null;
  words: FormPageWords;
  /** A test its owner is sending: said in a band over the page. */
  test: boolean;
  /** Framed in a business's own page (F4), and the sites it may show on: its links open beside it. */
  framed: { sites: readonly string[] } | null;
}

/** The whole document around a page's main part: its head, what a pasted link shows, the footer and the script. */
export function formDocument(frame: FormPageFrame, main: string): string {
  const title = `${frame.heading} · ${frame.business}`;
  const lead = frame.intro ?? frame.heading;
  return `<!doctype html><html lang="${escapeHtml(frame.lang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(lead)}"><meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(lead)}"><meta property="og:type" content="website">${
    frame.look.logo_url ? `<meta property="og:image" content="${escapeHtml(frame.look.logo_url)}">` : ""
  }
<style>${styleOf(frame.look)}</style></head><body>${
    frame.test ? `<p class="test"><b>A test.</b> It tells nobody and counts nowhere.</p>` : ""
  }<main>${main}</main>
<footer><span>${escapeHtml(frame.business)}</span>${
    frame.businessHref
      ? `<a href="${escapeHtml(frame.businessHref)}"${outward(frame)}>${escapeHtml(frame.words.privacy)}</a>`
      : ""
  }</footer>
<script>${FORM_SCRIPT}</script>${frame.framed ? `<script>${frameScriptOf(frame.framed.sites)}</script>` : ""}</body></html>`;
}

/** What a field shows of an earlier try: what was typed or picked, what is wrong, and an address offered as a fix. */
export interface FieldShown {
  value: string | string[];
  problem: string | null;
  fix: string | null;
}

const NOTHING_SHOWN: FieldShown = { value: "", problem: null, fix: null };

/** What a typed field is to a browser: its kind of keyboard and what it may fill in by itself. */
const TYPED: Record<string, string> = {
  short: `type="text" maxlength="${FORM_LIMITS.short}"`,
  email: `type="email" inputmode="email" autocomplete="email" autocapitalize="none" maxlength="${FORM_LIMITS.email}"`,
  phone: `type="tel" inputmode="tel" autocomplete="tel" maxlength="${FORM_LIMITS.phone}"`,
};

/** The line under a field: what is wrong with it, or an address offered as a fix, pressed to take it. */
function underField(field: FormField, shown: FieldShown, words: FormPageWords): string {
  if (shown.problem) return `<p class="bad" id="p-${field.id}" role="alert">${escapeHtml(shown.problem)}</p>`;
  if (!shown.fix) return "";
  const press = `<button type="submit" class="lnk" name="fix.${field.id}" value="${escapeHtml(shown.fix)}">${escapeHtml(shown.fix)}</button>`;
  const [before, after = ""] = words.did_you_mean.split("{address}");
  return `<p class="fix" id="p-${field.id}" role="alert">${escapeHtml(before ?? "")}${press}${escapeHtml(after)}</p>`;
}

/** Where a field stands on the page: the first that is wrong, where to look; the name's, which a browser may fill in. */
interface FieldPlace {
  first: boolean;
  name: boolean;
}

/** A time the visitor picked that will not do, said over the times open now: taken since, or too short for its service. */
export interface TimeNotice {
  why: "taken" | "too_short";
  /** The time they had picked, in words; and for one too short, the service. */
  time: string;
  service: string | null;
}

/**
 * The when question as the business takes a time (form-times.ts): its open times day by day, a finger wide, with "None
 * of these work" for a request with no time; or a way to the business's own booking page, which asks nothing here and
 * opens beside the form, so what they typed stays.
 */
function drawWhen(
  field: FormField,
  shown: FieldShown,
  frame: Pick<FormPageFrame, "words" | "business">,
  shownAs: { times: Extract<FormTimesShown, { way: "requests" | "their_page" }>; notice: TimeNotice | null },
): string {
  const { words } = frame;
  const { times, notice } = shownAs;
  const legend = `<legend>${escapeHtml(field.label)}</legend>${field.help ? `<small>${escapeHtml(field.help)}</small>` : ""}`;
  if (times.way === "their_page") {
    const go = escapeHtml(fillWords(words.book_page, { business: frame.business }));
    return `<fieldset class="q">${legend}<a class="book" href="${escapeHtml(times.href)}" target="_blank" rel="noopener"><span><b>${go}</b><small>${escapeHtml(words.book_page_lead)}</small></span><span aria-hidden="true">›</span></a></fieldset>`;
  }
  const picked = typeof shown.value === "string" ? shown.value : "";
  const noticeHtml = notice
    ? `<div class="note" role="alert" data-first><b>${escapeHtml(
        notice.why === "taken"
          ? fillWords(words.time_taken, { time: notice.time })
          : fillWords(words.time_short, { service: notice.service ?? "" }),
      )}</b>${escapeHtml(notice.why === "taken" ? words.time_taken_lead : fillWords(words.time_short_lead, { time: notice.time }))}</div>`
    : "";
  // Nothing is picked for them: "None of these work" is a choice they make, never where the page starts or lands again
  // after a time was lost (the walk of 22 November).
  const chip = (value: string, label: string) =>
    `<label class="opt"><input type="radio" name="a.${field.id}" value="${escapeHtml(value)}"${
      picked !== "" && picked === value ? " checked" : ""
    }><span>${escapeHtml(label)}</span></label>`;
  const days = times.days
    .map(
      (day) =>
        `<p class="day">${escapeHtml(day.label)}</p><div class="opts times">${day.times.map((time) => chip(time.slot, time.label)).join("")}</div>`,
    )
    .join("");
  const none = `<div class="opts">${chip("", words.none_of_these)}</div>`;
  return `<fieldset class="q" data-times>${legend}${noticeHtml}${days}${none}</fieldset>`;
}

/** One field: its label, its help, its box or its choices, and what is wrong with it. */
function drawField(field: FormField, shown: FieldShown, words: FormPageWords, at: FieldPlace): string {
  const { first, name } = at;
  const id = `f-${field.id}`;
  const optional = field.needed ? "" : `<em>${escapeHtml(words.optional)}</em>`;
  const help = field.help ? `<small>${escapeHtml(field.help)}</small>` : "";
  const described = shown.problem || shown.fix ? ` aria-describedby="p-${field.id}"` : "";
  const wrong = shown.problem ? ` aria-invalid="true"` : "";
  const mark = first ? " data-first" : "";
  const under = underField(field, shown, words);
  if (CHOICE_KINDS.has(field.kind)) {
    const picked = new Set(Array.isArray(shown.value) ? shown.value : [shown.value]);
    const kind = field.kind === "several" ? "checkbox" : "radio";
    const choices = (field.choices ?? [])
      .map(
        (choice, at) =>
          `<label class="opt"><input type="${kind}" name="a.${field.id}" value="${escapeHtml(choice.id)}"${
            picked.has(choice.id) ? " checked" : ""
          }${at === 0 ? mark : ""}${described}><span>${escapeHtml(choice.label)}</span></label>`,
      )
      .join("");
    return `<fieldset class="q"${wrong}><legend>${escapeHtml(field.label)}${optional}</legend>${help}<div class="opts">${choices}</div>${under}</fieldset>`;
  }
  const typed = escapeHtml(typeof shown.value === "string" ? shown.value : "");
  const needed = field.needed ? ` aria-required="true"` : "";
  const box =
    field.kind === "long"
      ? `<textarea id="${id}" name="a.${field.id}" rows="3" maxlength="${FORM_LIMITS.long}"${needed}${wrong}${described}${mark}>${typed}</textarea>`
      : `<input id="${id}" name="a.${field.id}" ${TYPED[field.kind] ?? TYPED.short}${
          name ? ` autocomplete="name"` : ""
        } value="${typed}"${needed}${wrong}${described}${mark}>`;
  return `<div class="q"><label for="${id}">${escapeHtml(field.label)}${optional}</label>${help}${box}${under}</div>`;
}

/** What the form's page shows this time. */
export interface FormShown {
  description: FormDescription;
  /** Where the form posts: its own address. */
  action: string;
  /** What rides with the answers, unseen: the entry's id, the version, where it came from. */
  carried: Record<string, string>;
  shown: Record<string, FieldShown>;
  /** A line over the fields: the form changed while it was open, the send failed, or the answers are too long. */
  notice: "changed" | "unsent" | "too_much" | null;
  /** How the when question asks for a time (F3); absent or "ask", it asks as the form wrote it. */
  times?: FormTimesShown;
  /** A time picked that will not do, said over the times open now. */
  timeNotice?: TimeNotice | null;
}

/**
 * The press: "Send request", or where the when question shows open times, "Ask for this time" once one is picked (the
 * page's script says it as they pick; with no script, it reads as the page was drawn).
 */
function askPressOf(words: FormPageWords, asksTimes: boolean, form: FormShown): string {
  if (!asksTimes) return `<button type="submit" class="go">${escapeHtml(words.send)}</button>`;
  const when = form.description.fields.find((field) => field.kind === "when");
  const picked = when ? form.shown[when.id]?.value : "";
  const say = typeof picked === "string" && picked ? words.ask_time : words.send;
  return `<button type="submit" class="go" data-ask="${escapeHtml(words.ask_time)}" data-plain="${escapeHtml(words.send)}">${escapeHtml(say)}</button>`;
}

/** The form: its heading, its fields in order, and the press. */
export function formMain(frame: FormPageFrame, form: FormShown): string {
  const { words } = frame;
  const firstWrong = form.description.fields.find(
    (field) => form.shown[field.id]?.problem || form.shown[field.id]?.fix,
  );
  const nameField = form.description.fields.find((field) => field.kind === "short");
  const times = form.times && form.times.way !== "ask" ? form.times : null;
  const asksTimes = times?.way === "requests" && form.description.fields.some((field) => field.kind === "when");
  const sendsAway = times?.way === "their_page" && form.description.fields.some((field) => field.kind === "when");
  const fields = form.description.fields
    .map((field) =>
      times && field.kind === "when"
        ? drawWhen(field, form.shown[field.id] ?? NOTHING_SHOWN, frame, { times, notice: form.timeNotice ?? null })
        : drawField(field, form.shown[field.id] ?? NOTHING_SHOWN, words, {
            first: field === firstWrong,
            name: field === nameField,
          }),
    )
    .join("");
  // How the when question was asked, so its answer is read as it was asked (contracts readFormAnswers, `when`).
  const carried = Object.entries({
    ...form.carried,
    ...(asksTimes ? { times: "1" } : sendsAway ? { times: "page" } : {}),
  })
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join("");
  const business = { business: frame.business };
  const changed =
    form.notice === "changed"
      ? `<div class="note" role="status"><b>${escapeHtml(fillWords(words.changed, business))}</b>${escapeHtml(words.changed_lead)}</div>`
      : "";
  const tooMuch =
    form.notice === "too_much" ? `<div class="note" role="alert">${escapeHtml(words.too_much)}</div>` : "";
  const unsent = `<div class="note unsent" role="alert"${form.notice === "unsent" ? "" : " hidden"}><b>${escapeHtml(words.unsent)}</b>${escapeHtml(words.unsent_lead)}</div>`;
  return `${businessMarkOf(frame.look, frame.business)}<h1>${escapeHtml(frame.heading)}</h1>${
    frame.intro ? `<p class="lead">${escapeHtml(frame.intro)}</p>` : ""
  }${changed}<form method="post" action="${escapeHtml(form.action)}" novalidate data-sending="${escapeHtml(words.sending)}" data-again="${escapeHtml(words.try_now)}">${carried}
<div class="hp" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
${fields}${tooMuch}${unsent}${askPressOf(words, asksTimes, form)}
<p class="sub">${escapeHtml(fillWords(asksTimes ? words.time_confirm : words.booked, business))}</p></form>`;
}

/** What the thank-you says of one request. */
interface ThanksShown {
  /** The business's own thank-you words, written with the form. */
  thanks: string;
  name: string | null;
  /** Their address, where a reply by email can go to it now: null where they gave none, or the business can send none. */
  email: string | null;
  /** Their number as they would read it, where it is the only way to reach them. */
  phoneOnly: string | null;
  /** The address that opens the chat with their message ready, where the business has the chat and the form offers it. */
  chatHref: string | null;
  /** The address that opens the form for another request: through the same link, and a test where this one was. */
  againHref: string;
  /** The time they asked for, in words (F3), where they asked for one: never "booked", only asked for. */
  asked?: string | null;
}

/** The lines under the thank-you's heading: what they asked for, and how they will be answered, by what they gave. */
function roadLines(frame: FormPageFrame, thanks: ThanksShown): { lead: string; sub: string } {
  const { words } = frame;
  const timeWords = thanks.asked ?? null;
  const parts = { business: frame.business, email: thanks.email, phone: thanks.phoneOnly };
  const bold = (line: string, part: string | null) =>
    part ? escapeHtml(line).replace(escapeHtml(part), `<b>${escapeHtml(part)}</b>`) : escapeHtml(line);
  // A time asked for is said first, as asked for: the business confirms it, and nothing is booked until it does.
  const first = timeWords
    ? bold(fillWords(words.asked_for, { time: timeWords }), timeWords)
    : escapeHtml(thanks.thanks);
  const timeSub = timeWords ? escapeHtml(words.time_sub) : "";
  if (thanks.email) {
    const line = timeWords ? words.confirm_by_email : words.by_email;
    return {
      lead: `${first} ${bold(fillWords(line, parts), thanks.email)}`,
      sub: timeWords ? timeSub : thanks.chatHref ? escapeHtml(fillWords(words.chat_help, parts)) : "",
    };
  }
  if (thanks.chatHref) {
    return {
      lead: `${timeWords ? `${first} ` : ""}${escapeHtml(fillWords(words.chat_only, parts))}`,
      sub: thanks.phoneOnly ? bold(fillWords(words.or_call, parts), thanks.phoneOnly) : timeSub,
    };
  }
  if (thanks.phoneOnly) {
    return {
      lead: `${first} ${bold(fillWords(words.will_call, parts), thanks.phoneOnly)}`,
      sub: timeWords ? timeSub : escapeHtml(fillWords(words.booked, parts)),
    };
  }
  // An address the business cannot write to from here yet, and no other road: only that they will answer is said.
  return { lead: `${first} ${escapeHtml(fillWords(words.booked, parts))}`, sub: "" };
}

/**
 * The thank-you, and inside it the page as it reads when opened again after sending (kept by the script, so nobody
 * sends twice wondering): that it was sent, and what time they asked for, the chat's press, and another request as one
 * quiet press.
 */
export function thanksMain(frame: FormPageFrame, thanks: ThanksShown): string {
  const { words } = frame;
  const head = thanks.name ? fillWords(words.thanks, { name: thanks.name }) : words.thanks_plain;
  const road = roadLines(frame, thanks);
  const chat = thanks.chatHref
    ? `<a class="go wa" href="${escapeHtml(thanks.chatHref)}"${outward(frame) || ` rel="noopener"`}>${escapeHtml(words.chat)}</a>`
    : "";
  const sub = road.sub ? `<p class="sub">${road.sub}</p>` : "";
  const mark = businessMarkOf(frame.look, frame.business);
  const sent = thanks.asked
    ? fillWords(words.sent_time, { business: frame.business, time: thanks.asked })
    : fillWords(words.sent_lead, { business: frame.business });
  const again = `${mark}<div class="done"><div class="tick">${TICK}</div><h1>${escapeHtml(words.sent_already)}</h1><p class="lead">${escapeHtml(
    sent,
  )}</p></div>${chat}<a class="more" href="${escapeHtml(thanks.againHref)}">${escapeHtml(words.send_another)}</a>`;
  return `${mark}<div class="done"><div class="tick">${TICK}</div><h1>${escapeHtml(head)}</h1><p class="lead">${road.lead}</p></div>${chat}${sub}<template data-again>${again}</template>`;
}

/** A form that is off: it says so, with a way to message the business and who they are. */
export function closedMain(frame: FormPageFrame, chatHref: string | null, about: string | null): string {
  const { words } = frame;
  const business = { business: frame.business };
  const chat = chatHref
    ? `<a class="go wa" href="${escapeHtml(chatHref)}"${outward(frame) || ` rel="noopener"`}>${escapeHtml(fillWords(words.message_business, business))}</a>`
    : "";
  // Who they are: their own page where it opens, and what they do where they said. With neither, the page has named
  // them already, and a card would only say the name again.
  const named = frame.businessHref
    ? `<a href="${escapeHtml(frame.businessHref)}"${outward(frame)}>${escapeHtml(frame.business)}</a>`
    : escapeHtml(frame.business);
  const card =
    frame.businessHref || about
      ? `<div class="card"><b>${named}</b>${about ? `<br>${escapeHtml(about)}` : ""}</div>`
      : "";
  return `${businessMarkOf(frame.look, frame.business)}<div class="done"><div class="tick">${SHUT}</div><h1>${escapeHtml(words.closed)}</h1><p class="lead">${escapeHtml(
    fillWords(words.closed_lead, business),
  )}</p></div>${chat}${card}`;
}
