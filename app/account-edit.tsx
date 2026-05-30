import * as React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AccountForm, type AccountFormValues } from '@/src/components/AccountForm';
import { useAppState } from '@/src/store/appState';
import { MAX_ACCOUNTS, useConfig } from '@/src/store/config';

export default function AccountEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id;

  const account = useConfig(s => (id ? s.accounts.find(a => a.id === id) : undefined));
  const addAccount = useConfig(s => s.addAccount);
  const updateAccount = useConfig(s => s.updateAccount);
  const loginAccount = useAppState(s => s.loginAccount);
  const startServices = useAppState(s => s.startServices);

  const [busy, setBusy] = React.useState(false);

  const isEdit = !!account;

  const submit = async (v: AccountFormValues) => {
    setBusy(true);
    try {
      if (account) {
        const patch: Partial<AccountFormValues> = {
          displayName: v.displayName || v.username,
          username: v.username,
          studentID: v.studentID,
        };
        // Only overwrite the password when a new one was entered.
        if (v.password) (patch as { password: string }).password = v.password;
        updateAccount(account.id, patch);
        startServices();
        await loginAccount(account.id);
      } else {
        const newId = addAccount({
          displayName: v.displayName,
          username: v.username,
          password: v.password,
          studentID: v.studentID,
        });
        if (!newId) {
          Alert.alert('已达上限', `最多 ${MAX_ACCOUNTS} 个账号`);
          return;
        }
        startServices();
        await loginAccount(newId);
      }
      router.back();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.cancel}>取消</Text>
        </Pressable>
        <Text style={styles.title}>{isEdit ? '编辑账号' : '添加账号'}</Text>
        <View style={{ width: 32 }} />
      </View>
      <AccountForm
        initial={
          account
            ? {
                displayName: account.displayName,
                username: account.username,
                studentID: account.studentID,
              }
            : undefined
        }
        submitLabel={isEdit ? '保存' : '添加账号'}
        onSubmit={submit}
        busy={busy}
        passwordOptional={isEdit}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0b0e' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  cancel: { color: '#3478f6', fontSize: 16 },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
