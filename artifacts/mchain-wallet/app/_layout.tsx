import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { useFonts } from "expo-font";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PinModal } from "@/components/PinModal";
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
 * Keeps the splash screen alive until BOTH fonts are loaded AND the
 * initial PIN check has completed — preventing any flash of the home
 * screen before the PIN modal appears.
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
  const ready = (fontsLoaded || !!fontError) && isReady;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

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
  const { isLoading, isOnboarded } = useWallet();

  useEffect(() => {
    if (!isLoading) {
      if (!isOnboarded) {
        router.replace("/onboarding");
      } else {
        router.replace("/(tabs)");
      }
    }
  }, [isLoading, isOnboarded]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
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
            <PinProvider>
              <AppReadyGate fontsLoaded={fontsLoaded} fontError={fontError}>
                <PinGate>
                  <WalletProvider>
                    <RootLayoutNav />
                  </WalletProvider>
                </PinGate>
              </AppReadyGate>
            </PinProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
