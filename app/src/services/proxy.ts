import type { VehiclePosition, Stop, Arrival } from "../types";

// In dev: use localhost proxy. In prod: set EXPO_PUBLIC_PROXY_URL env var.
export const PROXY_URL =
  process.env.EXPO_PUBLIC_PROXY_URL ?? "http://10.0.2.2:3001"; // 10.0.2.2 = host machine from Android emulator

export async function fetchNearbyStops(
  lat: number,
  lng: number,
  radiusKm = 0.5
): Promise<Stop[]> {
  const res = await fetch(
    `${PROXY_URL}/stops/nearby?lat=${lat}&lng=${lng}&radius=${radiusKm}`
  );
  const data = await res.json();
  return data.stops ?? [];
}

export async function fetchArrivals(stopId: string): Promise<Arrival[]> {
  const res = await fetch(
    `${PROXY_URL}/arrivals/${encodeURIComponent(stopId)}`
  );
  const data = await res.json();
  return data.arrivals ?? [];
}

export async function fetchVehicles(): Promise<VehiclePosition[]> {
  const res = await fetch(`${PROXY_URL}/vehicles`);
  const data = await res.json();
  return (data.features ?? []).map(
    (f: { properties: VehiclePosition }) => f.properties
  );
}

// SSE streaming for live vehicle updates
export function connectVehicleStream(
  onSnapshot: (vehicles: VehiclePosition[]) => void,
  onUpdate: (vehicleCount: number) => void
): () => void {
  let source: EventSource | null = null;
  let closed = false;

  function connect() {
    if (closed) return;
    source = new EventSource(`${PROXY_URL}/stream`);

    source.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "snapshot") {
          onSnapshot(msg.vehicles ?? []);
        } else if (msg.type === "update") {
          onUpdate(msg.vehicleCount);
        }
      } catch {}
    };

    source.onerror = () => {
      source?.close();
      if (!closed) {
        setTimeout(connect, 5000); // reconnect after 5s
      }
    };
  }

  connect();

  return () => {
    closed = true;
    source?.close();
  };
}

export function formatArrivalTime(timeStr: string): string {
  // Convert "HH:MM:SS" to "17:48" or "In X min"
  const [h, m] = timeStr.split(":").map(Number);
  const now = new Date();
  const arrivalMinutes = h * 60 + m;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const diffMin = arrivalMinutes - nowMinutes;

  if (diffMin <= 0) return "Now";
  if (diffMin < 60) return `${diffMin} min`;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
