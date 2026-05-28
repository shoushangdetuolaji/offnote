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

export default function SettingsScreen() {
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

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Cobalt 解析实例</Text>
            <Text style={styles.cardHint}>
              OffNote 通过 Cobalt 解析 Instagram 链接。
              到 instances.cobalt.best 找一个 instagram=true 且无 turnstile 的在线实例。
            </Text>

            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>当前实例</Text>
              {saved ? (
                <Text style={styles.statusOk} numberOfLines={1}>
                  {saved}
                </Text>
              ) : (
                <Text style={styles.statusEmpty}>未配置</Text>
              )}
            </View>

            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="https://your-cobalt-instance.example.com/"
              placeholderTextColor="#aaa"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              style={styles.input}
            />

            <View style={styles.actions}>
              {saved && (
                <>
                  <Pressable
                    onPress={handleClear}
                    disabled={busy}
                    style={[styles.btn, styles.btnGhost, busy && styles.btnDisabled]}
                  >
                    <Text style={styles.btnGhostText}>清除</Text>
                  </Pressable>
                  <Pressable
                    onPress={handlePing}
                    disabled={busy}
                    style={[styles.btn, styles.btnGhost, busy && styles.btnDisabled]}
                  >
                    <Text style={styles.btnGhostText}>
                      {busy ? '检测中…' : '测试连通'}
                    </Text>
                  </Pressable>
                </>
              )}
              <Pressable
                onPress={handleSave}
                disabled={busy}
                style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
              >
                <Text style={styles.btnPrimaryText}>
                  {busy ? '保存中…' : '保存'}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.helpCard}>
            <Text style={styles.helpTitle}>哪里找 Cobalt 实例？</Text>
            <Text style={styles.helpText} selectable>
              1. 浏览器打开 https://instances.cobalt.best{'\n'}
              2. 勾选 "only online" 和 "only instances w/out turnstile"{'\n'}
              3. 找一个 services 列里 Instagram 是 ✓ 的{'\n'}
              4. 复制它的 API URL（一般是 https://开头）{'\n'}
              5. 粘进上方输入框 → 保存 → 测试连通
            </Text>
            <Text style={styles.helpWarn} selectable>
              ⚠️ 公共实例可能挂、可能限流。挂了就换一个，或自部署
              （Railway/Docker 一键，约 $5/月）。
            </Text>
          </View>
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
