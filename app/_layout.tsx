import * as React from 'react';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { useAppState } from '@/src/store/appState';
import { useConfig, hasAnyAccount } from '@/src/store/config';

export default function RootLayout() {
  const hasAccount = useConfig(hasAnyAccount);
  const loginAllEnabled = useAppState(s => s.loginAllEnabled);
  const startServices = useAppState(s => s.startServices);

  // On first boot: log in every enabled account, then start the poller.
  const bootstrappedRef = React.useRef(false);
  React.useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    if (hasAccount) {
      void loginAllEnabled().finally(() => startServices());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0b0b0e' }}>
      <ThemeProvider value={DarkTheme}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#0b0b0e' },
          }}
        >
          <Stack.Protected guard={hasAccount}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="scanner"
              options={{
                presentation: 'fullScreenModal',
                animation: 'slide_from_bottom',
              }}
            />
            <Stack.Screen
              name="account-edit"
              options={{
                presentation: 'modal',
                animation: 'slide_from_bottom',
              }}
            />
          </Stack.Protected>

          <Stack.Protected guard={!hasAccount}>
            <Stack.Screen name="login" />
          </Stack.Protected>
        </Stack>
        <StatusBar style="light" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
