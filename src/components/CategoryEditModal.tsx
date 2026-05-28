import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Props = {
  visible: boolean;
  mode: 'create' | 'rename';
  defaultName?: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
};

export default function CategoryEditModal({
  visible,
  mode,
  defaultName,
  onCancel,
  onConfirm,
}: Props) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (visible) setName(defaultName ?? '');
  }, [visible, defaultName]);

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          <Text style={styles.title}>
            {mode === 'create' ? '新建分类' : '重命名分类'}
          </Text>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="分类名"
            placeholderTextColor="#aaa"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            maxLength={40}
            style={styles.input}
          />

          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              style={[styles.btn, styles.btnGhost]}
            >
              <Text style={styles.btnGhostText}>取消</Text>
            </Pressable>
            <Pressable
              onPress={handleConfirm}
              disabled={!name.trim()}
              style={[
                styles.btn,
                styles.btnPrimary,
                !name.trim() && styles.btnDisabled,
              ]}
            >
              <Text style={styles.btnPrimaryText}>
                {mode === 'create' ? '创建' : '保存'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
  },
  actions: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnPrimary: { backgroundColor: '#111' },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  btnGhost: { backgroundColor: '#f1f1f1' },
  btnGhostText: { color: '#333', fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
});
