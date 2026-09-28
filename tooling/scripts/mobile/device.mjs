/**
 * The phone app on an Android emulator or phone, from a computer: adb, the screen's accessibility tree, the WebViews'
 * DevTools, and the line the app writes to the device's log as it starts. What the walk's scripts share (sign-in.mjs,
 * cold-start.mjs, walk.mjs); docs/runbook.md, "Walk the phone app", says how they are used.
 *
 * adb is the SDK's: ANDROID_HOME or ANDROID_SDK_ROOT when set, else where Android Studio puts it (%LOCALAPPDATA%\Android
 * \Sdk on Windows, ~/Library/Android/sdk on a Mac, ~/Android/Sdk on Linux), else the `adb` on the PATH. One device at a
 * time: ANDROID_SERIAL picks it when several are attached, as adb itself reads it.
 *
 * DevTools reaches the pages only in a preview or development build (Surface.tsx webviewDebuggingEnabled); a store
 * build refuses it, which is the point.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { execFileSync } from "node:child_process";

const APP_ID = "com.chanlytics.app";
const MAIN_ACTIVITY = `${APP_ID}/.MainActivity`;
/** How often a wait looks again. */
const POLL_MS = 250;
/** Where uiautomator writes the screen: its /dev/tty form prints nothing through `adb shell` on recent Android. */
const SCREEN_DUMP = "/data/local/tmp/chanlytics-screen.xml";

