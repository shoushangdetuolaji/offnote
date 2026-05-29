import * as Clipboard from 'expo-clipboard';
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
  title: string;
  placeholder?: string;
  validate?: (url: string) => boolean;
  errorText?: string;
  onCancel: () => void;
  onConfirm: (url: string) => void;
};

export default function PasteUrlModal({
  visible,
  title,
  placeholder,
  validate,
  errorText,
  onCancel,
  onConfirm,
}: Props) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!visible) return;
    (async () => {
      const txt = await Clipboard.getStringAsync().catch(() => '');
      setValue(txt.trim());
    })();
  }, [visible]);

  const trimmed = value.trim();
  const invalid = !!trimmed && validate ? !validate(trimmed) : false;
  const canConfirm = !!trimmed && !invalid;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder ?? '粘贴链接'}
            placeholderTextColor="#aaa"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            multiline
            style={[styles.input, invalid && styles.inputError]}
          />
          {invalid && errorText && (
            <Text style={styles.errorText}>{errorText}</Text>
          )}
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={[styles.btn, styles.btnGhost]}>
              <Text style={styles.btnGhostText}>取消</Text>
            </Pressable>
            <Pressable
              onPress={() => canConfirm && onConfirm(trimmed)}
              disabled={!canConfirm}
              style={[
                styles.btn,
                styles.btnPrimary,
                !canConfirm && styles.btnDisabled,
              ]}
            >
              <Text style={styles.btnPrimaryText}>导入</Text>
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
    marginBottom: 12,
  },
  input: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111',
    textAlignVertical: 'top',
  },
  inputError: { borderColor: '#e23b3b' },
  errorText: { marginTop: 6, color: '#e23b3b', fontSize: 12 },
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
