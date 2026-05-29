import * as React from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import CryptoJS from 'crypto-js';

import { GlassCard } from '@/src/components/Glass';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAppState } from '@/src/store/appState';
import {
  useConfig,
  MAX_ACCOUNTS,
  type AccountConfig,
  type ImportedAccount,
} from '@/src/store/config';

function encodeAccounts(accounts: AccountConfig[]): string {
  const payload: ImportedAccount[] = accounts.map(a => ({
    displayName: a.displayName,
    username: a.username,
    password: a.password,
    studentID: a.studentID,
  }));
  const json = JSON.stringify(payload);
  return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(json));
}

function decodeAccounts(text: string): ImportedAccount[] | null {
  const tryParse = (s: string): ImportedAccount[] | null => {
    try {
      const arr = JSON.parse(s);
      return Array.isArray(arr) ? (arr as ImportedAccount[]) : null;
    } catch {
      return null;
    }
  };
  // Try Base64 first, then fall back to raw JSON.
  try {
    const decoded = CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(text.trim()));
    const fromB64 = tryParse(decoded);
    if (fromB64) return fromB64;
  } catch {
    // not valid base64 — fall through
  }
  return tryParse(text.trim());
}

export default function AccountsScreen() {
  const router = useRouter();
  const accounts = useConfig(s => s.accounts);
  const setEnabled = useConfig(s => s.setEnabled);
  const removeAccount = useConfig(s => s.removeAccount);
  const importAccounts = useConfig(s => s.importAccounts);
  const clearAll = useConfig(s => s.clearAll);

  const runtimes = useAppState(s => s.runtimes);
  const loginAccount = useAppState(s => s.loginAccount);
  const logoutAccount = useAppState(s => s.logoutAccount);
  const startServices = useAppState(s => s.startServices);

  const [menuVisible, setMenuVisible] = React.useState(false);

  const canAdd = accounts.length < MAX_ACCOUNTS;

  const onAdd = () => {
    if (!canAdd) {
      Alert.alert('已达上限', `最多 ${MAX_ACCOUNTS} 个账号`);
      return;
    }
    router.push('/account-edit');
  };

  const onDelete = (acc: AccountConfig) => {
    Alert.alert('删除账号', `确定删除「${acc.displayName}」？将清除其会话与签到数据。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          logoutAccount(acc.id);
          removeAccount(acc.id);
        },
      },
    ]);
  };

  const onToggle = (acc: AccountConfig, enabled: boolean) => {
    setEnabled(acc.id, enabled);
    if (enabled) void loginAccount(acc.id);
    else logoutAccount(acc.id);
  };

  const onExport = async () => {
    setMenuVisible(false);
    if (accounts.length === 0) {
      Alert.alert('没有账号', '当前没有可复制的账号');
      return;
    }
    await Clipboard.setStringAsync(encodeAccounts(accounts));
    Alert.alert('已复制', `已将 ${accounts.length} 个账号复制到剪贴板`);
  };

  const onImport = async () => {
    setMenuVisible(false);
    const text = await Clipboard.getStringAsync();
    if (!text) {
      Alert.alert('剪贴板为空', '请先复制账号数据');
      return;
    }
    const incoming = decodeAccounts(text);
    if (!incoming) {
      Alert.alert('解析失败', '剪贴板内容不是有效的账号数据');
      return;
    }
    const { added, updated, skipped } = importAccounts(incoming);
    void useAppState.getState().loginAllEnabled().finally(() => startServices());
    Alert.alert('导入完成', `新增 ${added} · 更新 ${updated} · 跳过 ${skipped}`);
  };

  const onClearAll = () => {
    setMenuVisible(false);
    Alert.alert('清除全部数据', '将删除所有账号及其会话、签到数据，且不可恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '全部清除',
        style: 'destructive',
        onPress: () => {
          for (const a of accounts) logoutAccount(a.id);
          clearAll();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>账号</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={onAdd} hitSlop={8} style={styles.headerBtn}>
            <IconSymbol name="plus" size={22} color="#3478f6" />
          </Pressable>
          <Pressable onPress={() => setMenuVisible(true)} hitSlop={8} style={styles.headerBtn}>
            <IconSymbol name="ellipsis.circle" size={22} color="#3478f6" />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {accounts.length === 0 ? (
          <View style={styles.empty}>
            <IconSymbol name="person.crop.circle.badge.plus" size={48} color="rgba(235,235,245,0.4)" />
            <Text style={styles.emptyTitle}>还没有账号</Text>
            <Text style={styles.emptyText}>点击右上角 + 添加</Text>
          </View>
        ) : (
          accounts.map(acc => {
            const rt = runtimes[acc.id];
            return (
              <GlassCard key={acc.id} borderRadius={14} style={{ marginBottom: 10, padding: 0 }}>
                <Pressable
                  onPress={() => router.push({ pathname: '/account-edit', params: { id: acc.id } })}
                  style={styles.accRow}
                >
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.accName} numberOfLines={1}>{acc.displayName}</Text>
                    <Text style={styles.accSub} numberOfLines={1}>
                      {acc.username}
                      {acc.studentID ? ` · ${acc.studentID}` : ''}
                    </Text>
                    {rt?.isLoggedIn && <Text style={styles.accOk}>已登录</Text>}
                    {rt?.loginError && <Text style={styles.accErr} numberOfLines={1}>{rt.loginError}</Text>}
                  </View>
                  <Switch value={acc.enabled} onValueChange={v => onToggle(acc, v)} />
                </Pressable>
                <View style={styles.accActions}>
                  {rt?.isLoggedIn && (
                    <Pressable onPress={() => logoutAccount(acc.id)} style={styles.accActionBtn}>
                      <Text style={styles.accActionText}>登出</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => onDelete(acc)} style={styles.accActionBtn}>
                    <Text style={[styles.accActionText, { color: '#ff453a' }]}>删除</Text>
                  </Pressable>
                </View>
              </GlassCard>
            );
          })
        )}
      </ScrollView>

      <Modal animationType="fade" transparent visible={menuVisible} onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
          <GlassCard borderRadius={16} style={styles.menuCard}>
            <MenuItem icon="doc.on.doc" label="复制全部账号" onPress={onExport} />
            <Divider />
            <MenuItem icon="square.and.arrow.down" label="从剪贴板导入" onPress={onImport} />
            <Divider />
            <MenuItem icon="trash" label="清除全部数据" danger onPress={onClearAll} />
          </GlassCard>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function MenuItem({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: string;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const color = danger ? '#ff453a' : '#fff';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}>
      <IconSymbol name={icon as never} size={20} color={color} />
      <Text style={[styles.menuLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0b0e' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: { color: '#fff', fontSize: 32, fontWeight: '700' },
  headerActions: { flexDirection: 'row', gap: 14 },
  headerBtn: { padding: 2 },

  content: { paddingHorizontal: 20, paddingBottom: 100 },

  empty: { alignItems: 'center', gap: 8, paddingTop: 80 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  emptyText: { color: 'rgba(235,235,245,0.5)', fontSize: 13 },

  accRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  accName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  accSub: { color: 'rgba(235,235,245,0.6)', fontSize: 13 },
  accOk: { color: '#34d399', fontSize: 12 },
  accErr: { color: '#ff453a', fontSize: 12 },
  accActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  accActionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(120,120,128,0.25)' },
  accActionText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  menuBackdrop: { flex: 1, justifyContent: 'center', paddingHorizontal: 40, backgroundColor: 'rgba(0,0,0,0.5)' },
  menuCard: { padding: 0 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 15 },
  menuLabel: { fontSize: 15, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.15)', marginLeft: 16 },
});
