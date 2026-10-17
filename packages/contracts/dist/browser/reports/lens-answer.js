export function lensAnswerOf(lens, parts) {
  const { vm, campaigns, deals, reviews, people, ads } = parts;
  switch (lens) {
    case "overview":
      return vm.empty ? void 0 : vm.lines.hero;
    case "receptionist":
      return vm.empty ? void 0 : vm.lines.receptionist ?? void 0;
    case "people":
      return people?.head ?? vm.lines.people;
    case "pipeline":
      return deals?.present ? deals.headline : void 0;
    case "campaigns":
      return campaigns?.head ?? void 0;
    case "ads":
      return ads?.head ?? void 0;
    case "reviews":
      return reviews && !reviews.empty ? reviews.lines.head ?? void 0 : void 0;
  }
}
