import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { api } from "./api";

export const HEARTBEAT_TASK = "mchain-heartbeat-task";

TaskManager.defineTask(HEARTBEAT_TASK, async () => {
  try {
    const address = await AsyncStorage.getItem("mchain_mxc_address");
    if (!address) return BackgroundFetch.BackgroundFetchResult.NoData;

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

    await api.sendHeartbeat({
      address,
      batteryLevel,
      isCharging,
      activeMinutes: 1,
    });

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
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
