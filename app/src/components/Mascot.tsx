import React from "react";
import { View, StyleSheet } from "react-native";

/**
 * Godeez mascot — chubby cheerful yellow blob, rendered with plain Views so we
 * don't pull in react-native-svg (footprint/cost). "Useful first, cute second":
 * it lives in the header and empty/loading states, never over live arrival data.
 */
export default function Mascot({ size = 32 }: { size?: number }) {
  const s = size / 32; // scale factor against the 32px reference design
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {/* body */}
      <View
        style={[
          styles.body,
          { width: size, height: size * 0.92, borderRadius: size, backgroundColor: "#FFE08A" },
        ]}
      />
      {/* eyes */}
      <View style={[styles.eyeRow, { top: size * 0.34, gap: size * 0.18 }]}>
        <View style={[styles.eye, { width: 3.2 * s, height: 3.2 * s, borderRadius: 2 * s }]} />
        <View style={[styles.eye, { width: 3.2 * s, height: 3.2 * s, borderRadius: 2 * s }]} />
      </View>
      {/* cheeks */}
      <View style={[styles.cheekRow, { top: size * 0.46, gap: size * 0.42 }]}>
        <View style={[styles.cheek, { width: 4 * s, height: 2.6 * s, borderRadius: 2 * s }]} />
        <View style={[styles.cheek, { width: 4 * s, height: 2.6 * s, borderRadius: 2 * s }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { position: "absolute" },
  eyeRow: { position: "absolute", flexDirection: "row" },
  eye: { backgroundColor: "#3A2F28" },
  cheekRow: { position: "absolute", flexDirection: "row" },
  cheek: { backgroundColor: "#FF9E80", opacity: 0.7 },
});
