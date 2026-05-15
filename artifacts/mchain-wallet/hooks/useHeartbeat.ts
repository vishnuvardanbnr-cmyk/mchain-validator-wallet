import { router } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useWallet } from "@/context/WalletContext";
import { api } from "@/services/api";

type ApiError = Error & { status?: number; data?: Record<string, unknown> };

export function useHeartbeat() {
  const {
    validatorWallet,
    setValidatorStatus,
    setPendingHeartbeat,
    sessionExpired,
    setSessionExpired,
    setSessionExpiresAt,
    setIsStaked,
  } = useWallet();

  const validatorAddress = validatorWallet?.mxcAddress ?? null;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeMinutesRef = useRef(0);
  const validatorAddressRef = useRef(validatorAddress);
  const stoppedRef = useRef(false);
  const prevSessionExpiredRef = useRef(sessionExpired);

  useEffect(() => {
    validatorAddressRef.current = validatorAddress;
  }, [validatorAddress]);

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
    const address = validatorAddressRef.current;
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
          stopInterval();
          setSessionExpired(true);
          const expiredAt = apiErr.data.expiredAt as string | undefined;
          if (expiredAt) await setSessionExpiresAt(expiredAt);
          router.push("/(tabs)");
        } else {
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

  // Resume interval when session is restarted from any screen
  useEffect(() => {
    if (prevSessionExpiredRef.current && !sessionExpired && validatorAddress) {
      stoppedRef.current = false;
      sendHeartbeat();
      startInterval(sendHeartbeat);
    }
    prevSessionExpiredRef.current = sessionExpired;
  }, [sessionExpired, validatorAddress, sendHeartbeat, startInterval]);

  useEffect(() => {
    if (!validatorAddress) return;
    stoppedRef.current = false;

    sendHeartbeat();
    startInterval(sendHeartbeat);

    return () => stopInterval();
  }, [validatorAddress, sendHeartbeat, startInterval, stopInterval]);

  const restartSession = useCallback(async () => {
    const address = validatorAddressRef.current;
    if (!address) throw new Error("No validator wallet address");

    const result = await api.restartSession(address);

    await setSessionExpiresAt(result.sessionExpiresAt);
    setSessionExpired(false);
    setIsStaked(false);
    activeMinutesRef.current = 0;

    sendHeartbeat();
    startInterval(sendHeartbeat);

    return result;
  }, [setSessionExpiresAt, setSessionExpired, setIsStaked, sendHeartbeat, startInterval]);

  return { sendHeartbeat, restartSession };
}
