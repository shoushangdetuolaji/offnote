import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  count: number;
  /** how many notes are currently visible (used to decide select-all vs deselect-all wording) */
  totalVisible: number;
  onExit: () => void;
  onSelectAll: () => void;
  onMove: () => void;
  onDelete: () => void;
};

export default function SelectionBar({
  count,
  totalVisible,
  onExit,
  onSelectAll,
  onMove,
  onDelete,
}: Props) {
  const disabled = count === 0;
  const allSelected = count > 0 && count >= totalVisible;
  return (
    <View style={styles.bar}>
      <Pressable onPress={onExit} hitSlop={8} style={styles.iconBtn}>
        <Ionicons name="close" size={24} color="#111" />
      </Pressable>

      <Text style={styles.title}>已选 {count}</Text>

      <View style={styles.actions}>
        <Pressable onPress={onSelectAll} hitSlop={6} style={styles.iconBtn}>
          <Ionicons
            name={allSelected ? 'checkbox' : 'checkbox-outline'}
            size={22}
            color="#111"
          />
        </Pressable>
        <Pressable
          onPress={onMove}
          disabled={disabled}
          hitSlop={6}
          style={[styles.iconBtn, disabled && styles.iconBtnDisabled]}
        >
          <Ionicons name="folder-outline" size={22} color="#111" />
        </Pressable>
        <Pressable
          onPress={onDelete}
          disabled={disabled}
          hitSlop={6}
          style={[styles.iconBtn, disabled && styles.iconBtnDisabled]}
        >
          <Ionicons name="trash-outline" size={22} color="#e23b3b" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e6e6e6',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDisabled: {
    opacity: 0.3,
  },
  title: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
