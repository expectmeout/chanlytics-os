export function googleAudienceWords(a) {
  if (a === "testing")
    return "Google is reviewing Chanlytics; until then Connect works for invited Google accounts only.";
  if (a === "unverified")
    return "Google shows a warning until its review of Chanlytics is done \u2014 choose Advanced, then Go to Chanlytics.";
  return null;
}
