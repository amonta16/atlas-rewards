import { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, Pressable, Image, RefreshControl, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { listSaved, removeBusiness } from "@/lib/library-store";
import type { SavedBusiness } from "@/lib/types";

export default function Library() {
  const router = useRouter();
  const [items, setItems] = useState<SavedBusiness[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const saved = await listSaved();
    setItems(saved);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function openBusiness(b: SavedBusiness) {
    router.push(`/business/${b.slug}` as any);
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brandLabel}>ATLAS ENGINE</Text>
          <Text style={styles.headerTitle}>Your library</Text>
        </View>
        {items.length > 0 && (
          <Text style={styles.headerCount}>{items.length} {items.length === 1 ? "card" : "cards"}</Text>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="card-outline" size={64} color="#71717a" />
          </View>
          <Text style={styles.emptyTitle}>Your library is empty</Text>
          <Text style={styles.emptySub}>
            Scan a business QR code or browse Discover to add your first rewards card.
          </Text>
          <Pressable onPress={() => router.push("/scan" as any)} style={styles.emptyCTA}>
            <Ionicons name="scan" size={20} color="#0b0d12" />
            <Text style={styles.emptyCTAText}>Scan a code</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#22d3ee" />}
          renderItem={({ item }) => <BusinessCard item={item} onPress={() => openBusiness(item)} />}
        />
      )}
    </SafeAreaView>
  );
}

function BusinessCard({ item, onPress }: { item: SavedBusiness; onPress: () => void }) {
  const primary = item.brand_colors?.primary ?? "#6366f1";
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.cardGradient, { backgroundColor: primary }]}>
        {item.logo_url ? (
          <Image source={{ uri: item.logo_url }} style={styles.cardLogo} />
        ) : (
          <View style={[styles.cardLogoPlaceholder, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
            <Text style={styles.cardLogoPlaceholderText}>{item.name[0]?.toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.cardName}>{item.name}</Text>
        {item.industry && <Text style={styles.cardIndustry}>{item.industry}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0d12" },
  header: {
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20,
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
  },
  brandLabel: { fontSize: 10, fontWeight: "800", color: "#22d3ee", letterSpacing: 2, marginBottom: 4 },
  headerTitle: { fontSize: 32, fontWeight: "800", color: "#fff", letterSpacing: -1 },
  headerCount: { fontSize: 13, color: "#71717a", fontWeight: "600" },

  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyIconWrap: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: "#1f2937",
    alignItems: "center", justifyContent: "center", marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#fff", marginBottom: 8 },
  emptySub: { fontSize: 14, color: "#a1a1aa", textAlign: "center", lineHeight: 20, marginBottom: 24 },
  emptyCTA: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#22d3ee", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999,
  },
  emptyCTAText: { fontSize: 15, fontWeight: "700", color: "#0b0d12" },

  card: { borderRadius: 20, overflow: "hidden" },
  cardGradient: { padding: 20, minHeight: 140, justifyContent: "space-between" },
  cardLogo: { width: 40, height: 40, borderRadius: 8, backgroundColor: "#fff" },
  cardLogoPlaceholder: {
    width: 40, height: 40, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  cardLogoPlaceholderText: { color: "#fff", fontWeight: "800", fontSize: 18 },
  cardName: { fontSize: 22, fontWeight: "800", color: "#fff", marginTop: 24 },
  cardIndustry: { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 4, textTransform: "capitalize" },
});