function sdkRoot() {
  const set = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (set) return set;
  const home = os.homedir();
  const guess =
    process.platform === "win32"
      ? path.join(process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"), "Android", "Sdk")
      : process.platform === "darwin"
        ? path.join(home, "Library", "Android", "sdk")
        : path.join(home, "Android", "Sdk");
  return fs.existsSync(guess) ? guess : null;
}

const ADB = (() => {
  const root = sdkRoot();
  const exe = root && path.join(root, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb");
  return exe && fs.existsSync(exe) ? exe : "adb";
})();

/** One adb command's output, as text. Throws with adb's own words when it fails. */
function adb(args) {
  return execFileSync(ADB, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** The same, on the device's shell. */
export function shell(...args) {
  return adb(["shell", ...args]);
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits for `probe` to answer something other than null, undefined or false, looking every POLL_MS until `timeoutMs`. */
export async function waitFor(what, probe, timeoutMs) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const answer = await probe();
    if (answer !== null && answer !== undefined && answer !== false) return answer;
    if (Date.now() > until) throw new Error(`gave up waiting for ${what} after ${Math.round(timeoutMs / 1000)} s`);
    await sleep(POLL_MS);
  }
}

/** The one device adb would talk to, which the rest then uses; or an error saying why there is none. */
export function device() {
  const online = adb(["devices"])
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === "device")
    .map(([serial]) => serial);
  const wanted = process.env.ANDROID_SERIAL;
  const pick = wanted ? online.find((s) => s === wanted) : online.length === 1 ? online[0] : null;
  if (!pick) {
    throw new Error(
      online.length === 0
        ? "no Android device or emulator is online (adb devices lists none)"
        : wanted
          ? `ANDROID_SERIAL=${wanted} is not online`
          : `several devices are online (${online.join(", ")}): set ANDROID_SERIAL`,
    );
  }
  process.env.ANDROID_SERIAL = pick;
  return pick;
}

/** The app's version as the package manager says it, or null when the app is not installed. */
export function installed() {
  return /versionName=(\S+)/.exec(shell("dumpsys", "package", APP_ID))?.[1] ?? null;
}

export function stopApp() {
  shell("am", "force-stop", APP_ID);
}

/** Starts the app and waits for its first frame; the system's own measure of the launch, in ms (TotalTime). */
export function startApp() {
  const out = shell("am", "start", "-W", "-n", MAIN_ACTIVITY);
  const total = /TotalTime:\s*(\d+)/.exec(out);
  if (!total) throw new Error(`the app did not start:\n${out}`);
  return Number(total[1]);
}

/** The device's clock, in ms since the epoch: what a page's performance.timeOrigin is measured by. */
export function deviceNow() {
  return Number(shell("date", "+%s%3N").trim());
}

/* ---- The screen, as a person sees it ---- */

/** The nodes of a uiautomator dump: what each says (its text and its description) and the centre of where it is. */
export function nodesOf(xml) {
  const nodes = [];
  for (const [tag] of xml.matchAll(/<node\b[^>]*>/g)) {
    const attr = (name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? "";
    const box = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(attr("bounds"));
    if (!box) continue;
    const [x1, y1, x2, y2] = box.slice(1).map(Number);
    const says = [attr("text"), attr("content-desc")].map(unescapeXml).filter(Boolean).join(" ");
    nodes.push({ says, x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) });
  }
  return nodes;
}

const unescapeXml = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** The nodes on the screen whose words match, top to bottom as the tree lists them. */
export function onScreen(pattern) {
  shell("uiautomator", "dump", SCREEN_DUMP);
  return nodesOf(adb(["exec-out", "cat", SCREEN_DUMP])).filter((n) => pattern.test(n.says));
}

/** A finger's touch at a node's centre: what a selected tab takes, which a click does not reach. */
export function tap({ x, y }) {
  shell("input", "tap", String(x), String(y));
}

/* ---- What the app says as it starts ---- */

/**
 * The bundle the app last started with, from the device's log: its `app_launch` line (src/app/_layout.tsx), the
 * update's id or the build's own bundle, and its channel. Null when no launch was logged.
 */
export function launchOf(logcat) {
  const lines = logcat.split(/\r?\n/).filter((l) => l.includes("app_launch "));
  if (lines.length === 0) return null;
  try {
    return JSON.parse(lines[lines.length - 1].slice(lines[lines.length - 1].indexOf("app_launch ") + 11));
  } catch {
    return null;
  }
}

/** The device's log of what the app's JavaScript said, since it was last cleared. */
export function appLog() {
  return adb(["logcat", "-d", "-s", "ReactNativeJS:I"]);
}

export function clearLog() {
  adb(["logcat", "-c"]);
}

/* ---- The WebViews' DevTools ---- */

/** The app's process id, or null while it is not running (pidof then answers nothing and exits 1). */
export function appPid() {
  try {
    return shell("pidof", APP_ID).trim() || null;
  } catch {
    return null;
  }
}

/** The DevTools socket a WebView in process `pid` listens on, from the device's table of unix sockets, or null. */
export function devtoolsSocketOf(unixTable, pid) {
  return new RegExp(`@(webview_devtools_remote_${pid})(?!\\d)`).exec(unixTable)?.[1] ?? null;
}

/** A free port on this computer. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** The socket this computer forwards a port to, kept for as long as the app's process keeps it. */
let forwarded = null;

/**
 * The app's pages as DevTools lists them now, one per WebView (`{ url, webSocketDebuggerUrl }`), or none while no
 * WebView listens: at the sign-in screen, before the first page is made, or in a store build.
 */
export async function pagesNow() {
  const pid = appPid();
  const socket = pid && devtoolsSocketOf(shell("cat", "/proc/net/unix"), pid);
  if (!socket) return [];
  if (forwarded?.socket !== socket) {
    const port = await freePort();
    adb(["forward", `tcp:${port}`, `localabstract:${socket}`]);
    forwarded = { socket, port };
  }
  try {
    const response = await fetch(`http://127.0.0.1:${forwarded.port}/json`);
    return (await response.json()).filter((target) => target.type === "page");
  } catch {
    return [];
  }
}

/** A DevTools session with one page: `send(method, params)` answers the method's result, or throws its error. */
export function devtools(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  const waiting = new Map();
  let next = 1;
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    const call = message.id && waiting.get(message.id);
    if (!call) return;
    waiting.delete(message.id);
    if (message.error) call.reject(new Error(`${call.method}: ${message.error.message}`));
    else call.resolve(message.result);
  });
  const open = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error(`could not open ${webSocketDebuggerUrl}`)), { once: true });
  });
  return {
    async send(method, params = {}) {
      await open;
      const id = next++;
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject, method });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    /** A JavaScript expression's value, evaluated in the page. */
    async evaluate(expression) {
      const r = await this.send("Runtime.evaluate", { expression, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`${expression}: ${r.exceptionDetails.text}`);
      return r.result.value;
    },
    close: () => ws.close(),
  };
}

/** The middle of a list of numbers: what a few runs of something measure. */
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
