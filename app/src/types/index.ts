export type VehiclePosition = {
  vehicleId: string;
  label: string;
  lat: number;
  lng: number;
  routeId: string;
  tripId: string;
  timestamp: number;
};

export type Stop = {
  stop_id: string;
  stop_code: string | null;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
};

export type Arrival = {
  arrival_time: string; // "HH:MM:SS"
  departure_time: string;
  route_id: string;
  route_name: string;
  trip_headsign: string;
  trip_id: string;
};

export type Confirmation = {
  userId: string;
  timestamp: number;
  lat: number;
  lng: number;
  weight: number;
  routeId: string;
};
