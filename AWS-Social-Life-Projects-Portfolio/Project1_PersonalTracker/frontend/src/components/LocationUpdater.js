// src/components/LocationUpdater.js
// Real-time browser geolocation -> MapLibre layers (point + accuracy circle)

let watchId = null;

const POS_SOURCE_ID = "me-point-src";
const POS_LAYER_ID = "me-point-layer";

const ACC_SOURCE_ID = "me-accuracy-src";
const ACC_LAYER_ID = "me-accuracy-layer";

// Build a (very light) accuracy circle polygon from a center and radius (meters)
function circlePolygon([lng, lat], radiusMeters = 30, steps = 64) {
  const coords = [];
  const earth = 6378137; // meters
  const d = radiusMeters / earth;

  const rad = (deg) => (deg * Math.PI) / 180;
  const deg = (radVal) => (radVal * 180) / Math.PI;

  const latRad = rad(lat);
  const lngRad = rad(lng);

  for (let i = 0; i <= steps; i++) {
    const brng = (i * 2 * Math.PI) / steps;
    const lat2 = Math.asin(
      Math.sin(latRad) * Math.cos(d) + Math.cos(latRad) * Math.sin(d) * Math.cos(brng)
    );
    const lng2 =
      lngRad +
      Math.atan2(
        Math.sin(brng) * Math.sin(d) * Math.cos(latRad),
        Math.cos(d) - Math.sin(latRad) * Math.sin(lat2)
      );
    coords.push([deg(lng2), deg(lat2)]);
  }

  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [coords] },
    properties: {},
  };
}

function addOrUpdateSourcesAndLayers(map, position, accuracy = 30) {
  // Point source
  const pointFeature = {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [position.lng, position.lat],
    },
    properties: {},
  };

  // Accuracy polygon
  const accuracyFeature = circlePolygon([position.lng, position.lat], accuracy);

  if (!map.getSource(POS_SOURCE_ID)) {
    map.addSource(POS_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [pointFeature] },
    });
  } else {
    map.getSource(POS_SOURCE_ID).setData({
      type: "FeatureCollection",
      features: [pointFeature],
    });
  }

  if (!map.getLayer(POS_LAYER_ID)) {
    map.addLayer({
      id: POS_LAYER_ID,
      type: "circle",
      source: POS_SOURCE_ID,
      paint: {
        "circle-radius": 6,
        "circle-color": "#00E0FF",
        "circle-stroke-color": "#002C3D",
        "circle-stroke-width": 2,
      },
    });
  }

  if (!map.getSource(ACC_SOURCE_ID)) {
    map.addSource(ACC_SOURCE_ID, {
      type: "geojson",
      data: accuracyFeature,
    });
  } else {
    map.getSource(ACC_SOURCE_ID).setData(accuracyFeature);
  }

  if (!map.getLayer(ACC_LAYER_ID)) {
    map.addLayer({
      id: ACC_LAYER_ID,
      type: "fill",
      source: ACC_SOURCE_ID,
      paint: {
        "fill-color": "#00E0FF",
        "fill-opacity": 0.12,
      },
    });
  }
}

export function startLocationUpdates(map, { follow = true } = {}) {
  if (!("geolocation" in navigator)) {
    throw new Error("Geolocation is not supported by this browser.");
  }
  if (watchId !== null) return; // already running

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy, heading, speed } = pos.coords;
      const position = { lat: latitude, lng: longitude, accuracy, heading, speed };

      addOrUpdateSourcesAndLayers(map, position, accuracy || 30);

      if (follow) {
        // Smooth follow
        map.easeTo({
          center: [position.lng, position.lat],
          duration: 800,
          easing: (t) => t,
        });
      }
    },
    (err) => {
      console.error("[Location] error:", err);
      alert(`Location error: ${err.message}`);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 15000,
    }
  );
}

export function stopLocationUpdates() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

export function isRunning() {
  return watchId !== null;
}
