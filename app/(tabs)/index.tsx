import * as React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';

import { GlassCard, GlassToast } from '@/src/components/Glass';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  useAppState,
  type AccountRuntime,
  type BatchCheckinResult,
  type ScanEntry,
} from '@/src/store/appState';
import { useConfig, type AccountConfig } from '@/src/store/config';
import { isAbsent } from '@/src/models/rollcall';

type CardStatus = 'gray' | 'red' | 'yellow' | 'green';

const STATUS_COLOR: Record<CardStatus, string> = {
  gray: 'rgba(235,235,245,0.3)',
  red: '#ff453a',
  yellow: '#ff9f0a',
  green: '#34d399',
};

function cardStatus(acc: AccountConfig, rt: AccountRuntime): CardStatus {
  if (!acc.enabled) return 'gray';
  if (rt.loginError) return 'red';
  if (rt.isLoggingIn || !rt.isLoggedIn) return 'yellow';
  return rt.rollcalls.some(isAbsent) ? 'green' : 'yellow';
}

export default function DashboardScreen() {
  const router = useRouter();
  const accounts = useConfig(s => s.accounts);
  const runtimes = useAppState(s => s.runtimes);
  const checkinMessage = useAppState(s => s.checkinMessage);
  const lastScanResult = useAppState(s => s.lastScanResult);
  const servicesStarted = useAppState(s => s.servicesStarted);
  const loginAccount = useAppState(s => s.loginAccount);
  const loginAllEnabled = useAppState(s => s.loginAllEnabled);
  const refreshAllEnabled = useAppState(s => s.refreshAllEnabled);
  const batchCheckinNumber = useAppState(s => s.batchCheckinNumber);
  const numberCheckinAll = useAppState(s => s.numberCheckinAll);
  const radarCheckinAccount = useAppState(s => s.radarCheckinAccount);
  const clearScanResult = useAppState(s => s.clearScanResult);

  const tabBarHeight = useBottomTabBarHeight();
  const [numberCode, setNumberCode] = React.useState('');
  const [refreshing, setRefreshing] = React.useState(false);
  const [submittingNumber, setSubmittingNumber] = React.useState(false);
  const [batchNumberBusy, setBatchNumberBusy] = React.useState(false);
  const [busyAccount, setBusyAccount] = React.useState<string | null>(null);

  const rtFor = (id: string): AccountRuntime =>
    runtimes[id] ?? {
      id,
      isLoggedIn: false,
      isLoggingIn: false,
      loginError: null,
      rollcalls: [],
      todayCourses: [],
      isPolling: false,
      lastPollTime: null,
    };

  const enabled = accounts.filter(a => a.enabled);
  const loggedInCount = enabled.filter(a => rtFor(a.id).isLoggedIn).length;
  const errorCount = enabled.filter(a => !!rtFor(a.id).loginError).length;

  // Any enabled + logged-in account with an outstanding number task?
  const hasNumberTask = accounts.some(a => {
    if (!a.enabled) return false;
    const rt = rtFor(a.id);
    return rt.isLoggedIn && rt.rollcalls.some(r => r.source === 'number' && isAbsent(r));
  });

  const onScan = () => router.push('/scanner');

  const onRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loginAllEnabled();
      await refreshAllEnabled();
    } finally {
      setRefreshing(false);
    }
  };

  const submitNumber = async () => {
    const code = numberCode.trim();
    if (!code || submittingNumber) return;
    setSubmittingNumber(true);
    try {
      await batchCheckinNumber(code);
      setNumberCode('');
    } finally {
      setSubmittingNumber(false);
    }
  };

  const submitNumberAll = async () => {
    if (batchNumberBusy) return;
    setBatchNumberBusy(true);
    try {
      await numberCheckinAll();
    } finally {
      setBatchNumberBusy(false);
    }
  };

  // Per-account fallback: sign just one account when batch missed it.
  const scanForAccount = (id: string) =>
    router.push({ pathname: '/scanner', params: { account: id } });

  const numberForAccount = async (id: string) => {
    if (busyAccount) return;
    setBusyAccount(id);
    try {
      await numberCheckinAll([id]);
    } finally {
      setBusyAccount(null);
    }
  };

  const radarForAccount = async (id: string) => {
    if (busyAccount) return;
    setBusyAccount(id);
    try {
      await radarCheckinAccount(id);
    } finally {
      setBusyAccount(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>签到</Text>
        <Text style={styles.subtitle}>
          已启用 {enabled.length}/{accounts.length} · 已登录 {loggedInCount}
          {errorCount ? ` · 异常 ${errorCount}` : ''} · {servicesStarted ? '轮询已启动' : '轮询未启动'}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 88 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor="#fff"
            colors={["#3478f6"]}
            progressBackgroundColor="#1c1c1e"
          />
        }
      >
        {accounts.length === 0 ? (
          <View style={styles.empty}>
            <IconSymbol name="person.crop.circle.badge.plus" size={48} color="rgba(235,235,245,0.4)" />
            <Text style={styles.emptyTitle}>还没有账号</Text>
            <Text style={styles.emptyText}>到「账号」页添加</Text>
          </View>
        ) : (
          accounts.map(acc => (
            <AccountCard
              key={acc.id}
              account={acc}
              runtime={rtFor(acc.id)}
              busy={busyAccount === acc.id}
              onRetry={() => void loginAccount(acc.id)}
              onScan={() => scanForAccount(acc.id)}
              onNumber={() => void numberForAccount(acc.id)}
              onRadar={() => void radarForAccount(acc.id)}
            />
          ))
        )}

        {hasNumberTask && (
          <GlassCard borderRadius={14} style={{ marginTop: 4 }}>
            <Text style={styles.numberTitle}>数字签到</Text>
            <Pressable
              onPress={submitNumberAll}
              disabled={batchNumberBusy}
              style={({ pressed }) => [
                styles.numberAllButton,
                batchNumberBusy && styles.numberSubmitDisabled,
                pressed && { opacity: 0.9 },
              ]}
            >
              {batchNumberBusy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <IconSymbol name="number.circle" size={20} color="#fff" />
                  <Text style={styles.numberAllText}>一起数字签到</Text>
                </>
              )}
            </Pressable>
            <Text style={styles.numberHint}>
              自动取码失败时，输入老师提供的签到码，提交给所有未签的数字任务
            </Text>
            <View style={styles.numberRow}>
              <TextInput
                value={numberCode}
                onChangeText={setNumberCode}
                keyboardType="number-pad"
                maxLength={8}
                placeholder="签到码"
                placeholderTextColor="rgba(235,235,245,0.35)"
                style={styles.numberInput}
              />
              <Pressable
                onPress={submitNumber}
                disabled={!numberCode.trim() || submittingNumber}
                style={({ pressed }) => [
                  styles.numberSubmit,
                  (!numberCode.trim() || submittingNumber) && styles.numberSubmitDisabled,
                  pressed && { opacity: 0.85 },
                ]}
              >
                {submittingNumber ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.numberSubmitText}>提交</Text>
                )}
              </Pressable>
            </View>
          </GlassCard>
        )}
      </ScrollView>

      {/* Sticky scan bar, docked just above the tab bar */}
      <View style={[styles.scanBar, { bottom: tabBarHeight + 8 }]}>
        <Pressable
          onPress={onScan}
          style={({ pressed }) => [styles.scanButton, pressed && { opacity: 0.9 }]}
        >
          <IconSymbol name="qrcode.viewfinder" size={24} color="#fff" />
          <Text style={styles.scanButtonText}>扫码签到</Text>
        </Pressable>
      </View>

      {checkinMessage && (
        <View pointerEvents="none" style={styles.toastWrap}>
          <GlassToast message={checkinMessage} />
        </View>
      )}

      <ResultSheet
        result={lastScanResult}
        onClose={clearScanResult}
        onScanAgain={() => {
          clearScanResult();
          router.push('/scanner');
        }}
      />
    </SafeAreaView>
  );
}

