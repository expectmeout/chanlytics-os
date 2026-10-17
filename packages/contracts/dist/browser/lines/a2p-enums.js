export const BUSINESS_INDUSTRIES = [
  "AGRICULTURE",
  "AUTOMOTIVE",
  "BANKING",
  "CONSTRUCTION",
  "CONSUMER",
  "EDUCATION",
  "ELECTRONICS",
  "ENERGY",
  "ENGINEERING",
  "FAST_MOVING_CONSUMER_GOODS",
  "FINANCIAL",
  "FINTECH",
  "FOOD_AND_BEVERAGE",
  "GOVERNMENT",
  "HEALTHCARE",
  "HOSPITALITY",
  "INSURANCE",
  "JEWELRY",
  "LEGAL",
  "MANUFACTURING",
  "MEDIA",
  "NOT_FOR_PROFIT",
  "OIL_AND_GAS",
  "ONLINE",
  "PROFESSIONAL_SERVICES",
  "RAW_MATERIALS",
  "REAL_ESTATE",
  "RELIGION",
  "RETAIL",
  "TECHNOLOGY",
  "TELECOMMUNICATIONS",
  "TRANSPORTATION",
  "TRAVEL"
];
export const DEFAULT_INDUSTRY = "PROFESSIONAL_SERVICES";
export const BUSINESS_TYPES = [
  "Co-operative",
  "Corporation",
  "Limited Liability Corporation",
  "Non-profit Corporation",
  "Partnership"
];
export const DEFAULT_BUSINESS_TYPE = "Limited Liability Corporation";
export const COMPANY_TYPES = ["government", "non-profit", "private", "public"];
export const DEFAULT_COMPANY_TYPE = "private";
export function industryOf(v) {
  const up = String(v ?? "").trim().toUpperCase();
  return BUSINESS_INDUSTRIES.includes(up) ? up : DEFAULT_INDUSTRY;
}
export function businessTypeOf(v) {
  const s = String(v ?? "").trim();
  return BUSINESS_TYPES.includes(s) ? s : DEFAULT_BUSINESS_TYPE;
}
export function companyTypeOf(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return COMPANY_TYPES.includes(s) ? s : DEFAULT_COMPANY_TYPE;
}
export function industryWords(v) {
  return v.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
