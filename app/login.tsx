import * as React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountForm, type AccountFormValues } from '@/src/components/AccountForm';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAppState } from '@/src/store/appState';
import { MAX_ACCOUNTS, useConfig } from '@/src/store/config';

export default function LoginScreen() {
  const addAccount = useConfig(s => s.addAccount);
  const loginAccount = useAppState(s => s.loginAccount);
  const startServices = useAppState(s => s.startServices);

  const [busy, setBusy] = React.useState(false);

  const submit = async (v: AccountFormValues) => {
    setBusy(true);
    const id = addAccount({
      displayName: v.displayName,
      username: v.username,
      password: v.password,
      studentID: v.studentID,
    });
    if (!id) {
      Alert.alert('已达上限', `最多 ${MAX_ACCOUNTS} 个账号`);
      setBusy(false);
      return;
    }
    try {
      await loginAccount(id);
    } finally {
      startServices();
      setBusy(false);
    }
    // The hasAnyAccount guard in _layout flips us into the tabs automatically.
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.logo}>
        <IconSymbol name="checkmark.seal.fill" size={64} color="#3478f6" />
        <Text style={styles.title}>云小北</Text>
        <Text style={styles.subtitle}>多账号集中签到</Text>
      </View>
      <AccountForm submitLabel="添加账号" onSubmit={submit} busy={busy} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0b0e' },
  logo: { alignItems: 'center', gap: 6, marginTop: 32, marginBottom: 4 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700', marginTop: 8 },
  subtitle: { color: 'rgba(235,235,245,0.6)', fontSize: 14 },
});
