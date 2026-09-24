/**
 * What the first run's Check offers as chips (canvas R2: "Tap what you offer. A few is enough.", "Languages it answers
 * in"): the services a business of Google's kind usually offers, and the common languages, each on when it is already
 * the record's. A tap adds one and a tap on one that is on takes it out (first-run.jsx); nothing here is stored until an
 * owner taps it.
 *
 * The services are keyed by Google's primary type (the Places API's "Table A" names, as google_listings.facts keeps
 * them), and a kind with no entry suggests nothing: a guess at a trade we do not know would put another trade's words
 * in front of its customers (trade-neutral.test.mjs). A line naming one trade's own services says so with
 * `trade-word:`: the table only reaches a business Google lists as that trade.
 */
import { sameListed } from "./availability";
import { COMMON_LANGUAGES, PROFILE_LIMITS, profileRefusal } from "./business-tab";

const SUGGESTIONS: Readonly<Record<string, readonly string[]>> = {
  hair_salon: [
    "Haircut", // trade-word: a hair salon's own service, suggested only where Google lists a hair salon
    "Color",
    "Highlights",
    "Balayage", // trade-word: a hair salon's own service, suggested only where Google lists a hair salon
    "Blowout", // trade-word: a hair salon's own service, suggested only where Google lists a hair salon
    "Keratin treatment", // trade-word: a hair salon's own service, suggested only where Google lists a hair salon
    "Extensions",
  ],
  barber_shop: [
    "Haircut", // trade-word: a barber's own service, suggested only where Google lists a barber shop
    "Beard trim",
    "Hot towel shave",
    "Fade",
    "Kids' cut",
    "Line-up",
  ],
  beauty_salon: [
    "Haircut", // trade-word: a beauty salon's own service, suggested only where Google lists one or a beautician
    "Color",
    "Manicure",
    "Pedicure",
    "Facial",
    "Waxing",
    "Brow shaping",
    "Makeup",
  ],
  nail_salon: ["Manicure", "Pedicure", "Gel manicure", "Acrylic set", "Dip powder", "Nail art", "Fill"],
  spa: ["Massage", "Facial", "Body scrub", "Hot stone massage", "Couples massage", "Body wrap"],
  skin_care_clinic: ["Facial", "Chemical peel", "Microneedling", "Dermaplaning", "Acne treatment", "Consultation"],
  makeup_artist: ["Bridal makeup", "Event makeup", "Makeup lesson", "Airbrush makeup", "Trial session"],
  tanning_studio: ["Spray tan", "Tanning session", "Tanning package", "Rapid tan"],
  body_art_service: ["Tattoo", "Piercing", "Touch-up", "Cover-up", "Consultation"],
  dentist: ["Cleaning", "Checkup", "Whitening", "Filling", "Crown", "Emergency visit"],
  chiropractor: ["New patient exam", "Adjustment", "Massage", "Spinal decompression", "Consultation"],
  physiotherapist: [
    "Evaluation",
    "Physical therapy session",
    "Sports injury rehab",
    "Post-surgery rehab",
    "Dry needling",
  ],
  doctor: ["New patient visit", "Annual physical", "Sick visit", "Follow-up", "Telehealth visit", "Vaccination"],
  foot_care: ["Foot exam", "Nail care", "Callus removal", "Orthotics fitting", "Diabetic foot check"],
  wellness_center: ["Consultation", "Massage", "Acupuncture", "IV drip", "Membership"],
  veterinary_care: ["Wellness exam", "Vaccinations", "Dental cleaning", "Spay or neuter", "Sick visit", "Microchip"],
  pet_care: ["Full groom", "Bath and brush", "Nail trim", "Boarding", "Daycare", "Dog walking"],
  fitness_center: ["Personal training", "Group class", "Membership", "Day pass", "Nutrition coaching"],
  yoga_studio: ["Drop-in class", "Class pack", "Private session", "Beginners series", "Membership"],
  car_repair: ["Oil change", "Brake service", "Diagnostics", "Tire rotation", "Inspection", "AC repair"],
  car_wash: ["Exterior wash", "Full detail", "Interior cleaning", "Wax", "Monthly plan"],
  tire_shop: ["Tire installation", "Rotation", "Balancing", "Alignment", "Flat repair"],
  moving_company: ["Local move", "Long-distance move", "Packing", "Storage", "Piano move", "Office move"],
  plumber: ["Leak repair", "Drain cleaning", "Water heater", "Toilet repair", "Emergency call-out", "Inspection"],
  electrician: [
    "Outlet installation",
    "Panel upgrade",
    "Lighting installation",
    "EV charger installation",
    "Troubleshooting",
    "Inspection",
  ],
  roofing_contractor: ["Roof inspection", "Roof repair", "Roof replacement", "Gutter repair", "Estimate"],
  painter: ["Interior painting", "Exterior painting", "Cabinet painting", "Drywall repair", "Estimate"],
  locksmith: ["Lockout", "Rekey", "Lock installation", "Key cutting", "Car lockout"],
  laundry: ["Wash and fold", "Dry cleaning", "Pickup and delivery", "Alterations"],
  tailor: ["Alterations", "Hemming", "Suit tailoring", "Repairs", "Custom fitting"],
  florist: ["Bouquet", "Wedding flowers", "Event flowers", "Sympathy flowers", "Delivery"],
  lawyer: ["Consultation", "Contract review", "Estate planning", "Family law", "Business formation"],
  insurance_agency: ["Quote", "Auto insurance", "Home insurance", "Life insurance", "Policy review"],
  real_estate_agency: ["Home valuation", "Buyer consultation", "Listing appointment", "Showing", "Rental help"],
  catering_service: ["Event catering", "Tasting", "Corporate lunch", "Wedding catering", "Drop-off catering"],
  child_care_agency: ["Tour", "Full-time care", "Part-time care", "After-school care", "Drop-in care"],
};

