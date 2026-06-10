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
  /** When true, the card renders a checkbox and disables swipe / detail-open behaviour. */
  selectionMode?: boolean;
  selected?: boolean;
};

export default function NoteCard({
  note,
  onPress,
  onDelete,
  onLongPress,
  selectionMode,
  selected,
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

  const bodyText = note.caption?.trim();
  const remark = note.note?.trim();

  // title 在抓取时被拼成「作者_标题」（见 lib/xhs buildTitle），
  // 作者部分用相同规则清洗过；这里按作者精确剥掉开头前缀，避免与 @作者 行重复。
  const displayTitle = (() => {
    const raw = note.title?.trim();
    if (!raw) return note.author ? `@${note.author}` : '未命名';
    const authorSlug = note.author?.replace(/[^A-Za-z0-9_一-龥]/g, '');
    if (authorSlug && raw.startsWith(`${authorSlug}_`)) {
      const stripped = raw.slice(authorSlug.length + 1).trim();
      if (stripped) return stripped;
    }
    return raw;
  })();

  const cardInner = (
    <Pressable
      onPress={() => onPress(note)}
      onLongPress={onLongPress ? () => onLongPress(note) : undefined}
      style={[styles.card, selectionMode && selected && styles.cardSelected]}
    >
      {selectionMode && (
        <View
          style={[styles.checkbox, selected && styles.checkboxChecked]}
        >
          {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
      )}

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
          <View
            style={[styles.sourceBadge, { backgroundColor: sourceBadge.bg }]}
          >
            <Text
              style={[styles.sourceBadgeText, { color: sourceBadge.color }]}
            >
              {sourceBadge.label}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.cardBody}>
        <View style={styles.headerRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {displayTitle}
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
        {note.author && (
          <Text style={styles.cardAuthor} numberOfLines={1}>
            @{note.author}
          </Text>
        )}
        {bodyText ? (
          <Text style={styles.cardCaption} numberOfLines={2}>
            {bodyText}
          </Text>
        ) : null}
        {remark ? (
          <View style={styles.remarkRow}>
            <Ionicons
              name="create-outline"
              size={12}
              color="#f5b400"
              style={styles.remarkIcon}
            />
            <Text style={styles.remarkText} numberOfLines={1}>
              {remark}
            </Text>
          </View>
        ) : null}
        <Text style={styles.cardMeta}>{formatDate(note.createdAt)}</Text>
      </View>
    </Pressable>
  );

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

  return (
    <View
      style={[styles.wrapper, selectionMode && selected && styles.wrapperSelected]}
    >
      {selectionMode ? (
        cardInner
      ) : (
        <Swipeable
          ref={swipeRef}
          friction={1.6}
          rightThreshold={36}
          dragOffsetFromRightEdge={30}
          overshootRight={false}
          renderRightActions={renderRightActions}
        >
          {cardInner}
        </Swipeable>
      )}
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
  wrapperSelected: {
    borderColor: '#111',
  },
  card: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#fff',
    alignItems: 'flex-start',
  },
  cardSelected: {
    backgroundColor: '#f6f8fb',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#bbb',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    backgroundColor: '#111',
    borderColor: '#111',
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
  remarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff9e6',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginBottom: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  remarkIcon: {
    marginTop: 1,
  },
  remarkText: {
    fontSize: 12,
    color: '#9a7b00',
    flexShrink: 1,
  },
  cardMeta: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
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
