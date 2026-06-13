import type { ServiceType } from "../theme";

export type VehiclePosition = {
  vehicleId: string;
  label: string;
  lat: number;
  lng: number;
  routeId: string;
  tripId: string;
  timestamp: number;
};

export type RouteBadge = {
  route_name: string;
  service_type: ServiceType;
};

export type Stop = {
  stop_id: string;
  stop_code: string | null;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  // Enriched by /stops/nearby (optional — absent when a stop comes from search)
  walk_m?: number;
  walk_min?: number;
  routes?: RouteBadge[];
};

export type Arrival = {
  arrival_time: string; // "HH:MM:SS"
  departure_time: string;
  route_id: string;
  route_name: string;
  service_type: ServiceType;
  trip_headsign: string;
  trip_id: string;
};

export type LineStop = {
  stop_id: string;
  stop_code: string | null;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  stop_sequence: number;
};

export type LineDirection = {
  direction_id: number;
  headsign: string;
  stops: LineStop[];
  shape: [number, number][]; // [lat, lng] points
};

export type LineDetail = {
  route_id: string;
  route_name: string;
  service_type: ServiceType;
  directions: LineDirection[];
};

export type Favourite = {
  stop_id: string;
  stop_name: string;
  lat: number;
  lng: number;
};
