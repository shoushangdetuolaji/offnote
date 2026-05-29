import {
  Poppins_700Bold,
  Poppins_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/poppins';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  size?: number;
};

export default function Wordmark({ size = 32 }: Props) {
  const [loaded] = useFonts({
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  // 字体未加载完时用系统粗体先撑住布局，避免抖动
  const fontFamily = loaded ? 'Poppins_800ExtraBold' : undefined;

  return (
    <View style={styles.row}>
      <Text
        style={[
          styles.text,
          styles.off,
          { fontSize: size, fontFamily, lineHeight: size * 1.1 },
        ]}
      >
        Off
      </Text>
      <Text
        style={[
          styles.text,
          styles.note,
          { fontSize: size, fontFamily, lineHeight: size * 1.1 },
        ]}
      >
        Note
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  text: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  off: {
    color: '#bbb',
  },
  note: {
    color: '#111',
  },
});
