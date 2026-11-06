import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TagSelectList from './TagSelectList';

type Props = {
  visible: boolean;
  /** 打开时的初始勾选 */
  initial: string[];
  onCancel: () => void;
  onDone: (tags: string[]) => void;
};

/** 全屏标签选择页：取消 / 选择标签 / 完成(N) */
export default function TagSelectSheet({ visible, initial, onCancel, onDone }: Props) {
  const [draft, setDraft] = useState<string[]>([]);

  useEffect(() => {
    if (visible) setDraft(initial);
  }, [visible, initial]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.bar}>
          <Pressable onPress={onCancel} hitSlop={8} style={styles.barBtn}>
            <Text style={styles.cancel}>取消</Text>
          </Pressable>
          <Text style={styles.title}>选择标签</Text>
          <Pressable onPress={() => onDone(draft)} hitSlop={8} style={styles.barBtn}>
            <Text style={styles.done}>
              完成{draft.length ? `(${draft.length})` : ''}
            </Text>
          </Pressable>
        </View>
        <KeyboardAvoidingView
          style={styles.body}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TagSelectList selected={draft} onChange={setDraft} />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  bar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  barBtn: { paddingHorizontal: 8, paddingVertical: 6, minWidth: 64 },
  cancel: { fontSize: 15, color: '#333' },
  title: { fontSize: 16, fontWeight: '600', color: '#111' },
  done: { fontSize: 15, fontWeight: '600', color: '#ff2442', textAlign: 'right' },
  body: { flex: 1 },
});