function AccountCard({
  account,
  runtime,
  busy,
  onRetry,
  onScan,
  onNumber,
  onRadar,
}: {
  account: AccountConfig;
  runtime: AccountRuntime;
  busy: boolean;
  onRetry: () => void;
  onScan: () => void;
  onNumber: () => void;
  onRadar: () => void;
}) {
  const status = cardStatus(account, runtime);
  const color = STATUS_COLOR[status];
  const absent = runtime.rollcalls.filter(isAbsent);
  const qr = absent.filter(r => r.source === 'qr').length;
  const num = absent.filter(r => r.source === 'number').length;
  const radar = absent.filter(r => r.source === 'radar').length;
  const numberTask = runtime.rollcalls.find(r => r.source === 'number' && isAbsent(r));
  const showFallback = account.enabled && runtime.isLoggedIn && absent.length > 0;

  let statusText: string;
  if (!account.enabled) statusText = '已禁用';
  else if (runtime.loginError) statusText = runtime.loginError;
  else if (runtime.isLoggingIn) statusText = '登录中…';
  else if (!runtime.isLoggedIn) statusText = '未登录';
  else if (absent.length > 0)
    statusText = [qr && `扫码 ${qr}`, num && `数字 ${num}`, radar && `定位 ${radar}`]
      .filter(Boolean)
      .join(' · ');
  else statusText = '暂无待签任务';

  return (
    <GlassCard borderRadius={14} style={{ marginBottom: 10, padding: 0 }}>
      <View style={styles.cardRow}>
        <View style={[styles.colorBar, { backgroundColor: color }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardName} numberOfLines={1}>{account.displayName}</Text>
            {runtime.isPolling && <ActivityIndicator size="small" color="rgba(235,235,245,0.6)" />}
            {runtime.lastPollTime && !runtime.isPolling && (
              <Text style={styles.cardTime}>{timeAgo(runtime.lastPollTime)}</Text>
            )}
          </View>
          <Text
            style={[styles.cardStatus, status === 'red' && { color: '#ff453a' }]}
            numberOfLines={2}
          >
            {statusText}
          </Text>
          {numberTask?.checkedInCount != null && (
            <Text style={styles.cardSub}>已签 {numberTask.checkedInCount} 人</Text>
          )}
          {showFallback && (
            <View style={styles.fallbackRow}>
              {busy ? (
                <ActivityIndicator size="small" color="rgba(235,235,245,0.7)" />
              ) : (
                <>
                  {qr > 0 && (
                    <FallbackBtn label="扫码" icon="qrcode.viewfinder" onPress={onScan} />
                  )}
                  {num > 0 && (
                    <FallbackBtn label="数字" icon="number.circle" onPress={onNumber} />
                  )}
                  {radar > 0 && (
                    <FallbackBtn label="定位" icon="location.circle" onPress={onRadar} />
                  )}
                </>
              )}
            </View>
          )}
        </View>
        {status === 'red' ? (
          <Pressable onPress={onRetry} style={styles.retryButton}>
            <Text style={styles.retryText}>重试</Text>
          </Pressable>
        ) : status === 'green' ? (
          <IconSymbol name="dot.radiowaves.left.and.right" size={22} color="#34d399" />
        ) : null}
      </View>
    </GlassCard>
  );
}

function FallbackBtn({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof IconSymbol>['name'];
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.fallbackBtn, pressed && { opacity: 0.8 }]}
    >
      <IconSymbol name={icon} size={15} color="#3478f6" />
      <Text style={styles.fallbackBtnText}>{label}</Text>
    </Pressable>
  );
}

