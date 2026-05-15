import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useWallet } from "@/context/WalletContext";
import { api, type Epoch } from "@/services/api";
import { signEpochBlockHash } from "@/services/crypto";

type ApiError = Error & { status?: number; data?: Record<string, unknown> };

export function useHeartbeat() {
  const {
    validatorWallet,
    validatorStatus,
    setValidatorStatus,
    setPendingHeartbeat,
  } = useWallet();

  const validatorAddress = validatorWallet?.mxcAddress ?? null;
  const walletId = validatorWallet?.id ?? null;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeMinutesRef = useRef(0);
  const validatorAddressRef = useRef(validatorAddress);
  const walletIdRef = useRef(walletId);
  const stoppedRef = useRef(false);

  // Epoch state — tracked in refs to avoid re-render churn in the hot path,
  // but also exposed as React state for the UI.
  const openEpochRef = useRef<Epoch | null>(null);
  const signedEpochsRef = useRef<Set<number>>(new Set());
  const [openEpoch, setOpenEpoch] = useState<Epoch | null>(null);

  useEffect(() => {
    validatorAddressRef.current = validatorAddress;
    walletIdRef.current = walletId;
  }, [validatorAddress, walletId]);

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

  // Build an epoch signature if an open epoch exists, hasn't been signed yet,
  // and the signing window hasn't expired.
  const buildEpochSignature = useCallback(async (): Promise<
    { epochNumber: number; signature: string } | undefined
  > => {
    const epoch = openEpochRef.current;
    if (!epoch) return undefined;
    if (signedEpochsRef.current.has(epoch.epochNumber)) return undefined;
    if (new Date(epoch.signingWindowClosesAt) <= new Date()) return undefined;

    const wId = walletIdRef.current;
    if (!wId) return undefined;

    try {
      const pk = await SecureStore.getItemAsync(`mchain_pk_${wId}`);
      if (!pk) return undefined;
      const signature = signEpochBlockHash(epoch.blockHash, pk);
      signedEpochsRef.current.add(epoch.epochNumber);
      return { epochNumber: epoch.epochNumber, signature };
    } catch {
      return undefined;
    }
  }, []);

  const sendHeartbeat = useCallback(async () => {
    const address = validatorAddressRef.current;
    if (!address || stoppedRef.current) return;

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

    const epochSignature = await buildEpochSignature();

    try {
      const resp = await api.sendHeartbeat({
        address,
        batteryLevel,
        isCharging,
        activeMinutes: activeMinutesRef.current,
        ...(epochSignature ? { epochSignature } : {}),
      });

      setPendingHeartbeat(false);
      setValidatorStatus("active");
      activeMinutesRef.current = 0;

      // Store the open epoch from the response for the next signing cycle
      const nextEpoch = resp.openEpoch ?? null;
      openEpochRef.current = nextEpoch;
      setOpenEpoch(nextEpoch);
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
  }, [setValidatorStatus, setPendingHeartbeat, stopInterval, buildEpochSignature]);

  // Restart the foreground interval when the validator is re-activated
  const prevStatusRef = useRef(validatorStatus);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = validatorStatus;
    if (prev !== "active" && validatorStatus === "active" && validatorAddress) {
      stoppedRef.current = false;
      sendHeartbeat();
      startInterval(sendHeartbeat);
    }
  }, [validatorStatus, validatorAddress, sendHeartbeat, startInterval]);

  // Start interval when validator address first becomes available
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

  return { sendHeartbeat, restartSession, openEpoch };
}
