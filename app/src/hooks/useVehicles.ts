import { useState, useEffect, useRef } from "react";
import { connectVehicleStream, fetchVehicles } from "../services/proxy";
import type { VehiclePosition } from "../types";

export function useVehicles() {
  const [vehicles, setVehicles] = useState<VehiclePosition[]>([]);
  const [fetchedAt, setFetchedAt] = useState<number>(0);
  const [connected, setConnected] = useState(false);
  const disconnectRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Initial fetch
    fetchVehicles().then((v) => {
      setVehicles(v);
      setFetchedAt(Date.now());
    });

    // SSE stream for live updates
    const disconnect = connectVehicleStream(
      (vehicles) => {
        setVehicles(vehicles);
        setFetchedAt(Date.now());
        setConnected(true);
      },
      () => {
        // On update message, re-fetch full vehicle list
        fetchVehicles().then((v) => {
          setVehicles(v);
          setFetchedAt(Date.now());
        });
      }
    );

    disconnectRef.current = disconnect;
    return () => disconnect();
  }, []);

  // Data staleness in seconds
  const staleSecs = fetchedAt ? Math.floor((Date.now() - fetchedAt) / 1000) : null;

  return { vehicles, fetchedAt, connected, staleSecs };
}
