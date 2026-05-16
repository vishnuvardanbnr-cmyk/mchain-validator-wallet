import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { signEpochBlockHash } from "./crypto";

export const HEARTBEAT_TASK = "mchain-validator-heartbeat";

const CHAIN_BASE = "https://chain.mvault.pro/api";
const VALIDATOR_ADDRESS_KEY = "mchain_validator_address";
const VALIDATOR_STATUS_KEY = "validatorStatus";
const VALIDATOR_WALLET_ID_KEY = "mchain_validator_wallet_id";
const OPEN_EPOCH_KEY = "mchain_open_epoch_v1";

// ─── Define the background task at module top-level ───────────────────────────
TaskManager.defineTask(HEARTBEAT_TASK, async () => {
  try {
    const address = await AsyncStorage.getItem(VALIDATOR_ADDRESS_KEY);
    if (!address) return BackgroundFetch.BackgroundFetchResult.NoData;

    const status = await AsyncStorage.getItem(VALIDATOR_STATUS_KEY);
    if (status === "paused" || status === "inactive" || status === "banned") {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    let batteryLevel = 85;
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

    // ── Epoch signing ──────────────────────────────────────────────────────────
    let epochSignature: { epochNumber: number; signature: string } | undefined;
    try {
      const epochJson = await AsyncStorage.getItem(OPEN_EPOCH_KEY);
      if (epochJson) {
        const storedEpoch = JSON.parse(epochJson) as {
          epochNumber: number;
          blockHash: string;
          signingWindowClosesAt: string;
        };
        const windowClose = new Date(storedEpoch.signingWindowClosesAt);
        if (windowClose > new Date()) {
          const walletId = await AsyncStorage.getItem(VALIDATOR_WALLET_ID_KEY);
          if (walletId) {
            const pk = await SecureStore.getItemAsync(`mchain_pk_${walletId}`);
            if (pk) {
              const sig = signEpochBlockHash(storedEpoch.blockHash, pk);
              epochSignature = { epochNumber: storedEpoch.epochNumber, signature: sig };
            }
          }
        }
      }
    } catch {
      // Signing unavailable — still send heartbeat without signature
    }

    const body: Record<string, unknown> = { address, batteryLevel, isCharging };
    if (epochSignature) body.epochSignature = epochSignature;

    const response = await fetch(`${CHAIN_BASE}/validators/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.status === 429) {
      // Too soon — back off, but don't change status
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    if (response.status === 403) {
      const data = await response.json().catch(() => ({}));
      const errorMsg: string = data.error ?? data.message ?? "";

      if (errorMsg === "validator_paused" || data.restartRequired === true) {
        await AsyncStorage.setItem(VALIDATOR_STATUS_KEY, "paused");
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const Notifs = require("expo-notifications");
          await Notifs.scheduleNotificationAsync({
            content: {
              title: "Validator Paused",
              body: "Your phone was offline too long. Open the app to restart and keep earning.",
            },
            trigger: null,
          });
        } catch {
          // Notifications unavailable in this environment (Expo Go)
        }
      } else if (errorMsg.includes("pending")) {
        // awaiting approval — no action needed, just wait
      } else if (errorMsg.includes("inactive")) {
        await AsyncStorage.setItem(VALIDATOR_STATUS_KEY, "inactive");
      } else if (errorMsg.includes("banned")) {
        await AsyncStorage.setItem(VALIDATOR_STATUS_KEY, "banned");
      }

      return BackgroundFetch.BackgroundFetchResult.Failed;
    }

    // Store open epoch from response for the next signing cycle
    try {
      const result = await response.json() as { openEpoch?: { epochNumber: number; blockHash: string; signingWindowClosesAt: string } | null };
      if (result.openEpoch) {
        await AsyncStorage.setItem(OPEN_EPOCH_KEY, JSON.stringify(result.openEpoch));
      } else {
        await AsyncStorage.removeItem(OPEN_EPOCH_KEY);
      }
    } catch {
      // Ignore JSON parse errors
    }

    await AsyncStorage.setItem(VALIDATOR_STATUS_KEY, "active");
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ─── Register / unregister ────────────────────────────────────────────────────
export async function registerHeartbeatTask(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(HEARTBEAT_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(HEARTBEAT_TASK, {
        minimumInterval: 8 * 60, // 8 minutes as per spec
        stopOnTerminate: false,   // keep running on Android when app is closed
        startOnBoot: true,        // restart after phone reboot
      });
    }
  } catch {
    // Background fetch unavailable in this environment (simulator / web)
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
