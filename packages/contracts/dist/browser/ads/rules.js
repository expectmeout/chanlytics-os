export const ADS_WINDOW_DAYS = 30;
export const ADS_FRESH_DAYS = 3;
export const ADS_SETTLE_DAYS = 14;
export const TOO_EARLY_DAYS = 7;
export const ADS_ASK_MIN = 10;
export const ADS_ASK_MIN_CALLS = 20;
export const ADS_ASK_SOON_DAYS = 3;
export const ADS_EXTEND_MAX_DAYS = 30;
export const ADS_MOVE_DAYS = 14;
export const ADS_MOVE_STEP_MINOR = 500;
export const ADS_CHANCE_Z = 1.96;
export const ADS_OWN_DAYS = 14;
export const ADS_OWN_START_MINOR = 1e3;
export const ADS_DEFAULT_MILES = 5;
export const ADS_TOTAL_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];
export const ADS_DAILY_CHOICES_MINOR = [500, 1e3, 1500, 2500, 4e3];
export const ADS_END_SHIFTS = [-7, 7, 14, 30];
export const ADS_SPECIAL_MILES = 15;
export const ADS_DISPLAY_NAME_MAX = 20;
export const ADS_ZIP_DIGITS = 5;
export const ADS_COPY_LIMITS = { headlineFacebook: 27, headlineInstagram: 40, textInstagram: 125, near: 0.8 };
export const BUDGET_RULES = {
  meta: { maxStep: null, waitDays: 0, totalMaxDays: null, dailyIsAverage: true, changeRelearns: true },
  google: { maxStep: null, waitDays: 0, totalMaxDays: 90, dailyIsAverage: true, changeRelearns: true },
  tiktok: { maxStep: 0.3, waitDays: 2, totalMaxDays: null, dailyIsAverage: false, changeRelearns: true }
};
export const SCHEDULE_NEEDS_TOTAL = { meta: true, google: false, tiktok: false };
export const DOOR_NEEDS = {
  whatsapp: { meta: ["page-linked", "whatsapp-linked", "payment", "chanlytics-whatsapp"] },
  call: { google: ["account-active", "payment", "number-on-page", "call-reporting", "verification"] },
  form: {
    meta: ["page-linked", "payment", "lead-terms", "privacy-link", "yes-line"],
    tiktok: ["tiktok-linked", "payment", "identity", "privacy-link", "yes-line"]
  }
};
export const STANDING_CHECKS = {
  meta: ["account-active", "payment", "page-linked", "whatsapp-linked", "instagram-linked", "chanlytics-whatsapp"],
  google: ["account-active", "payment", "number-on-page", "call-reporting"],
  tiktok: ["tiktok-linked", "payment", "privacy-link"]
};
export const ADS_PERMISSION_WARN_DAYS = 7;
export const ADS_SOFT_NEEDS = ["price-changed", "permission-lapsing"];
export const countedDoor = (door) => door !== "call";
export const ADS_GROUP_FROM = 7;
export const ADS_AGE_FLOOR = 18;
export const ADS_AGE_FLOOR_COSMETIC = 25;
export const ADS_GOOGLE_HEADLINE_MAX = 30;
export const ADS_GOOGLE_DESCRIPTION_MAX = 90;
export const ADS_GOOGLE_NAME_MAX = 25;
export const ADS_GOOGLE_DAILY = { day: 2, month: 30.4 };
export const ADS_CALL_SECONDS = 60;
export const ADS_LEAD_DAYS = 7;
