import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { listSaved } from "@/lib/library-store";
import { ROOT_HOST } from "@/lib/config";

export default function Profile() {
  const [count, setCount] = useState(0);
  useEffect(() => { listSaved().then(s => setCount(s.length)); }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.brandLabel}>ATLAS ENGINE</Text>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <View style={styles.statsCard}>
        <View style={styles.statsTopBadge}>
          <Ionicons name="card" size={20} color="#22d3ee" />
        </View>
        <Text style={styles.statsNumber}>{count}</Text>
        <Text style={styles.statsLabel}>businesses in your library</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>About</Text>
        <Row icon="information-circle" label="Version" value="1.0.0" />
        <Row icon="globe" label="Platform host" value={ROOT_HOST} />
        <Row
          icon="open-outline"
          label="Help & support"
          onPress={() => Linking.openURL(`https://${ROOT_HOST}`)}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Atlas Engine — sign in is handled by each business's rewards app, separately. No global account in v1.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function Row({ icon, label, value, onPress }: { icon: any; label: string; value?: string; onPress?: () => void }) {
  const C = onPress ? Pressable : View;
  return (
    <C onPress={onPress} style={({ pressed }: any) => [styles.row, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={18} color="#71717a" />
      <Text style={styles.rowLabel}>{label}</Text>
      {value && <Text style={styles.rowValue}>{value}</Text>}
      {onPress && <Ionicons name="chevron-forward" size={16} color="#52525b" />}
    </C>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0d12" },
  header: { padding: 20, paddingBottom: 8 },
  brandLabel: { fontSize: 10, fontWeight: "800", color: "#22d3ee", letterSpacing: 2, marginBottom: 4 },
  headerTitle: { fontSize: 28, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },

  statsCard: {
    margin: 20, marginTop: 12, padding: 20, borderRadius: 18,
    backgroundColor: "#141823", borderColor: "#1f2937", borderWidth: 1,
    alignItems: "flex-start",
  },
  statsTopBadge: {
    width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(34, 211, 238, 0.15)", marginBottom: 12,
  },
  statsNumber: { color: "#fff", fontSize: 40, fontWeight: "800", letterSpacing: -1 },
  statsLabel: { color: "#a1a1aa", fontSize: 13 },

  section: { padding: 20, paddingTop: 4 },
  sectionLabel: { fontSize: 10, color: "#71717a", textTransform: "uppercase", letterSpacing: 2, fontWeight: "800", marginBottom: 8 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#1f2937",
  },
  rowLabel: { color: "#fff", fontSize: 15, flex: 1 },
  rowValue: { color: "#71717a", fontSize: 13 },

  footer: { padding: 20, marginTop: "auto" },
  footerText: { color: "#52525b", fontSize: 11, lineHeight: 16, textAlign: "center" },
});
