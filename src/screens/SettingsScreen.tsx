import { useActionSheet } from '@expo/react-native-action-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
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
  exportBackup,
  importBackup,
  shareBackup,
} from '../lib/backup';
import {
  clearCobaltInstance,
  getCobaltInstance,
  pingCobaltInstance,
  setCobaltInstance,
} from '../lib/cobalt';
import {
  checkLatestRelease,
  downloadApk,
  installApk,
  isNewer,
} from '../lib/update';
import type { SettingsStackParamList } from '../navigation/SettingsStack';

const CURRENT_VERSION =
  Constants.expoConfig?.version ??
  Application.nativeApplicationVersion ??
  '1.0.0';

type Nav = NativeStackNavigationProp<SettingsStackParamList, 'SettingsList'>;

export default function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const { showActionSheetWithOptions } = useActionSheet();
  const [input, setInput] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);

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

  const startDownload = (apkUrl: string) => {
    setProgress('准备下载…');
    downloadApk(apkUrl, (p) => setProgress(`下载中 ${p.label}`))
      .then(async (fileUri) => {
        setProgress(null);
        await installApk(fileUri);
      })
      .catch((e) => {
        setProgress(null);
        Alert.alert('下载失败', e?.message ?? '请稍后重试，或切换网络');
      });
  };

  const handleCheckUpdate = async () => {
    if (checking || progress) return;
    setChecking(true);
    try {
      const latest = await checkLatestRelease();
      if (!isNewer(latest.version, CURRENT_VERSION)) {
        Alert.alert('已是最新版本', `当前版本 v${CURRENT_VERSION}`);
        return;
      }
      const body = latest.notes
        ? `\n\n更新内容：\n${latest.notes}`
        : '';
      if (Platform.OS !== 'android' || !latest.apkUrl) {
        // iOS 或无 apk 资产：跳转 release 页
        Alert.alert(
          `发现新版本 v${latest.version}`,
          `当前 v${CURRENT_VERSION}${body}`,
          [
            { text: '取消', style: 'cancel' },
            { text: '前往下载', onPress: () => Linking.openURL(latest.htmlUrl) },
          ],
        );
        return;
      }
      const apkUrl = latest.apkUrl;
      Alert.alert(
        `发现新版本 v${latest.version}`,
        `当前 v${CURRENT_VERSION}${body}`,
        [
          { text: '取消', style: 'cancel' },
          { text: '下载更新', onPress: () => startDownload(apkUrl) },
        ],
      );
    } catch (e: any) {
      Alert.alert('检查更新失败', e?.message ?? '请检查网络后重试');
    } finally {
      setChecking(false);
    }
  };

  const runExport = async () => {
    setBackupMsg('正在打包数据…');
    try {
      const zipUri = await exportBackup(setBackupMsg);
      setBackupMsg(null);
      await shareBackup(zipUri);
    } catch (e: any) {
      setBackupMsg(null);
      Alert.alert('导出失败', e?.message ?? '请稍后重试');
    }
  };

  const runImport = async () => {
    Alert.alert(
      '从备份恢复',
      '将合并备份里的笔记与分类，已存在的笔记会跳过、不会覆盖。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '选择备份文件',
          onPress: async () => {
            setBackupMsg('正在恢复…');
            try {
              const result = await importBackup(setBackupMsg);
              setBackupMsg(null);
              if (!result) return; // 用户取消选择
              Alert.alert(
                '恢复完成',
                `新增 ${result.added} 条，跳过 ${result.skipped} 条（已存在）。\n回到首页会自动刷新。`,
              );
            } catch (e: any) {
              setBackupMsg(null);
              Alert.alert('恢复失败', e?.message ?? '备份文件可能损坏');
            }
          },
        },
      ],
    );
  };

  const handleBackup = () => {
    if (backupMsg) return;
    showActionSheetWithOptions(
      {
        title: '备份与恢复',
        options: ['导出备份', '从备份恢复', '取消'],
        cancelButtonIndex: 2,
      },
      (index) => {
        if (index === 0) runExport();
        else if (index === 1) runImport();
      },
    );
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

          <Pressable
            onPress={handleCheckUpdate}
            disabled={checking || !!progress}
            style={({ pressed }) => [
              styles.navRow,
              pressed && styles.navRowPressed,
              (checking || !!progress) && styles.navRowDisabled,
            ]}
            android_ripple={{ color: '#eee' }}
          >
            <View style={styles.navIcon}>
              <Ionicons name="cloud-download-outline" size={20} color="#444" />
            </View>
            <View style={styles.navBody}>
              <Text style={styles.navLabel}>检查更新</Text>
              <Text style={styles.navHint}>
                {progress
                  ? progress
                  : checking
                    ? '正在检查…'
                    : '从 GitHub 获取最新版本'}
              </Text>
            </View>
            {!checking && !progress && (
              <Ionicons name="chevron-forward" size={18} color="#bbb" />
            )}
          </Pressable>

          <Pressable
            onPress={handleBackup}
            disabled={!!backupMsg}
            style={({ pressed }) => [
              styles.navRow,
              pressed && styles.navRowPressed,
              !!backupMsg && styles.navRowDisabled,
            ]}
            android_ripple={{ color: '#eee' }}
          >
            <View style={styles.navIcon}>
              <Ionicons name="archive-outline" size={20} color="#444" />
            </View>
            <View style={styles.navBody}>
              <Text style={styles.navLabel}>备份与恢复</Text>
              <Text style={styles.navHint}>
                {backupMsg ?? '导出全部笔记为 zip，或从备份恢复'}
              </Text>
            </View>
            {!backupMsg && (
              <Ionicons name="chevron-forward" size={18} color="#bbb" />
            )}
          </Pressable>

          <Text style={styles.versionText}>当前版本 v{CURRENT_VERSION}</Text>
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
  navRowDisabled: {
    opacity: 0.6,
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#aaa',
    marginTop: 8,
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
