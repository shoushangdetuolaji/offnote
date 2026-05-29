import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SettingsScreen from '../screens/SettingsScreen';
import StorageStatsScreen from '../screens/StorageStatsScreen';

export type SettingsStackParamList = {
  SettingsList: undefined;
  StorageStats: undefined;
};

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export default function SettingsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerTitleStyle: { fontSize: 17, fontWeight: '600' },
        headerBackTitle: '返回',
      }}
    >
      <Stack.Screen
        name="SettingsList"
        component={SettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="StorageStats"
        component={StorageStatsScreen}
        options={{ title: '使用统计' }}
      />
    </Stack.Navigator>
  );
}
