import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { useAppState } from '@/src/store/appState';
import { useConfig, hasAnyAccount } from '@/src/store/config';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const hasAccount = useConfig(hasAnyAccount);
  const loginAllEnabled = useAppState(s => s.loginAllEnabled);
  const startServices = useAppState(s => s.startServices);

  const [ready, setReady] = React.useState(false);

  // First boot: log in every enabled account + start the poller, while a short
  // "hello" transition covers the launch. No login gate — we always land on the
  // tabs; adding accounts happens from the 账号 tab.
  const bootstrappedRef = React.useRef(false);
  React.useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    void SplashScreen.hideAsync().catch(() => {});
    if (hasAccount) {
      void loginAllEnabled().finally(() => startServices());
    }
    const t = setTimeout(() => setReady(true), 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <Text style={styles.helloText}>hello</Text>
          </View>
        )}
        <StatusBar style="light" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  hello: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0b0e' },
  helloText: { color: '#fff', fontSize: 32, fontWeight: '300', letterSpacing: 2 },
});
