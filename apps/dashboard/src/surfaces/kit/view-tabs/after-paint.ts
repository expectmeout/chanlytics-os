/**
 * Where a press's work begins (the strip's ViewTabs and the tab bar's TabBar): after the frame that answers it has been
 * painted, where there are frames. The frame's callback, then a message, which runs once that frame is on the screen: the
 * tab lights first, and only then is the page it asks for drawn (a page drawn in one long piece began before the browser
 * had painted, and the tab lit only with the page: 5 Oct 2026). Never a timer: while a finger is down on a page that
 * listens to touches, a browser holds timers back until it knows the touch is no scroll (Chromium, about 100 ms: the tab
 * bar's move waited for the lift, measured 12 Oct 2026), and a message it runs at once. A module of its own, so a page
 * that draws a button and no strip carries none of it.
 */
export function afterPaint(then: () => void): void {
  if (typeof requestAnimationFrame !== "function" || typeof MessageChannel !== "function") {
    then();
    return;
  }
  requestAnimationFrame(() => {
    const next = new MessageChannel();
    next.port1.onmessage = () => {
      next.port1.close();
      then();
    };
    next.port2.postMessage(0);
  });
}
