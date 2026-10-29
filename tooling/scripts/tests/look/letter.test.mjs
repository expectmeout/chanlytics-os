/**
 * The letter (contracts look/letter.ts, decision 0075): the business's look at the top, its words escaped, one button
 * in its colour, who sent it; and the sign-up confirmation written on it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmPageWords, letterHtml, signupConfirmEmailHtml } from "@chanlytics/contracts";

const LOOK = { business: "Harbor <Studio>", logo_url: "https://x.example/l.png", accent: "#2a6f97" };

test("a letter wears the business's logo and colour, says its words escaped, one button, and who sent it", () => {
  const html = letterHtml({
    look: LOOK,
    subject: "Confirm & go",
    preview: "First line",
    lines: ["Hello <you>", "Second"],
    button: { words: "Yes, do it", href: "https://x.example/c/a?b=1&c=2" },
    foot: ["A foot line"],
  });
  assert.match(html, /<img[^>]+src="https:\/\/x\.example\/l\.png"/);
  assert.match(html, /Harbor &lt;Studio&gt;/);
  assert.match(html, /Hello &lt;you&gt;/);
  assert.match(html, /background:#2a6f97/);
  assert.match(html, /href="https:\/\/x\.example\/c\/a\?b=1&amp;c=2"[^>]*>Yes, do it</);
  assert.match(html, /A foot line/);
  assert.match(html, /Sent for Harbor &lt;Studio&gt; by Chanlytics\./);
  assert.match(html, /<title>Confirm &amp; go<\/title>/);
  assert.match(html, /prefers-color-scheme:dark/);
  assert.ok(html.indexOf("First line") < html.indexOf("<table"), "the preview line comes first, hidden");
});

test("with no logo the name is the wordmark; with no colour the button is ink; a light colour is darkened", () => {
  const plain = letterHtml({
    look: { business: "Nails & Co", logo_url: null, accent: null },
    subject: "s",
    preview: "",
    lines: ["x"],
    button: { words: "Go", href: "https://x.example" },
    foot: [],
  });
  assert.ok(!/<img/.test(plain));
  assert.match(plain, /Nails &amp; Co/);
  assert.match(plain, /background:#1f2026/);
  const light = letterHtml({
    look: { business: "N", logo_url: null, accent: "#ffe066" },
    subject: "s",
    preview: "",
    lines: ["x"],
    button: { words: "Go", href: "https://x.example" },
    foot: [],
  });
  assert.ok(!/#ffe066/.test(light), "never the unreadable colour as given");
  const none = letterHtml({ look: LOOK, subject: "s", preview: "", lines: ["x"], button: null, foot: [] });
  assert.ok(!/<a href/.test(none), "no button, no link");
});

test("the sign-up confirmation is a letter: the page's own button words, the link, nothing that sells", () => {
  const html = signupConfirmEmailHtml({ business: "Harbor Studio", link: "https://app.example.com/c/abc", look: LOOK });
  const button = confirmPageWords("ask", { business: "Harbor Studio", address: null }).button;
  assert.match(html, new RegExp(`href="https://app\\.example\\.com/c/abc"[^>]*>${button}<`));
  assert.match(html, /You signed up on Harbor Studio&#39;s website for offers and news\./);
  assert.match(html, /If this wasn&#39;t you, ignore this email\./);
  assert.match(html, /<title>Confirm your sign-up with Harbor Studio<\/title>/);
  const unnamed = signupConfirmEmailHtml({
    business: " ",
    link: "https://app.example.com/c/abc",
    look: { business: " ", logo_url: null, accent: null },
  });
  assert.match(unnamed, /You signed up on us&#39;s website/);
  assert.match(unnamed, /Sent for us by Chanlytics\./, "a nameless business is still named for the reader");
});
