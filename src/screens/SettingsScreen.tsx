import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  clearCobaltInstance,
  getCobaltInstance,
  pingCobaltInstance,
  setCobaltInstance,
} from '../lib/cobalt';
import type { SettingsStackParamList } from '../navigation/SettingsStack';

type Nav = NativeStackNavigationProp<SettingsStackParamList, 'SettingsList'>;

export default function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const [input, setInput] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setSaved(await getCobaltInstance());
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleSave = async () => {
    if (!input.trim()) {
      Alert.alert('提示', '请粘贴 Cobalt 实例 URL');
      return;
    }
    setBusy(true);
    try {
      await setCobaltInstance(input);
      setInput('');
      await refresh();
      Alert.alert('已保存', '解析请求会发到这个实例');
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    Alert.alert('确认清除', '清除后将无法解析（必须配置 Cobalt 实例才能用）', [
      { text: '取消', style: 'cancel' },
      {
        text: '清除',
        style: 'destructive',
        onPress: async () => {
          await clearCobaltInstance();
          await refresh();
        },
      },
    ]);
  };

  const handlePing = async () => {
    if (!saved) return;
    setBusy(true);
    try {
      const r = await pingCobaltInstance(saved);
      Alert.alert(
        r.ok ? '实例在线 ✅' : '实例无响应 ❌',
        `HTTP ${r.status}\n${r.snippet}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>设置</Text>

          <Pressable
            onPress={() => navigation.navigate('StorageStats')}
            style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed]}
            android_ripple={{ color: '#eee' }}
          >
            <View style={styles.navIcon}>
              <Ionicons name="stats-chart-outline" size={20} color="#444" />
            </View>
            <View style={styles.navBody}>
              <Text style={styles.navLabel}>使用统计</Text>
              <Text style={styles.navHint}>查看笔记数量和本地空间占用</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#bbb" />
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 20,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  navRowPressed: {
    backgroundColor: '#f5f5f5',
  },
  navIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f6f8fb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBody: { flex: 1 },
  navLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    marginBottom: 2,
  },
  navHint: {
    fontSize: 12,
    color: '#888',
  },
  card: {
    backgroundColor: '#f6f8fb',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e6ecf2',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    marginBottom: 6,
  },
  cardHint: {
    fontSize: 12,
    color: '#666',
    marginBottom: 14,
    lineHeight: 18,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  statusLabel: {
    fontSize: 13,
    color: '#444',
  },
  statusOk: {
    fontSize: 13,
    color: '#2a8f3a',
    fontWeight: '600',
    flexShrink: 1,
  },
  statusEmpty: {
    fontSize: 13,
    color: '#b03030',
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#dcdcdc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#111',
    backgroundColor: '#fff',
  },
  actions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  btnPrimary: {
    backgroundColor: '#111',
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  btnGhost: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dcdcdc',
  },
  btnGhostText: {
    color: '#444',
    fontSize: 14,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  helpCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#eee',
  },
  helpTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
    marginBottom: 10,
  },
  helpText: {
    fontSize: 13,
    color: '#444',
    lineHeight: 22,
    marginBottom: 10,
  },
  helpWarn: {
    fontSize: 12,
    color: '#a06200',
    lineHeight: 18,
  },
});
