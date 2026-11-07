import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  DEFAULT_NOTE_FILTER,
  type NoteFilter,
} from '../lib/noteFilter';
import { tagKey } from '../lib/tags';

export { DEFAULT_NOTE_FILTER, type NoteFilter };

export type CategoryOption = { value: string; label: string };

type Props = {
  value: NoteFilter;
  onChange: (next: NoteFilter) => void;
  /** 当前列表里出现过的标签（已按最近使用排序） */
  tags: string[];
  /** 传了才显示「分类」一组（首页用；分类页本身已限定分类） */
  categoryOptions?: CategoryOption[];
  onCollapse: () => void;
};

const SOURCE_OPTIONS: Array<{ key: NoteFilter['source']; label: string }> = [
  { key: 'all', label: '不限' },
  { key: 'instagram', label: 'IG' },
  { key: 'rednote', label: '小红书' },
  { key: 'douyin', label: '抖音' },
];

const SORT_OPTIONS: Array<{ key: NoteFilter['sort']; label: string }> = [
  { key: 'newest', label: '最新发布' },
  { key: 'oldest', label: '最早发布' },
];

export default function NoteFilterPanel({
  value,
  onChange,
  tags,
  categoryOptions,
  onCollapse,
}: Props) {
  const selectedKeys = new Set(value.tags.map(tagKey));

  const toggleTag = (name: string) => {
    const key = tagKey(name);
    onChange({
      ...value,
      tags: selectedKeys.has(key)
        ? value.tags.filter((t) => tagKey(t) !== key)
        : [...value.tags, name],
    });
  };

  return (
    <View style={styles.panel}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {categoryOptions && categoryOptions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>分类</Text>
            <View style={styles.grid}>
              {categoryOptions.map((o) => (
                <Option
                  key={o.value}
                  label={o.label}
                  active={value.category === o.value}
                  onPress={() => onChange({ ...value, category: o.value })}
                />
              ))}
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>笔记类型</Text>
        <View style={styles.grid}>
          {SOURCE_OPTIONS.map((o) => (
            <Option
              key={o.key}
              label={o.label}
              active={value.source === o.key}
              onPress={() => onChange({ ...value, source: o.key })}
            />
          ))}
        </View>

        <Text style={styles.sectionTitle}>发布时间</Text>
        <View style={styles.grid}>
          {SORT_OPTIONS.map((o) => (
            <Option
              key={o.key}
              label={o.label}
              active={value.sort === o.key}
              onPress={() => onChange({ ...value, sort: o.key })}
            />
          ))}
        </View>

        {tags.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>标签</Text>
            <View style={styles.grid}>
              <Option
                label="不限"
                active={value.tags.length === 0}
                onPress={() => onChange({ ...value, tags: [] })}
              />
              {tags.map((name) => (
                <Option
                  key={name}
                  label={name}
                  active={selectedKeys.has(tagKey(name))}
                  onPress={() => toggleTag(name)}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={() => onChange(DEFAULT_NOTE_FILTER)}
          style={styles.footerBtn}
          hitSlop={6}
        >
          <Ionicons name="refresh-outline" size={15} color="#333" />
          <Text style={styles.footerText}>重置</Text>
        </Pressable>
        <Pressable onPress={onCollapse} style={styles.footerBtn} hitSlop={6}>
          <Ionicons name="chevron-up" size={15} color="#333" />
          <Text style={styles.footerText}>收起</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Option({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.cell}>
      <Pressable
        onPress={onPress}
        style={[styles.option, active && styles.optionActive]}
      >
        <Text
          style={[styles.optionText, active && styles.optionTextActive]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: 20,
    marginBottom: 10,
    paddingTop: 4,
    backgroundColor: '#fff',
    // 标签很多时面板内部滚动，底部「重置 / 收起」常驻
    maxHeight: '70%',
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  sectionTitle: {
    fontSize: 15,
    color: '#333',
    marginTop: 8,
    marginBottom: 10,
  },
  // 四列网格：每格 25%，用右/下内边距做间距，容器向右抵消
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginRight: -10,
  },
  cell: {
    width: '25%',
    paddingRight: 10,
    paddingBottom: 10,
  },
  option: {
    height: 38,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  optionActive: {
    backgroundColor: '#fff0f1',
  },
  optionText: {
    fontSize: 14,
    color: '#333',
  },
  optionTextActive: {
    color: '#ff2442',
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5e5',
    marginTop: 4,
  },
  footerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
  },
  footerText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
});
