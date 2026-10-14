/**
 * The industries the people card's provider filters companies by, in its own names, as its pinned build lists them (its
 * input schema, 14 Oct 2026): a run naming any other is refused before it starts. A plan names these alone: the route's
 * schema (people-plan-schema.ts) spells one typed in any case as the directory does, and refuses one it does not list
 * with the nearest of its own; Ask's planner says the same. Server only, outside the barrel: in the browser's contracts
 * the list would ride on every page's first load (1.9 KB gzipped), where only the Find people sheet would say it.
 */

const PEOPLE_INDUSTRIES = [
  "Accounting",
  "Agriculture",
  "Airlines/Aviation",
  "Alternative Dispute Resolution",
  "Alternative Medicine",
  "Animation",
  "Apparel & Fashion",
  "Architecture & Planning",
  "Arts & Crafts",
  "Automotive",
  "Aviation & Aerospace",
  "Banking",
  "Biotechnology",
  "Broadcast Media",
  "Building Materials",
  "Business Supplies & Equipment",
  "Capital Markets",
  "Chemicals",
  "Civic & Social Organization",
  "Civil Engineering",
  "Commercial Real Estate",
  "Computer & Network Security",
  "Computer Games",
  "Computer Hardware",
  "Computer Networking",
  "Computer Software",
  "Construction",
  "Consumer Electronics",
  "Consumer Goods",
  "Consumer Services",
  "Cosmetics",
  "Dairy",
  "Defense & Space",
  "Design",
  "E-Learning",
  "Education Management",
  "Electrical/Electronic Manufacturing",
  "Entertainment",
  "Environmental Services",
  "Events Services",
  "Executive Office",
  "Facilities Services",
  "Farming",
  "Financial Services",
  "Fine Art",
  "Fishery",
  "Food & Beverages",
  "Food Production",
  "Fund-Raising",
  "Furniture",
  "Gambling & Casinos",
  "Glass",
  "Government Administration",
  "Government Relations",
  "Graphic Design",
  "Health",
  "Higher Education",
  "Hospital & Health Care",
  "Hospitality",
  "Human Resources",
  "Import & Export",
  "Individual & Family Services",
  "Industrial Automation",
  "Information Services",
  "Information Technology & Services",
  "Insurance",
  "International Affairs",
  "International Trade & Development",
  "Internet",
  "Investment Banking",
  "Investment Management",
  "Judiciary",
  "Law Enforcement",
  "Law Practice",
  "Legal Services",
  "Legislative Office",
  "Leisure",
  "Libraries",
  "Logistics & Supply Chain",
  "Luxury Goods & Jewelry",
  "Machinery",
  "Management Consulting",
  "Maritime",
  "Market Research",
  "Marketing & Advertising",
  "Mechanical or Industrial Engineering",
  "Media Production",
  "Medical Devices",
  "Medical Practice",
  "Mental Health Care",
  "Military",
  "Mining & Metals",
  "Motion Pictures & Film",
  "Museums & Institutions",
  "Music",
  "Nanotechnology",
  "Newspapers",
  "Nonprofit Organization Management",
  "Oil & Energy",
  "Online Media",
  "Outsourcing/Offshoring",
  "Package/Freight Delivery",
  "Packaging & Containers",
  "Paper & Forest Products",
  "Performing Arts",
  "Pharmaceuticals",
  "Philanthropy",
  "Photography",
  "Plastics",
  "Political Organization",
  "Primary/Secondary Education",
  "Printing",
  "Professional Training & Coaching",
  "Program Development",
  "Public Policy",
  "Public Relations & Communications",
  "Public Safety",
  "Publishing",
  "Railroad Manufacture",
  "Ranching",
  "Real Estate",
  "Recreational Facilities & Services",
  "Religious Institutions",
  "Renewables & Environment",
  "Research",
  "Restaurants",
  "Retail",
  "Security & Investigations",
  "Semiconductors",
  "Shipbuilding",
  "Sporting Goods",
  "Sports",
  "Staffing & Recruiting",
  "Supermarkets",
  "Telecommunications",
  "Textiles",
  "Think Tanks",
  "Tobacco",
  "Translation & Localization",
  "Transportation/Trucking/Railroad",
  "Utilities",
  "Venture Capital & Private Equity",
  "Veterinary",
  "Warehousing",
  "Wholesale",
  "Wine & Spirits",
  "Wireless",
  "Writing & Editing",
  "Other",
  "Specialty",
  "Services",
  "Rentals/Leasing",
  "Other Vehicles",
  "Professional Services software",
  "eBusiness Software",
] as const;
type PeopleIndustry = (typeof PEOPLE_INDUSTRIES)[number];

/** An industry's key: any case, and "and" for "&", is one ("marketing and advertising" is Marketing & Advertising). */
const industryKey = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\band\b/g, "&")
    .replace(/[^a-z0-9&]+/g, "");

const INDUSTRY_BY_KEY = new Map<string, PeopleIndustry>(PEOPLE_INDUSTRIES.map((i) => [industryKey(i), i]));

/** The directory's own name for an industry as typed, or null for one it does not list. */
export function peopleIndustryOf(raw: string | null | undefined): PeopleIndustry | null {
  return INDUSTRY_BY_KEY.get(industryKey(raw ?? "")) ?? null;
}

const wordsIn = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && w !== "and" && w !== "the");

/** How many letters two words begin with alike. */
const sharedStart = (a: string, b: string): number => {
  let n = 0;
  while (n < a.length && a[n] === b[n]) n++;
  return n;
};

/**
 * Up to three of the directory's industries nearest what was typed: those whose words begin as a typed word does, five
 * letters alike at least (a shorter word whole), the longest likeness first. "marketing agencies" finds Marketing &
 * Advertising, never Capital Markets; "law firms" Law Enforcement and Law Practice; "dentists" none.
 */
export function peopleIndustriesNear(typed: string): PeopleIndustry[] {
  const typedWords = wordsIn(typed);
  const scored = PEOPLE_INDUSTRIES.map((industry) => {
    let best = 0;
    for (const w of typedWords)
      for (const v of wordsIn(industry)) {
        const n = sharedStart(w, v);
        if (n >= Math.min(5, w.length) && n > best) best = n;
      }
    return { industry, best };
  }).filter((x) => x.best > 0);
  const top = Math.max(0, ...scored.map((x) => x.best));
  return scored
    .filter((x) => x.best >= top - 1)
    .sort((a, b) => b.best - a.best)
    .slice(0, 3)
    .map((x) => x.industry);
}
