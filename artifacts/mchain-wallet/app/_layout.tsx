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
import "@/services/node"; // initializes cached node URL from storage on startup

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5_000,
    },
  },
});

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

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <PinProvider>
              <PinGate>
                <WalletProvider>
                  <RootLayoutNav />
                </WalletProvider>
              </PinGate>
            </PinProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
