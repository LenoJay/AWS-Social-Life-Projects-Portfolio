// src/components/LocationUpdater.js
import { updateLocation } from "../api";

let watchId = null;
let running = false;

/**
 * Start browser geolocation and push to backend
 * @param {object} opts
 *  - groupId (string)
 *  - status (string)
 *  - onUpdate (fn) called with {lat,lng,accuracy,timestamp}
 */
export function startLocationUpdates(opts = {}) {
  if (running) return;
  if (!("geolocation" in navigator)) throw new Error("Geolocation not available");
  const { groupId, status = "OMW!", onUpdate } = opts;

  running = true;
  watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const payload = { lat: latitude, lng: longitude, accuracy: accuracy ?? 30, timestamp: pos.timestamp };

      // Update UI immediately
      if (onUpdate) onUpdate(payload);

      // Push to backend (best-effort)
      try {
        await updateLocation({ groupId, lat: latitude, lng: longitude, status });
      } catch (e) {
        console.warn("[UpdateLocation] API error:", e.message);
      }
    },
    (err) => {
      console.error("[Geo] watchPosition error:", err);
      alert(err.message || "Failed to get position updates.");
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
  );
}

export function stopLocationUpdates() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  running = false;
}
export function isRunning() { return running; }
