// src/components/LocationUpdater.js
// Lightweight geolocation watcher with a simple API.
// No throttling or localStorage, per your preference.

let watchId = null;
let running = false;

/**
 * Start browser geolocation updates.
 * @param {Object} options
 *  - onUpdate({lng, lat, accuracy, timestamp})
 *  - follow (boolean) If true, caller may re-center map when updates arrive
 */
export function startLocationUpdates(options = {}) {
  if (running) return;
  if (!("geolocation" in navigator)) {
    throw new Error("Geolocation is not available in this browser.");
  }

  running = true;

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const payload = {
        lat: latitude,
        lng: longitude,
        accuracy: accuracy ?? 30,
        timestamp: pos.timestamp,
      };
      if (typeof options.onUpdate === "function") {
        options.onUpdate(payload);
      }
    },
    (err) => {
      console.error("[Geo] watchPosition error:", err);
      alert(err.message || "Failed to get position updates.");
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    }
  );
}

export function stopLocationUpdates() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  running = false;
}

export function isRunning() {
  return running;
}
