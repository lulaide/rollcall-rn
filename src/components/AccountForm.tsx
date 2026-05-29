// Reusable add/edit account form. Used by app/login.tsx (onboarding) and
// app/account-edit.tsx (modal add/edit). Password is masked; on edit it may be
// left blank to keep the existing password.

import * as React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { GlassCard } from './Glass';
import { IconSymbol } from '@/components/ui/icon-symbol';

export interface AccountFormValues {
  displayName: string;
  username: string;
  password: string;
  studentID: string;
}

interface Props {
  initial?: Partial<AccountFormValues>;
  submitLabel: string;
  onSubmit: (values: AccountFormValues) => void | Promise<void>;
  busy?: boolean;
  error?: string | null;
  /** When editing, the password may be left blank to keep the stored one. */
  passwordOptional?: boolean;
}

export function AccountForm({
  initial,
  submitLabel,
  onSubmit,
  busy = false,
  error,
  passwordOptional = false,
}: Props) {
  const [displayName, setDisplayName] = React.useState(initial?.displayName ?? '');
  const [username, setUsername] = React.useState(initial?.username ?? '');
  const [password, setPassword] = React.useState(initial?.password ?? '');
  const [studentID, setStudentID] = React.useState(initial?.studentID ?? '');

  const canSubmit =
    username.trim().length > 0 &&
    (passwordOptional || password.length > 0) &&
    !busy;

  const submit = () => {
    if (!canSubmit) return;
    void onSubmit({
      displayName: displayName.trim(),
      username: username.trim(),
      password,
      studentID: studentID.trim(),
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <GlassCard borderRadius={14} style={{ padding: 0 }}>
          <Field
            label="账号"
            value={username}
            onChangeText={setUsername}
            placeholder="统一身份认证账号"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
          />
          <Divider />
          <Field
            label="密码"
            value={password}
            onChangeText={setPassword}
            placeholder={passwordOptional ? '留空保持不变' : '统一身份认证密码'}
            secureTextEntry
            textContentType="password"
          />
          <Divider />
          <Field
            label="学号"
            value={studentID}
            onChangeText={setStudentID}
            placeholder="选填，用于读课表"
            keyboardType="number-pad"
          />
          <Divider />
          <Field
            label="昵称"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="选填，默认用账号"
          />
        </GlassCard>

        {error ? (
          <View style={styles.errorWrap}>
            <IconSymbol name="exclamationmark.triangle" size={16} color="#ff453a" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.button,
            !canSubmit && styles.buttonDisabled,
            pressed && canSubmit && styles.buttonPressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{submitLabel}</Text>
          )}
        </Pressable>

        <View style={{ height: 24 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  ...input
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor="rgba(235,235,245,0.4)"
        style={styles.input}
        {...input}
      />
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 18 },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    minHeight: 48,
    gap: 12,
  },
  fieldLabel: { color: '#fff', fontSize: 15, width: 56 },
  input: { flex: 1, color: '#fff', fontSize: 15, paddingVertical: 6 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginLeft: 16,
  },
  errorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  errorText: { color: '#ff453a', fontSize: 13, flexShrink: 1 },
  button: {
    backgroundColor: '#3478f6',
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonDisabled: { backgroundColor: 'rgba(120,120,128,0.4)' },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
