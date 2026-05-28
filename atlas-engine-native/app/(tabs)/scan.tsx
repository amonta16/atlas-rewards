import { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, BarcodeScanningResult } from "expo-camera";
import * as Haptics from "expo-haptics";
import { lookupBusinessBySlug, saveBusiness } from "@/lib/library-store";

export default function Scan() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualSlug, setManualSlug] = useState("");

  useEffect(() => {
    if (!permission) requestPermission();
  }, [permission]);

  function extractSlugFromQr(raw: string): string {
    // Accept several QR encodings:
    //   "atlas://add/joesgym"
    //   "https://atlasrewards.app/qr/joesgym"
    //   "https://joesgym.atlasrewards.app/..."
    //   "joesgym"
    try {
      if (raw.startsWith("atlas://")) {
        return raw.replace(/^atlas:\/\/(add\/)?/, "").split(/[/?#]/)[0];
      }
      if (raw.startsWith("http")) {
        const u = new URL(raw);
        // /qr/<slug>
        const m = u.pathname.match(/\/qr\/([a-z0-9-]+)/i);
        if (m) return m[1].toLowerCase();
        // subdomain.atlasrewards.app
        const parts = u.hostname.split(".");
        if (parts.length >= 3) return parts[0].toLowerCase();
        return u.pathname.replace(/^\/+/, "").toLowerCase();
      }
    } catch {}
    return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  }

  async function addBySlug(slug: string) {
    if (!slug) return;
    setBusy(true);
    try {
      const biz = await lookupBusinessBySlug(slug);
      if (!biz) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Not found", `No business with slug "${slug}".`);
        return;
      }
      await saveBusiness({
        id: biz.id,
        slug: biz.slug,
        name: biz.name,
        industry: biz.industry,
        logo_url: biz.logo_url,
        hero_image_url: null,
        brand_colors: biz.brand_colors,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/business/${biz.slug}` as any);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Couldn't add this business.");
    } finally {
      setBusy(false);
    }
  }

  function onBarcode(result: BarcodeScanningResult) {
    if (busy) return;
    const slug = extractSlugFromQr(result.data ?? "");
    if (!slug) return;
    addBySlug(slug);
  }

  if (!permission?.granted) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.permWrap}>
          <Ionicons name="camera-outline" size={64} color="#71717a" />
          <Text style={styles.permTitle}>Camera access needed</Text>
          <Text style={styles.permSub}>Atlas Engine uses your camera to scan business QR codes.</Text>
          <Pressable onPress={requestPermission} style={styles.permCTA}>
            <Text style={styles.permCTAText}>Allow camera</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.brandLabel}>ATLAS ENGINE</Text>
        <Text style={styles.headerTitle}>Scan a business</Text>
        <Text style={styles.headerSub}>Point at a business QR code to add their rewards card.</Text>
      </View>

      {!manualMode ? (
        <>
          <View style={styles.cameraWrap}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={onBarcode}
            />
            <View pointerEvents="none" style={styles.frame} />
          </View>
          <Pressable onPress={() => setManualMode(true)} style={styles.manualBtn}>
            <Ionicons name="keypad-outline" size={16} color="#22d3ee" />
            <Text style={styles.manualBtnText}>Enter business name manually</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.manualWrap}>
          <Text style={styles.manualLabel}>Business URL slug</Text>
          <TextInput
            value={manualSlug}
            onChangeText={setManualSlug}
            placeholder="e.g. joesgym"
            placeholderTextColor="#52525b"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.manualInput}
          />
          <Pressable onPress={() => addBySlug(manualSlug)} disabled={busy} style={[styles.manualSubmit, busy && { opacity: 0.5 }]}>
            <Text style={styles.manualSubmitText}>{busy ? "Adding…" : "Add to library"}</Text>
          </Pressable>
          <Pressable onPress={() => setManualMode(false)} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Back to scanner</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0d12" },
  header: { padding: 20 },
  brandLabel: { fontSize: 10, fontWeight: "800", color: "#22d3ee", letterSpacing: 2, marginBottom: 4 },
  headerTitle: { fontSize: 28, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  headerSub: { fontSize: 14, color: "#a1a1aa", marginTop: 8, lineHeight: 20 },

  cameraWrap: { flex: 1, marginHorizontal: 20, borderRadius: 24, overflow: "hidden", backgroundColor: "#000" },
  frame: {
    position: "absolute", left: "10%", top: "20%", width: "80%", aspectRatio: 1,
    borderWidth: 2, borderColor: "#22d3ee", borderRadius: 24,
  },

  manualBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    padding: 16, alignSelf: "center",
  },
  manualBtnText: { color: "#22d3ee", fontWeight: "600", fontSize: 14 },

  manualWrap: { padding: 20, flex: 1 },
  manualLabel: { fontSize: 12, color: "#71717a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, fontWeight: "700" },
  manualInput: {
    backgroundColor: "#1f2937", color: "#fff", fontSize: 18,
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12,
    borderColor: "#374151", borderWidth: 1,
  },
  manualSubmit: { backgroundColor: "#22d3ee", paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 16 },
  manualSubmitText: { color: "#0b0d12", fontWeight: "800", fontSize: 16 },
  cancelBtn: { padding: 12, alignItems: "center", marginTop: 8 },
  cancelBtnText: { color: "#71717a", fontWeight: "600" },

  permWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  permTitle: { fontSize: 20, fontWeight: "700", color: "#fff", marginTop: 16 },
  permSub: { fontSize: 14, color: "#a1a1aa", textAlign: "center", marginTop: 8, marginBottom: 24, lineHeight: 20 },
  permCTA: { backgroundColor: "#22d3ee", paddingHorizontal: 24, paddingVertical: 14, borderRadius: 999 },
  permCTAText: { color: "#0b0d12", fontWeight: "800", fontSize: 15 },
});
