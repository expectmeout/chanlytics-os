/**
 * The phone is told (the PRD, M6; the PR 2 design). Two pure rules and the effects around expo-notifications:
 *
 * - which tab a kept row's route belongs to, and the route a tapped notification carries (pure, tested);
 * - asking permission and a token, on a device only, after the Android channel exists (a 13+ rule), and handing the
 *   token to the page over the bridge, which registers it through the account route (the page's transport rule);
 * - a tap, cold or warm, becoming a pending route the owning tab's page is asked to open once it is ready;
 * - the icon's number, set from the page's bell and from the push's own badge field.
 */
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { routeOfData } from "./notifications-pure";
export { tabOf, routeOfData, badgeOfData } from "./notifications-pure";

/** In the foreground a push is shown as a banner and kept in the list, with its sound and its badge. */
export function installForegroundHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

const CHANNEL = "default";

/**
 * The phone's push token, or null: a simulator, a refusal, or a service that could not be reached. Never throws.
 * The channel comes first on Android: without one the permission prompt does not appear on 13 and later.
 */
export async function askForToken(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: "Chanlytics",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
    const have = await Notifications.getPermissionsAsync();
    const allowed = (p: Notifications.NotificationPermissionsStatus) =>
      p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    let perm = have;
    if (!allowed(perm)) perm = await Notifications.requestPermissionsAsync();
    if (!allowed(perm)) return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch {
    return null;
  }
}

export async function setBadge(n: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, Math.floor(n)));
  } catch {
    /* a launcher without badges */
  }
}

/** The route of the tap that started the app, if a tap did; read once. */
export async function coldStartRoute(): Promise<string | null> {
  try {
    const last = await Notifications.getLastNotificationResponseAsync();
    if (!last || last.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;
    await Notifications.clearLastNotificationResponseAsync();
    return routeOfData(last.notification.request.content.data);
  } catch {
    return null;
  }
}

/** Every tap while the app runs, and every token the service rotates. Returns the uninstall. */
export function listen(on: { tap: (route: string) => void; token: (token: string) => void }): () => void {
  const a = Notifications.addNotificationResponseReceivedListener((r) => {
    if (r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const route = routeOfData(r.notification.request.content.data);
    if (route) on.tap(route);
  });
  const b = Notifications.addPushTokenListener(async () => {
    const token = await askForToken();
    if (token) on.token(token);
  });
  return () => {
    a.remove();
    b.remove();
  };
}