function ResultSheet({
  result,
  onClose,
  onScanAgain,
}: {
  result: BatchCheckinResult | null;
  onClose: () => void;
  onScanAgain: () => void;
}) {
  return (
    <Modal animationType="slide" transparent visible={result !== null} onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <GlassCard borderRadius={20} style={styles.sheet}>
          <Text style={styles.sheetTitle}>签到结果</Text>
          {result && (
            <ScrollView style={{ maxHeight: 360 }}>
              {isEmptyResult(result) && (
                <Text style={styles.sheetEmpty}>{result.message ?? '没有可处理的账号'}</Text>
              )}
              <Bucket title="本次新签" color="#34d399" entries={result.newlySigned} />
              <Bucket title="本次失败" color="#ff453a" entries={result.failed} showError />
              <Bucket title="已签跳过" color="rgba(235,235,245,0.6)" entries={result.alreadySigned} />
              <Bucket title="无匹配任务" color="rgba(235,235,245,0.5)" entries={result.noTask} />
            </ScrollView>
          )}
          <View style={styles.sheetActions}>
            <Pressable onPress={onClose} style={[styles.sheetBtn, styles.sheetBtnSecondary]}>
              <Text style={styles.sheetBtnText}>完成</Text>
            </Pressable>
            {result && result.failed.length > 0 && (
              <Pressable onPress={onScanAgain} style={[styles.sheetBtn, styles.sheetBtnPrimary]}>
                <Text style={styles.sheetBtnText}>再次扫描</Text>
              </Pressable>
            )}
          </View>
        </GlassCard>
      </View>
    </Modal>
  );
}

