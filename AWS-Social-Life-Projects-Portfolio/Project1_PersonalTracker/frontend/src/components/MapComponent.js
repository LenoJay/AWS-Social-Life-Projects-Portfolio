// src/components/MapComponent.js
import React, { useEffect, useRef, useState } from "react";
import { Amplify } from "aws-amplify";
import awsExports from "../aws-exports";
import { createMap } from "maplibre-gl-js-amplify";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as turf from "@turf/turf";
import { startLocationUpdates, stopLocationUpdates, isRunning } from "./LocationUpdater";

// Configure Amplify
Amplify.configure(awsExports);

// --- simple mock for "group" devices until we hook a backend ---
async function fetchGroupPositionsMock() {
  // return a couple of fake devices around London
  return [
    {
      deviceId: "alice",
      status: "OMW!",
      position: [-0.12, 51.505],
      accuracy: 25,
      color: "#22c55e",
    },
    {
      deviceId: "bob",
      status: "I’m safe",
      position: [-0.14, 51.51],
      accuracy: 30,
      color: "#f97316",
    },
  ];
}

export default function MapComponent() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  // my state
  const [status, setStatus] = useState("idle"); // idle | ready | tracking
  const [myStatusText, setMyStatusText] = useState("OMW!");

  // trail data (array of [lng, lat])
  const trailRef = useRef([]);
  // html marker for my status bubble
  const myMarkerRef = useRef(null);

  // other users markers
  const othersRef = useRef(new Map()); // deviceId -> { marker }

  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        // London
        const map = await createMap({
          container: mapContainerRef.current,
          center: [-0.1276, 51.5074],
          zoom: 12,
        });

        if (disposed) return;
        mapRef.current = map;

        map.on("load", () => {
          // sources
          map.addSource("me-point-src", {
            type: "geojson",
            data: turf.point([-0.1276, 51.5074]),
          });

          map.addSource("me-trail-src", {
            type: "geojson",
            data: turf.lineString([]),
          });

          map.addSource("me-accuracy-src", {
            type: "geojson",
            data: turf.featureCollection([]),
          });

          // layers
          map.addLayer({
            id: "me-trail",
            type: "line",
            source: "me-trail-src",
            paint: {
              "line-color": "#0ea5e9",
              "line-width": 4,
              "line-opacity": 0.9,
            },
          });

          map.addLayer({
            id: "me-accuracy",
            type: "fill",
            source: "me-accuracy-src",
            paint: {
              "fill-color": "#0ea5e9",
              "fill-opacity": 0.15,
            },
          });

          map.addLayer({
            id: "me-dot",
            type: "circle",
            source: "me-point-src",
            paint: {
              "circle-radius": 6,
              "circle-color": "#0ea5e9",
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
            },
          });

          // HTML marker for status bubble
          myMarkerRef.current = createStatusMarker(myStatusText, "#0ea5e9");
          myMarkerRef.current.setLngLat([-0.1276, 51.5074]).addTo(map);

          setStatus("ready");

          // initial render of mock "group" users
          renderGroupMarkers();
        });
      } catch (e) {
        console.error("[Map] init failed:", e);
        alert(`Map failed to initialize: ${e?.message || e}`);
      }
    })();

    return () => {
      disposed = true;
      stopLocationUpdates();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      othersRef.current.forEach(({ marker }) => marker.remove());
      othersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // update my status bubble text when changed
  useEffect(() => {
    if (myMarkerRef.current) {
      updateStatusMarker(myMarkerRef.current, myStatusText);
    }
  }, [myStatusText]);

  const handleStart = () => {
    if (!mapRef.current) return;
    if (!isRunning()) {
      startLocationUpdates({
        onUpdate: (p) => onMyPosition(p),
      });
      setStatus("tracking");
    }
  };

  const handleStop = () => {
    stopLocationUpdates();
    setStatus("ready");
  };

  const handleRecenter = () => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("me-point-src");
    const data = src?._data;
    if (data && data.geometry?.coordinates) {
      map.easeTo({ center: data.geometry.coordinates, duration: 600 });
    } else {
      map.easeTo({ center: [-0.1276, 51.5074], duration: 600 });
    }
  };

  function onMyPosition({ lng, lat, accuracy }) {
    const map = mapRef.current;
    if (!map) return;

    // 1) update point
    const pt = turf.point([lng, lat]);
    map.getSource("me-point-src").setData(pt);

    // 2) update trail (append point)
    trailRef.current.push([lng, lat]);
    map.getSource("me-trail-src").setData(turf.lineString(trailRef.current));

    // 3) update accuracy circle polygon using turf.circle (meters)
    const circle = turf.circle([lng, lat], Math.max(accuracy, 10) / 1000, {
      steps: 64,
      units: "kilometers",
    });
    map.getSource("me-accuracy-src").setData(circle);

    // 4) move my status marker
    if (myMarkerRef.current) {
      myMarkerRef.current.setLngLat([lng, lat]);
    }
  }

  async function renderGroupMarkers() {
    const map = mapRef.current;
    if (!map) return;

    const devices = await fetchGroupPositionsMock();

    // remove stale ones
    const alive = new Set(devices.map((d) => d.deviceId));
    for (const [id, { marker }] of othersRef.current) {
      if (!alive.has(id)) {
        marker.remove();
        othersRef.current.delete(id);
      }
    }

    devices.forEach((d) => {
      let entry = othersRef.current.get(d.deviceId);
      if (!entry) {
        const m = createStatusMarker(d.status, d.color);
        m.setLngLat(d.position).addTo(map);
        othersRef.current.set(d.deviceId, { marker: m });
      } else {
        updateStatusMarker(entry.marker, d.status, d.color);
        entry.marker.setLngLat(d.position);
      }
    });
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div
        ref={mapContainerRef}
        style={{ width: "100%", height: "520px", borderRadius: 12, background: "#111" }}
      />

      <div style={toolbarStyle}>
        {status !== "tracking" ? (
          <button onClick={handleStart} style={btnStyle}>
            Start tracking
          </button>
        ) : (
          <button onClick={handleStop} style={btnStyle}>
            Stop tracking
          </button>
        )}
        <button onClick={handleRecenter} style={btnStyle}>
          Recenter me
        </button>

        {/* Quick status presets */}
        <div style={{ display: "flex", gap: 6 }}>
          {["OMW!", "I’m safe", "Need help", "Here"].map((txt) => (
            <button
              key={txt}
              onClick={() => setMyStatusText(txt)}
              style={{
                ...btnStyle,
                background: txt === myStatusText ? "#22c55e" : "#334155",
              }}
            >
              {txt}
            </button>
          ))}
        </div>

        <button onClick={renderGroupMarkers} style={btnStyleSecondary}>
          Refresh group
        </button>

        <span style={{ opacity: 0.9 }}>
          Status: <strong>{status}</strong>
        </span>
      </div>
    </div>
  );
}

