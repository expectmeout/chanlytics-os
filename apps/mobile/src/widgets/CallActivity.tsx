/**
 * The call in progress on the Lock Screen and in the Dynamic Island (the PRD, PR 7). Started by the site with a
 * push when the call starts; ended by the app when the page's Live says no call is in progress, or by the phone
 * when it goes stale. The 'widget' directive: nothing outside the function exists here.
 */
import { HStack, Image, Text, VStack } from "@expo/ui/swift-ui";
import { font, foregroundStyle, padding } from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity, type LiveActivityEnvironment } from "expo-widgets";

export interface CallActivityProps {
  who: string;
  line: string;
  startedAt: string;
}

const CallActivity = (props: CallActivityProps, environment: LiveActivityEnvironment) => {
  "widget";
  const teal = "#3cb79e";
  const ink = environment.isLuminanceReduced ? "#ffffff" : "#fbfaf8";
  return {
    banner: (
      <HStack spacing={10} modifiers={[padding({ all: 12 })]}>
        <Image systemName="phone.fill" color={teal} />
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 15, weight: "semibold" }), foregroundStyle(ink)]}>{props.who}</Text>
          <Text
            modifiers={[font({ size: 12 }), foregroundStyle("#a7a8ab")]}
          >{`On the line with your receptionist · ${props.line}`}</Text>
        </VStack>
      </HStack>
    ),
    compactLeading: <Image systemName="phone.fill" color={teal} />,
    compactTrailing: <Text modifiers={[font({ size: 12 })]}>{props.who}</Text>,
    minimal: <Image systemName="phone.fill" color={teal} />,
    expandedLeading: <Image systemName="phone.fill" color={teal} />,
    expandedCenter: (
      <VStack alignment="leading" spacing={2}>
        <Text modifiers={[font({ size: 15, weight: "semibold" })]}>{props.who}</Text>
        <Text modifiers={[font({ size: 12 })]}>{`With your receptionist · ${props.line}`}</Text>
      </VStack>
    ),
  };
};

export default createLiveActivity<CallActivityProps>("CallActivity", CallActivity);
