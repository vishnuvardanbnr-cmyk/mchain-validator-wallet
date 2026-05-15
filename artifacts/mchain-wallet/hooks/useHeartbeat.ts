import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useWallet } from "@/context/WalletContext";
import { api } from "@/services/api";

type ApiError = Error & { status?: number; data?: Record<string, unknown> };

export function useHeartbeat() {
  const {
    validatorWallet,
    validatorStatus,
    setValidatorStatus,
    setPendingHeartbeat,
  } = useWallet();

  const validatorAddress = validatorWallet?.mxcAddress ?? null;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeMinutesRef = useRef(0);
  const validatorAddressRef = useRef(validatorAddress);
  const stoppedRef = useRef(false);

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

    // Don't send heartbeats if paused, inactive, or banned
    const currentStatus = validatorAddressRef.current ? undefined : null;
    void currentStatus; // status is read from context via validatorStatus directly

    let batteryLevel = 85;
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
      setValidatorStatus("active");
      activeMinutesRef.current = 0;
    } catch (err: unknown) {
      const apiErr = err as ApiError;

      if (apiErr?.status === 403) {
        const errorMsg: string =
          (apiErr.data?.error as string) ??
          (apiErr.data?.message as string) ??
          "";

        if (errorMsg === "validator_paused" || errorMsg.includes("paused")) {
          stopInterval();
          setValidatorStatus("paused");
        } else if (errorMsg.includes("pending")) {
          setPendingHeartbeat(true);
          setValidatorStatus("pending");
        } else if (errorMsg.includes("inactive")) {
          stopInterval();
          setValidatorStatus("inactive");
        } else if (errorMsg.includes("banned")) {
          stopInterval();
          setValidatorStatus("banned");
        } else {
          setPendingHeartbeat(true);
          setValidatorStatus("pending");
        }
      }
    }
  }, [setValidatorStatus, setPendingHeartbeat, stopInterval]);

  // Restart the foreground interval when the validator is re-activated
  const prevStatusRef = useRef(validatorStatus);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = validatorStatus;
    if (
      prev !== "active" &&
      validatorStatus === "active" &&
      validatorAddress
    ) {
      stoppedRef.current = false;
      sendHeartbeat();
      startInterval(sendHeartbeat);
    }
  }, [validatorStatus, validatorAddress, sendHeartbeat, startInterval]);

  // Start interval when validator address is available and status is active
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
    setValidatorStatus("active");
    activeMinutesRef.current = 0;
    sendHeartbeat();
    startInterval(sendHeartbeat);
    return result;
  }, [setValidatorStatus, sendHeartbeat, startInterval]);

  return { sendHeartbeat, restartSession };
}
