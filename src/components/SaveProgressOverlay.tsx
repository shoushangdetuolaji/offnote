import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export type SaveProgress = {
  /** 主文案，如「正在下载」 */
  title: string;
  /** 副文案，如「第 3/6 项」 */
  detail?: string;
  /** 0~1；不传时只显示转圈 */
  fraction?: number;
};

type Props = {
  progress: SaveProgress | null;
};

/** 保存时的居中进度卡片，遮住整个页面防止重复点击 */
export default function SaveProgressOverlay({ progress }: Props) {
  if (!progress) return null;
  const f =
    progress.fraction === undefined
      ? undefined
      : Math.max(0, Math.min(1, progress.fraction));

  return (
    <View style={styles.backdrop} pointerEvents="auto">
      <View style={styles.card}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.title}>{progress.title}</Text>
        {!!progress.detail && <Text style={styles.detail}>{progress.detail}</Text>}
        {f !== undefined && (
          <>
            <View style={styles.track}>
              <View style={[styles.bar, { width: `${Math.round(f * 100)}%` }]} />
            </View>
            <Text style={styles.percent}>{Math.round(f * 100)}%</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  card: {
    width: 240,
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: 'rgba(17,17,17,0.94)',
    alignItems: 'center',
    gap: 8,
  },
  title: { color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 4 },
  detail: { color: '#bbb', fontSize: 13 },
  track: {
    alignSelf: 'stretch',
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
    marginTop: 6,
  },
  bar: { height: 6, borderRadius: 3, backgroundColor: '#fe2c55' },
  percent: { color: '#ddd', fontSize: 12, fontVariant: ['tabular-nums'] },
});
