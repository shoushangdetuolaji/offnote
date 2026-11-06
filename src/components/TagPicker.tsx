import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { cleanTagName, listTags, tagKey, TAG_MAX_LEN } from '../lib/tags';

type Props = {
  /** 当前勾选的标签名 */
  selected: string[];
  onChange: (next: string[]) => void;
  /** 深色主题（笔记详情页用） */
  dark?: boolean;
};

/**
 * 标签选择：输入新建 + 标签库勾选（按最近使用排序）。
 * 新建的标签在笔记保存时才写入标签库（见 lib/notes 里的 touchTags）。
 */
export default function TagPicker({ selected, onChange, dark }: Props) {
  const [library, setLibrary] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    let alive = true;
    listTags().then((tags) => {
      if (alive) setLibrary(tags.map((t) => t.name));
    });
    return () => {
      alive = false;
    };
  }, []);

  const selectedKeys = useMemo(
    () => new Set(selected.map(tagKey)),
    [selected],
  );

  // 已勾选但不在标签库里的（刚新建的）放最前面
  const allTags = useMemo(() => {
    const libKeys = new Set(library.map(tagKey));
    const fresh = selected.filter((n) => !libKeys.has(tagKey(n)));
    return [...fresh, ...library];
  }, [library, selected]);

  const query = cleanTagName(draft).toLocaleLowerCase();
  const visible = query
    ? allTags.filter((n) => n.toLocaleLowerCase().includes(query))
    : allTags;
  const exactExists = !!query && allTags.some((n) => tagKey(n) === query);

  const toggle = (name: string) => {
    const key = tagKey(name);
    if (selectedKeys.has(key)) {
      onChange(selected.filter((n) => tagKey(n) !== key));
    } else {
      onChange([...selected, name]);
    }
  };

  const submit = () => {
    const name = cleanTagName(draft);
    if (!name) return;
    const key = tagKey(name);
    const existing = allTags.find((n) => tagKey(n) === key);
    if (!selectedKeys.has(key)) onChange([...selected, existing ?? name]);
    setDraft('');
  };

  const c = dark ? darkColors : lightColors;

  return (
    <View>
      <View style={[styles.inputRow, { borderColor: c.border }]}>
        <Text style={[styles.hash, { color: c.muted }]}>#</Text>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          placeholder="搜索或新建标签"
          placeholderTextColor={c.placeholder}
          maxLength={TAG_MAX_LEN}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          submitBehavior="submit"
          style={[styles.input, { color: c.text }]}
        />
        {!!query && (
          <Pressable onPress={submit} hitSlop={6} style={styles.addBtn}>
            <Text style={styles.addText}>
              {exactExists ? '勾选' : '新建'}
            </Text>
          </Pressable>
        )}
      </View>

      {visible.length > 0 ? (
        <View style={styles.chipsRow}>
          {visible.map((name) => {
            const active = selectedKeys.has(tagKey(name));
            return (
              <Pressable
                key={name}
                onPress={() => toggle(name)}
                style={[
                  styles.chip,
                  { backgroundColor: c.chipBg, borderColor: c.chipBg },
                  active && { backgroundColor: c.activeBg, borderColor: c.activeBg },
                ]}
              >
                {active && (
                  <Ionicons
                    name="checkmark"
                    size={13}
                    color={c.activeText}
                    style={styles.chipIcon}
                  />
                )}
                <Text
                  style={[
                    styles.chipText,
                    { color: c.chipText },
                    active && { color: c.activeText, fontWeight: '600' },
                  ]}
                  numberOfLines={1}
                >
                  {name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={[styles.empty, { color: c.muted }]}>
          {query ? '回车新建这个标签' : '还没有标签，输入后回车新建'}
        </Text>
      )}
    </View>
  );
}

const lightColors = {
  text: '#111',
  muted: '#999',
  placeholder: '#aaa',
  border: '#e0e0e0',
  chipBg: '#f3f4f6',
  chipText: '#444',
  activeBg: '#111',
  activeText: '#fff',
};

const darkColors = {
  text: '#eee',
  muted: '#777',
  placeholder: '#666',
  border: '#2a2a2c',
  chipBg: '#1f1f22',
  chipText: '#ccc',
  activeBg: '#eee',
  activeText: '#111',
};

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  hash: {
    fontSize: 14,
    marginRight: 4,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
  },
  addBtn: {
    paddingLeft: 8,
  },
  addText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f6feb',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 180,
  },
  chipIcon: {
    marginRight: 3,
  },
  chipText: {
    fontSize: 13,
  },
  empty: {
    fontSize: 12,
    marginTop: 10,
  },
});
