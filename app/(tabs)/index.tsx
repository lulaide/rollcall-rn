import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { GlassCard, GlassToast } from '@/src/components/Glass';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAppState } from '@/src/store/appState';
import {
  type Rollcall,
  isAbsent,
  sourceLabel,
  sourceSFSymbol,
  statusLabel,
} from '@/src/models/rollcall';
import { getCoords } from '@/src/services/locationData';

export default function DashboardScreen() {
  const router = useRouter();
  const rollcalls = useAppState(s => s.rollcalls);
  const todayCourses = useAppState(s => s.todayCourses);
  const centerConnected = useAppState(s => s.centerConnected);
  const isPolling = useAppState(s => s.isPolling);
  const lastPollTime = useAppState(s => s.lastPollTime);
  const checkinMessage = useAppState(s => s.checkinMessage);
  const refreshRollcalls = useAppState(s => s.refreshRollcalls);
  const checkinNumber = useAppState(s => s.checkinNumber);
  const checkinLocation = useAppState(s => s.checkinLocation);
  const setCheckinMessage = useAppState(s => s.setCheckinMessage);

  const [refreshing, setRefreshing] = React.useState(false);
  const [numberDialogRollcallID, setNumberDialogRollcallID] = React.useState<number | null>(null);
  const [numberCode, setNumberCode] = React.useState('');

  const onRefresh = async () => {
    setRefreshing(true);
    try { await refreshRollcalls(); } finally { setRefreshing(false); }
  };

  const onScanGlobal = () => {
    router.push({ pathname: '/scanner', params: { mode: 'global' } });
  };

  const openNumberDialog = (rollcallID: number) => {
    setNumberCode('');
    setNumberDialogRollcallID(rollcallID);
  };

  const closeNumberDialog = () => {
    setNumberDialogRollcallID(null);
    setNumberCode('');
  };

  const submitNumberDialog = () => {
    const value = numberCode.trim();
    if (!value) {
      Alert.alert('内容为空', '请输入数字签到码');
      return;
    }
    const rollcallID = numberDialogRollcallID;
    closeNumberDialog();
    if (rollcallID) void checkinNumber(rollcallID, value);
  };

  const onTapRollcall = (r: Rollcall) => {
    if (!isAbsent(r)) return;
    if (r.source === 'qr') {
      router.push({ pathname: '/scanner', params: { mode: 'rollcall', rollcallID: String(r.rollcall_id) } });
    } else if (r.source === 'number') {
      openNumberDialog(r.rollcall_id);
    } else if (r.source === 'radar') {
      const inst = todayCourses.find(c => {
        if (c.startMs == null || c.endMs == null) return false;
        const now = Date.now();
        return now >= c.startMs - 15 * 60_000 && now <= c.endMs;
      });
      if (!inst) {
        setCheckinMessage('无法确定当前位置');
        return;
      }
      const coords = getCoords(inst.location);
      if (!coords) {
        setCheckinMessage('未识别的教学楼');
        return;
      }
      checkinLocation(r.rollcall_id, coords.lat, coords.lon);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>签到</Text>
        <Pressable onPress={onScanGlobal} style={styles.scanFab}>
          <IconSymbol name="qrcode.viewfinder" size={20} color="#fff" />
          <Text style={styles.scanFabText}>扫一扫</Text>
        </Pressable>
      </View>

      <FlatList
        data={rollcalls}
        keyExtractor={r => String(r.rollcall_id)}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl tintColor="#fff" refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <GlassCard borderRadius={14} style={{ marginBottom: 14 }}>
            <View style={styles.statusRow}>
              <IconSymbol
                name={centerConnected ? 'wifi' : 'wifi.slash'}
                size={18}
                color={centerConnected ? '#34d399' : '#ff453a'}
              />
              <Text style={styles.statusText}>
                {centerConnected ? 'Center 已连接' : 'Center 未连接'}
              </Text>
              <View style={{ flex: 1 }} />
              {isPolling && <ActivityIndicator size="small" color="rgba(235,235,245,0.6)" />}
              {lastPollTime && (
                <Text style={styles.timeText}>
                  {timeAgo(lastPollTime)}
                </Text>
              )}
            </View>
          </GlassCard>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <IconSymbol name="checkmark.circle" size={48} color="rgba(235,235,245,0.4)" />
            <Text style={styles.emptyTitle}>暂无签到任务</Text>
            <Text style={styles.emptyText}>下拉刷新，或等待轮询</Text>
          </View>
        }
        renderItem={({ item }) => (
          <RollcallRow rollcall={item} onPress={() => onTapRollcall(item)} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />

      {checkinMessage && (
        <View pointerEvents="none" style={styles.toastWrap}>
          <GlassToast message={checkinMessage} />
        </View>
      )}

      <Modal
        animationType="fade"
        transparent
        visible={numberDialogRollcallID !== null}
        onRequestClose={closeNumberDialog}
      >
        <View style={styles.modalBackdrop}>
          <GlassCard borderRadius={18} style={styles.numberCard}>
            <Text style={styles.numberTitle}>输入签到码</Text>
            <Text style={styles.numberHint}>请输入老师提供的数字签到码</Text>
            <TextInput
              autoFocus
              keyboardType="number-pad"
              maxLength={8}
              onChangeText={setNumberCode}
              placeholder="4 位数字"
              placeholderTextColor="rgba(235,235,245,0.35)"
              style={styles.numberInput}
              value={numberCode}
            />
            <View style={styles.actionRow}>
              <Pressable
                onPress={closeNumberDialog}
                style={[styles.actionButton, styles.actionButtonSecondary]}
              >
                <Text style={styles.actionButtonText}>取消</Text>
              </Pressable>
              <Pressable
                onPress={submitNumberDialog}
                style={[styles.actionButton, styles.actionButtonPrimary]}
              >
                <Text style={styles.actionButtonText}>确定</Text>
              </Pressable>
            </View>
          </GlassCard>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function RollcallRow({ rollcall, onPress }: { rollcall: Rollcall; onPress: () => void }) {
  const absent = isAbsent(rollcall);
  return (
    <GlassCard borderRadius={14}>
      <View style={styles.itemRow}>
        <IconSymbol
          name={sourceSFSymbol(rollcall.source) as any}
          size={28}
          color={absent ? '#ff9f0a' : '#34d399'}
        />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.courseTitle} numberOfLines={2}>{rollcall.course_title}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{sourceLabel(rollcall.source)}</Text>
            </View>
            <Text style={[styles.statusText, { color: absent ? '#ff9f0a' : '#34d399' }]}>
              {statusLabel(rollcall.status)}
            </Text>
          </View>
        </View>
        {absent ? (
          <Pressable onPress={onPress} style={styles.checkinButton}>
            <Text style={styles.checkinButtonText}>签到</Text>
          </Pressable>
        ) : (
          <IconSymbol name="checkmark.circle.fill" size={24} color="#34d399" />
        )}
      </View>
    </GlassCard>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: { color: '#fff', fontSize: 32, fontWeight: '700' },
  scanFab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3478f6',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  scanFabText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  listContent: { paddingHorizontal: 20, paddingBottom: 120 },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusText: { color: '#fff', fontSize: 14 },
  timeText: { color: 'rgba(235,235,245,0.5)', fontSize: 12 },

  empty: { alignItems: 'center', gap: 8, paddingTop: 60 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  emptyText: { color: 'rgba(235,235,245,0.5)', fontSize: 13 },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  courseTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    backgroundColor: 'rgba(52,120,246,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeText: { color: '#3478f6', fontSize: 11, fontWeight: '600' },

  checkinButton: {
    backgroundColor: '#3478f6',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  checkinButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  toastWrap: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },

  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  numberCard: { padding: 18 },
  numberTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  numberHint: { color: 'rgba(235,235,245,0.6)', fontSize: 13, marginTop: 6 },
  numberInput: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    color: '#fff',
    backgroundColor: 'rgba(120,120,128,0.26)',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
  },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionButtonSecondary: { backgroundColor: 'rgba(120,120,128,0.4)' },
  actionButtonPrimary: { backgroundColor: '#3478f6' },
  actionButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
