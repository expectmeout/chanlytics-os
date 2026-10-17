import { sameListed } from "../calendar/service-offer.js";
import { profileRefusal } from "../config/business-tab/fold-limits.js";
import { PROFILE_LIMITS } from "../config/workspace-config/config-rules.js";
import { COMMON_LANGUAGES } from "../config/business-tab/how-it-answers.js";
const SUGGESTIONS = {
  hair_salon: [
    "Haircut",
    // trade-word: a hair salon's own service, suggested only where Google lists a hair salon
    "Color",
    "Highlights",
    "Balayage",
    // trade-word: a hair salon's own service, suggested only where Google lists a hair salon
    "Blowout",
    // trade-word: a hair salon's own service, suggested only where Google lists a hair salon
    "Keratin treatment",
    // trade-word: a hair salon's own service, suggested only where Google lists a hair salon
    "Extensions"
  ],
  barber_shop: [
    "Haircut",
    // trade-word: a barber's own service, suggested only where Google lists a barber shop
    "Beard trim",
    "Hot towel shave",
    "Fade",
    "Kids' cut",
    "Line-up"
  ],
  beauty_salon: [
    "Haircut",
    // trade-word: a beauty salon's own service, suggested only where Google lists one or a beautician
    "Color",
    "Manicure",
    "Pedicure",
    "Facial",
    "Waxing",
    "Brow shaping",
    "Makeup"
  ],
  nail_salon: ["Manicure", "Pedicure", "Gel manicure", "Acrylic set", "Dip powder", "Nail art", "Fill"],
  spa: ["Massage", "Facial", "Body scrub", "Hot stone massage", "Couples massage", "Body wrap"],
  skin_care_clinic: ["Facial", "Chemical peel", "Microneedling", "Dermaplaning", "Acne treatment", "Consultation"],
  makeup_artist: ["Bridal makeup", "Event makeup", "Makeup lesson", "Airbrush makeup", "Trial session"],
  tanning_studio: ["Spray tan", "Tanning session", "Tanning package", "Rapid tan"],
  body_art_service: ["Tattoo", "Piercing", "Touch-up", "Cover-up", "Consultation"],
  dentist: ["Cleaning", "Checkup", "Whitening", "Filling", "Crown", "Emergency visit"],
  // trade-word: a dentist's own service, suggested only where Google lists a dentist
  chiropractor: ["New patient exam", "Adjustment", "Massage", "Spinal decompression", "Consultation"],
  physiotherapist: [
    "Evaluation",
    "Physical therapy session",
    "Sports injury rehab",
    "Post-surgery rehab",
    "Dry needling"
  ],
  doctor: ["New patient visit", "Annual physical", "Sick visit", "Follow-up", "Telehealth visit", "Vaccination"],
  // trade-word: a doctor's own services, suggested only where Google lists a doctor
  foot_care: ["Foot exam", "Nail care", "Callus removal", "Orthotics fitting", "Diabetic foot check"],
  wellness_center: ["Consultation", "Massage", "Acupuncture", "IV drip", "Membership"],
  veterinary_care: ["Wellness exam", "Vaccinations", "Dental cleaning", "Spay or neuter", "Sick visit", "Microchip"],
  // trade-word: a vet's own service, suggested only where Google lists a vet
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
    "Inspection"
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
  child_care_agency: ["Tour", "Full-time care", "Part-time care", "After-school care", "Drop-in care"]
};
const SAME_AS = {
  hair_care: "hair_salon",
  beautician: "beauty_salon",
  massage: "spa",
  massage_spa: "spa",
  dental_clinic: "dentist",
  medical_clinic: "doctor",
  medical_center: "doctor",
  gym: "fitness_center",
  pet_boarding_service: "pet_care"
};
export const SERVICE_SUGGESTION_TYPES = /* @__PURE__ */ (() => Object.keys(SUGGESTIONS))();
export function serviceSuggestionsOf(type) {
  const t = (type ?? "").trim();
  return SUGGESTIONS[SAME_AS[t] ?? t] ?? [];
}
export function checkChipsOf(i) {
  const listed = (Array.isArray(i.services) ? i.services : []).map((s) => s && typeof s.name === "string" ? s.name.trim() : "").filter(Boolean);
  const chosen = (Array.isArray(i.languages) ? i.languages : []).filter((l) => typeof l === "string" && l.trim() !== "").map((l) => l.trim());
  const has = (list, name) => list.some((x) => sameListed(x, name));
  const besides = chosen.filter((l, k) => !has(COMMON_LANGUAGES, l) && !has(chosen.slice(0, k), l));
  const set = (key, chips, count) => count >= PROFILE_LIMITS[key] && chips.some((c) => !c.on) ? { chips: chips.filter((c) => c.on), full: profileRefusal(key) } : { chips, full: null };
  return {
    services: set(
      "services",
      serviceSuggestionsOf(i.type).map((name) => ({ name, on: has(listed, name) })),
      listed.length
    ),
    languages: set(
      "languages",
      [
        ...COMMON_LANGUAGES.map((name) => ({ name, on: has(chosen, name) })),
        ...besides.map((name) => ({ name, on: true }))
      ],
      chosen.length
    )
  };
}
