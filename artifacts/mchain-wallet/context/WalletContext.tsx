import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { generateKeyPair, type KeyPair } from "@/services/crypto";

const KEYS = {
  IS_ONBOARDED: "mchain_is_onboarded",
  MXC_ADDRESS: "mchain_mxc_address",
  ETH_ADDRESS: "mchain_eth_address",
  PUBLIC_KEY: "mchain_public_key",
  MONIKER: "mchain_moniker",
  DEVICE_ID: "mchain_device_id",
  PRIVATE_KEY: "mchain_private_key",
};

interface WalletContextType {
  isLoading: boolean;
  isOnboarded: boolean;
  mxcAddress: string | null;
  ethAddress: string | null;
  publicKey: string | null;
  moniker: string;
  deviceId: string;
  validatorStatus: "active" | "pending" | "offline" | "banned" | null;
  setValidatorStatus: (
    status: "active" | "pending" | "offline" | "banned" | null
  ) => void;
  pendingHeartbeat: boolean;
  setPendingHeartbeat: (pending: boolean) => void;
  generateAndStoreKeyPair: () => Promise<KeyPair>;
  completeOnboarding: (
    mxcAddress: string,
    ethAddress: string,
    publicKey: string,
    privateKey: string,
    moniker: string
  ) => Promise<void>;
  getPrivateKey: () => Promise<string | null>;
  updateMoniker: (moniker: string) => Promise<void>;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [mxcAddress, setMxcAddress] = useState<string | null>(null);
  const [ethAddress, setEthAddress] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [moniker, setMoniker] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [validatorStatus, setValidatorStatus] = useState<
    "active" | "pending" | "offline" | "banned" | null
  >(null);
  const [pendingHeartbeat, setPendingHeartbeat] = useState(false);

  useEffect(() => {
    loadStoredData();
  }, []);

  async function loadStoredData() {
    try {
      const [onboarded, addr, eth, pubKey, mon, devId] = await Promise.all([
        AsyncStorage.getItem(KEYS.IS_ONBOARDED),
        AsyncStorage.getItem(KEYS.MXC_ADDRESS),
        AsyncStorage.getItem(KEYS.ETH_ADDRESS),
        AsyncStorage.getItem(KEYS.PUBLIC_KEY),
        AsyncStorage.getItem(KEYS.MONIKER),
        AsyncStorage.getItem(KEYS.DEVICE_ID),
      ]);

      setIsOnboarded(onboarded === "true");
      if (addr) setMxcAddress(addr);
      if (eth) setEthAddress(eth);
      if (pubKey) setPublicKey(pubKey);
      setMoniker(mon ?? "");

      if (devId) {
        setDeviceId(devId);
      } else {
        const newId =
          Date.now().toString() + Math.random().toString(36).substring(2, 9);
        await AsyncStorage.setItem(KEYS.DEVICE_ID, newId);
        setDeviceId(newId);
      }
    } catch {
      // Continue with defaults
    } finally {
      setIsLoading(false);
    }
  }

  const generateAndStoreKeyPair = useCallback(async (): Promise<KeyPair> => {
    return generateKeyPair();
  }, []);

  const completeOnboarding = useCallback(
    async (
      addr: string,
      eth: string,
      pubKey: string,
      privKey: string,
      mon: string
    ) => {
      await Promise.all([
        AsyncStorage.setItem(KEYS.IS_ONBOARDED, "true"),
        AsyncStorage.setItem(KEYS.MXC_ADDRESS, addr),
        AsyncStorage.setItem(KEYS.ETH_ADDRESS, eth),
        AsyncStorage.setItem(KEYS.PUBLIC_KEY, pubKey),
        AsyncStorage.setItem(KEYS.MONIKER, mon),
        SecureStore.setItemAsync(KEYS.PRIVATE_KEY, privKey),
      ]);
      setIsOnboarded(true);
      setMxcAddress(addr);
      setEthAddress(eth);
      setPublicKey(pubKey);
      setMoniker(mon);
    },
    []
  );

  const getPrivateKey = useCallback(async (): Promise<string | null> => {
    return SecureStore.getItemAsync(KEYS.PRIVATE_KEY);
  }, []);

  const updateMoniker = useCallback(async (mon: string) => {
    await AsyncStorage.setItem(KEYS.MONIKER, mon);
    setMoniker(mon);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        isLoading,
        isOnboarded,
        mxcAddress,
        ethAddress,
        publicKey,
        moniker,
        deviceId,
        validatorStatus,
        setValidatorStatus,
        pendingHeartbeat,
        setPendingHeartbeat,
        generateAndStoreKeyPair,
        completeOnboarding,
        getPrivateKey,
        updateMoniker,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
