import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export type NotifKey =
  | "notif_validator_paused"
  | "notif_epoch_signed"
  | "notif_new_epoch"
  | "notif_heartbeat_failed";

const DEFAULTS: Record<NotifKey, boolean> = {
  notif_validator_paused: true,
  notif_epoch_signed: false,
  notif_new_epoch: false,
  notif_heartbeat_failed: true,
};

export async function getNotifPref(key: NotifKey): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(key);
    if (val === null) return DEFAULTS[key];
    return val === "1";
  } catch {
    return DEFAULTS[key];
  }
}

export async function setNotifPref(key: NotifKey, enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(key, enabled ? "1" : "0");
}

export async function getAllNotifPrefs(): Promise<Record<NotifKey, boolean>> {
  const keys: NotifKey[] = [
    "notif_validator_paused",
    "notif_epoch_signed",
    "notif_new_epoch",
    "notif_heartbeat_failed",
  ];
  const pairs = await Promise.all(keys.map(async (k) => [k, await getNotifPref(k)] as const));
  return Object.fromEntries(pairs) as Record<NotifKey, boolean>;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === "granted") return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

export async function getNotificationPermissionStatus(): Promise<"granted" | "denied" | "undetermined"> {
  if (Platform.OS === "web") return "denied";
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status as "granted" | "denied" | "undetermined";
  } catch {
    return "undetermined";
  }
}

export async function sendNotifIfEnabled(
  key: NotifKey,
  title: string,
  body: string,
): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const enabled = await getNotifPref(key);
    if (!enabled) return;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null,
    });
  } catch {
    // Notifications unavailable (simulator / Expo Go restrictions)
  }
}
