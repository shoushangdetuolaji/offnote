import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@expo/ui';

import type { Category } from '../lib/categories';
import type { Note } from '../lib/notes';

type Props = {
  /** When non-null the sheet is presented and shows targets for moving this note */
  note: Note | null;
  categories: Category[];
  onPick: (categoryId: string | undefined) => void;
  onDismiss: () => void;
};

type Row = { id: string | undefined; label: string };

export default function MoveToCategorySheet({
  note,
  categories,
  onPick,
  onDismiss,
}: Props) {
  const rows: Row[] = [
    { id: undefined, label: '未分类' },
    ...categories.map((c) => ({ id: c.id, label: c.name })),
  ];

  const currentId = note?.categoryId;
  const needScroll = rows.length > 5;

  return (
    <BottomSheet
      isPresented={!!note}
      onDismiss={onDismiss}
      showDragIndicator
      snapPoints={needScroll ? ['half', 'full'] : undefined}
    >
      <View style={styles.container}>
        <Text style={styles.title}>移动到分类</Text>
        {note?.title || note?.author ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {note.title ?? `@${note.author}`}
          </Text>
        ) : null}
        <ScrollView
          style={needScroll ? styles.scroll : undefined}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={needScroll}
          bounces={needScroll}
        >
          {rows.map((row) => {
            const active = currentId === row.id;
            return (
              <Pressable
                key={row.id ?? '__none__'}
                onPress={() => onPick(row.id)}
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.rowPressed,
                ]}
              >
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {row.label}
                </Text>
                {active && (
                  <Ionicons name="checkmark" size={20} color="#1f6feb" />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  subtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
    marginBottom: 12,
  },
  scroll: {
    maxHeight: 360,
  },
  list: {
    marginTop: 8,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  rowPressed: {
    backgroundColor: '#f5f5f5',
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    color: '#111',
  },
});
