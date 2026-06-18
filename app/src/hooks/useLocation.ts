import { useState, useEffect } from "react";
import * as Location from "expo-location";

type LocationState = {
  lat: number;
  lng: number;
} | null;

export function useLocation() {
  const [location, setLocation] = useState<LocationState>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;

    async function start() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setPermissionDenied(true);
        // Default to KL Sentral if no permission
        setLocation({ lat: 3.1342, lng: 101.6865 });
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });

      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 50 },
        (pos) => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      );
    }

    start();
    return () => { sub?.remove(); };
  }, []);

  return { location, permissionDenied };
}
