import { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { IgMetadata } from '../lib/metadata';

type Props = {
  visible: boolean;
  defaultName: string;
  defaultNote?: string;
  hintExt?: string;
  metadata?: IgMetadata | null;
  metadataLoading?: boolean;
  onCancel: () => void;
  onConfirm: (name: string, note: string) => void;
};

export default function RenameModal({
  visible,
  defaultName,
  defaultNote,
  hintExt,
  metadata,
  metadataLoading,
  onCancel,
  onConfirm,
}: Props) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (visible) {
      setName(stripExt(defaultName));
      setNote(defaultNote ?? '');
    }
  }, [visible, defaultName, defaultNote]);

  const ext = hintExt ?? extractExt(defaultName);

  const confirm = () => {
    const cleaned = name.trim().replace(/[/\\:?*"<>|]/g, '').slice(0, 80);
    const final = cleaned ? `${cleaned}.${ext}` : defaultName;
    onConfirm(final, note.trim());
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
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>命名并保存</Text>

            {(metadata?.thumbnailUrl || metadata?.author || metadata?.caption || metadataLoading) && (
              <View style={styles.metaCard}>
                {metadata?.thumbnailUrl && (
                  <Image
                    source={{ uri: metadata.thumbnailUrl }}
                    style={styles.thumb}
                    resizeMode="cover"
                  />
                )}
                <View style={styles.metaBody}>
                  {metadataLoading && !metadata?.author && (
                    <Text style={styles.metaHint}>正在获取作者和文案…</Text>
                  )}
                  {metadata?.author && (
                    <Text style={styles.metaAuthor}>@{metadata.author}</Text>
                  )}
                  {metadata?.caption && (
                    <Text style={styles.metaCaption} numberOfLines={3}>
                      {metadata.caption}
                    </Text>
                  )}
                </View>
              </View>
            )}

            <Text style={styles.label}>标题</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="输入标题"
                placeholderTextColor="#aaa"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
              <Text style={styles.extLabel}>.{ext}</Text>
            </View>

            <Text style={[styles.label, styles.labelSpaced]}>备注（可选）</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="给自己留点话"
              placeholderTextColor="#aaa"
              multiline
              style={styles.textArea}
            />

            <View style={styles.actions}>
              <Pressable onPress={onCancel} style={[styles.btn, styles.btnGhost]}>
                <Text style={styles.btnGhostText}>取消</Text>
              </Pressable>
              <Pressable onPress={confirm} style={[styles.btn, styles.btnPrimary]}>
                <Text style={styles.btnPrimaryText}>保存</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function extractExt(filename: string): string {
  const m = filename.match(/\.([A-Za-z0-9]+)$/);
  return m ? m[1].toLowerCase() : 'bin';
}

function stripExt(filename: string): string {
  return filename.replace(/\.[A-Za-z0-9]+$/, '');
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    maxHeight: '85%',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 14,
  },
  metaCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#f6f8fb',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#e8eaee',
  },
  metaBody: {
    flex: 1,
  },
  metaAuthor: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111',
    marginBottom: 4,
  },
  metaCaption: {
    fontSize: 12,
    color: '#444',
    lineHeight: 17,
  },
  metaHint: {
    fontSize: 12,
    color: '#888',
  },
  label: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  labelSpaced: {
    marginTop: 14,
  },
  textArea: {
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111',
  },
  extLabel: {
    fontSize: 14,
    color: '#888',
    marginLeft: 4,
  },
  actions: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnPrimary: {
    backgroundColor: '#111',
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  btnGhost: {
    backgroundColor: '#f1f1f1',
  },
  btnGhostText: {
    color: '#333',
    fontSize: 15,
    fontWeight: '600',
  },
});
