import { useActionSheet } from '@expo/react-native-action-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const { showActionSheetWithOptions } = useActionSheet();
  const insets = useSafeAreaInsets();
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
    const result =
      edit.mode === 'create'
        ? await createCategory(name)
        : await renameCategory(edit.category.id, name);
    if (!result.ok) {
      if (result.reason === 'duplicate') {
        Alert.alert('提示', '已有同名分类，请换一个');
      }
      return;
    }
    setEdit(null);
    await reload();
  };

  const takenNames =
    edit?.mode === 'rename'
      ? categories
          .filter((c) => c.id !== edit.category.id)
          .map((c) => c.name)
      : categories.map((c) => c.name);

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

  const openActionMenu = (cat: Category) => {
    showActionSheetWithOptions(
      {
        title: cat.name,
        options: ['改名', '删除', '取消'],
        destructiveButtonIndex: 1,
        cancelButtonIndex: 2,
        containerStyle: { paddingBottom: insets.bottom },
      },
      (index) => {
        if (index === 0) setEdit({ mode: 'rename', category: cat });
        else if (index === 1) handleDelete(cat, () => {});
      },
    );
  };

  const renderItem = ({ item }: { item: Category }) => (
    <CategoryRow
      category={item}
      count={countByCategory(item.id)}
      onPress={() => openCategory(item)}
      onLongPress={() => openActionMenu(item)}
    />
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>分类</Text>
        <Pressable
          onPress={() => setEdit({ mode: 'create' })}
          style={({ pressed }) => [styles.headerCta, pressed && styles.headerCtaPressed]}
          hitSlop={8}
          accessibilityLabel="新建分类"
        >
          <Ionicons name="add" size={26} color="#111" />
        </Pressable>
      </View>

      <FlatList
        data={categories}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.divider} />}
        ListHeaderComponent={
          <>
            <Pressable
              onPress={() =>
                navigation.navigate('CategoryNotes', {
                  categoryId: '__uncategorized__',
                  categoryName: '未分类',
                })
              }
              android_ripple={{ color: '#eee' }}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Ionicons name="albums-outline" size={20} color="#666" />
              <Text style={styles.rowName} numberOfLines={1}>
                未分类
              </Text>
              <Text style={styles.count}>{countByCategory(undefined)}</Text>
              <Ionicons name="chevron-forward" size={18} color="#bbb" />
            </Pressable>
            {categories.length > 0 && <View style={styles.divider} />}
          </>
        }
        ListFooterComponent={
          categories.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>还没有自定义分类</Text>
              <Text style={styles.emptyHint}>点右上「+」给笔记建一个分类</Text>
            </View>
          ) : null
        }
      />

      <CategoryEditModal
        visible={!!edit}
        mode={edit?.mode === 'rename' ? 'rename' : 'create'}
        defaultName={edit?.mode === 'rename' ? edit.category.name : ''}
        takenNames={takenNames}
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
  onLongPress: () => void;
};

function CategoryRow({ category, count, onPress, onLongPress }: RowProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={250}
      android_ripple={{ color: '#eee' }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Ionicons name="folder" size={20} color="#f5b400" />
      <Text style={styles.rowName} numberOfLines={1}>
        {category.name}
      </Text>
      <Text style={styles.count}>{count}</Text>
      <Ionicons name="chevron-forward" size={18} color="#bbb" />
    </Pressable>
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
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCtaPressed: {
    backgroundColor: '#f0f0f0',
  },
  list: {
    marginHorizontal: 20,
    marginTop: 4,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f7f7f8',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#f7f7f8',
  },
  rowPressed: {
    backgroundColor: '#ededee',
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
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e2e2e4',
    marginLeft: 46,
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
});
