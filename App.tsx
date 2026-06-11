import { ActionSheetProvider } from '@expo/react-native-action-sheet';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  ImageBackground,
  StyleSheet,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RootTabs from './src/navigation/RootTabs';

// 阻止原生 splash 自动隐藏，由我们用全屏覆盖层接管（Android 原生 splash 只能居中小图）
SplashScreen.preventAutoHideAsync().catch(() => {});

// 全屏覆盖层展示时长（毫秒）
const SPLASH_DURATION = 1200;
const FADE_DURATION = 300;

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 全屏覆盖层已就绪，隐藏原生 splash（衔接到我们的全屏图）
    SplashScreen.hideAsync().catch(() => {});
    const timer = setTimeout(() => {
      Animated.timing(fade, {
        toValue: 0,
        duration: FADE_DURATION,
        useNativeDriver: true,
      }).start(() => setShowSplash(false));
    }, SPLASH_DURATION);
    return () => clearTimeout(timer);
  }, [fade]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ActionSheetProvider useCustomActionSheet>
          <NavigationContainer>
            <RootTabs />
            <StatusBar style="auto" />
          </NavigationContainer>
        </ActionSheetProvider>
      </SafeAreaProvider>

      {showSplash && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: fade }]}
          pointerEvents="none"
        >
          <ImageBackground
            source={require('./assets/start.png')}
            resizeMode="cover"
            style={styles.splash}
          />
        </Animated.View>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#FDF7F3',
  },
});
