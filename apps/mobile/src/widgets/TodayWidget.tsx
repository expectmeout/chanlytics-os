/**
 * Today on the home screen and the Lock Screen (the PRD, M7). Everything the widget says comes from one snapshot the
 * page handed over (contracts todayWidgetSnapshot): the standing's headline, the four figures, who is waiting, and
 * the first person who needs you, as of a moment. The 'widget' directive compiles this into the widget extension's
 * own runtime, so nothing outside the function exists here: no hooks, no imports of the app, no module-scope values.
 */
import { HStack, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import { font, foregroundStyle, padding } from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

export interface TodayWidgetProps {
  headline: string;
  figures: { label: string; value: number }[];
  waiting: number;
  first: { who: string; reason: string } | null;
  /** "3:41 PM", already in the person's clock: the widget runtime has no timezone of the workspace. */
  asOf: string;
}

const TodayWidget = (props: TodayWidgetProps, environment: WidgetEnvironment) => {
  "widget";
  const dark = environment.colorScheme === "dark" || environment.widgetRenderingMode === "vibrant";
  const ink = dark ? "#fbfaf8" : "#161616";
  const muted = dark ? "#a7a8ab" : "#6b6c70";
  const coral = "#fa695c";
  const small = environment.widgetFamily === "systemSmall";
  // The Lock Screen's rectangle, the one accessory family app.config.ts declares.
  const lockScreen = environment.widgetFamily === "accessoryRectangular";

  if (lockScreen) {
    return (
      <VStack alignment="leading" spacing={2}>
        <Text modifiers={[font({ size: 13, weight: "semibold" })]}>{props.headline}</Text>
        <Text modifiers={[font({ size: 12 })]}>
          {props.first ? `${props.first.who}: ${props.first.reason}` : `As of ${props.asOf}`}
        </Text>
      </VStack>
    );
  }

  const figures = small ? props.figures.slice(0, 2) : props.figures.slice(0, 4);
  return (
    <VStack alignment="leading" spacing={6} modifiers={[padding({ all: 4 })]}>
      <Text modifiers={[font({ size: small ? 14 : 15, weight: "semibold" }), foregroundStyle(ink)]}>
        {props.headline}
      </Text>
      <HStack spacing={small ? 10 : 14}>
        {figures.map((f) => (
          <VStack key={f.label} alignment="leading" spacing={0}>
            <Text modifiers={[font({ size: small ? 22 : 26, weight: "bold" }), foregroundStyle(ink)]}>
              {String(f.value)}
            </Text>
            <Text modifiers={[font({ size: 11 }), foregroundStyle(muted)]}>{f.label}</Text>
          </VStack>
        ))}
        <Spacer />
      </HStack>
      <Spacer />
      {props.first ? (
        <Text modifiers={[font({ size: 12, weight: "medium" }), foregroundStyle(coral)]}>
          {props.first.who}: {props.first.reason}
        </Text>
      ) : (
        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>
          {props.waiting > 0 ? `${String(props.waiting)} waiting on you` : "Nobody is waiting on you"}
        </Text>
      )}
      <Text modifiers={[font({ size: 10 }), foregroundStyle(muted)]}>{`As of ${props.asOf}`}</Text>
    </VStack>
  );
};

export default createWidget<TodayWidgetProps>("TodayWidget", TodayWidget);
