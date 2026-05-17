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
 * Reads readiness from inside providers and calls onReady() upward.
 * Children only render after splashDone so they never flash under the loader.
 */
function AppReadyGate({
  fontsLoaded,
  fontError,
  onReady,
  splashDone,
  children,
}: {
  fontsLoaded: boolean;
  fontError: Error | null;
  onReady: () => void;
  splashDone: boolean;
  children: React.ReactNode;
}) {
  const { isReady } = usePinContext();
  const { isLoading: walletLoading } = useWallet();
  const ready = (fontsLoaded || !!fontError) && isReady && !walletLoading;

  useEffect(() => {
    if (ready) onReady();
  }, [ready]);

  if (!splashDone) return null;
  return <>{children}</>;
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

  // appReady is signalled from inside providers via onReady()
  const [appReady, setAppReady] = useState(false);
  // splashDone = loader has finished its fade-out → safe to show app
  const [splashDone, setSplashDone] = useState(false);

  // Drop the native OS splash immediately — our SplashLoader takes over
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <SafeAreaProvider style={{ backgroundColor: "#060E1A" }}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#060E1A" }}>
            <WalletProvider>
              <PinProvider>
                <AppReadyGate
                  fontsLoaded={fontsLoaded}
                  fontError={fontError}
                  onReady={() => setAppReady(true)}
                  splashDone={splashDone}
                >
                  <PinGate>
                    <RootLayoutNav />
                  </PinGate>
                </AppReadyGate>
              </PinProvider>
            </WalletProvider>

            {/* SplashLoader lives OUTSIDE providers so it always renders
                regardless of provider initialization state */}
            <SplashLoader
              ready={appReady}
              onDone={() => setSplashDone(true)}
            />
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
