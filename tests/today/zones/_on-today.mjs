/**
 * Need you as Today draws it (apps/dashboard/src/surfaces/today/zones/page.tsx): handed the card Today's one arrangement
 * names (arrangement.ts), so a test of who waits sees the card and the lines under it as the page has them (Today, calm,
 * 19 Nov 2026: the first thing worth doing is the card, every other thing a line).
 */
const { NeedYou } = await import("../../../apps/dashboard/src/surfaces/today/zones/need-you.tsx");
const { useTodayArrangement } = await import("../../../apps/dashboard/src/surfaces/today/arrangement.ts");

export const NeedYouOnToday = () => NeedYou({ card: useTodayArrangement().card });
