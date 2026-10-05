/**
 * The words of Campaigns' one act, "New message", as a head draws them: the verb, and the noun a narrow head leaves out
 * (`cm-act-noun`, which a phone's head hides). The home's head and Sent's both draw it, so there is one name for the one door
 * (contracts CAMPAIGN_ROOMS.newMessage), whichever room it is pressed in.
 */
import { CAMPAIGN_ROOMS } from "@chanlytics/contracts";

export function NewMessageLabel() {
  const [verb, ...noun] = CAMPAIGN_ROOMS.newMessage.split(" ");
  return (
    <span>
      {verb}
      <span className="cm-act-noun"> {noun.join(" ")}</span>
    </span>
  );
}
