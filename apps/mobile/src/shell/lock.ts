/**
 * The lock (the PR 3 design): Face ID, Touch ID or the phone's passcode in front of the pages at launch and after
 * two minutes in the background, on by default where the phone can lock, until the person turns it off from the
 * lock screen itself. The choice lives in the secure store; the rule in sign-in.ts.
 */
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const KEY = "chanlytics.lock";

export async function canLock(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export async function lockChoice(): Promise<boolean | null> {
  try {
    const v = await SecureStore.getItemAsync(KEY);
    return v === "on" ? true : v === "off" ? false : null;
  } catch {
    return null;
  }
}

export async function setLockChoice(on: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, on ? "on" : "off");
  } catch {
    /* a store that refuses keeps the default */
  }
}

export async function unlock(): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock Chanlytics",
      cancelLabel: "Cancel",
    });
    return r.success;
  } catch {
    return false;
  }
}
