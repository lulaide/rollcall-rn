import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { useAppState } from '@/src/store/appState';
import { useConfig, enabledAccounts } from '@/src/store/config';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const loginAllEnabled = useAppState(s => s.loginAllEnabled);
  const startServices = useAppState(s => s.startServices);

  const [ready, setReady] = React.useState(false);

  // First boot: wait for persisted accounts to hydrate, then start the poller
  // even when the app is empty. No login gate — adding accounts happens from the
  // 账号 tab, and the idempotent service layer will pick them up later.
  React.useEffect(() => {
    let cancelled = false;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;

    const finishBoot = () => {
      if (cancelled) return;
      void SplashScreen.hideAsync().catch(() => {});
      startServices();
      if (enabledAccounts(useConfig.getState()).length > 0) {
        void loginAllEnabled().finally(() => startServices());
      }
      readyTimer = setTimeout(() => {
        if (!cancelled) setReady(true);
      }, 650);
    };

    if (useConfig.persist.hasHydrated()) {
      finishBoot();
    } else {
      const unsub = useConfig.persist.onFinishHydration(finishBoot);
      return () => {
        cancelled = true;
        unsub();
        if (readyTimer) clearTimeout(readyTimer);
      };
    }

    return () => {
      cancelled = true;
      if (readyTimer) clearTimeout(readyTimer);
    };
  }, [loginAllEnabled, startServices]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0b0b0e' }}>
      <ThemeProvider value={DarkTheme}>
        {ready ? (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#0b0b0e' },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="scanner"
              options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="account-edit"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
          </Stack>
        ) : (
          <View style={styles.hello}>
            <Text style={styles.helloText}>Hello</Text>
          </View>
        )}
        <StatusBar style="light" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  hello: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0b0e' },
  helloText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '300',
    letterSpacing: 2,
    lineHeight: 42,
    paddingHorizontal: 8,
  },
});