/** Google's near kinds, which share a list: a hair care listing offers what a hair salon does. */
const SAME_AS: Readonly<Record<string, string>> = {
  hair_care: "hair_salon",
  beautician: "beauty_salon",
  massage: "spa",
  massage_spa: "spa",
  dental_clinic: "dentist",
  medical_clinic: "doctor",
  medical_center: "doctor",
  gym: "fitness_center",
  pet_boarding_service: "pet_care",
};

/** The kinds with a list of their own, for the tests that hold every list to what a service can be. */
export const SERVICE_SUGGESTION_TYPES: readonly string[] = /* @__PURE__ */ (() => Object.keys(SUGGESTIONS))();

/** What a business of Google's kind usually offers; none for a kind with no list, or none at all. */
export function serviceSuggestionsOf(type: string | null | undefined): readonly string[] {
  const t = (type ?? "").trim();
  return SUGGESTIONS[SAME_AS[t] ?? t] ?? [];
}

export interface CheckChipVM {
  name: string;
  /** Already the record's: a tap takes it out. */
  on: boolean;
}

/** One list's chips, and what stands for the rest once the profile keeps no more of the list. */
export interface CheckChipSetVM {
  /** In the list's order. At the cap, only the ones that are on: none is offered to add, and each still takes one out. */
  chips: CheckChipVM[];
  /** At the cap (PROFILE_LIMITS), the cap's own sentence (profileRefusal), said where the rest were; else null. */
  full: string | null;
}

export interface CheckChipsVM {
  /** Google's kind's suggestions. */
  services: CheckChipSetVM;
  /** The common languages, then any chosen one they do not name. */
  languages: CheckChipSetVM;
}

/**
 * The chips over the record as it stands: the settings read's services and languages. A name is the same name however
 * it is written, by the one rule (availability.ts sameListed).
 */
export function checkChipsOf(i: {
  type: string | null | undefined;
  services: readonly { name?: string | null }[] | null | undefined;
  languages: readonly string[] | null | undefined;
}): CheckChipsVM {
  // A stored list that is not one (a hand-edited record) is none, never a throw: the page draws this as it draws.
  const listed = (Array.isArray(i.services) ? i.services : [])
    .map((s) => (s && typeof s.name === "string" ? s.name.trim() : ""))
    .filter(Boolean);
  const chosen = (Array.isArray(i.languages) ? i.languages : [])
    .filter((l): l is string => typeof l === "string" && l.trim() !== "")
    .map((l) => l.trim());
  const has = (list: readonly string[], name: string) => list.some((x) => sameListed(x, name));
  // A chosen language the list does not name is a chip of its own, once however often it is stored.
  const besides = chosen.filter((l, k) => !has(COMMON_LANGUAGES, l) && !has(chosen.slice(0, k), l));
  // At the cap, none that is off is offered to add: the ones on stay, and the cap's sentence stands for the rest.
  const set = (key: "services" | "languages", chips: CheckChipVM[], count: number): CheckChipSetVM =>
    count >= PROFILE_LIMITS[key] && chips.some((c) => !c.on)
      ? { chips: chips.filter((c) => c.on), full: profileRefusal(key) }
      : { chips, full: null };
  return {
    services: set(
      "services",
      serviceSuggestionsOf(i.type).map((name) => ({ name, on: has(listed, name) })),
      listed.length,
    ),
    languages: set(
      "languages",
      [
        ...COMMON_LANGUAGES.map((name) => ({ name, on: has(chosen, name) })),
        ...besides.map((name) => ({ name, on: true })),
      ],
      chosen.length,
    ),
  };
}