/** Create a nice HTML marker with a speech-bubble style */
function createStatusMarker(text, color = "#0ea5e9") {
  const el = document.createElement("div");
  el.style.position = "relative";

  const dot = document.createElement("div");
  dot.style.width = "12px";
  dot.style.height = "12px";
  dot.style.borderRadius = "999px";
  dot.style.background = color;
  dot.style.border = "2px solid #fff";
  dot.style.boxShadow = "0 0 0 2px rgba(0,0,0,0.2)";
  dot.style.transform = "translate(-50%, -50%)";
  dot.style.position = "absolute";
  dot.style.left = "50%";
  dot.style.top = "50%";
  el.appendChild(dot);

  const bubble = document.createElement("div");
  bubble.style.position = "absolute";
  bubble.style.whiteSpace = "nowrap";
  bubble.style.left = "50%";
  bubble.style.bottom = "18px";
  bubble.style.transform = "translateX(-50%)";
  bubble.style.background = "rgba(17,17,17,0.85)";
  bubble.style.color = "#fff";
  bubble.style.fontSize = "12px";
  bubble.style.padding = "6px 8px";
  bubble.style.borderRadius = "8px";
  bubble.style.border = `1px solid ${color}`;
  bubble.style.boxShadow = "0 2px 8px rgba(0,0,0,0.25)";
  bubble.textContent = text;
  bubble.className = "status-bubble";
  el.appendChild(bubble);

  const marker = new maplibregl.Marker({ element: el, anchor: "bottom" });
  return marker;
}

function updateStatusMarker(marker, newText, color = "#0ea5e9") {
  const el = marker.getElement();
  const bubble = el.querySelector(".status-bubble");
  if (bubble) {
    bubble.textContent = newText;
    bubble.style.border = `1px solid ${color}`;
  }
}

const toolbarStyle = {
  position: "absolute",
  top: 12,
  left: 12,
  display: "flex",
  gap: 8,
  background: "rgba(20,20,20,0.7)",
  borderRadius: 8,
  padding: "8px 10px",
  color: "#fff",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
};

const btnStyle = {
  background: "#0EA5E9",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "6px 10px",
  cursor: "pointer",
};

const btnStyleSecondary = {
  background: "#334155",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "6px 10px",
  cursor: "pointer",
};
