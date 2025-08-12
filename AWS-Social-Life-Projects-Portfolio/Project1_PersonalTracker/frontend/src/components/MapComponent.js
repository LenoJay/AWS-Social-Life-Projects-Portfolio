// src/components/MapComponent.js
import React, { useEffect, useRef, useState } from "react";
import { Amplify } from "aws-amplify";
import awsExports from "../aws-exports";
import { createMap } from "maplibre-gl-js-amplify";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as turf from "@turf/turf";
import { startLocationUpdates, stopLocationUpdates, isRunning } from "./LocationUpdater";
import { getGroupLocations, setStatus } from "../api";

Amplify.configure(awsExports);

// Choose your active group here
const DEFAULT_GROUP_ID = "group-1";

export default function MapComponent() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  const [trackingState, setTrackingState] = useState("idle"); // idle | ready | tracking
  const [myStatusText, setMyStatusText] = useState("OMW!");
  const pollTimerRef = useRef(null);

  const trailRef = useRef([]);
  const myMarkerRef = useRef(null);
  const othersRef = useRef(new Map());

  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        const map = await createMap({
          container: mapContainerRef.current,
          center: [-0.1276, 51.5074], // London
          zoom: 12,
        });
        if (disposed) return;
        mapRef.current = map;

        map.on("load", () => {
          map.addSource("me-point-src", { type: "geojson", data: turf.point([-0.1276, 51.5074]) });
          map.addSource("me-trail-src", { type: "geojson", data: turf.lineString([]) });
          map.addSource("me-accuracy-src", { type: "geojson", data: turf.featureCollection([]) });

          map.addLayer({ id: "me-trail", type: "line", source: "me-trail-src",
            paint: { "line-color": "#0ea5e9", "line-width": 4, "line-opacity": 0.9 } });
          map.addLayer({ id: "me-accuracy", type: "fill", source: "me-accuracy-src",
            paint: { "fill-color": "#0ea5e9", "fill-opacity": 0.15 } });
          map.addLayer({ id: "me-dot", type: "circle", source: "me-point-src",
            paint: { "circle-radius": 6, "circle-color": "#0ea5e9", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });

          // My status bubble marker
          myMarkerRef.current = createStatusMarker(myStatusText, "#0ea5e9");
          myMarkerRef.current.setLngLat([-0.1276, 51.5074]).addTo(map);

          setTrackingState("ready");

          // Start polling real group members
          startPolling();
        });
      } catch (e) {
        console.error("[Map] init failed:", e);
        alert(`Map failed to initialize: ${e?.message || e}`);
      }
    })();

    return () => {
      disposed = true;
      stopLocationUpdates();
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      othersRef.current.forEach(({ marker }) => marker.remove());
      othersRef.current.clear();
    };
  }, []);

  // Update my bubble text + push to backend
  useEffect(() => {
    if (myMarkerRef.current) updateStatusMarker(myMarkerRef.current, myStatusText);
    // Don’t block UI if API fails
    setStatus({ groupId: DEFAULT_GROUP_ID, status: myStatusText }).catch(() => {});
  }, [myStatusText]);

  const handleStart = () => {
    if (!mapRef.current) return;
    if (!isRunning()) {
      startLocationUpdates({
        groupId: DEFAULT_GROUP_ID,
        status: myStatusText,
        onUpdate: (p) => onMyPosition(p),
      });
      setTrackingState("tracking");
    }
  };

  const handleStop = () => {
    stopLocationUpdates();
    setTrackingState("ready");
  };

  const handleRecenter = () => {
    const map = mapRef.current; if (!map) return;
    const data = map.getSource("me-point-src")?._data;
    const center = (data && data.geometry?.coordinates) || [-0.1276, 51.5074];
    map.easeTo({ center, duration: 600 });
  };

  function onMyPosition({ lng, lat, accuracy }) {
    const map = mapRef.current; if (!map) return;

    map.getSource("me-point-src").setData(turf.point([lng, lat]));
    trailRef.current.push([lng, lat]);
    map.getSource("me-trail-src").setData(turf.lineString(trailRef.current));

    const circle = turf.circle([lng, lat], Math.max(accuracy, 10) / 1000, { steps: 64, units: "kilometers" });
    map.getSource("me-accuracy-src").setData(circle);

    if (myMarkerRef.current) myMarkerRef.current.setLngLat([lng, lat]);
  }

  function startPolling() {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    const poll = async () => {
      try {
        const resp = await getGroupLocations({ groupId: DEFAULT_GROUP_ID });
        const items = resp.items || resp || []; // support different response shapes
        renderGroupMarkers(items);
      } catch (e) {
        console.warn("[Poll] error:", e.message);
      }
    };
    poll(); // immediately
    pollTimerRef.current = setInterval(poll, 7000);
  }

  function renderGroupMarkers(devices) {
    const map = mapRef.current; if (!map) return;
    const alive = new Set(devices.map((d) => d.UserId));

    // remove stale
    for (const [id, { marker }] of othersRef.current) {
      if (!alive.has(id)) { marker.remove(); othersRef.current.delete(id); }
    }

    devices.forEach((d) => {
      const id = d.UserId;
      const lng = d.Lng, lat = d.Lat;
      if (typeof lng !== "number" || typeof lat !== "number") return;

      const color = "#f97316";
      const text = d.Status || "Here";
      let entry = othersRef.current.get(id);

      if (!entry) {
        const m = createStatusMarker(text, color);
        m.setLngLat([lng, lat]).addTo(map);
        othersRef.current.set(id, { marker: m });
      } else {
        updateStatusMarker(entry.marker, text, color);
        entry.marker.setLngLat([lng, lat]);
      }
    });
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div ref={mapContainerRef} style={{ width: "100%", height: "520px", borderRadius: 12, background: "#111" }} />
      <div style={toolbarStyle}>
        {trackingState !== "tracking" ? (
          <button onClick={handleStart} style={btnStyle}>Start tracking</button>
        ) : (
          <button onClick={handleStop} style={btnStyle}>Stop tracking</button>
        )}
        <button onClick={handleRecenter} style={btnStyle}>Recenter me</button>
        <div style={{ display: "flex", gap: 6 }}>
          {["OMW!", "I’m safe", "Need help", "Here"].map((txt) => (
            <button
              key={txt}
              onClick={() => setMyStatusText(txt)}
              style={{ ...btnStyle, background: txt === myStatusText ? "#22c55e" : "#334155" }}
            >
              {txt}
            </button>
          ))}
        </div>
        <span style={{ opacity: 0.9 }}>Status: <strong>{trackingState}</strong></span>
      </div>
    </div>
  );
}

