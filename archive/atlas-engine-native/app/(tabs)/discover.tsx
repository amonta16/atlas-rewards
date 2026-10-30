import { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, Image, TextInput, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { browseBusinesses, saveBusiness, listSaved } from "@/lib/library-store";
import type { DiscoverBusiness } from "@/lib/types";

export default function Discover() {
  const router = useRouter();
  const [items, setItems] = useState<DiscoverBusiness[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [browseRes, savedRes] = await Promise.all([browseBusinesses(), listSaved()]);
      setItems(browseRes);
      setSavedIds(new Set(savedRes.map(s => s.id)));
      setLoading(false);
    })();
  }, []);

  async function add(b: DiscoverBusiness) {
    await saveBusiness({
      id: b.id, slug: b.slug, name: b.name, industry: b.industry,
      logo_url: b.logo_url, hero_image_url: null, brand_colors: b.brand_colors,
    });
    setSavedIds(new Set([...savedIds, b.id]));
    router.push(`/business/${b.slug}` as any);
  }

  const filtered = items.filter(b => b.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.brandLabel}>ATLAS ENGINE</Text>
        <Text style={styles.headerTitle}>Discover businesses</Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color="#71717a" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name…"
          placeholderTextColor="#52525b"
          style={styles.searchInput}
        />
      </View>

      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator color="#22d3ee" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centerWrap}>
          <Text style={styles.emptyText}>No businesses match.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item }) => (
            <Row item={item} saved={savedIds.has(item.id)} onAdd={() => add(item)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Row({ item, saved, onAdd }: { item: DiscoverBusiness; saved: boolean; onAdd: () => void }) {
  const primary = item.brand_colors?.primary ?? "#6366f1";
  return (
    <Pressable onPress={onAdd} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      {item.logo_url ? (
        <Image source={{ uri: item.logo_url }} style={styles.rowLogo} />
      ) : (
        <View style={[styles.rowLogoPlaceholder, { backgroundColor: primary }]}>
          <Text style={styles.rowLogoText}>{item.name[0]?.toUpperCase()}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        {item.industry && <Text style={styles.rowIndustry}>{item.industry}</Text>}
      </View>
      {saved ? (
        <View style={styles.savedPill}>
          <Ionicons name="checkmark" size={14} color="#22d3ee" />
          <Text style={styles.savedText}>Saved</Text>
        </View>
      ) : (
        <View style={[styles.addBtn, { backgroundColor: primary }]}>
          <Ionicons name="add" size={18} color="#fff" />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0d12" },
  header: { padding: 20, paddingBottom: 12 },
  brandLabel: { fontSize: 10, fontWeight: "800", color: "#22d3ee", letterSpacing: 2, marginBottom: 4 },
  headerTitle: { fontSize: 28, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },

  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#1f2937", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    marginHorizontal: 20, marginBottom: 12,
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 15 },

  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: "#71717a", fontSize: 14 },

  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#141823", padding: 14, borderRadius: 14,
    borderWidth: 1, borderColor: "#1f2937",
  },
  rowLogo: { width: 44, height: 44, borderRadius: 10, backgroundColor: "#fff" },
  rowLogoPlaceholder: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowLogoText: { color: "#fff", fontWeight: "800", fontSize: 18 },
  rowName: { fontSize: 15, fontWeight: "700", color: "#fff" },
  rowIndustry: { fontSize: 12, color: "#71717a", marginTop: 2, textTransform: "capitalize" },
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  savedPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: "rgba(34, 211, 238, 0.15)",
  },
  savedText: { color: "#22d3ee", fontSize: 11, fontWeight: "700" },
});
