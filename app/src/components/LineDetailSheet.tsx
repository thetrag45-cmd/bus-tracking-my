import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import type { LineDetail } from "../types";
import { colors, serviceColor } from "../theme";

type Props = {
  line: LineDetail;
  dirIndex: number;
  onChangeDir: (i: number) => void;
  onSelectStop: (stopId: string) => void;
  onClose: () => void;
};

/**
 * Line detail (Moovit teardown gap #2): service-type pill, direction toggle,
 * and the ordered stop timeline with a coloured rail. The route shape polyline
 * itself is drawn on the map by MapScreen using line.directions[dir].shape.
 */
export default function LineDetailSheet({ line, dirIndex, onChangeDir, onSelectStop, onClose }: Props) {
  const dir = line.directions[dirIndex];
  const tint = serviceColor(line.service_type);

  return (
    <View style={styles.sheet}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <View style={[styles.pill, { backgroundColor: tint }]}>
            <Text style={styles.pillText}>🚌 {line.route_name}</Text>
          </View>
          {!!dir?.headsign && <Text style={styles.headsign}>→ {dir.headsign}</Text>}
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {line.directions.length > 1 && (
        <View style={styles.dirRow}>
          {line.directions.map((d, i) => (
            <TouchableOpacity
              key={d.direction_id}
              style={[styles.dirBtn, i === dirIndex && styles.dirBtnActive]}
              onPress={() => onChangeDir(i)}
            >
              <Text
                style={[styles.dirBtnText, i === dirIndex && styles.dirBtnTextActive]}
                numberOfLines={1}
              >
                → {d.headsign || `Direction ${i + 1}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={styles.sectionLabel}>STOPS ON THIS LINE</Text>
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {(dir?.stops ?? []).map((s, i, arr) => (
          <TouchableOpacity key={s.stop_id} style={styles.stopRow} onPress={() => onSelectStop(s.stop_id)}>
            <View style={styles.rail}>
              <View style={[styles.railLine, { backgroundColor: i === 0 ? "transparent" : tint }]} />
              <View style={[styles.node, { borderColor: tint }]} />
              <View style={[styles.railLine, { backgroundColor: i === arr.length - 1 ? "transparent" : tint }]} />
            </View>
            <View style={styles.stopText}>
              <Text style={styles.stopName}>{s.stop_name}</Text>
              {!!s.stop_code && <Text style={styles.stopCode}>{s.stop_code}</Text>}
            </View>
          </TouchableOpacity>
        ))}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: colors.cream, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    maxHeight: "78%", shadowColor: "#000", shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.16, shadowRadius: 16, elevation: 10,
  },
  handle: { width: 36, height: 4, backgroundColor: "#E6DCC4", borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 6 },
  header: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  pill: { alignSelf: "flex-start", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 4 },
  pillText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  headsign: { fontSize: 13, color: colors.later, fontWeight: "600" },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.line, alignItems: "center", justifyContent: "center", marginLeft: 12 },
  closeBtnText: { fontSize: 13, color: "#7A6E5E" },
  dirRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  dirBtn: { flex: 1, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: "#fff" },
  dirBtnActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  dirBtnText: { fontSize: 12, fontWeight: "700", color: colors.later },
  dirBtnTextActive: { color: "#fff" },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: colors.faint, letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 2 },
  list: { paddingHorizontal: 16 },
  stopRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 2 },
  rail: { width: 16, alignItems: "center", alignSelf: "stretch" },
  railLine: { width: 3, flex: 1 },
  node: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#fff", borderWidth: 3 },
  stopText: { flex: 1, paddingVertical: 7 },
  stopName: { fontSize: 13, fontWeight: "600", color: colors.ink },
  stopCode: { fontSize: 10, color: colors.faint, marginTop: 1 },
});
