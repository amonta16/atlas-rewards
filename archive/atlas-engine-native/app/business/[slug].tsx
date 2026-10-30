import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { listSaved, markOpened, removeBusiness } from "@/lib/library-store";
import { urlForBusiness } from "@/lib/config";
import type { SavedBusiness } from "@/lib/types";

export default function BusinessWebView() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [biz, setBiz] = useState<SavedBusiness | null>(null);
  const [loading, setLoading] = useState(true);
  const webRef = useRef<WebView>(null);

  useEffect(() => {
    (async () => {
      const saved = await listSaved();
      const found = saved.find(s => s.slug === slug);
      setBiz(found ?? null);
      if (found) await markOpened(found.id);
    })();
  }, [slug]);

  function close() { router.back(); }

  async function unsave() {
    if (!biz) return;
    Alert.alert(
      `Remove ${biz.name}?`,
      "Your rewards account at this business stays intact — you can always add it back later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await removeBusiness(biz.id);
            router.back();
          },
        },
      ]
    );
  }

  if (!biz) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Business not in your library.</Text>
          <Pressable onPress={close} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const primary = biz.brand_colors?.primary ?? "#6366f1";
  const url = urlForBusiness(biz.slug, "/app");

  return (
    <View style={styles.container}>
      {/* Top chrome — brand-aware */}
      <SafeAreaView edges={["top"]} style={{ backgroundColor: primary }}>
        <View style={styles.topBar}>
          <Pressable onPress={close} style={styles.topBtn}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <Text numberOfLines={1} style={styles.topTitle}>{biz.name}</Text>
          <Pressable onPress={unsave} style={styles.topBtn}>
            <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
          </Pressable>
        </View>
      </SafeAreaView>

      {/* WebView */}
      <WebView
        ref={webRef}
        source={{ uri: url }}
        style={{ flex: 1, backgroundColor: "#fff" }}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        javaScriptEnabled
        startInLoadingState
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        renderLoading={() => (
          <View style={[styles.center, { backgroundColor: "#fff" }]}>
            <ActivityIndicator color={primary} size="large" />
            <Text style={[styles.loadingText, { color: primary }]}>Loading {biz.name}…</Text>
          </View>
        )}
      />

      {loading && (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <ActivityIndicator color={primary} size="small" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0d12" },
  topBar: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 8, gap: 8,
  },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  topTitle: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "700", textAlign: "center" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  errorText: { color: "#fff", fontSize: 16, marginBottom: 16 },
  closeBtn: { backgroundColor: "#22d3ee", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 },
  closeBtnText: { color: "#0b0d12", fontWeight: "700" },
  loadingText: { marginTop: 12, fontSize: 14, fontWeight: "600" },
  loadingOverlay: { position: "absolute", top: 90, right: 16 },
});
