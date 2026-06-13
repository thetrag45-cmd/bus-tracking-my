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
import {
  getFavourites,
  isFavourite,
  toggleFavourite,
  subscribe,
  type FavKey,
  type Favourites,
} from "../services/favourites";
import type { Stop, Arrival } from "../types";
import { colors, serviceColor, arrivalSemantic } from "../theme";

type Props = {
  stop: Stop;
  userLocation: { lat: number; lng: number } | null;
  onClose: () => void;
  onSelectRoute: (routeId: string) => void;
};

function diffMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  const now = new Date();
  return h * 60 + m - (now.getHours() * 60 + now.getMinutes());
}

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export default function StopDetailSheet({ stop, userLocation, onClose, onSelectRoute }: Props) {
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [confirmCount, setConfirmCount] = useState(0);
  const [favs, setFavs] = useState<Favourites>(getFavourites());

  useEffect(() => subscribe(setFavs), []);

  useEffect(() => {
    setLoading(true);
    fetchArrivals(stop.stop_id)
      .then(setArrivals)
      .finally(() => setLoading(false));
    const interval = setInterval(() => {
      fetchArrivals(stop.stop_id).then(setArrivals);
    }, 60_000);
    return () => clearInterval(interval);
  }, [stop.stop_id]);

  async function handleConfirm() {
    if (confirming || !userLocation) return;
    setConfirming(true);
    try {
      const routeId = arrivals[0]?.route_id ?? "";
      await submitConfirmation(
        stop.stop_id, routeId, userLocation.lat, userLocation.lng, stop.stop_lat, stop.stop_lon
      );
      setConfirmCount((n) => n + 1);
    } catch {
      Alert.alert("Could not submit", "Check your connection and try again.");
    } finally {
      setConfirming(false);
    }
  }

  function onToggleFav(key: FavKey) {
    const set = toggleFavourite(key, {
      stop_id: stop.stop_id, stop_name: stop.stop_name, lat: stop.stop_lat, lng: stop.stop_lon,
    });
    // listeners update `favs`; nothing else needed
  }

  const distLabel = userLocation
    ? (() => {
        const m = haversineM(userLocation.lat, userLocation.lng, stop.stop_lat, stop.stop_lon);
        return m < 1000 ? `${Math.round(m)}m away` : `${(m / 1000).toFixed(1)}km away`;
      })()
    : "";

  // Hero = first arrival
  const first = arrivals[0];
  const firstDiff = first ? diffMinutes(first.arrival_time) : null;
  const sem = firstDiff !== null ? arrivalSemantic(firstDiff) : null;
  const isHome = isFavourite("home", stop.stop_id);
  const isWork = isFavourite("work", stop.stop_id);

  return (
    <View style={styles.sheet}>
      <View style={styles.handle} />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.badgeRow}>
            <Text style={styles.stopCode}>{stop.stop_code ?? stop.stop_id}</Text>
            {!!distLabel && <Text style={styles.distance}>{distLabel}</Text>}
          </View>
          <Text style={styles.stopName} numberOfLines={2}>{stop.stop_name}</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Next-bus hero */}
      <View
        style={[
          styles.hero,
          sem?.key === "arriving" && styles.heroGo,
          sem?.key === "soon" && styles.heroSoon,
        ]}
      >
        <View style={styles.heroTimeWrap}>
          <Text style={[styles.heroTime, sem && { color: sem.color }, !first && styles.heroTimeEmpty]}>
            {!first ? "—" : firstDiff! <= 0 ? "Now" : firstDiff! < 60 ? `${firstDiff}` : formatArrivalTime(first.arrival_time)}
          </Text>
          {first && firstDiff! > 0 && firstDiff! < 60 && <Text style={styles.heroUnit}>min</Text>}
        </View>
        <View style={styles.heroInfo}>
          {first ? (
            <>
              <Text style={styles.heroRoute}>{first.route_name}</Text>
              <Text style={styles.heroHeadsign} numberOfLines={1}>{first.trip_headsign}</Text>
              <Text style={styles.heroLabel}>{sem?.label}</Text>
            </>
          ) : (
            <Text style={styles.heroRoute}>That's the last bus for today</Text>
          )}
        </View>
      </View>

      {/* Save as Home / Work */}
      <View style={styles.favRow}>
        <TouchableOpacity style={[styles.favBtn, isHome && styles.favBtnActive]} onPress={() => onToggleFav("home")}>
          <Text style={[styles.favBtnText, isHome && styles.favBtnTextActive]}>🏠 {isHome ? "Home ✓" : "Save as Home"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.favBtn, isWork && styles.favBtnActive]} onPress={() => onToggleFav("work")}>
          <Text style={[styles.favBtnText, isWork && styles.favBtnTextActive]}>💼 {isWork ? "Work ✓" : "Save as Work"}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.scheduledNotice}>ℹ Scheduled times for now — live arrivals coming soon</Text>
      <Text style={styles.sectionLabel}>NEXT BUSES · TAP A ROUTE TO SEE ITS LINE</Text>

      {loading ? (
        <ActivityIndicator style={styles.spinner} color={colors.yellow} />
      ) : arrivals.length <= 1 ? (
        <Text style={styles.emptyText}>{arrivals.length === 0 ? "No more arrivals today" : "No further arrivals today"}</Text>
      ) : (
        <ScrollView style={styles.arrivalList} showsVerticalScrollIndicator={false}>
          {arrivals.slice(1).map((a, i) => {
            const d = diffMinutes(a.arrival_time);
            const s = arrivalSemantic(d);
            const label = d <= 0 ? "Now" : d < 60 ? `${d} min` : formatArrivalTime(a.arrival_time);
            return (
              <TouchableOpacity
                key={`${a.trip_id}-${i}`}
                style={styles.arrivalRow}
                onPress={() => onSelectRoute(a.route_id)}
                activeOpacity={0.6}
              >
                <View style={[styles.routeBadge, { backgroundColor: serviceColor(a.service_type) }]}>
                  <Text style={styles.routeBadgeText}>{a.route_name}</Text>
                </View>
                <Text style={styles.headsign} numberOfLines={1}>{a.trip_headsign}</Text>
                <Text style={[styles.arrivalTime, { color: s.color, backgroundColor: s.bg }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.confirmSection}>
        <TouchableOpacity
          style={[styles.confirmBtn, confirmCount > 0 && styles.confirmBtnSent]}
          onPress={handleConfirm}
          disabled={confirming}
          activeOpacity={0.85}
        >
          {confirming ? (
            <ActivityIndicator color={colors.amberInk} />
          ) : (
            <Text style={[styles.confirmBtnText, confirmCount > 0 && styles.confirmBtnTextSent]}>
              {confirmCount > 0 ? "✓ Thanks! You told everyone" : "🚌 Bus is here? Tap to confirm"}
            </Text>
          )}
        </TouchableOpacity>
        <Text style={styles.confirmSubtext}>
          {confirmCount > 0
            ? `${confirmCount} sent. You're helping other commuters.`
            : "Help your fellow commuters. Your spot is shared anonymously."}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: colors.cream, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingBottom: 28, shadowColor: "#000", shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.16, shadowRadius: 16, elevation: 10, maxHeight: "75%",
  },
  handle: { width: 36, height: 4, backgroundColor: "#E6DCC4", borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 4 },
  header: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  headerLeft: { flex: 1 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  stopCode: { fontSize: 11, color: colors.amberInk, fontWeight: "700", backgroundColor: colors.chip, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, overflow: "hidden" },
  distance: { fontSize: 11, color: colors.muted },
  stopName: { fontSize: 16, fontWeight: "800", color: colors.ink, lineHeight: 21 },
  closeBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center", backgroundColor: colors.line, borderRadius: 15, marginLeft: 12 },
  closeBtnText: { fontSize: 13, color: "#7A6E5E" },

  hero: { marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 16, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.laterBg, borderWidth: 1.5, borderColor: colors.laterBorder },
  heroGo: { backgroundColor: colors.goBg, borderColor: colors.goBorder },
  heroSoon: { backgroundColor: colors.soonBg, borderColor: colors.soonBorder },
  heroTimeWrap: { minWidth: 76, alignItems: "center", flexDirection: "row", justifyContent: "center" },
  heroTime: { fontSize: 38, fontWeight: "800", color: colors.later, lineHeight: 40 },
  heroTimeEmpty: { fontSize: 22, color: "#A99A82" },
  heroUnit: { fontSize: 14, fontWeight: "700", color: colors.later, marginLeft: 3, marginTop: 12 },
  heroInfo: { flex: 1 },
  heroRoute: { fontSize: 15, fontWeight: "800", color: colors.ink },
  heroHeadsign: { fontSize: 12, color: colors.later, marginTop: 2 },
  heroLabel: { fontSize: 11, color: colors.later, fontWeight: "600", marginTop: 2 },

  favRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  favBtn: { flex: 1, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: "#fff", alignItems: "center" },
  favBtnActive: { backgroundColor: colors.chip, borderColor: colors.yellow },
  favBtnText: { fontSize: 12, fontWeight: "700", color: colors.ink },
  favBtnTextActive: { color: colors.amberInk },

  scheduledNotice: { fontSize: 11, color: colors.faint, paddingHorizontal: 16, paddingTop: 10 },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: colors.faint, letterSpacing: 0.6, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  spinner: { marginVertical: 24 },
  emptyText: { textAlign: "center", color: colors.faint, fontSize: 14, marginVertical: 24, paddingHorizontal: 16 },
  arrivalList: { maxHeight: 220 },
  arrivalRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line2, gap: 10 },
  routeBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, minWidth: 50, alignItems: "center" },
  routeBadgeText: { fontSize: 12, fontWeight: "800", color: "#fff" },
  headsign: { flex: 1, fontSize: 13, color: "#5A4F42" },
  arrivalTime: { fontSize: 14, fontWeight: "700", minWidth: 52, textAlign: "center", paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, overflow: "hidden" },
  confirmSection: { paddingHorizontal: 16, paddingTop: 14, gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, marginTop: 6 },
  confirmBtn: { backgroundColor: colors.yellow, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  confirmBtnSent: { backgroundColor: colors.goBg },
  confirmBtnText: { color: colors.amberInk, fontSize: 15, fontWeight: "800" },
  confirmBtnTextSent: { color: colors.go },
  confirmSubtext: { textAlign: "center", fontSize: 11, color: colors.faint },
});
