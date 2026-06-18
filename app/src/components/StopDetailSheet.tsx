import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { fetchArrivals, formatArrivalTime } from "../services/proxy";
import { submitConfirmation } from "../services/firebase";
import type { Stop, Arrival } from "../types";

type Props = {
  stop: Stop;
  userLocation: { lat: number; lng: number };
  onClose: () => void;
};

export default function StopDetailSheet({ stop, userLocation, onClose }: Props) {
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [confirmCount, setConfirmCount] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetchArrivals(stop.stop_id)
      .then(setArrivals)
      .finally(() => setLoading(false));

    // Refresh arrivals every 60s
    const interval = setInterval(() => {
      fetchArrivals(stop.stop_id).then(setArrivals);
    }, 60_000);

    return () => clearInterval(interval);
  }, [stop.stop_id]);

  async function handleConfirm() {
    if (confirming) return;
    setConfirming(true);
    try {
      // Use first arrival's routeId if available
      const routeId = arrivals[0]?.route_id ?? "";
      await submitConfirmation(
        stop.stop_id,
        routeId,
        userLocation.lat,
        userLocation.lng,
        stop.stop_lat,
        stop.stop_lon
      );
      setConfirmCount((n) => n + 1);
    } catch (e) {
      Alert.alert("Could not submit", "Check your connection and try again.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <View style={styles.sheet}>
      <View style={styles.handle} />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.stopCode}>{stop.stop_code ?? stop.stop_id}</Text>
          <Text style={styles.stopName} numberOfLines={2}>
            {stop.stop_name}
          </Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>SCHEDULED ARRIVALS</Text>

      {loading ? (
        <ActivityIndicator style={styles.spinner} color="#1565C0" />
      ) : arrivals.length === 0 ? (
        <Text style={styles.emptyText}>No more arrivals today</Text>
      ) : (
        <ScrollView
          style={styles.arrivalList}
          showsVerticalScrollIndicator={false}
        >
          {arrivals.map((a, i) => (
            <View key={`${a.trip_id}-${i}`} style={styles.arrivalRow}>
              <View style={styles.routeBadge}>
                <Text style={styles.routeBadgeText}>{a.route_name}</Text>
              </View>
              <Text style={styles.headsign} numberOfLines={1}>
                {a.trip_headsign}
              </Text>
              <Text style={styles.arrivalTime}>
                {formatArrivalTime(a.arrival_time)}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Crowdsource confirm button */}
      <View style={styles.confirmSection}>
        <TouchableOpacity
          style={[styles.confirmBtn, confirming && styles.confirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={confirming}
          activeOpacity={0.8}
        >
          {confirming ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.confirmBtnText}>🚌 Bus is here!</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.confirmSubtext}>
          {confirmCount > 0
            ? `You confirmed ${confirmCount} time${confirmCount > 1 ? "s" : ""} — thanks!`
            : "Help your fellow commuters — tap when the bus arrives"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    maxHeight: "65%",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#ddd",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  headerLeft: { flex: 1, gap: 2 },
  stopCode: { fontSize: 12, color: "#1565C0", fontWeight: "700", letterSpacing: 0.5 },
  stopName: { fontSize: 17, fontWeight: "700", color: "#111", lineHeight: 22 },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f0f0f0",
    borderRadius: 16,
    marginLeft: 12,
  },
  closeBtnText: { fontSize: 14, color: "#555" },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#999",
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 6,
  },
  spinner: { marginVertical: 24 },
  emptyText: {
    textAlign: "center",
    color: "#aaa",
    fontSize: 14,
    marginVertical: 24,
    paddingHorizontal: 20,
  },
  arrivalList: { maxHeight: 200 },
  arrivalRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f4f4f4",
    gap: 10,
  },
  routeBadge: {
    backgroundColor: "#E3F2FD",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 44,
    alignItems: "center",
  },
  routeBadgeText: { fontSize: 12, fontWeight: "700", color: "#1565C0" },
  headsign: { flex: 1, fontSize: 13, color: "#333" },
  arrivalTime: { fontSize: 15, fontWeight: "700", color: "#111", minWidth: 52, textAlign: "right" },
  confirmSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#eee",
  },
  confirmBtn: {
    backgroundColor: "#1565C0",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  confirmBtnDisabled: { backgroundColor: "#90A4AE" },
  confirmBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  confirmSubtext: { textAlign: "center", fontSize: 12, color: "#999" },
});
