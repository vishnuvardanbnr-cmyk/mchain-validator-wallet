import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useWallet } from "@/context/WalletContext";
import { api } from "@/services/api";

export function useHeartbeat() {
  const { mxcAddress, setValidatorStatus, setPendingHeartbeat } = useWallet();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeMinutesRef = useRef(0);
  const mxcAddressRef = useRef(mxcAddress);

  useEffect(() => {
    mxcAddressRef.current = mxcAddress;
  }, [mxcAddress]);

  const sendHeartbeat = useCallback(async () => {
    const address = mxcAddressRef.current;
    if (!address) return;

    let batteryLevel = 50;
    let isCharging = false;

    if (Platform.OS !== "web") {
      try {
        const Battery = await import("expo-battery");
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

    try {
      await api.sendHeartbeat({
        address,
        batteryLevel,
        isCharging,
        activeMinutes: activeMinutesRef.current,
      });
      setPendingHeartbeat(false);
      activeMinutesRef.current = 0;
    } catch (err: unknown) {
      const apiErr = err as { status?: number };
      if (apiErr?.status === 403) {
        setPendingHeartbeat(true);
        setValidatorStatus("pending");
      }
    }
  }, [setValidatorStatus, setPendingHeartbeat]);

  useEffect(() => {
    if (!mxcAddress) return;

    sendHeartbeat();

    intervalRef.current = setInterval(() => {
      activeMinutesRef.current += 1;
      sendHeartbeat();
    }, 60_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [mxcAddress, sendHeartbeat]);

  return { sendHeartbeat };
}
