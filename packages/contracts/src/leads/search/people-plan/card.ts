/** People plan: card. */

export const PEOPLE_CARD = "people_at_companies" as const;

/** The seniority words the card's provider filters on, interns left out: a cold email never goes to one. */
export const PEOPLE_SENIORITIES = [
  "owner",
  "founder",
  "c_suite",
  "partner",
  "vp",
  "head",
  "director",
  "manager",
  "senior",
  "entry",
] as const;

export type PeopleSeniority = (typeof PEOPLE_SENIORITIES)[number];

export const PEOPLE_SENIORITY_WORDS: Record<PeopleSeniority, string> = {
  owner: "owners",
  founder: "founders",
  c_suite: "the C-suite",
  partner: "partners",
  vp: "VPs",
  head: "heads of a team",
  director: "directors",
  manager: "managers",
  senior: "senior staff",
  entry: "entry level",
};

/** A company's size as the provider names its ranges. */
export const PEOPLE_COMPANY_SIZES = [
  "1 - 10",
  "11 - 50",
  "51 - 200",
  "201 - 500",
  "501 - 1000",
  "1001 - 5000",
  "5001 - 10000",
  "10001+",
] as const;

export type PeopleCompanySize = (typeof PEOPLE_COMPANY_SIZES)[number];

export const PEOPLE_COUNT_MAX = 500;

/** The least a run's cap is, the provider's and the checker's alike: what a people search reserves for each. */
export const PEOPLE_RUN_FLOOR_USD = 0.5;

export const PEOPLE_TITLES_MAX = 5;

export const PEOPLE_INDUSTRIES_MAX = 5;

export const PEOPLE_STATES_MAX = 10;

/** The most words a plan searches companies' sites for (`keywords`), and the longest each. */
export const PEOPLE_KEYWORDS_MAX = 5;
