import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  computeStorageStats,
  formatBytes,
  type StorageStats,
} from '../lib/stats';

export default function StorageStatsScreen() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const s = await computeStorageStats();
    setStats(s);
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        await load();
        setLoading(false);
      })();
    }, [load]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading || !stats) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>正在统计…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.summaryRow}>
          <StatCard icon="document-text" label="笔记总数" value={String(stats.noteCount)} />
          <StatCard icon="folder" label="分类数" value={String(stats.categoryCount)} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>本地占用</Text>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>总占用</Text>
            <Text style={styles.totalValue}>{formatBytes(stats.totalBytes)}</Text>
          </View>
          <Breakdown
            rows={[
              { label: '视频', bytes: stats.videoBytes, color: '#1f6feb' },
              { label: '图片', bytes: stats.imageBytes, color: '#f5b400' },
              { label: '元数据', bytes: stats.metadataBytes, color: '#888' },
            ]}
            total={stats.totalBytes}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>按来源</Text>
          <SourceRow
            label="Instagram"
            badge="IG"
            badgeBg="#e1306c"
            count={stats.bySource.instagram.count}
            bytes={stats.bySource.instagram.bytes}
          />
          <SourceRow
            label="小红书"
            badge="RED"
            badgeBg="#fe2c55"
            count={stats.bySource.rednote.count}
            bytes={stats.bySource.rednote.bytes}
          />
          {stats.bySource.unknown.count > 0 && (
            <SourceRow
              label="其他"
              badge="?"
              badgeBg="#aaa"
              count={stats.bySource.unknown.count}
              bytes={stats.bySource.unknown.bytes}
            />
          )}
        </View>

        <Text style={styles.tip}>下拉可重新统计</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={20} color="#666" />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Breakdown({
  rows,
  total,
}: {
  rows: { label: string; bytes: number; color: string }[];
  total: number;
}) {
  return (
    <View style={styles.breakdown}>
      {rows.map((r) => {
        const pct = total > 0 ? (r.bytes / total) * 100 : 0;
        return (
          <View key={r.label} style={styles.brRow}>
            <View style={styles.brHeader}>
              <View style={[styles.brDot, { backgroundColor: r.color }]} />
              <Text style={styles.brLabel}>{r.label}</Text>
              <Text style={styles.brValue}>{formatBytes(r.bytes)}</Text>
            </View>
            <View style={styles.brBarBg}>
              <View
                style={[
                  styles.brBarFill,
                  { width: `${pct}%`, backgroundColor: r.color },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function SourceRow({
  label,
  badge,
  badgeBg,
  count,
  bytes,
}: {
  label: string;
  badge: string;
  badgeBg: string;
  count: number;
  bytes: number;
}) {
  return (
    <View style={styles.sourceRow}>
      <View style={[styles.badge, { backgroundColor: badgeBg }]}>
        <Text style={styles.badgeText}>{badge}</Text>
      </View>
      <Text style={styles.sourceLabel}>{label}</Text>
      <Text style={styles.sourceCount}>{count} 条</Text>
      <Text style={styles.sourceBytes}>{formatBytes(bytes)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 13, color: '#888' },
  content: { padding: 16, paddingBottom: 32 },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: '#f6f8fb',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#e6ecf2',
    gap: 8,
  },
  statValue: { fontSize: 22, fontWeight: '700', color: '#111' },
  statLabel: { fontSize: 12, color: '#666' },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 14,
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 13, color: '#666', marginBottom: 12, fontWeight: '600' },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  totalLabel: { fontSize: 14, color: '#444' },
  totalValue: { fontSize: 22, fontWeight: '700', color: '#111' },
  breakdown: { gap: 12 },
  brRow: { gap: 6 },
  brHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brDot: { width: 8, height: 8, borderRadius: 4 },
  brLabel: { flex: 1, fontSize: 13, color: '#444' },
  brValue: { fontSize: 13, color: '#111', fontVariant: ['tabular-nums'] },
  brBarBg: {
    height: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  brBarFill: { height: '100%', borderRadius: 3 },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  badge: {
    width: 32,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  sourceLabel: { flex: 1, fontSize: 14, color: '#111' },
  sourceCount: { fontSize: 13, color: '#666', marginRight: 12 },
  sourceBytes: { fontSize: 13, color: '#111', fontVariant: ['tabular-nums'] },
  tip: {
    textAlign: 'center',
    fontSize: 11,
    color: '#aaa',
    marginTop: 16,
  },
});
