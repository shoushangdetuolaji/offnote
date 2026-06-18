import { Ionicons } from '@expo/vector-icons';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { NoteSource } from '../lib/notes';

type Props = {
  visible: boolean;
  onPick: (source: NoteSource) => void;
  onDismiss: () => void;
};

const ICON_HEIGHT = 32;

type Row = {
  source: NoteSource;
  label: string;
  hint: string;
  icon: ReturnType<typeof require>;
  ratio: number;
};

const SOURCES: Row[] = [
  {
    source: 'rednote',
    label: '小红书',
    hint: '粘贴小红书链接直接导入',
    icon: require('../../assets/rednote.webp'),
    ratio: 1,
  },
  {
    source: 'instagram',
    label: 'Instagram',
    hint: '通过 Cobalt 解析下载',
    icon: require('../../assets/instagram.webp'),
    ratio: 1,
  },
];

export default function SourcePickerSheet({ visible, onPick, onDismiss }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onDismiss} />
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <View style={[styles.sheet, { paddingBottom: 12 + insets.bottom }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>从哪里导入笔记</Text>

          {SOURCES.map((row, idx) => (
            <Pressable
              key={row.source}
              onPress={() => onPick(row.source)}
              style={({ pressed }) => [
                styles.row,
                idx > 0 && styles.rowDivider,
                pressed && styles.rowPressed,
              ]}
              android_ripple={{ color: '#eee' }}
            >
              <View style={styles.iconBox}>
                <Image
                  source={row.icon}
                  style={{
                    height: ICON_HEIGHT,
                    width: ICON_HEIGHT * row.ratio,
                  }}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.body}>
                <Text style={styles.label} numberOfLines={1}>
                  {row.label}
                </Text>
                <Text style={styles.hint} numberOfLines={1}>
                  {row.hint}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#bbb" />
            </Pressable>
          ))}
        </View>
      </View>
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
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 12,
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
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 2,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  rowPressed: {
    backgroundColor: '#f5f5f5',
  },
  iconBox: {
    width: 58,
    height: ICON_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    marginBottom: 2,
  },
  hint: {
    fontSize: 12,
    color: '#888',
  },
});
