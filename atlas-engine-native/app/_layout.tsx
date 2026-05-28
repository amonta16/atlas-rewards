import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="business/[slug]" options={{ presentation: "fullScreenModal" }} />
      </Stack>
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}
