/**
 * The call in progress on the Lock Screen and in the Dynamic Island (the PRD, PR 7). Started by the site with a
 * push when the call starts; ended by the app when the page's Live says no call is in progress. Past its stale date
 * the phone keeps it for hours, so it stops naming anyone then: whoever it named may be long off the line. The
 * 'widget' directive: nothing outside the function exists inside it. Its name and its props' shape are contracts'
 * (live-activity.ts), which the site's push fills.
 */
import { HStack, Image, Text, VStack } from "@expo/ui/swift-ui";
import { font, foregroundStyle, padding } from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity, type LiveActivityEnvironment } from "expo-widgets";
import { CALL_ACTIVITY_NAME, type CallActivityProps } from "@chanlytics/contracts";

const CallActivity = (props: CallActivityProps, environment: LiveActivityEnvironment) => {
  "widget";
  const coral = "#fa695c";
  const ink = "#fbfaf8";
  const stale = environment.isStale === true;
  const who = stale ? "A call" : props.who;
  const with_ = stale ? "It may have ended" : `On the line with your receptionist · ${props.line}`;
  return {
    banner: (
      <HStack spacing={10} modifiers={[padding({ all: 12 })]}>
        <Image systemName="phone.fill" color={coral} />
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 15, weight: "semibold" }), foregroundStyle(ink)]}>{who}</Text>
          <Text modifiers={[font({ size: 12 }), foregroundStyle("#a7a8ab")]}>{with_}</Text>
        </VStack>
      </HStack>
    ),
    compactLeading: <Image systemName="phone.fill" color={coral} />,
    compactTrailing: <Text modifiers={[font({ size: 12 })]}>{who}</Text>,
    minimal: <Image systemName="phone.fill" color={coral} />,
    expandedLeading: <Image systemName="phone.fill" color={coral} />,
    expandedCenter: (
      <VStack alignment="leading" spacing={2}>
        <Text modifiers={[font({ size: 15, weight: "semibold" })]}>{who}</Text>
        <Text modifiers={[font({ size: 12 })]}>
          {stale ? "It may have ended" : `With your receptionist · ${props.line}`}
        </Text>
      </VStack>
    ),
  };
};

export default createLiveActivity<CallActivityProps>(CALL_ACTIVITY_NAME, CallActivity);
