import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { useFonts } from "expo-font";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PinModal } from "@/components/PinModal";
import { SplashLoader } from "@/components/SplashLoader";
import { PinProvider, usePinContext } from "@/context/PinContext";
import { WalletProvider, useWallet } from "@/context/WalletContext";
import "@/services/backgroundTasks";
import "@/services/node";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5_000,
    },
  },
});

/**
 * Sits inside PinProvider so it can read isReady from context.
 * Keeps the native splash alive until fonts + PIN + wallet are ready,
 * then hands off to the animated in-app SplashLoader which fades out
 * before revealing app content — no blank frame ever visible.
 */
function AppReadyGate({
  fontsLoaded,
  fontError,
  children,
}: {
  fontsLoaded: boolean;
  fontError: Error | null;
  children: React.ReactNode;
}) {
  const { isReady } = usePinContext();
  const { isLoading: walletLoading } = useWallet();
  const ready = (fontsLoaded || !!fontError) && isReady && !walletLoading;

  // Hide the native splash immediately so our in-app loader takes over
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  const [splashDone, setSplashDone] = useState(false);

  return (
    <>
      {splashDone && children}
      <SplashLoader ready={ready} onDone={() => setSplashDone(true)} />
    </>
  );
}

function PinGate({ children }: { children: React.ReactNode }) {
  const { isAppLocked, unlockApp, pinRequest, dismissPin } = usePinContext();
  const showModal = isAppLocked || !!pinRequest;
  const modalTitle = isAppLocked ? "Unlock Wallet" : (pinRequest?.title ?? "");
  const modalSubtitle = isAppLocked ? "Enter your PIN to access your wallet." : pinRequest?.subtitle;
  const modalOnSuccess = isAppLocked ? unlockApp : (pinRequest?.onSuccess ?? (() => {}));
  const modalOnCancel = isAppLocked ? undefined : (pinRequest?.onCancel ?? dismissPin);

  return (
    <>
      {children}
      <PinModal
        visible={showModal}
        title={modalTitle}
        subtitle={modalSubtitle}
        onSuccess={modalOnSuccess}
        onCancel={modalOnCancel}
        animationType={isAppLocked ? "none" : "fade"}
      />
    </>
  );
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="onboarding"
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <WalletProvider>
              <PinProvider>
                <AppReadyGate fontsLoaded={fontsLoaded} fontError={fontError}>
                  <PinGate>
                    <RootLayoutNav />
                  </PinGate>
                </AppReadyGate>
              </PinProvider>
            </WalletProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