function createStatusMarker(text, color = "#0ea5e9") {
  const el = document.createElement("div");
  el.style.position = "relative";

  const dot = document.createElement("div");
  dot.style.width = "12px"; dot.style.height = "12px"; dot.style.borderRadius = "999px";
  dot.style.background = color; dot.style.border = "2px solid #fff"; dot.style.boxShadow = "0 0 0 2px rgba(0,0,0,0.2)";
  dot.style.transform = "translate(-50%, -50%)"; dot.style.position = "absolute"; dot.style.left = "50%"; dot.style.top = "50%";
  el.appendChild(dot);

  const bubble = document.createElement("div");
  bubble.style.position = "absolute"; bubble.style.whiteSpace = "nowrap"; bubble.style.left = "50%"; bubble.style.bottom = "18px"; bubble.style.transform = "translateX(-50%)";
  bubble.style.background = "rgba(17,17,17,0.85)"; bubble.style.color = "#fff"; bubble.style.fontSize = "12px"; bubble.style.padding = "6px 8px";
  bubble.style.borderRadius = "8px"; bubble.style.border = `1px solid ${color}`; bubble.style.boxShadow = "0 2px 8px rgba(0,0,0,0.25)";
  bubble.textContent = text; bubble.className = "status-bubble";
  el.appendChild(bubble);

  return new maplibregl.Marker({ element: el, anchor: "bottom" });
}

function updateStatusMarker(marker, newText, color = "#0ea5e9") {
  const el = marker.getElement();
  const bubble = el.querySelector(".status-bubble");
  if (bubble) { bubble.textContent = newText; bubble.style.border = `1px solid ${color}`; }
}

const toolbarStyle = {
  position: "absolute", top: 12, left: 12, display: "flex", gap: 8,
  background: "rgba(20,20,20,0.7)", borderRadius: 8, padding: "8px 10px",
  color: "#fff", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
};
const btnStyle = { background: "#0EA5E9", color: "#fff", border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer" };
