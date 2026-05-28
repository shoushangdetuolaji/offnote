import { createNativeStackNavigator } from '@react-navigation/native-stack';

import CategoriesScreen from '../screens/CategoriesScreen';
import CategoryNotesScreen from '../screens/CategoryNotesScreen';

export type CategoriesStackParamList = {
  CategoriesList: undefined;
  CategoryNotes: { categoryId: string; categoryName: string };
};

const Stack = createNativeStackNavigator<CategoriesStackParamList>();

export default function CategoriesStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerTitleStyle: { fontSize: 17, fontWeight: '600' },
        headerBackTitle: '返回',
      }}
    >
      <Stack.Screen
        name="CategoriesList"
        component={CategoriesScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CategoryNotes"
        component={CategoryNotesScreen}
        options={({ route }) => ({ title: route.params.categoryName })}
      />
    </Stack.Navigator>
  );
}
