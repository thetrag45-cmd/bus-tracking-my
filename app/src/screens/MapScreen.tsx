import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { useLocation } from "../hooks/useLocation";
import { useVehicles } from "../hooks/useVehicles";
import { fetchNearbyStops } from "../services/proxy";
import type { Stop } from "../types";
import StopDetailSheet from "../components/StopDetailSheet";

export default function MapScreen() {
  const { location } = useLocation();
  const { vehicles, staleSecs } = useVehicles();
  const [stops, setStops] = useState<Stop[]>([]);
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [loadingStops, setLoadingStops] = useState(false);

  const loadNearbyStops = useCallback(async () => {
    if (!location) return;
    setLoadingStops(true);
    try {
      const nearby = await fetchNearbyStops(location.lat, location.lng, 1.0);
      setStops(nearby);
    } finally {
      setLoadingStops(false);
    }
  }, [location]);

  useEffect(() => {
    loadNearbyStops();
  }, [loadNearbyStops]);

  if (!location) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Finding your location…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude: location.lat,
          longitude: location.lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        showsUserLocation
        showsMyLocationButton
      >
        {/* Bus stop markers */}
        {stops.map((stop) => (
          <Marker
            key={stop.stop_id}
            coordinate={{ latitude: stop.stop_lat, longitude: stop.stop_lon }}
            title={stop.stop_name}
            pinColor="#1565C0"
            onPress={() => setSelectedStop(stop)}
          />
        ))}

        {/* Live vehicle markers */}
        {vehicles.map((v) => (
          <Marker
            key={v.vehicleId}
            coordinate={{ latitude: v.lat, longitude: v.lng }}
            title={v.label || v.routeId}
            description={v.tripId ? `Trip ${v.tripId}` : undefined}
          >
            <View style={styles.busMarker}>
              <Text style={styles.busMarkerText}>🚌</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Data freshness badge */}
      <View style={styles.freshnessBadge}>
        <Text style={styles.freshnessText}>
          {staleSecs === null
            ? "Connecting…"
            : staleSecs < 60
            ? `Updated ${staleSecs}s ago`
            : "Stale — reconnecting"}
        </Text>
      </View>

      {/* Stop count badge */}
      {loadingStops ? (
        <View style={styles.stopsBadge}>
          <ActivityIndicator size="small" color="#fff" />
        </View>
      ) : stops.length > 0 ? (
        <View style={styles.stopsBadge}>
          <Text style={styles.stopsBadgeText}>
            {stops.length} stops nearby
          </Text>
        </View>
      ) : null}

      {/* Vehicle count */}
      <View style={styles.vehicleBadge}>
        <Text style={styles.vehicleBadgeText}>
          🚌 {vehicles.length} live
        </Text>
      </View>

      {/* Stop detail bottom sheet */}
      {selectedStop && (
        <StopDetailSheet
          stop={selectedStop}
          userLocation={location}
          onClose={() => setSelectedStop(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: StyleSheet.absoluteFill,
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
  },
  loadingText: { color: "#666", fontSize: 15 },
  freshnessBadge: {
    position: "absolute",
    top: 52,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  freshnessText: { color: "#fff", fontSize: 12 },
  stopsBadge: {
    position: "absolute",
    top: 84,
    alignSelf: "center",
    backgroundColor: "#1565C0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  stopsBadgeText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  vehicleBadge: {
    position: "absolute",
    top: 52,
    right: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  vehicleBadgeText: { color: "#fff", fontSize: 12 },
  busMarker: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  busMarkerText: { fontSize: 20 },
});
