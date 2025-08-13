import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { createMap } from "maplibre-gl-js-amplify";
import * as turf from "@turf/turf";
import { updateLocation, getGroupLocations, setStatus, joinGroup } from "../api"; // adjust if needed

// London default
const DEFAULT_CENTER = [-0.1276, 51.5074]; // [lng, lat]
const DEFAULT_ZOOM = 12;

function MapComponent() {
  const mapRef = useRef(null);
  const mapDivRef = useRef(null);

  const myMarkerRef = useRef(null);
  const myAccuracyRef = useRef(null);

  const trailCoordsRef = useRef([]); // [[lng,lat], ...]
  const myLastSelfRef = useRef(null); // {lng, lat}

  const trailSourceId = "my-trail-source";
  const trailLayerId = "my-trail-line";

  const othersRef = useRef({}); // userId -> { marker, bubble }
  const pollTimerRef = useRef(null);

  const [isTracking, setIsTracking] = useState(false);
  const [myStatusText, setMyStatusText] = useState("idle");
  const [groupId, setGroupId] = useState("");

  // Quick inline styles (keeps this self-contained)
  const styles = {
    appWrap: {
      minHeight: "100vh",
      width: "100%",
      background: "#0b1220",              // nice dark background
      color: "#e5e7eb",                   // light text
      padding: "16px",
      boxSizing: "border-box",
    },
    topBar: {
      display: "flex",
      flexWrap: "wrap",
      gap: "10px",
      alignItems: "center",
      marginBottom: "12px",
    },
    input: {
      padding: "8px 10px",
      borderRadius: "8px",
      border: "1px solid #374151",
      background: "#0f172a",
      color: "#e5e7eb",
      outline: "none",
    },
    btn: {
      padding: "8px 12px",
      borderRadius: "8px",
      border: "1px solid transparent",
      cursor: "pointer",
      fontWeight: 600,
      color: "#ffffff",
      background: "#3b82f6",
      boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
    },
    btnGreen: { background: "#10b981" },
    btnAmber: { background: "#f59e0b" },
    btnRed: { background: "#ef4444" },
    btnSlate: { background: "#64748b" },
    statusText: { marginLeft: 8, fontWeight: 600, color: "#cbd5e1" },

    card: {
      width: "100%",
      borderRadius: "12px",
      overflow: "hidden",
      background: "#0f172a",
      border: "1px solid #1f2937",
      boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
    },
    map: {
      width: "100%",
      height: "500px", // fixed tile height
    },
    footerBar: {
      display: "flex",
      gap: "10px",
      alignItems: "center",
      padding: "10px",
      borderTop: "1px solid #1f2937",
      background: "#0b1220",
    },
    spacer: { flex: 1 },
  };

  // ----- MAP INIT -----
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (mapRef.current) return;

      const map = await createMap({
        container: mapDivRef.current,
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
      });

      if (cancelled) return;
      mapRef.current = map;

      map.on("load", () => {
        // Ensure the canvas looks interactive
        const canvas = map.getCanvas();
        canvas.style.cursor = "grab";
        map.on("dragstart", () => (canvas.style.cursor = "grabbing"));
        map.on("dragend", () => (canvas.style.cursor = "grab"));

        // Force a resize once everything is painted to honor the fixed height
        setTimeout(() => map.resize(), 0);

        // Add empty source for the trail
        if (!map.getSource(trailSourceId)) {
          map.addSource(trailSourceId, {
            type: "geojson",
            data: turf.featureCollection([]),
          });
        }
        if (!map.getLayer(trailLayerId)) {
          map.addLayer({
            id: trailLayerId,
            type: "line",
            source: trailSourceId,
            paint: {
              "line-color": "#3b82f6",
              "line-width": 3,
            },
          });
        }
      });
    })();

    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (mapRef.current) {
        const map = mapRef.current;
        if (map.getLayer(trailLayerId)) map.removeLayer(trailLayerId);
        if (map.getSource(trailSourceId)) map.removeSource(trailSourceId);
        map.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // ----- DRAW / UPDATE MY MARKER + ACCURACY -----
  const renderSelf = (lng, lat, accuracy) => {
    const map = mapRef.current;
    if (!map) return;

    myLastSelfRef.current = { lng, lat };

    // Marker (You are here)
    if (!myMarkerRef.current) {
      const el = document.createElement("div");
      el.style.width = "14px";
      el.style.height = "14px";
      el.style.borderRadius = "50%";
      el.style.background = "#10b981"; // green
      el.style.boxShadow = "0 0 0 2px #fff";
      myMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);
    } else {
      myMarkerRef.current.setLngLat([lng, lat]);
    }

    // Accuracy circle
    const radiusInKm = Math.max(0, (accuracy || 0) / 1000);
    const circle = turf.circle([lng, lat], radiusInKm, { steps: 50, units: "kilometers" });
    const srcId = "self-accuracy-src";
    const layerId = "self-accuracy-layer";
    if (!map.getSource(srcId)) {
      map.addSource(srcId, { type: "geojson", data: circle });
      map.addLayer({
        id: layerId,
        type: "fill",
        source: srcId,
        paint: {
          "fill-color": "#10b981",
          "fill-opacity": 0.15,
        },
      });
    } else {
      map.getSource(srcId).setData(circle);
    }
  };

  // ----- TRAIL: only draw a line if >= 2 points -----
  const updateTrail = () => {
    const map = mapRef.current;
    if (!map) return;

    const coords = trailCoordsRef.current;
    const src = map.getSource(trailSourceId);
    if (!src) return;

    if (coords.length >= 2) {
      const line = turf.lineString(coords);
      src.setData(line);
    } else {
      src.setData(turf.featureCollection([]));
    }
  };

  // ----- GEOLOCATION: Start / Stop -----
  const startTracking = async () => {
    setIsTracking(true);
    try {
      if (groupId) await joinGroup({ groupId });
    } catch (_) {}

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { longitude: lng, latitude: lat, accuracy } = pos.coords;
          renderSelf(lng, lat, accuracy);
          mapRef.current?.flyTo({ center: [lng, lat], zoom: 15, essential: true });

          trailCoordsRef.current.push([lng, lat]);
          updateTrail();

          try {
            await updateLocation({ lat, lng, accuracy });
          } catch (e) {
            console.warn("updateLocation failed", e);
          }
        },
        (err) => console.warn("getCurrentPosition error", err),
        { enableHighAccuracy: true }
      );
    }

    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(refreshOthers, 5000);
  };

  const stopTracking = () => {
    setIsTracking(false);
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
  };

  const recenter = () => {
    const map = mapRef.current;
    const p = myLastSelfRef.current;
    if (map && p) map.flyTo({ center: [p.lng, p.lat], zoom: 15, essential: true });
  };

  // ----- OTHER USERS -----
  const refreshOthers = async () => {
    const map = mapRef.current;
    if (!map || !groupId) return;
    let data;
    try {
      data = await getGroupLocations({ groupId });
    } catch (e) {
      console.warn("getGroupLocations failed", e);
      return;
    }

    // data.items = [{ userId, lat, lng, status, updatedAt }, ...]
    const existing = othersRef.current;
    const seen = new Set();

    for (const u of data.items || []) {
      const key = u.userId;
      seen.add(key);
      const lng = u.lng;
      const lat = u.lat;

      if (!existing[key]) {
        // marker
        const el = document.createElement("div");
        el.style.width = "12px";
        el.style.height = "12px";
        el.style.borderRadius = "50%";
        el.style.background = "#ef4444";
        el.style.boxShadow = "0 0 0 2px #fff";
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);

        // bubble (status)
        const bubble = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
          .setLngLat([lng, lat])
          .setHTML(
            `<div style="padding:4px 8px;border-radius:8px;background:#111;color:#fff;font-size:12px">${u.status || ""}</div>`
          )
          .addTo(map);

        existing[key] = { marker, bubble };
      } else {
        existing[key].marker.setLngLat([lng, lat]);
        existing[key].bubble
          .setLngLat([lng, lat])
          .setHTML(
            `<div style="padding:4px 8px;border-radius:8px;background:#111;color:#fff;font-size:12px">${u.status || ""}</div>`
          );
      }
    }

    // remove any not seen
    for (const key of Object.keys(existing)) {
      if (!seen.has(key)) {
        existing[key].marker.remove();
        existing[key].bubble.remove();
        delete existing[key];
      }
    }
  };

  // ----- STATUS QUICK BUTTONS -----
  const sendStatus = async (txt) => {
    setMyStatusText(txt);
    try {
      await setStatus({ groupId, status: txt });
    } catch (e) {
      console.warn("setStatus failed", e);
    }
  };

  return (
    <div style={styles.appWrap}>
      {/* Controls row */}
      <div style={styles.topBar}>
        <input
          placeholder="Group ID"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value.trim())}
          style={styles.input}
        />
        {!isTracking ? (
          <button style={styles.btn} onClick={startTracking}>Start tracking</button>
        ) : (
          <button style={{ ...styles.btn, ...styles.btnSlate }} onClick={stopTracking}>Stop tracking</button>
        )}
        <button style={{ ...styles.btn, ...styles.btnGreen }} onClick={() => sendStatus("OMW!")}>OMW!</button>
        <button style={{ ...styles.btn, ...styles.btnGreen }} onClick={() => sendStatus("I'm safe")}>I'm safe</button>
        <button style={{ ...styles.btn, ...styles.btnAmber }} onClick={() => sendStatus("Delayed")}>Delayed</button>
        <button style={{ ...styles.btn, ...styles.btnAmber }} onClick={() => sendStatus("Be right back")}>BRB</button>
        <button style={{ ...styles.btn, ...styles.btnRed }} onClick={() => sendStatus("Need help")}>Need help</button>
        <button style={{ ...styles.btn, ...styles.btnRed }} onClick={() => sendStatus("Emergency")}>Emergency</button>
        <div style={styles.statusText}>Status: {myStatusText}</div>
      </div>

      {/* Map card */}
      <div style={styles.card}>
        <div ref={mapDivRef} style={styles.map} />
        <div style={styles.footerBar}>
          <div style={styles.spacer} />
          <button style={{ ...styles.btn, ...styles.btnSlate }} onClick={recenter}>
            Re-center
          </button>
        </div>
      </div>
    </div>
  );
}

export default MapComponent;
