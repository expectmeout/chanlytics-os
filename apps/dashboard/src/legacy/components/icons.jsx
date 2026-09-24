/* global React */
// Chanlytics — Icon set (16px stroke, 1.5w). Tiny curated list.

const Icon = ({ name, size = 16, className = "", style = {} }) => {
  const s = { width: size, height: size, ...style };
  const props = {
    width: size, height: size, viewBox: "0 0 16 16", fill: "none",
    stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round",
    strokeLinejoin: "round", className: `icon ${className}`, style: s
  };
  switch (name) {
    case "home":     return <svg {...props}><path d="M2.5 7L8 2.5 13.5 7v6a1 1 0 01-1 1h-9a1 1 0 01-1-1V7z"/><path d="M6 14V9h4v5"/></svg>;
    case "inbox":    return <svg {...props}><path d="M2 9l1.5-5.5A1 1 0 014.5 3h7a1 1 0 011 .5L14 9"/><path d="M2 9v3.5a1 1 0 001 1h10a1 1 0 001-1V9"/><path d="M2 9h3.5l1 2h3l1-2H14"/></svg>;
    case "users":    return <svg {...props}><circle cx="6" cy="6" r="2.5"/><path d="M2 13c0-2.2 1.8-4 4-4s4 1.8 4 4"/><path d="M11 4.5a2 2 0 010 3.5M14 12c0-1.5-.7-2.8-1.8-3.5"/></svg>;
    case "deal":     return <svg {...props}><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M6 7h4M6 10h2.5"/></svg>;
    case "phone":    return <svg {...props}><path d="M3 3.5l2.5-.5 1.5 3-1.5 1c.7 1.5 1.7 2.5 3 3.2L9.5 9l3 1.5-.5 2.5c-4.5.3-9-4.2-9-9.5z"/></svg>;
    case "chat":     return <svg {...props}><path d="M3 3h10a1 1 0 011 1v6a1 1 0 01-1 1H8l-3 2.5V11H3a1 1 0 01-1-1V4a1 1 0 011-1z"/></svg>;
    case "calendar": return <svg {...props}><rect x="2" y="3.5" width="12" height="10" rx="1"/><path d="M2 6.5h12M5 2v3M11 2v3"/></svg>;
    case "content":  return <svg {...props}><rect x="2" y="2.5" width="12" height="11" rx="1"/><path d="M5 6h6M5 9h6M5 12h3"/></svg>;
    case "agents":   return <svg {...props}><rect x="3" y="3" width="10" height="10" rx="1.5"/><circle cx="6" cy="7" r="0.6" fill="currentColor"/><circle cx="10" cy="7" r="0.6" fill="currentColor"/><path d="M6 10h4"/></svg>;
    case "settings": return <svg {...props}><circle cx="8" cy="8" r="2"/><path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4"/></svg>;
    case "search":   return <svg {...props}><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3 3"/></svg>;
    case "plus":     return <svg {...props}><path d="M8 3v10M3 8h10"/></svg>;
    case "filter":   return <svg {...props}><path d="M2 4h12M4 8h8M6 12h4"/></svg>;
    case "more":     return <svg {...props}><circle cx="3.5" cy="8" r="0.8" fill="currentColor"/><circle cx="8" cy="8" r="0.8" fill="currentColor"/><circle cx="12.5" cy="8" r="0.8" fill="currentColor"/></svg>;
    case "chevron":  return <svg {...props}><path d="M6 4l4 4-4 4"/></svg>;
    case "chevron-down": return <svg {...props}><path d="M4 6l4 4 4-4"/></svg>;
    case "arrow-up": return <svg {...props}><path d="M8 13V3M4 7l4-4 4 4"/></svg>;
    case "arrow-down":return <svg {...props}><path d="M8 3v10M4 9l4 4 4-4"/></svg>;
    case "arrow-right":return <svg {...props}><path d="M3 8h10M9 4l4 4-4 4"/></svg>;
    case "external": return <svg {...props}><path d="M6 3h7v7M13 3l-7 7M5 5H3v8h8v-2"/></svg>;
    case "check":    return <svg {...props}><path d="M3 8.5l3.5 3L13 5"/></svg>;
    case "clock":    return <svg {...props}><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/></svg>;
    case "bolt":     return <svg {...props}><path d="M9 2L3.5 9H7l-1 5L12.5 7H9l1-5z"/></svg>;
    case "sparkle":  return <svg {...props}><path d="M8 2v4M8 10v4M2 8h4M10 8h4"/><path d="M4 4l1.5 1.5M10.5 10.5L12 12M4 12l1.5-1.5M10.5 5.5L12 4"/></svg>;
    // Ask's three at rest, still: the stair the canvas holds (mascot/character.ts STEP, wider than tall, the squares
    // clear of each other). A door to Ask wears this mark where a second live canvas would be a second character (F1).
    case "three":    return <svg {...props}><rect x="0.9" y="3.4" width="4.4" height="4.4" rx="1.05"/><rect x="5.65" y="6.22" width="4.4" height="4.4" rx="1.05"/><rect x="10.4" y="9.04" width="4.4" height="4.4" rx="1.05"/></svg>;
    case "instagram":return <svg {...props}><rect x="2.5" y="2.5" width="11" height="11" rx="3"/><circle cx="8" cy="8" r="2.5"/><circle cx="11" cy="5" r="0.5" fill="currentColor"/></svg>;
    case "mail":     return <svg {...props}><rect x="2" y="3.5" width="12" height="9" rx="1"/><path d="M2.5 5l5.5 4 5.5-4"/></svg>;
    case "command":  return <svg {...props}><path d="M5 3.5h6v9H5z M3.5 5v6 M11 5h1.5v1.5H11z M3.5 9.5H5M11 9.5h1.5"/></svg>;
    case "sun":      return <svg {...props}><circle cx="8" cy="8" r="3"/><path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4"/></svg>;
    case "moon":     return <svg {...props}><path d="M13 9.5A5.5 5.5 0 016.5 3a5.5 5.5 0 106.5 6.5z"/></svg>;
    case "bell":     return <svg {...props}><path d="M4 11V7a4 4 0 018 0v4l1 1H3l1-1z M6.5 13a1.5 1.5 0 003 0"/></svg>;
    case "dot":      return <svg {...props}><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>;
    case "wave":     return <svg {...props}><path d="M2 8h2l1-3 2 6 2-4 1.5 2H14"/></svg>;
    case "video":    return <svg {...props}><rect x="2" y="4" width="9" height="8" rx="1"/><path d="M11 7l3-2v6l-3-2z"/></svg>;
    case "tag":      return <svg {...props}><path d="M2.5 8.5l6-6h5v5l-6 6-5-5z"/><circle cx="10.5" cy="5.5" r="0.7" fill="currentColor"/></svg>;
    // A gift: an offer, where a template is marketing and reaches only people who said yes to offers.
    case "gift":     return <svg {...props}><path d="M2.5 6h11v2.5h-11z"/><path d="M3.5 8.5v5h9v-5"/><path d="M8 6v7.5"/><path d="M8 6H5.8a1.5 1.5 0 110-3C7.4 3 8 6 8 6zM8 6h2.2a1.5 1.5 0 100-3C8.6 3 8 6 8 6z"/></svg>;
    // A standing run: a playbook's, which comes round again.
    case "repeat":   return <svg {...props}><path d="M11.5 1.5l2 2-2 2"/><path d="M2.5 7.5v-1a3 3 0 013-3h8"/><path d="M4.5 14.5l-2-2 2-2"/><path d="M13.5 8.5v1a3 3 0 01-3 3h-8"/></svg>;
    // A send: a broadcast, once.
    case "send":     return <svg {...props}><path d="M14 2L7.5 8.5"/><path d="M14 2l-4.5 12-2-5.5-5.5-2z"/></svg>;
    case "money":    return <svg {...props}><circle cx="8" cy="8" r="5.5"/><path d="M8 5v6M6 9c0 1 .9 1.5 2 1.5s2-.5 2-1.3-.9-1.2-2-1.4-2-.5-2-1.3.9-1.5 2-1.5 2 .5 2 1.5"/></svg>;
    case "trending-up": return <svg {...props}><path d="M2 12l4-4 3 3 5-5"/><path d="M9.5 6h4v4"/></svg>;
    case "chevron-up":  return <svg {...props}><path d="M4 10l4-4 4 4"/></svg>;
    case "edit":     return <svg {...props}><path d="M3 13h2.5l7-7-2.5-2.5-7 7V13z"/><path d="M11 4l1 1"/></svg>;
    case "zap":      return <svg {...props}><path d="M9 2L4 9h3l-1 5 5-7H8l1-5z" fill="currentColor"/></svg>;
    case "x":        return <svg {...props}><path d="M4 4l8 8M12 4l-8 8"/></svg>;
    case "play":     return <svg {...props}><path d="M5 3.5L12 8l-7 4.5v-9z" fill="currentColor"/></svg>;
    case "pause":    return <svg {...props}><rect x="4.5" y="3" width="2.5" height="10" fill="currentColor"/><rect x="9" y="3" width="2.5" height="10" fill="currentColor"/></svg>;
    case "alert":    return <svg {...props}><path d="M8 2L1.5 13h13L8 2z"/><path d="M8 6.5v3M8 11.5v.5"/></svg>;
    case "info":     return <svg {...props}><circle cx="8" cy="8" r="5.5"/><path d="M8 7.5v3.5M8 5.25v.5"/></svg>;
    // A notice that asks for something: the info glyph turned over.
    case "notice":   return <svg {...props}><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.5M8 10.75v.5"/></svg>;
    case "error":    return <svg {...props}><circle cx="8" cy="8" r="5.5"/><path d="M6 6l4 4M10 6l-4 4"/></svg>;
    case "headphones": return <svg {...props}><path d="M2 9v3a1 1 0 001 1h1.5v-5H3a1 1 0 00-1 1zM14 9v3a1 1 0 01-1 1h-1.5v-5H13a1 1 0 011 1z"/><path d="M2 9a6 6 0 0112 0"/></svg>;
    case "eye":      return <svg {...props}><path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/></svg>;
    case "flag":     return <svg {...props}><path d="M3 14V2.5h8l-1.5 3 1.5 3H3"/></svg>;
    case "pin":      return <svg {...props}><path d="M10 2.5L13.5 6 11 8l-1.5-1.5L6 10l-1-1 3.5-3.5L7 4l3-1.5z"/><path d="M6 10l-3 3.5"/></svg>;
    case "star":     return <svg {...props}><path d="M8 2l1.8 4 4.2.5-3 3 .9 4.2L8 11.7 4.1 13.7 5 9.5 2 6.5 6.2 6z"/></svg>;
    case "shield":   return <svg {...props}><path d="M8 1.5l5 2v4c0 3-2 5.5-5 7-3-1.5-5-4-5-7v-4l5-2z"/></svg>;
    case "sort":     return <svg {...props}><path d="M4 3v10M2 11l2 2 2-2 M12 13V3M14 5l-2-2-2 2"/></svg>;
    case "refresh":  return <svg {...props}><path d="M2 8a6 6 0 0110-4.5L13 5M14 8a6 6 0 01-10 4.5L3 11"/><path d="M13 2v3h-3M3 14v-3h3"/></svg>;
    case "menu":     return <svg {...props}><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/></svg>;
    case "logout":   return <svg {...props}><path d="M6 2.5H3.5a1 1 0 00-1 1v9a1 1 0 001 1H6M10 11l3-3-3-3M13 8H6"/></svg>;
    case "keyboard": return <svg {...props}><rect x="1.5" y="4" width="13" height="8" rx="1.5"/><path d="M4 7h1M6.5 7h1M9 7h1M11.5 7h1M4 9.5h8"/></svg>;
    case "chevrons": return <svg {...props}><path d="M5 6l3-3 3 3M5 10l3 3 3-3"/></svg>;
    case "monitor":  return <svg {...props}><rect x="1.5" y="2.5" width="13" height="8.5" rx="1.5"/><path d="M6 13.5h4M8 11v2.5"/></svg>;
    case "user":     return <svg {...props}><circle cx="8" cy="5.5" r="2.5"/><path d="M2.5 14a5.5 5.5 0 0111 0"/></svg>;
    case "sidebar":  return <svg {...props}><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M6 2.5v11"/></svg>;
    case "download": return <svg {...props}><path d="M8 2.5v8M4.5 7L8 10.5 11.5 7"/><path d="M3 13h10"/></svg>;
    // The lead finder's own (release B): a held mic, the stop and undo of a
    // round, the lock on what a found lead may receive, a fact that could not
    // be confirmed, and the row acts the peek and the table draw.
    case "mic":      return <svg {...props}><rect x="6" y="2" width="4" height="7" rx="2"/><path d="M3.5 7.5a4.5 4.5 0 009 0M8 12v2"/></svg>;
    case "stop":     return <svg {...props}><rect x="4" y="4" width="8" height="8" rx="1.5"/></svg>;
    case "undo":     return <svg {...props}><path d="M3 7h7a3.5 3.5 0 010 7H6"/><path d="M5.5 4.5L3 7l2.5 2.5"/></svg>;
    case "lock":     return <svg {...props}><rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/></svg>;
    case "dashring": return <svg {...props}><path d="M8 2a6 6 0 013.2 1M14 6.2a6 6 0 010 3.6M11.2 13A6 6 0 018 14M4.8 13A6 6 0 012 9.8M2 6.2A6 6 0 014.8 3"/></svg>;
    case "copy":     return <svg {...props}><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 00-1-1h-6a1 1 0 00-1 1v6a1 1 0 001 1h2"/></svg>;
    case "pencil":   return <svg {...props}><path d="M11 2.5l2.5 2.5-7.5 7.5H3.5V10z"/><path d="M9.5 4l2.5 2.5"/></svg>;
    case "ban":      return <svg {...props}><circle cx="8" cy="8" r="5.5"/><path d="M4.1 11.9l7.8-7.8"/></svg>;
    case "globe":    return <svg {...props}><circle cx="8" cy="8" r="5.5"/><path d="M2.5 8h11M8 2.5c1.6 1.7 2.4 3.6 2.4 5.5S9.6 12.3 8 13.5C6.4 12.3 5.6 10.4 5.6 8S6.4 4.2 8 2.5z"/></svg>;
    default: return <svg {...props}><circle cx="8" cy="8" r="3"/></svg>;
  }
};

window.Icon = Icon;
