export const ADS_ROUTE = "campaigns/ads";
const DOORS = ["whatsapp", "call", "form"];
const STARTS = ["copy", "again", "google"];
const NONE = { ad: null, compose: null, results: false };
export const isAdsParam = (param) => /^ads(:|$)/.test(param);
export function adsPreviewOf(config) {
  if (typeof config !== "object" || config === null || !("features" in config)) return false;
  const features = config.features;
  return typeof features === "object" && features !== null && "ads_preview" in features && features.ads_preview === true;
}
const adStartOf = (word) => STARTS.find((s) => s === word);
function composeOf(rest) {
  const [first = "", ...more] = rest.split(":");
  const how = adStartOf(first);
  const id = more.join(":");
  if (how && id) return { door: how === "google" ? "call" : "whatsapp", from: { how, id } };
  return { door: DOORS.find((d) => d === first) ?? "whatsapp", from: null };
}
export function parseAds(param) {
  const rest = param.replace(/^ads:?/, "");
  if (rest.startsWith("ad:")) {
    const id = rest.slice("ad:".length);
    return id ? { ...NONE, ad: id } : NONE;
  }
  if (rest === "results") return { ...NONE, results: true };
  if (rest === "new") return { ...NONE, compose: composeOf("") };
  if (rest.startsWith("new:")) return { ...NONE, compose: composeOf(rest.slice("new:".length)) };
  return NONE;
}
export const adRoute = (id) => `${ADS_ROUTE}:ad:${id}`;
export const newAdRoute = (door = "whatsapp") => door === "whatsapp" ? `${ADS_ROUTE}:new` : `${ADS_ROUTE}:new:${door}`;
export const newAdFromRoute = (how, id) => `${ADS_ROUTE}:new:${how}:${id}`;
export const adsResultsRoute = () => `${ADS_ROUTE}:results`;
export const ADS_SCOPE_ALL = { kind: "all" };
const SCOPE_PLATFORMS = ["meta", "google", "tiktok"];
export function adsScopeKey(scope) {
  if (scope.kind === "all") return "all";
  return scope.kind === "platform" ? `platform:${scope.platform}` : `ad:${scope.id}`;
}
export function adsScopeOfKey(key) {
  if (key === "all") return ADS_SCOPE_ALL;
  if (key.startsWith("platform:")) {
    const platform = SCOPE_PLATFORMS.find((p) => p === key.slice("platform:".length));
    return platform ? { kind: "platform", platform } : null;
  }
  const id = key.startsWith("ad:") ? key.slice("ad:".length) : "";
  return id ? { kind: "ad", id } : null;
}
export const ADS_WORDS = {
  viewsLabel: "Which campaigns",
  messagesTab: "Messages",
  adsTab: "Ads",
  newAd: "New ad"
};
