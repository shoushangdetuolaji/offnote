import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import type { Note } from '../lib/notes';

type Props = {
  note: Note;
  onPress: (note: Note) => void;
  onDelete: (note: Note, close: () => void) => void;
  onLongPress?: (note: Note) => void;
};

export default function NoteCard({
  note,
  onPress,
  onDelete,
  onLongPress,
}: Props) {
  const swipeRef = useRef<SwipeableMethods>(null);
  const closeSwipe = () => swipeRef.current?.close();

  const thumbUri =
    note.thumbnailFilename && `${note.dirUri}${note.thumbnailFilename}`;
  const total = note.media?.length ?? 0;
  const hasVideo = note.media?.some((m) => m.kind === 'video');
  const placeholderEmoji = total === 0 ? '📝' : hasVideo ? '🎬' : '🖼️';

  const sourceBadge = (() => {
    if (note.source === 'rednote') {
      return { label: 'RED', bg: '#fe2c55', color: '#fff' };
    }
    if (note.source === 'instagram') {
      return { label: 'IG', bg: '#e1306c', color: '#fff' };
    }
    return null;
  })();

  const renderRightActions = () => (
    <View style={styles.actionsContainer}>
      <Pressable
        onPress={() => onDelete(note, closeSwipe)}
        style={({ pressed }) => [
          styles.deleteBtn,
          pressed && styles.deleteBtnPressed,
        ]}
      >
        <Ionicons name="trash-outline" size={20} color="#fff" />
        <Text style={styles.deleteText}>删除</Text>
      </Pressable>
    </View>
  );

  const bodyText = note.caption || note.note || note.title || note.id;

  return (
    <View style={styles.wrapper}>
      <Swipeable
        ref={swipeRef}
        friction={1.6}
        rightThreshold={36}
        overshootRight={false}
        renderRightActions={renderRightActions}
      >
        <Pressable
          onPress={() => onPress(note)}
          onLongPress={onLongPress ? () => onLongPress(note) : undefined}
          style={styles.card}
        >
          <View style={styles.thumbBox}>
            {thumbUri ? (
              <Image source={{ uri: thumbUri }} style={styles.thumb} />
            ) : (
              <View style={styles.thumbPlaceholder}>
                <Text style={styles.thumbPlaceholderText}>{placeholderEmoji}</Text>
              </View>
            )}
            {hasVideo && (
              <View style={styles.videoBadge}>
                <Text style={styles.videoBadgeText}>视频</Text>
              </View>
            )}
            {total > 1 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{total} 项</Text>
              </View>
            )}
            {sourceBadge && (
              <View style={[styles.sourceBadge, { backgroundColor: sourceBadge.bg }]}>
                <Text style={[styles.sourceBadgeText, { color: sourceBadge.color }]}>
                  {sourceBadge.label}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.cardBody}>
            <View style={styles.headerRow}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {note.title || (note.author ? `@${note.author}` : '未命名')}
              </Text>
              {note.starred && (
                <Ionicons
                  name="star"
                  size={14}
                  color="#f5b400"
                  style={styles.starredHint}
                />
              )}
            </View>

            {note.author && note.title && (
              <Text style={styles.cardAuthor}>@{note.author}</Text>
            )}

            <Text style={styles.cardCaption} numberOfLines={2}>
              {bodyText}
            </Text>

            <Text style={styles.cardMeta}>{formatDate(note.createdAt)}</Text>
          </View>
        </Pressable>
      </Swipeable>
    </View>
  );
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
  },
  card: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#fff',
  },
  thumbBox: {
    width: 96,
    height: 96,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
    marginRight: 12,
    position: 'relative',
  },
  thumb: { width: '100%', height: '100%' },
  thumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPlaceholderText: { fontSize: 32 },
  videoBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  videoBadgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  countBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  countBadgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  sourceBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardBody: { flex: 1, paddingVertical: 2 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
  },
  starredHint: {
    marginLeft: 6,
  },
  cardAuthor: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  cardCaption: {
    fontSize: 13,
    color: '#444',
    lineHeight: 18,
    marginBottom: 6,
  },
  cardMeta: {
    fontSize: 11,
    color: '#999',
    marginTop: 'auto',
  },
  actionsContainer: {
    width: 88,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  deleteBtn: {
    flex: 1,
    backgroundColor: '#e23b3b',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  deleteBtnPressed: {
    backgroundColor: '#bf2929',
  },
  deleteText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
