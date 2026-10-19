/**
 * A person's page as contracts shapes it (toPersonVM: the profile, its timeline, cards, business, visits and calls), a
 * chunk of its own, fetched beside the person's read (people-detail.ts personDetail) rather than carried by every page's
 * first load (the loadability review, 19 Oct 2026).
 */
export { toPersonVM } from "@chanlytics/contracts";
