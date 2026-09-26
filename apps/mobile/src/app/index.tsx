/**
 * The app opens at "/", and no tab lives there: without this file every launch landed on Expo Router's "Unmatched
 * Route" and no page ever mounted, so the sign-in screen never came either. "/" is Today, the tab the bar starts on.
 */
import { Redirect } from "expo-router";

export default function Index() {
  return <Redirect href="/today" />;
}
