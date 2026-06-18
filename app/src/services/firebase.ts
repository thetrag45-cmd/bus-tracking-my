import { initializeApp, getApps } from "firebase/app";
import { getDatabase, ref, push, serverTimestamp } from "firebase/database";
import { getAuth, signInAnonymously } from "firebase/auth";

// Replace with your Firebase project config
// Set via EXPO_PUBLIC_FIREBASE_* env vars
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL ?? "",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "",
};

function getApp() {
  if (getApps().length === 0) {
    return initializeApp(firebaseConfig);
  }
  return getApps()[0];
}

let _userId: string | null = null;

export async function ensureAuth(): Promise<string> {
  if (_userId) return _userId;
  const app = getApp();
  const auth = getAuth(app);
  const cred = await signInAnonymously(auth);
  _userId = cred.user.uid;
  return _userId;
}

export function proximityWeight(
  userLat: number,
  userLng: number,
  stopLat: number,
  stopLng: number
): number {
  // Haversine distance in metres
  const R = 6371000;
  const dLat = ((stopLat - userLat) * Math.PI) / 180;
  const dLng = ((stopLng - userLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((userLat * Math.PI) / 180) *
      Math.cos((stopLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const distM = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  if (distM <= 50) return 1.0;
  if (distM <= 200) return 0.7;
  if (distM <= 500) return 0.3;
  return 0.1;
}

export async function submitConfirmation(
  stopId: string,
  routeId: string,
  userLat: number,
  userLng: number,
  stopLat: number,
  stopLng: number
): Promise<void> {
  const userId = await ensureAuth();
  const app = getApp();
  const db = getDatabase(app);
  const weight = proximityWeight(userLat, userLng, stopLat, stopLng);

  await push(ref(db, `confirmations/${stopId}`), {
    userId,
    timestamp: serverTimestamp(),
    lat: userLat,
    lng: userLng,
    weight,
    routeId,
  });
}
