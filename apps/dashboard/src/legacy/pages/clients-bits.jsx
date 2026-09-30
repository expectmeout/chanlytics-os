/* global React */
// Chanlytics — Clients shared bits: the person page and the demo's Segments still draw these two. The channel glyph, the agent
// chip and the bucket pill went with People's list (surfaces/people).

const TempBar = ({ value = 0.5, sizeClass = "" }) => (
  <div className={`cl-temp-bar ${sizeClass}`}>
    <div className={`cl-temp-pin ${sizeClass}`} style={{ left: `${Math.round(value * 100)}%` }} />
  </div>
);

const ClientTag = ({ children, signal = false }) => (
  <span className={`cl-tag${signal ? " signal" : ""}`}>{children}</span>
);

window.TempBar = TempBar;
window.ClientTag = ClientTag;
