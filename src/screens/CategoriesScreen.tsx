import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SafeAreaView } from 'react-native-safe-area-context';

import CategoryEditModal from '../components/CategoryEditModal';
import {
  createCategory,
  deleteCategory,
  listCategories,
  renameCategory,
  type Category,
} from '../lib/categories';
import { clearCategoryFromNotes, listNotes, type Note } from '../lib/notes';
import type { CategoriesStackParamList } from '../navigation/CategoriesStack';

type EditTarget =
  | { mode: 'create' }
  | { mode: 'rename'; category: Category };

type Nav = NativeStackNavigationProp<CategoriesStackParamList, 'CategoriesList'>;

export default function CategoriesScreen() {
  const navigation = useNavigation<Nav>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [edit, setEdit] = useState<EditTarget | null>(null);

  const reload = useCallback(async () => {
    const [cats, ns] = await Promise.all([listCategories(), listNotes()]);
    setCategories(cats);
    setNotes(ns);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const countByCategory = (categoryId?: string) =>
    notes.filter((n) => n.categoryId === categoryId).length;

  const handleConfirmEdit = async (name: string) => {
    if (!edit) return;
    if (edit.mode === 'create') {
      await createCategory(name);
    } else {
      await renameCategory(edit.category.id, name);
    }
    setEdit(null);
    await reload();
  };

  const handleDelete = async (cat: Category, closeSwipe: () => void) => {
    const inCat = countByCategory(cat.id);
    const msg =
      inCat > 0
        ? `删除分类「${cat.name}」？\n${inCat} 条笔记会回到「未分类」（笔记本身不会删除）`
        : `删除分类「${cat.name}」？`;
    Alert.alert('删除分类', msg, [
      { text: '取消', style: 'cancel', onPress: closeSwipe },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await clearCategoryFromNotes(cat.id);
          await deleteCategory(cat.id);
          await reload();
        },
      },
    ]);
  };

  const openCategory = (cat: Category) => {
    navigation.navigate('CategoryNotes', {
      categoryId: cat.id,
      categoryName: cat.name,
    });
  };

  const renderItem = ({ item }: { item: Category }) => (
    <CategoryRow
      category={item}
      count={countByCategory(item.id)}
      onPress={() => openCategory(item)}
      onRename={() => setEdit({ mode: 'rename', category: item })}
      onDelete={handleDelete}
    />
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>分类</Text>
        <Pressable
          onPress={() => setEdit({ mode: 'create' })}
          style={styles.headerCta}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.headerCtaText}>新建</Text>
        </Pressable>
      </View>

      <View style={styles.uncategorized}>
        <Pressable
          onPress={() =>
            navigation.navigate('CategoryNotes', {
              categoryId: '__uncategorized__',
              categoryName: '未分类',
            })
          }
          style={styles.row}
        >
          <Ionicons name="albums-outline" size={20} color="#666" />
          <Text style={styles.uncategorizedName}>未分类</Text>
          <Text style={styles.count}>{countByCategory(undefined)}</Text>
          <Ionicons name="chevron-forward" size={18} color="#bbb" />
        </Pressable>
      </View>

      <FlatList
        data={categories}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.list,
          categories.length === 0 && styles.listEmpty,
        ]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>还没有自定义分类</Text>
            <Text style={styles.emptyHint}>
              点右上「新建」给笔记建一个分类
            </Text>
          </View>
        }
      />

      <CategoryEditModal
        visible={!!edit}
        mode={edit?.mode === 'rename' ? 'rename' : 'create'}
        defaultName={edit?.mode === 'rename' ? edit.category.name : ''}
        onCancel={() => setEdit(null)}
        onConfirm={handleConfirmEdit}
      />
    </SafeAreaView>
  );
}

type RowProps = {
  category: Category;
  count: number;
  onPress: () => void;
  onRename: () => void;
  onDelete: (cat: Category, closeSwipe: () => void) => void;
};

function CategoryRow({ category, count, onPress, onRename, onDelete }: RowProps) {
  const swipeRef = useRef<SwipeableMethods>(null);
  const close = () => swipeRef.current?.close();

  const renderActions = () => (
    <View style={styles.actionsBox}>
      <Pressable
        onPress={() => {
          close();
          onRename();
        }}
        style={[styles.actionBtn, styles.actionRename]}
      >
        <Ionicons name="create-outline" size={18} color="#fff" />
        <Text style={styles.actionText}>改名</Text>
      </Pressable>
      <Pressable
        onPress={() => onDelete(category, close)}
        style={[styles.actionBtn, styles.actionDelete]}
      >
        <Ionicons name="trash-outline" size={18} color="#fff" />
        <Text style={styles.actionText}>删除</Text>
      </Pressable>
    </View>
  );

  return (
    <Swipeable
      ref={swipeRef}
      friction={1.6}
      rightThreshold={36}
      overshootRight={false}
      renderRightActions={renderActions}
    >
      <Pressable
        onPress={onPress}
        onLongPress={onRename}
        style={styles.row}
      >
        <Ionicons name="folder" size={20} color="#f5b400" />
        <Text style={styles.rowName} numberOfLines={1}>
          {category.name}
        </Text>
        <Text style={styles.count}>{count}</Text>
        <Ionicons name="chevron-forward" size={18} color="#bbb" />
      </Pressable>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  title: {
    flex: 1,
    fontSize: 28,
    fontWeight: '600',
  },
  headerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#111',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  headerCtaText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  uncategorized: {
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: '#f6f8fb',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e6ecf2',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  uncategorizedName: {
    flex: 1,
    fontSize: 15,
    color: '#444',
    fontWeight: '500',
  },
  rowName: {
    flex: 1,
    fontSize: 15,
    color: '#111',
    fontWeight: '500',
  },
  count: {
    fontSize: 13,
    color: '#999',
    fontVariant: ['tabular-nums'],
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 24,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 13,
    color: '#888',
  },
  actionsBox: {
    flexDirection: 'row',
  },
  actionBtn: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionRename: { backgroundColor: '#1f6feb' },
  actionDelete: { backgroundColor: '#e23b3b' },
  actionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
