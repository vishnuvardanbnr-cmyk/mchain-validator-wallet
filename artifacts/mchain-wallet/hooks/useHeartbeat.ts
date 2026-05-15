import { router } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useWallet } from "@/context/WalletContext";
import { api } from "@/services/api";

type ApiError = Error & { status?: number; data?: Record<string, unknown> };

export function useHeartbeat() {
  const {
    mxcAddress,
    setValidatorStatus,
    setPendingHeartbeat,
    setSessionExpired,
    setSessionExpiresAt,
    setIsStaked,
  } = useWallet();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeMinutesRef = useRef(0);
  const mxcAddressRef = useRef(mxcAddress);
  const stoppedRef = useRef(false);

  useEffect(() => {
    mxcAddressRef.current = mxcAddress;
  }, [mxcAddress]);

  const stopInterval = useCallback(() => {
    stoppedRef.current = true;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startInterval = useCallback((beat: () => void) => {
    stoppedRef.current = false;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      activeMinutesRef.current += 1;
      beat();
    }, 60_000);
  }, []);

  const sendHeartbeat = useCallback(async () => {
    const address = mxcAddressRef.current;
    if (!address || stoppedRef.current) return;

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
      const res = await api.sendHeartbeat({
        address,
        batteryLevel,
        isCharging,
        activeMinutes: activeMinutesRef.current,
      });

      setPendingHeartbeat(false);
      setSessionExpired(false);
      activeMinutesRef.current = 0;

      if (res.isStaked !== undefined) setIsStaked(res.isStaked);
      if (res.sessionExpiresAt !== undefined) {
        await setSessionExpiresAt(res.sessionExpiresAt ?? null);
      }
    } catch (err: unknown) {
      const apiErr = err as ApiError;

      if (apiErr?.status === 403) {
        if (apiErr?.data?.error === "session_expired") {
          // Session expired — stop heartbeats and show restart UI
          stopInterval();
          setSessionExpired(true);
          const expiredAt = apiErr.data.expiredAt as string | undefined;
          if (expiredAt) await setSessionExpiresAt(expiredAt);
          router.push("/(tabs)");
        } else {
          // Validator pending approval
          setPendingHeartbeat(true);
          setValidatorStatus("pending");
        }
      }
    }
  }, [
    setValidatorStatus,
    setPendingHeartbeat,
    setSessionExpired,
    setSessionExpiresAt,
    setIsStaked,
    stopInterval,
  ]);

  useEffect(() => {
    if (!mxcAddress) return;
    stoppedRef.current = false;

    sendHeartbeat();
    startInterval(sendHeartbeat);

    return () => stopInterval();
  }, [mxcAddress, sendHeartbeat, startInterval, stopInterval]);

  const restartSession = useCallback(async () => {
    const address = mxcAddressRef.current;
    if (!address) throw new Error("No wallet address");

    const result = await api.restartSession(address);

    await setSessionExpiresAt(result.sessionExpiresAt);
    setSessionExpired(false);
    setIsStaked(false);
    activeMinutesRef.current = 0;

    // Resume heartbeats
    sendHeartbeat();
    startInterval(sendHeartbeat);

    return result;
  }, [setSessionExpiresAt, setSessionExpired, setIsStaked, sendHeartbeat, startInterval]);

  return { sendHeartbeat, restartSession };
}
