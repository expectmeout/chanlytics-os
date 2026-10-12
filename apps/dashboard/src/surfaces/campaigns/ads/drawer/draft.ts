/**
 * An ad being edited (MOCKUP): what Edit holds before Save -- the words a tapped chip chose, the photo and the words -- and
 * how it differs from the ad. Pure; the drawer keeps one and draws the ad as it would be (`applyDraft`), a changed word
 * wearing a dot, and the foot counting the changes. A change to the offer, photo, words or area sends the ad back for
 * checking; one to the amount or the end date starts right away. What Save sends is an `AdPatch` of the fields moved, and the
 * ad as it would be is the one contracts' `adWith` makes of it: the store's verb and this agree because they are one rule.
 */
import { adWith, sameArea } from "@chanlytics/contracts";
import type { AdArea, AdCopy, AdPatch, AdRead, AdsRead } from "@chanlytics/contracts";
import { adServiceOf, areaOfValue, starterCopy } from "@chanlytics/contracts/ads-page";
import type { ChipId } from "@chanlytics/contracts/ads-page";

/** The words an edit can move: each wears a dot, and the foot counts them. */
export type EditId = "offer" | "photo" | "words" | "area" | "amount" | "end";

export interface Draft {
  serviceId: string;
  area: AdArea;
  /** The amount in minor units: a total, or a daily amount. */
  amountMinor: number;
  endDay: string;
  /** The words as the offer drafts them: what `copy` is measured against, so a new offer is one change, not two. */
  base: AdCopy;
  copy: AdCopy;
  /** How many times a new photo was chosen (the example has no photo to pick). */
  photo: number;
}

export const startDraft = (ad: AdRead): Draft => ({
  serviceId: ad.serviceId,
  area: ad.area,
  amountMinor: ad.budget.amountMinor,
  endDay: ad.endDay,
  base: ad.copy,
  copy: ad.copy,
  photo: 0,
});

const saidWords = (c: AdCopy): string => JSON.stringify([c.headline, c.text, c.headlines, c.lines]);

/** The words the draft has moved from the ad's own. */
export function changedOf(ad: AdRead, d: Draft): ReadonlySet<EditId> {
  const moved: [EditId, boolean][] = [
    ["offer", d.serviceId !== ad.serviceId],
    ["photo", d.photo > 0],
    ["words", saidWords(d.copy) !== saidWords(d.base)],
    ["area", !sameArea(d.area, ad.area)],
    ["amount", d.amountMinor !== ad.budget.amountMinor],
    ["end", d.endDay !== ad.endDay],
  ];
  return new Set(moved.filter(([, on]) => on).map(([id]) => id));
}

/** What Save sends: the fields the draft has moved, and nothing else. */
export function draftPatch(ad: AdRead, d: Draft): AdPatch {
  const moved = changedOf(ad, d);
  const patch: AdPatch = {};
  if (moved.has("offer")) patch.serviceId = d.serviceId;
  if (moved.has("area")) patch.area = d.area;
  if (moved.has("end")) patch.endDay = d.endDay;
  if (moved.has("amount")) patch.amountMinor = d.amountMinor;
  if (moved.has("words") || moved.has("offer")) patch.copy = d.copy;
  if (moved.has("photo")) patch.photo = true;
  return patch;
}

/** What the ad would be with the draft saved: the fields Edit can move, and nothing else. */
export const applyDraft = (ad: AdRead, d: Draft, read: AdsRead): AdRead => adWith(ad, read, draftPatch(ad, d));

/** Another Service chosen as the offer: its words are drafted again from it, as New ad drafts them. */
function withOffer(d: Draft, o: { serviceId: string; read: AdsRead; ad: AdRead }): Draft {
  const { serviceId, read, ad } = o;
  const service = adServiceOf(read, serviceId);
  if (!service) return d;
  const base =
    service.id === ad.serviceId
      ? ad.copy
      : starterCopy({
          service: service.name,
          price: service.note,
          business: read.business,
          door: ad.door,
          word: read.appointmentWord,
        });
  return { ...d, serviceId: service.id, base, copy: base };
}

/** The draft with a tapped word's choice in it: the value a chip hands back (sentence.tsx) says which. */
export function withChip(d: Draft, chip: ChipId, value: string, o: { read: AdsRead; ad: AdRead }): Draft {
  switch (chip) {
    case "end":
      return { ...d, endDay: value };
    case "amount":
      return { ...d, amountMinor: Number(value) };
    case "area":
      return { ...d, area: areaOfValue(value) };
    case "offer":
      return withOffer(d, { serviceId: value, read: o.read, ad: o.ad });
    default:
      return d;
  }
}
