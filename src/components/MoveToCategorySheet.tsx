import { Ionicons } from '@expo/vector-icons';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  const visible = !!note;
  const rows: Row[] = [
    { id: undefined, label: '未分类' },
    ...categories.map((c) => ({ id: c.id, label: c.name })),
  ];
  const currentId = note?.categoryId;
  const needScroll = rows.length > 5;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onDismiss} />
      <SafeAreaView style={styles.sheetWrap} edges={['bottom']} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.handle} />
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
            keyboardShouldPersistTaps="handled"
          >
            {rows.map((row, idx) => {
              const active = currentId === row.id;
              return (
                <Pressable
                  key={row.id ?? '__none__'}
                  onPress={() => onPick(row.id)}
                  android_ripple={{ color: '#eee' }}
                  style={({ pressed }) => [
                    styles.row,
                    idx > 0 && styles.rowDivider,
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
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d0d0d0',
    marginBottom: 12,
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
    marginBottom: 8,
  },
  scroll: {
    maxHeight: 360,
  },
  list: {
    marginTop: 4,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  rowDivider: {
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
