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
  initial?: string;
  placeholder?: string;
  hint?: string;
  maxLength?: number;
  onCancel: () => void;
  onSubmit: (text: string) => void;
};

/** 跨平台的单行输入弹窗（Android 没有 Alert.prompt） */
export default function TextPromptModal({
  visible,
  title,
  initial = '',
  placeholder,
  hint,
  maxLength = 40,
  onCancel,
  onSubmit,
}: Props) {
  const [text, setText] = useState(initial);

  useEffect(() => {
    if (visible) setText(initial);
  }, [visible, initial]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.dialog}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => onSubmit(text)}
            placeholder={placeholder}
            placeholderTextColor="#aaa"
            autoFocus
            selectTextOnFocus
            maxLength={maxLength}
            returnKeyType="done"
            style={styles.input}
          />
          {!!hint && <Text style={styles.hint}>{hint}</Text>}
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={[styles.btn, styles.btnGhost]}>
              <Text style={styles.btnGhostText}>取消</Text>
            </Pressable>
            <Pressable onPress={() => onSubmit(text)} style={[styles.btn, styles.btnPrimary]}>
              <Text style={styles.btnPrimaryText}>保存</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  dialog: { backgroundColor: '#fff', borderRadius: 14, padding: 18 },
  title: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
  },
  hint: { fontSize: 12, color: '#999', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  btnGhost: { backgroundColor: '#f1f1f1' },
  btnGhostText: { fontSize: 15, fontWeight: '600', color: '#333' },
  btnPrimary: { backgroundColor: '#111' },
  btnPrimaryText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
