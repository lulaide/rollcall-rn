import * as React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlassCard } from '@/src/components/Glass';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAppState } from '@/src/store/appState';
import { useConfig, enabledAccounts } from '@/src/store/config';
import { type CurriculumInstance, isInstanceNow } from '@/src/models/curriculum';

export default function CurriculumScreen() {
  const firstEnabledId = useConfig(s => enabledAccounts(s)[0]?.id);
  const todayCourses = useAppState(s =>
    firstEnabledId ? (s.runtimes[firstEnabledId]?.todayCourses ?? []) : [],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>今日课表</Text>
      </View>

      <FlatList
        data={todayCourses}
        keyExtractor={c => c.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <IconSymbol name="calendar.badge.checkmark" size={48} color="rgba(235,235,245,0.4)" />
            <Text style={styles.emptyTitle}>今天没有课</Text>
            <Text style={styles.emptyText}>享受休息时间吧</Text>
          </View>
        }
        renderItem={({ item }) => <CourseRow course={item} />}
      />
    </SafeAreaView>
  );
}

function CourseRow({ course }: { course: CurriculumInstance }) {
  const ongoing = isInstanceNow(course);
  return (
    <GlassCard borderRadius={14}>
      <View style={styles.row}>
        <View style={styles.timeBox}>
          <Text style={styles.timeStart}>{course.start_time}</Text>
          <Text style={styles.timeEnd}>{course.end_time}</Text>
        </View>
        <View
          style={[
            styles.bar,
            { backgroundColor: ongoing ? '#34d399' : 'rgba(255,255,255,0.2)' },
          ]}
        />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.courseTitle} numberOfLines={2}>{course.course}</Text>
          {course.location ? (
            <View style={styles.locationRow}>
              <IconSymbol name="mappin.circle.fill" size={14} color="rgba(235,235,245,0.6)" />
              <Text style={styles.locationText}>{course.location}</Text>
            </View>
          ) : null}
        </View>
        {ongoing && (
          <View style={styles.ongoingBadge}>
            <Text style={styles.ongoingText}>进行中</Text>
          </View>
        )}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0b0e' },
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: { color: '#fff', fontSize: 32, fontWeight: '700' },
  listContent: { paddingHorizontal: 20, paddingBottom: 120 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timeBox: { width: 50, alignItems: 'center', gap: 2 },
  timeStart: { color: '#fff', fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  timeEnd: { color: 'rgba(235,235,245,0.6)', fontSize: 12, fontVariant: ['tabular-nums'] },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  courseTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { color: 'rgba(235,235,245,0.6)', fontSize: 12 },

  ongoingBadge: {
    backgroundColor: 'rgba(52,211,153,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  ongoingText: { color: '#34d399', fontSize: 11, fontWeight: '600' },

  empty: { alignItems: 'center', gap: 8, paddingTop: 60 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  emptyText: { color: 'rgba(235,235,245,0.5)', fontSize: 13 },
});
