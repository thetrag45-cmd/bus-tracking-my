import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { useLocation } from "../hooks/useLocation";
import { useVehicles } from "../hooks/useVehicles";
import { fetchNearbyStops, fetchLineDetail } from "../services/proxy";
import { loadFavourites, subscribe, type Favourites } from "../services/favourites";
import type { Stop, LineDetail } from "../types";
import StopDetailSheet from "../components/StopDetailSheet";
import LineDetailSheet from "../components/LineDetailSheet";
import Mascot from "../components/Mascot";
import { colors, serviceColor } from "../theme";

// Klang Valley coverage centre + radius (out-of-region detection, Moovit gap #4).
const COVERAGE = { lat: 3.139, lng: 101.687, radiusKm: 60 };
const AREAS = [
  { name: "KL Sentral", lat: 3.1342, lng: 101.6865 },
  { name: "Petaling Jaya", lat: 3.1073, lng: 101.6068 },
  { name: "KLCC", lat: 3.1578, lng: 101.7117 },
  { name: "Shah Alam", lat: 3.0738, lng: 101.5183 },
];

// Soft cream/pastel Google map style — keeps the map calm so the yellow chrome
// and coloured route lines/markers stand out (brand: yellow owns chrome, not map).
const MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#FBF4E6" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#7A6E5E" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#FFF8EC" }] },
  { featureType: "poi", stylers: [{ visibility: "simplified" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#E7EFDD" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#FBEFD8" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#CDE6F2" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export default function MapScreen() {
  const { location } = useLocation();
  const { vehicles, staleSecs } = useVehicles();
  const mapRef = useRef<MapView | null>(null);

  const [stops, setStops] = useState<Stop[]>([]);
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [line, setLine] = useState<LineDetail | null>(null);
  const [dirIndex, setDirIndex] = useState(0);
  const [favs, setFavs] = useState<Favourites>({});
  const [region, setRegion] = useState<{ lat: number; lng: number } | null>(null);
  const [outOfRegion, setOutOfRegion] = useState(false);

  useEffect(() => {
    loadFavourites();
    return subscribe(setFavs);
  }, []);

  // Establish the working centre from device location, with coverage check.
  useEffect(() => {
    if (!location || region) return;
    const km = haversineKm(location.lat, location.lng, COVERAGE.lat, COVERAGE.lng);
    if (km > COVERAGE.radiusKm) setOutOfRegion(true);
    else setRegion({ lat: location.lat, lng: location.lng });
  }, [location, region]);

  const loadNearbyStops = useCallback(async (lat: number, lng: number) => {
    const nearby = await fetchNearbyStops(lat, lng, 1.0);
    setStops(nearby);
  }, []);

  useEffect(() => {
    if (region) loadNearbyStops(region.lat, region.lng);
  }, [region, loadNearbyStops]);

  async function openLine(routeId: string) {
    setLine(null);
    setDirIndex(0);
    const detail = await fetchLineDetail(routeId);
    if (!detail) return;
    setLine(detail);
    // fit the map to the shape
    const shape = detail.directions[0]?.shape ?? [];
    if (shape.length && mapRef.current) {
      mapRef.current.fitToCoordinates(
        shape.map(([la, ln]) => ({ latitude: la, longitude: ln })),
        { edgePadding: { top: 80, right: 60, bottom: 360, left: 60 }, animated: true }
      );
    }
  }

  function jumpToArea(lat: number, lng: number) {
    setOutOfRegion(false);
    setRegion({ lat, lng });
    mapRef.current?.animateToRegion(
      { latitude: lat, longitude: lng, latitudeDelta: 0.03, longitudeDelta: 0.03 },
      600
    );
  }

  function goToFav(key: "home" | "work") {
    const f = favs[key];
    if (!f) return;
    mapRef.current?.animateToRegion(
      { latitude: f.lat, longitude: f.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      600
    );
    fetchNearbyStops(f.lat, f.lng, 0.5).then((near) => {
      const match = near.find((s) => s.stop_id === f.stop_id) ?? near[0];
      if (match) setSelectedStop(match);
    });
  }

  // ── Out-of-region empty state ──
  if (outOfRegion) {
    return (
      <View style={styles.regionWrap}>
        <Mascot size={92} />
        <Text style={styles.regionTitle}>Godeez isn't here yet</Text>
        <Text style={styles.regionBody}>
          We're live across the Klang Valley right now. Hop to a covered area to take a look:
        </Text>
        <Text style={styles.regionLabel}>JUMP TO COVERAGE</Text>
        <View style={styles.areaGrid}>
          {AREAS.map((a) => (
            <TouchableOpacity key={a.name} style={styles.areaBtn} onPress={() => jumpToArea(a.lat, a.lng)}>
              <Text style={styles.areaBtnText}>{a.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  if (!region) {
    return (
      <View style={styles.loading}>
        <Mascot size={64} />
        <Text style={styles.loadingText}>Finding your stops…</Text>
      </View>
    );
  }

  const lineDir = line?.directions[dirIndex];
  const lineTint = line ? serviceColor(line.service_type) : colors.sky;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        customMapStyle={MAP_STYLE}
        initialRegion={{ latitude: region.lat, longitude: region.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {/* Route shape (white casing under the coloured line for legibility) */}
        {lineDir && lineDir.shape.length > 0 && (
          <>
            <Polyline
              coordinates={lineDir.shape.map(([la, ln]) => ({ latitude: la, longitude: ln }))}
              strokeColor="#FFFFFF"
              strokeWidth={8}
            />
            <Polyline
              coordinates={lineDir.shape.map(([la, ln]) => ({ latitude: la, longitude: ln }))}
              strokeColor={lineTint}
              strokeWidth={4.5}
            />
          </>
        )}

        {/* Line stops (highlighted) override generic stop dots when a line is open */}
        {lineDir
          ? lineDir.stops.map((s) => (
              <Marker
                key={`L-${s.stop_id}`}
                coordinate={{ latitude: s.stop_lat, longitude: s.stop_lon }}
                onPress={() => selectStopById(s.stop_id)}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={[styles.lineStopDot, { borderColor: lineTint }]} />
              </Marker>
            ))
          : stops.map((stop) => (
              <Marker
                key={stop.stop_id}
                coordinate={{ latitude: stop.stop_lat, longitude: stop.stop_lon }}
                onPress={() => setSelectedStop(stop)}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                {/* 30px transparent hit box around a 17px bullseye node →
                    larger tap target + clearer "stop" read than a flat dot */}
                <View style={styles.stopHit}>
                  <View style={styles.stopDot}>
                    <View style={styles.stopPip} />
                  </View>
                </View>
              </Marker>
            ))}

        {/* Live vehicles — sky-blue route chips */}
        {vehicles.map((v) => (
          <Marker
            key={v.vehicleId}
            coordinate={{ latitude: v.lat, longitude: v.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.busChip}>
              <Text style={styles.busChipText}>{v.label || v.routeId || "🚌"}</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Yellow brand header */}
      <View style={styles.header}>
        <Mascot size={28} />
        <Text style={styles.headerTitle}>Godeez</Text>
        <View style={styles.liveDot} />
        <Text style={styles.freshness}>
          {staleSecs === null ? "Saying hi…" : staleSecs < 5 ? "Live" : staleSecs < 60 ? `${staleSecs}s ago` : "Reconnecting…"}
        </Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.vehicleCount}>🚌 {vehicles.length}</Text>
      </View>

      {/* Favourites chips */}
      <View style={styles.favRow}>
        <FavChip emoji="🏠" label={favs.home ? favs.home.stop_name : "Set Home"} set={!!favs.home} onPress={() => goToFav("home")} />
        <FavChip emoji="💼" label={favs.work ? favs.work.stop_name : "Set Work"} set={!!favs.work} onPress={() => goToFav("work")} />
      </View>

      {/* Locate FAB */}
      <TouchableOpacity
        style={styles.locateBtn}
        onPress={() => location && mapRef.current?.animateToRegion({ latitude: location.lat, longitude: location.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500)}
      >
        <Text style={{ fontSize: 20 }}>📍</Text>
      </TouchableOpacity>

      {/* Stop detail */}
      {selectedStop && !line && (
        <StopDetailSheet
          stop={selectedStop}
          userLocation={location}
          onClose={() => setSelectedStop(null)}
          onSelectRoute={openLine}
        />
      )}

      {/* Line detail */}
      {line && (
        <LineDetailSheet
          line={line}
          dirIndex={dirIndex}
          onChangeDir={(i) => {
            setDirIndex(i);
            const shape = line.directions[i]?.shape ?? [];
            if (shape.length && mapRef.current) {
              mapRef.current.fitToCoordinates(
                shape.map(([la, ln]) => ({ latitude: la, longitude: ln })),
                { edgePadding: { top: 80, right: 60, bottom: 360, left: 60 }, animated: true }
              );
            }
          }}
          onSelectStop={selectStopById}
          onClose={() => setLine(null)}
        />
      )}
    </View>
  );

  function selectStopById(stopId: string) {
    fetchNearbyStops(
      lineDir?.stops.find((s) => s.stop_id === stopId)?.stop_lat ?? region!.lat,
      lineDir?.stops.find((s) => s.stop_id === stopId)?.stop_lon ?? region!.lng,
      0.5
    ).then((near) => {
      const match = near.find((s) => s.stop_id === stopId);
      if (match) {
        setLine(null);
        setSelectedStop(match);
      }
    });
  }
}

function FavChip({ emoji, label, set, onPress }: { emoji: string; label: string; set: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.favChip, !set && styles.favChipUnset]} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.favChipEmoji}>{emoji}</Text>
      <Text style={[styles.favChipText, !set && styles.favChipTextUnset]} numberOfLines={1}>
        {label.length > 16 ? label.slice(0, 15) + "…" : label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  map: StyleSheet.absoluteFill,
  loading: { flex: 1, justifyContent: "center", alignItems: "center", gap: 14, backgroundColor: colors.cream },
  loadingText: { color: colors.later, fontSize: 15, fontWeight: "600" },

  header: {
    position: "absolute", top: 0, left: 0, right: 0, height: 54,
    backgroundColor: colors.yellow, flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, gap: 8,
    shadowColor: "#D6A014", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: colors.ink, letterSpacing: -0.3 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.go, marginLeft: 2 },
  freshness: { fontSize: 11, fontWeight: "600", color: colors.amberInk, opacity: 0.85, marginLeft: 4 },
  vehicleCount: { fontSize: 12, fontWeight: "700", color: colors.amberInk },

  favRow: { position: "absolute", top: 62, left: 12, right: 12, flexDirection: "row", gap: 8 },
  favChip: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fff",
    borderWidth: 1.5, borderColor: colors.line, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    shadowColor: "#3A2F28", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3, maxWidth: "48%",
  },
  favChipUnset: { borderStyle: "dashed", backgroundColor: "rgba(255,255,255,0.9)" },
  favChipEmoji: { fontSize: 14 },
  favChipText: { fontSize: 12, fontWeight: "700", color: colors.ink },
  favChipTextUnset: { color: colors.muted },

  locateBtn: {
    position: "absolute", right: 14, bottom: 28, width: 48, height: 48, borderRadius: 24,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 5,
  },

  stopHit: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  stopDot: {
    width: 17, height: 17, borderRadius: 8.5, backgroundColor: colors.ink,
    borderWidth: 2.5, borderColor: "#fff", alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 4,
  },
  stopPip: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: "#fff" },
  lineStopDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: "#fff", borderWidth: 3 },
  busChip: { backgroundColor: colors.sky, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  busChipText: { color: "#fff", fontSize: 9, fontWeight: "800" },

  regionWrap: { flex: 1, backgroundColor: colors.cream, alignItems: "center", justifyContent: "center", padding: 32 },
  regionTitle: { fontSize: 20, fontWeight: "800", color: colors.ink, marginTop: 12, marginBottom: 8 },
  regionBody: { fontSize: 14, color: colors.later, textAlign: "center", lineHeight: 21, maxWidth: 300, marginBottom: 22 },
  regionLabel: { fontSize: 11, fontWeight: "700", color: colors.faint, letterSpacing: 0.8, marginBottom: 10 },
  areaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", maxWidth: 320 },
  areaBtn: { width: 150, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, backgroundColor: "#fff", alignItems: "center" },
  areaBtnText: { fontSize: 14, fontWeight: "700", color: colors.ink },
});
