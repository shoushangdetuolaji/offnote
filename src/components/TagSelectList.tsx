import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';

import {
  getTagSortMode,
  groupTagsByLetter,
  INDEX_LETTERS,
  setTagSortMode,
  tagMatches,
  type TagSortMode,
} from '../lib/tagIndex';
import { renameTagOnNotes } from '../lib/notes';
import {
  cleanTagName,
  listTags,
  normalizeTags,
  removeTagFromLibrary,
  renameTagInLibrary,
  tagKey,
  TAG_MAX_LEN,
} from '../lib/tags';

type Props = {
  selected: string[];
  onChange: (next: string[]) => void;
  dark?: boolean;
};

type Section = { letter: string; data: string[] };

const ROW_H = 48;
const HEADER_H = 28;

/**
 * 标签列表选择：搜索/新建 + 「最近使用 | A–Z」排序 + 勾选列表。
 * A–Z 模式按拼音首字母分组，右侧字母索引条可点按/滑动跳转。
 */
export default function TagSelectList({ selected, onChange, dark }: Props) {
  const c = dark ? darkColors : lightColors;
  const [library, setLibrary] = useState<string[]>([]);
  const [mode, setMode] = useState<TagSortMode>('recent');
  const [query, setQuery] = useState('');
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [barHeight, setBarHeight] = useState(0);
  const listRef = useRef<SectionList<string, Section>>(null);

  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [working, setWorking] = useState(false);

  const reloadLibrary = async () => {
    const tags = await listTags();
    setLibrary(tags.map((t) => t.name));
  };

  useEffect(() => {
    let alive = true;
    Promise.all([listTags(), getTagSortMode()]).then(([tags, m]) => {
      if (!alive) return;
      setLibrary(tags.map((t) => t.name));
      setMode(m);
    });
    return () => {
      alive = false;
    };
  }, []);

  const changeMode = (m: TagSortMode) => {
    setMode(m);
    setTagSortMode(m);
  };

  const selectedKeys = useMemo(() => new Set(selected.map(tagKey)), [selected]);

  // 已勾选但标签库里还没有的（刚新建的）排最前
  const allTags = useMemo(() => {
    const libKeys = new Set(library.map(tagKey));
    const fresh = selected.filter((n) => !libKeys.has(tagKey(n)));
    return [...fresh, ...library];
  }, [library, selected]);

  const visible = useMemo(
    () => allTags.filter((n) => tagMatches(n, query)),
    [allTags, query],
  );

  const sections: Section[] = useMemo(
    () =>
      mode === 'az'
        ? groupTagsByLetter(visible)
        : visible.length
          ? [{ letter: '', data: visible }]
          : [],
    [mode, visible],
  );

  const headerH = mode === 'az' ? HEADER_H : 0;

  // SectionList 的扁平索引包含每组的 header 和 footer
  const layoutTable = useMemo(() => {
    const table: Array<{ length: number; offset: number }> = [];
    let offset = 0;
    for (const s of sections) {
      table.push({ length: headerH, offset });
      offset += headerH;
      for (let i = 0; i < s.data.length; i++) {
        table.push({ length: ROW_H, offset });
        offset += ROW_H;
      }
      table.push({ length: 0, offset });
    }
    return table;
  }, [sections, headerH]);

  const cleaned = cleanTagName(query);
  const exactExists =
    !!cleaned && allTags.some((n) => tagKey(n) === tagKey(cleaned));

  const toggle = (name: string) => {
    const key = tagKey(name);
    onChange(
      selectedKeys.has(key)
        ? selected.filter((n) => tagKey(n) !== key)
        : [...selected, name],
    );
  };

  const createFromQuery = () => {
    if (!cleaned) return;
    const existing = allTags.find((n) => tagKey(n) === tagKey(cleaned));
    if (!selectedKeys.has(tagKey(cleaned))) {
      onChange([...selected, existing ?? cleaned]);
    }
    setQuery('');
  };

  // ---------- 重命名 / 删除 ----------
  const openManage = (name: string) => {
    Alert.alert(`标签「${name}」`, undefined, [
      {
        text: '重命名',
        onPress: () => {
          setRenameText(name);
          setRenaming(name);
        },
      },
      { text: '删除', style: 'destructive', onPress: () => confirmDelete(name) },
      { text: '取消', style: 'cancel' },
    ]);
  };

  const doRename = async (oldName: string, finalName: string) => {
    setWorking(true);
    try {
      await renameTagInLibrary(oldName, finalName);
      await renameTagOnNotes(oldName, finalName);
      await reloadLibrary();
      if (selectedKeys.has(tagKey(oldName))) {
        onChange(
          normalizeTags(
            selected.map((n) => (tagKey(n) === tagKey(oldName) ? finalName : n)),
          ),
        );
      }
    } finally {
      setWorking(false);
      setRenaming(null);
    }
  };

  const submitRename = () => {
    const oldName = renaming;
    if (!oldName) return;
    const name = cleanTagName(renameText);
    if (!name || name === oldName) {
      setRenaming(null);
      return;
    }
    // 改成一个已存在的标签 = 合并
    const existing = allTags.find(
      (n) => tagKey(n) === tagKey(name) && tagKey(n) !== tagKey(oldName),
    );
    if (existing) {
      Alert.alert(
        '合并标签？',
        `「${existing}」已存在，「${oldName}」会合并进去，所有笔记上的「${oldName}」都会改成「${existing}」。`,
        [
          { text: '取消', style: 'cancel' },
          { text: '合并', onPress: () => doRename(oldName, existing) },
        ],
      );
      return;
    }
    doRename(oldName, name);
  };

  const confirmDelete = (name: string) => {
    Alert.alert(
      `删除标签「${name}」？`,
      '会从所有笔记上移除这个标签，笔记本身不受影响。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            setWorking(true);
            try {
              await removeTagFromLibrary(name);
              await renameTagOnNotes(name, null);
              await reloadLibrary();
              if (selectedKeys.has(tagKey(name))) {
                onChange(selected.filter((n) => tagKey(n) !== tagKey(name)));
              }
            } finally {
              setWorking(false);
            }
          },
        },
      ],
    );
  };

  // ---------- 字母索引条 ----------
  const availableLetters = useMemo(
    () => new Set(sections.map((s) => s.letter)),
    [sections],
  );

  const jumpTo = (letter: string) => {
    // 没有这个字母的组时，跳到它后面最近的一组
    const start = INDEX_LETTERS.indexOf(letter);
    const target = INDEX_LETTERS.slice(start).find((l) => availableLetters.has(l));
    if (!target) return;
    const sectionIndex = sections.findIndex((s) => s.letter === target);
    if (sectionIndex < 0) return;
    listRef.current?.scrollToLocation({
      sectionIndex,
      itemIndex: 0,
      viewOffset: HEADER_H,
      animated: false,
    });
  };

  const letterAt = (y: number): string => {
    if (barHeight <= 0) return INDEX_LETTERS[0];
    const i = Math.floor((y / barHeight) * INDEX_LETTERS.length);
    return INDEX_LETTERS[Math.max(0, Math.min(INDEX_LETTERS.length - 1, i))];
  };

  const handleIndexTouch = (e: GestureResponderEvent) => {
    const letter = letterAt(e.nativeEvent.locationY);
    if (letter !== activeLetter) {
      setActiveLetter(letter);
      jumpTo(letter);
    }
  };

  const renderRow = ({ item }: { item: string }) => {
    const active = selectedKeys.has(tagKey(item));
    return (
      <Pressable
        onPress={() => toggle(item)}
        onLongPress={() => openManage(item)}
        delayLongPress={400}
        disabled={working}
        style={({ pressed }) => [
          styles.row,
          { borderBottomColor: c.divider },
          pressed && { backgroundColor: c.pressed },
        ]}
      >
        <Text style={[styles.rowText, { color: c.text }]} numberOfLines={1}>
          {item}
        </Text>
        <Ionicons
          name={active ? 'checkbox' : 'square-outline'}
          size={22}
          color={active ? c.accent : c.muted}
        />
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={[styles.search, { backgroundColor: c.inputBg }]}>
          <Ionicons name="search-outline" size={16} color={c.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={createFromQuery}
            placeholder="搜索或新建标签（支持拼音首字母）"
            placeholderTextColor={c.placeholder}
            maxLength={TAG_MAX_LEN}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            submitBehavior="submit"
            style={[styles.searchInput, { color: c.text }]}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={6}>
              <Ionicons name="close-circle" size={16} color={c.muted} />
            </Pressable>
          )}
        </View>
        <View style={[styles.segment, { backgroundColor: c.inputBg }]}>
          {(['recent', 'az'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => changeMode(m)}
              style={[styles.segBtn, mode === m && { backgroundColor: c.segActive }]}
            >
              <Text
                style={[
                  styles.segText,
                  { color: mode === m ? c.text : c.muted },
                  mode === m && styles.segTextActive,
                ]}
              >
                {m === 'recent' ? '最近' : 'A–Z'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {!!cleaned && !exactExists && (
        <Pressable
          onPress={createFromQuery}
          style={[styles.createRow, { borderBottomColor: c.divider }]}
        >
          <Ionicons name="add-circle-outline" size={20} color={c.accent} />
          <Text style={[styles.createText, { color: c.accent }]} numberOfLines={1}>
            新建标签「{cleaned}」
          </Text>
        </Pressable>
      )}

      <View style={styles.listWrap}>
        <SectionList
          ref={listRef}
          sections={sections}
          keyExtractor={(item) => item}
          renderItem={renderRow}
          renderSectionHeader={({ section }) =>
            mode === 'az' ? (
              <View style={[styles.header, { backgroundColor: c.headerBg }]}>
                <Text style={[styles.headerText, { color: c.muted }]}>
                  {section.letter}
                </Text>
              </View>
            ) : null
          }
          stickySectionHeadersEnabled={mode === 'az'}
          getItemLayout={(_data, index) => ({
            ...(layoutTable[index] ?? { length: 0, offset: 0 }),
            index,
          })}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={mode === 'az' ? styles.listPadRight : undefined}
          ListFooterComponent={
            visible.length > 0 ? (
              <Text style={[styles.hint, { color: c.muted }]}>
                长按标签可重命名或删除
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: c.muted }]}>
              {query ? '没有匹配的标签，回车新建' : '还没有标签，在上面输入后回车新建'}
            </Text>
          }
        />

        {mode === 'az' && sections.length > 0 && (
          <View
            style={styles.indexBar}
            onLayout={(e: LayoutChangeEvent) => setBarHeight(e.nativeEvent.layout.height)}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={handleIndexTouch}
            onResponderMove={handleIndexTouch}
            onResponderRelease={() => setActiveLetter(null)}
            onResponderTerminate={() => setActiveLetter(null)}
          >
            {/* 子元素不接收触摸，保证 locationY 相对整根索引条 */}
            <View pointerEvents="none" style={styles.indexInner}>
              {INDEX_LETTERS.map((l) => (
                <Text
                  key={l}
                  style={[
                    styles.indexLetter,
                    { color: availableLetters.has(l) ? c.accent : c.disabled },
                    activeLetter === l && styles.indexLetterActive,
                  ]}
                >
                  {l}
                </Text>
              ))}
            </View>
          </View>
        )}

        <Modal
          visible={!!renaming}
          transparent
          animationType="fade"
          onRequestClose={() => setRenaming(null)}
        >
          <View style={styles.dialogBackdrop}>
            <View style={[styles.dialog, { backgroundColor: c.dialogBg }]}>
              <Text style={[styles.dialogTitle, { color: c.text }]}>重命名标签</Text>
              <TextInput
                value={renameText}
                onChangeText={setRenameText}
                onSubmitEditing={submitRename}
                autoFocus
                selectTextOnFocus
                maxLength={TAG_MAX_LEN}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                style={[
                  styles.dialogInput,
                  { color: c.text, borderColor: c.divider, backgroundColor: c.inputBg },
                ]}
              />
              <Text style={[styles.dialogHint, { color: c.muted }]}>
                所有笔记上的这个标签会一起改名
              </Text>
              <View style={styles.dialogActions}>
                <Pressable
                  onPress={() => setRenaming(null)}
                  style={[styles.dialogBtn, { backgroundColor: c.inputBg }]}
                >
                  <Text style={[styles.dialogBtnText, { color: c.text }]}>取消</Text>
                </Pressable>
                <Pressable
                  onPress={submitRename}
                  disabled={working}
                  style={[styles.dialogBtn, { backgroundColor: c.accent }]}
                >
                  <Text style={[styles.dialogBtnText, { color: '#fff' }]}>
                    {working ? '保存中…' : '保存'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {activeLetter && (
          <View style={styles.bubble} pointerEvents="none">
            <Text style={styles.bubbleText}>{activeLetter}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const lightColors = {
  text: '#111',
  muted: '#999',
  placeholder: '#aaa',
  disabled: '#ccc',
  divider: '#eee',
  pressed: '#f5f5f5',
  inputBg: '#f3f4f6',
  segActive: '#fff',
  headerBg: '#f7f7f8',
  accent: '#ff2442',
  dialogBg: '#fff',
};

const darkColors = {
  text: '#eee',
  muted: '#888',
  placeholder: '#666',
  disabled: '#444',
  divider: '#222',
  pressed: '#1a1a1c',
  inputBg: '#1f1f22',
  segActive: '#3a3a3e',
  headerBg: '#151517',
  accent: '#ff4d6a',
  dialogBg: '#1c1c1e',
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  segment: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    height: 38,
  },
  segBtn: {
    paddingHorizontal: 10,
    borderRadius: 8,
    justifyContent: 'center',
  },
  segText: { fontSize: 13 },
  segTextActive: { fontWeight: '600' },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: ROW_H,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  createText: { fontSize: 15, fontWeight: '500', flexShrink: 1 },
  listWrap: { flex: 1 },
  listPadRight: { paddingRight: 22 },
  row: {
    height: ROW_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { fontSize: 15, flex: 1, marginRight: 12 },
  header: {
    height: HEADER_H,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  headerText: { fontSize: 13, fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 13 },
  hint: { textAlign: 'center', fontSize: 12, paddingVertical: 14 },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  dialog: { borderRadius: 14, padding: 18 },
  dialogTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  dialogInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  dialogHint: { fontSize: 12, marginTop: 8 },
  dialogActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  dialogBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  dialogBtnText: { fontSize: 15, fontWeight: '600' },
  indexBar: {
    position: 'absolute',
    right: 0,
    top: 8,
    bottom: 8,
    width: 22,
    justifyContent: 'center',
  },
  indexInner: { flex: 1, justifyContent: 'space-around', alignItems: 'center' },
  indexLetter: { fontSize: 11, fontWeight: '600' },
  indexLetterActive: { transform: [{ scale: 1.3 }] },
  bubble: {
    position: 'absolute',
    alignSelf: 'center',
    top: '40%',
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleText: { color: '#fff', fontSize: 30, fontWeight: '700' },
});
