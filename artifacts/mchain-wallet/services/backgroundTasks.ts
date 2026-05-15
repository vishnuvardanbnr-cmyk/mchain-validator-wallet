import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { api } from "./api";

export const HEARTBEAT_TASK = "mchain-heartbeat-task";
const SESSION_EXPIRES_AT_KEY = "mchain_session_expires_at";
const VALIDATOR_ADDRESS_KEY = "mchain_validator_address";

TaskManager.defineTask(HEARTBEAT_TASK, async () => {
  try {
    const address = await AsyncStorage.getItem(VALIDATOR_ADDRESS_KEY);
    if (!address) return BackgroundFetch.BackgroundFetchResult.NoData;

    // Check if session is already expired before attempting heartbeat
    try {
      const storedExpiry = await SecureStore.getItemAsync(SESSION_EXPIRES_AT_KEY);
      if (storedExpiry && new Date(storedExpiry) < new Date()) {
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }
    } catch {
      // ignore
    }

    let batteryLevel = 50;
    let isCharging = false;

    if (Platform.OS !== "web") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Battery = require("expo-battery");
        const level = await Battery.getBatteryLevelAsync();
        batteryLevel = Math.round(level * 100);
        const state = await Battery.getBatteryStateAsync();
        isCharging =
          state === Battery.BatteryState.CHARGING ||
          state === Battery.BatteryState.FULL;
      } catch {
        // Battery info unavailable
      }
    }

    const res = await api.sendHeartbeat({
      address,
      batteryLevel,
      isCharging,
      activeMinutes: 1,
    });

    // Persist updated session expiry from successful heartbeat
    if (res.sessionExpiresAt) {
      await SecureStore.setItemAsync(SESSION_EXPIRES_AT_KEY, res.sessionExpiresAt);
    }

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (err: unknown) {
    const apiErr = err as { status?: number; data?: Record<string, unknown> };

    if (apiErr?.status === 403 && apiErr?.data?.error === "session_expired") {
      const expiredAt = apiErr.data.expiredAt as string | undefined;
      if (expiredAt) {
        try {
          await SecureStore.setItemAsync(SESSION_EXPIRES_AT_KEY, expiredAt);
        } catch {
          // ignore
        }
      }
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerHeartbeatTask(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(HEARTBEAT_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(HEARTBEAT_TASK, {
        minimumInterval: 60,
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  } catch {
    // Background fetch not available in this environment
  }
}

export async function unregisterHeartbeatTask(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(HEARTBEAT_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(HEARTBEAT_TASK);
    }
  } catch {
    // Ignore
  }
}