function isEmptyResult(result: BatchCheckinResult): boolean {
  return (
    result.newlySigned.length === 0 &&
    result.failed.length === 0 &&
    result.alreadySigned.length === 0 &&
    result.noTask.length === 0
  );
}

function Bucket({
  title,
  color,
  entries,
  showError,
}: {
  title: string;
  color: string;
  entries: ScanEntry[];
  showError?: boolean;
}) {
  if (entries.length === 0) return null;
  return (
    <View style={styles.bucket}>
      <View style={styles.bucketHeader}>
        <View style={[styles.bucketDot, { backgroundColor: color }]} />
        <Text style={styles.bucketTitle}>{title}</Text>
        <Text style={styles.bucketCount}>{entries.length}</Text>
      </View>
      {entries.map((e, i) => (
        <Text key={`${e.accountId}-${i}`} style={styles.bucketEntry} numberOfLines={1}>
          {e.displayName}
          {e.courseTitle ? ` · ${e.courseTitle}` : ''}
          {showError && e.error ? `  (${e.error})` : ''}
        </Text>
      ))}
    </View>
  );
}

function timeAgo(ms: number): string {
  const d = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (d < 60) return `${d}秒前`;
  if (d < 3600) return `${Math.floor(d / 60)}分钟前`;
  return `${Math.floor(d / 3600)}小时前`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0b0e' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: { color: '#fff', fontSize: 32, fontWeight: '700' },
  subtitle: { color: 'rgba(235,235,245,0.5)', fontSize: 14 },

  listContent: { paddingHorizontal: 20 },

  empty: { alignItems: 'center', gap: 8, paddingTop: 80 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  emptyText: { color: 'rgba(235,235,245,0.5)', fontSize: 13 },

  cardRow: { flexDirection: 'row', alignItems: 'stretch' },
  colorBar: { width: 5 },
  cardBody: { flex: 1, paddingVertical: 14, paddingHorizontal: 14, gap: 4 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { color: '#fff', fontSize: 16, fontWeight: '600', flex: 1 },
  cardTime: { color: 'rgba(235,235,245,0.5)', fontSize: 12 },
  cardStatus: { color: 'rgba(235,235,245,0.75)', fontSize: 13 },
  cardSub: { color: '#34d399', fontSize: 12 },
  fallbackRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  fallbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(52,120,246,0.18)',
  },
  fallbackBtnText: { color: '#3478f6', fontSize: 13, fontWeight: '600' },
  retryButton: {
    alignSelf: 'center',
    marginRight: 14,
    backgroundColor: 'rgba(255,69,58,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  retryText: { color: '#ff453a', fontSize: 13, fontWeight: '600' },

  numberTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  numberAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 12,
    marginTop: 12,
    backgroundColor: '#34d399',
  },
  numberAllText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  numberHint: { color: 'rgba(235,235,245,0.55)', fontSize: 12, marginTop: 12 },
  numberRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  numberInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    color: '#fff',
    backgroundColor: 'rgba(120,120,128,0.26)',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 3,
    textAlign: 'center',
  },
  numberSubmit: {
    paddingHorizontal: 22,
    borderRadius: 10,
    backgroundColor: '#3478f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberSubmitDisabled: { backgroundColor: 'rgba(120,120,128,0.4)' },
  numberSubmitText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  scanBar: {
    position: 'absolute',
    left: 0, right: 0,
    paddingHorizontal: 20,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#3478f6',
  },
  scanButtonText: { color: '#fff', fontSize: 18, fontWeight: '700' },

  toastWrap: { position: 'absolute', bottom: 90, left: 0, right: 0, alignItems: 'center' },

  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { margin: 12, padding: 20, backgroundColor: '#1c1c1e' },
  sheetTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  sheetEmpty: { color: 'rgba(235,235,245,0.7)', fontSize: 14, marginTop: 8, lineHeight: 20 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  sheetBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  sheetBtnSecondary: { backgroundColor: 'rgba(120,120,128,0.4)' },
  sheetBtnPrimary: { backgroundColor: '#3478f6' },
  sheetBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  bucket: { marginTop: 12 },
  bucketHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bucketDot: { width: 8, height: 8, borderRadius: 4 },
  bucketTitle: { color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 },
  bucketCount: { color: 'rgba(235,235,245,0.6)', fontSize: 13 },
  bucketEntry: { color: 'rgba(235,235,245,0.75)', fontSize: 13, marginTop: 4, marginLeft: 16 },
});
