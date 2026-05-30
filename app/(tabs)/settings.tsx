import * as React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '@/src/components/Glass';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAppState } from '@/src/store/appState';
import { useConfig } from '@/src/store/config';

export default function SettingsScreen() {
  const autoLocationCheckin = useConfig(s => s.autoLocationCheckin);
  const autoNumberCheckin = useConfig(s => s.autoNumberCheckin);
  const curriculumPreMinutes = useConfig(s => s.curriculumPreMinutes);
  const requestTimeoutMs = useConfig(s => s.requestTimeoutMs);
  const setGlobal = useConfig(s => s.setGlobal);
  const clearAll = useConfig(s => s.clearAll);

  const clearAllRuntime = useAppState(s => s.clearAllRuntime);

  const onClearAll = () => {
    Alert.alert('清除全部数据', '将删除所有账号及其会话、签到数据，且不可恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '全部清除',
        style: 'destructive',
        onPress: () => {
          clearAllRuntime();
          clearAll();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>设置</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <SectionLabel>签到设置</SectionLabel>
        <GlassCard borderRadius={14} style={{ padding: 0 }}>
          <Row
            label="自动定位签到"
            right={
              <Switch
                value={autoLocationCheckin}
                onValueChange={v => setGlobal({ autoLocationCheckin: v })}
              />
            }
          />
          <Divider />
          <Row
            label="自动数字签到"
            right={
              <Switch
                value={autoNumberCheckin}
                onValueChange={v => setGlobal({ autoNumberCheckin: v })}
              />
            }
          />
          <Divider />
          <Stepper
            label="课前轮询"
            value={curriculumPreMinutes}
            min={1}
            max={30}
            step={1}
            unit="分钟"
            onChange={v => setGlobal({ curriculumPreMinutes: v })}
          />
          <Divider />
          <Stepper
            label="请求超时"
            value={requestTimeoutMs / 1000}
            min={5}
            max={15}
            step={1}
            unit="秒"
            onChange={v => setGlobal({ requestTimeoutMs: v * 1000 })}
          />
        </GlassCard>

        <Pressable
          onPress={onClearAll}
          style={({ pressed }) => [styles.dangerButton, pressed && { opacity: 0.85 }]}
        >
          <IconSymbol name="trash" size={18} color="#ff453a" />
          <Text style={styles.dangerText}>清除全部数据</Text>
        </Pressable>

        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function Row({ label, value, right }: { label: string; value?: string; right?: React.ReactNode }) {
  return (
    <View style={styles.rowItem}>
      <Text style={styles.label}>{label}</Text>
      <View style={{ flex: 1 }} />
      {right ?? <Text style={styles.value} numberOfLines={1}>{value}</Text>}
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function Stepper({
  label, value, min, max, step, unit, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.rowItem}>
      <Text style={styles.label}>{label}</Text>
      <View style={{ flex: 1 }} />
      <Text style={styles.value}>{value} {unit}</Text>
      <View style={styles.stepperBox}>
        <Pressable onPress={() => onChange(Math.max(min, value - step))} style={styles.stepperBtn}>
          <Text style={styles.stepperText}>−</Text>
        </Pressable>
        <View style={styles.stepperDivider} />
        <Pressable onPress={() => onChange(Math.min(max, value + step))} style={styles.stepperBtn}>
          <Text style={styles.stepperText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0b0e' },
  headerRow: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { color: '#fff', fontSize: 32, fontWeight: '700' },
  content: { paddingHorizontal: 20, gap: 6 },

  sectionLabel: {
    color: 'rgba(235,235,245,0.6)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 16,
    marginBottom: 6,
    paddingHorizontal: 4,
    textTransform: 'uppercase',
  },

  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
    gap: 8,
  },
  label: { color: '#fff', fontSize: 15 },
  value: { color: 'rgba(235,235,245,0.7)', fontSize: 14, maxWidth: 220 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginLeft: 16,
  },

  stepperBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(120,120,128,0.36)',
    borderRadius: 8,
    overflow: 'hidden',
    marginLeft: 12,
  },
  stepperBtn: { paddingHorizontal: 14, paddingVertical: 5 },
  stepperText: { color: '#fff', fontSize: 18, fontWeight: '500' },
  stepperDivider: { width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.2)' },

  dangerButton: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,69,58,0.15)',
    borderRadius: 14,
  },
  dangerText: { color: '#ff453a', fontSize: 16, fontWeight: '600' },
});
