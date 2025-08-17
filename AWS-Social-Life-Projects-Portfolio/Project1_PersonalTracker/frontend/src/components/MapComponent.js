import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { createMap } from "maplibre-gl-js-amplify";
import * as turf from "@turf/turf";
import {
  createGroup,
  getGroup,
  joinGroup,
  updateLocation,
  getGroupLocations,
  setStatus,
} from "../api";
import { getCurrentUser } from "@aws-amplify/auth";

// ----- Constants -----
const WS_URL = ""; // optional WebSocket endpoint, leave blank to disable
const DEFAULT_CENTER = [-0.1276, 51.5074]; // London [lng, lat]
const DEFAULT_ZOOM = 12;
const ONLINE_WINDOW_MS = 60 * 1000;
const ACCURACY_MIN_M = 1;   // never render below 1m
const ACCURACY_MAX_M = 10;  // clamp circle to 10m max

// Sources / layers
const TRAIL_SRC = "my-trail-src";
const TRAIL_LAYER = "my-trail-layer";
const OTHERS_SRC = "others-src";
const OTHERS_LAYER_UNCLUSTERED = "others-unclustered";
const OTHERS_LAYER_CLUSTER = "others-clusters";
const OTHERS_LAYER_COUNT = "cluster-count";

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function timeAgo(ts) {
  try {
    const d = new Date(ts).getTime();
    const diff = Date.now() - d;
    if (diff < 60 * 1000) return `${Math.max(1, Math.floor(diff / 1000))}s ago`;
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  } catch { return ""; }
}

// Stand-alone statuses (no chat/context needed)
const STATUSES = [
  // Low urgency / green
  { label: "Available", color: "#10b981" },
  { label: "On my way", color: "#10b981" },
  { label: "Arrived at destination", color: "#10b981" },
  // Medium / amber
  { label: "Running late (~15m)", color: "#f59e0b" },
  { label: "Battery low", color: "#f59e0b" },
  { label: "Can’t talk right now", color: "#f59e0b" },
  // High / red (single urgent message)
  { label: "Urgent — call me", color: "#ef4444" },
];

export default function MapComponent() {
  // Map refs
  const mapRef = useRef(null);
  const mapDivRef = useRef(null);
  const myMarkerRef = useRef(null);
  const myLastSelfRef = useRef(null);

  const myAccuracySrcId = "self-accuracy-src";
  const myAccuracyLayerId = "self-accuracy-layer";

  const trailCoordsRef = useRef([]);
  const pollTimerRef = useRef(null);
  const wsRef = useRef(null);

  // UI state
  const [username, setUsername] = useState("");
  const [groupId, setGroupId] = useState(localStorage.getItem("pt_group") || "");
  const [groupName, setGroupName] = useState("");
  const [isTracking, setIsTracking] = useState(false);
  const [myStatusText, setMyStatusText] = useState("Available");
  const [toasts, setToasts] = useState([]);

  // ----- Styles -----
  const styles = {
    pageOuter: {
      minHeight: "100vh",
      width: "100%",
      background:
        "radial-gradient(1200px 600px at 10% -10%, #1b2a4a22 30%, transparent 60%)," +
        "radial-gradient(800px 500px at 90% 0%, #2d1a1a22 20%, transparent 55%)," +
        "linear-gradient(180deg, #0f1628 0%, #0b1120 50%, #0f1628 100%)",
      color: "#e5e7eb",
      padding: 18,
      boxSizing: "border-box",
    },
    headerRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    titleWrap: { display: "flex", alignItems: "baseline", gap: 12 },
    title: { fontSize: 24, fontWeight: 800, letterSpacing: 0.2 },
    titleSub: { fontSize: 14, opacity: 0.9 },
    // unified button base
    btnBase: {
      padding: "8px 12px",
      borderRadius: 10,
      border: "1px solid transparent",
      cursor: "pointer",
      fontWeight: 600,
      color: "#ffffff",
      boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
    },
    // colors
    btnBlue:   { background: "#3b82f6" }, // Create (lighter blue)
    btnBlueDk: { background: "#1e40af" }, // Join / Invite (darker blue)
    btnGreen:  { background: "#10b981" }, // Start tracking (green)
    btnRed:    { background: "#ef4444" }, // Stop tracking (red)
    btnSlate:  { background: "#64748b" },
    topBar: {
      display: "flex",
      flexWrap: "wrap",
      gap: 10,
      alignItems: "center",
      marginBottom: 10,
    },
    input: {
      padding: "8px 10px",
      borderRadius: 8,
      border: "1px solid #374151",
      background: "#0f172a",
      color: "#e5e7eb",
      outline: "none",
      minWidth: 160,
    },
    statusBar: {
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
      alignItems: "center",
      marginBottom: 10,
    },
    card: {
      width: "100%",
      borderRadius: 14,
      overflow: "hidden",
      background: "#0f172a",
      border: "1px solid #1f2937",
      boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
    },
    map: { width: "100%", height: "680px" }, // taller map
    footerBar: {
      display: "flex",
      gap: 10,
      alignItems: "center",
      padding: 10,
      borderTop: "1px solid #1f2937",
      background: "#0b1220",
    },
    spacer: { flex: 1 },
    toastWrap: {
      position: "fixed",
      bottom: 20,
      right: 20,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      zIndex: 9999,
    },
    toast: {
      background: "#111827",
      border: "1px solid #374151",
      color: "#fff",
      borderRadius: 10,
      padding: "10px 12px",
      boxShadow: "0 10px 30px rgba(0,0,0,.35)",
      fontSize: 14,
      maxWidth: 360,
    },
  };

  // ----- Signed-in user (kept for future, not shown in header now) -----
  useEffect(() => {
    (async () => {
      try {
        const user = await getCurrentUser();
        setUsername(user?.username || "");
      } catch { setUsername(""); }
    })();
  }, []);

  // ----- Load saved group / friendly name -----
  useEffect(() => {
    if (!groupId) return;
    (async () => {
      try {
        const g = await getGroup({ groupId });
        setGroupName(g.displayName || "");
      } catch { setGroupName(""); }
    })();
  }, [groupId]);

  // ----- Initialize map -----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (mapRef.current) return;
      const map = await createMap({ container: mapDivRef.current, center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
      if (cancelled) return;
      mapRef.current = map;

      map.on("load", () => {
        const canvas = map.getCanvas();
        canvas.style.cursor = "grab";
        map.on("dragstart", () => (canvas.style.cursor = "grabbing"));
        map.on("dragend", () => (canvas.style.cursor = "grab"));
        setTimeout(() => map.resize(), 0);

        // Empty trail
        if (!map.getSource(TRAIL_SRC)) {
          map.addSource(TRAIL_SRC, { type: "geojson", data: turf.featureCollection([]) });
        }
        if (!map.getLayer(TRAIL_LAYER)) {
          map.addLayer({ id: TRAIL_LAYER, type: "line", source: TRAIL_SRC, paint: { "line-color": "#3b82f6", "line-width": 3 } });
        }

        // Others (clustered)
        if (!map.getSource(OTHERS_SRC)) {
          map.addSource(OTHERS_SRC, { type: "geojson", data: turf.featureCollection([]), cluster: true, clusterRadius: 40 });
        }
        if (!map.getLayer(OTHERS_LAYER_CLUSTER)) {
          map.addLayer({
            id: OTHERS_LAYER_CLUSTER, type: "circle", source: OTHERS_SRC, filter: ["has", "point_count"],
            paint: { "circle-color": "#334155", "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 25, 28], "circle-stroke-width": 1.5, "circle-stroke-color": "#0f172a" },
          });
        }
        if (!map.getLayer(OTHERS_LAYER_COUNT)) {
          map.addLayer({
            id: OTHERS_LAYER_COUNT, type: "symbol", source: OTHERS_SRC, filter: ["has", "point_count"],
            layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"], "text-size": 12 },
            paint: { "text-color": "#e5e7eb" },
          });
        }
        if (!map.getLayer(OTHERS_LAYER_UNCLUSTERED)) {
          map.addLayer({
            id: OTHERS_LAYER_UNCLUSTERED, type: "circle", source: OTHERS_SRC, filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": [
                "case",
                ["<", ["-", ["to-number", ["get", "nowMs"]], ["to-number", ["get", "updatedMs"]]], ONLINE_WINDOW_MS],
                "#10b981", "#6b7280",
              ],
              "circle-radius": 7, "circle-stroke-width": 2, "circle-stroke-color": "#ffffff",
            },
          });
        }

        map.on("click", OTHERS_LAYER_CLUSTER, (e) => {
          const features = map.queryRenderedFeatures(e.point, { layers: [OTHERS_LAYER_CLUSTER] });
          const clusterId = features[0]?.properties?.cluster_id;
          map.getSource(OTHERS_SRC).getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            map.easeTo({ center: features[0].geometry.coordinates, zoom });
          });
        });

        map.on("click", OTHERS_LAYER_UNCLUSTERED, (e) => {
          const f = e.features && e.features[0];
          if (!f) return;
          const { status = "", updatedAt = "" } = f.properties || {};
          const coords = f.geometry.coordinates.slice();
          new maplibregl.Popup({ closeOnClick: true })
            .setLngLat(coords)
            .setHTML(
              `<div style="padding:6px 8px;border-radius:10px;background:#111;color:#fff;font-size:12px">
                 <div style="font-weight:700;margin-bottom:4px">${status || "No status"}</div>
                 <div style="opacity:.8">${updatedAt ? timeAgo(updatedAt) : "recent"}</div>
               </div>`
            )
            .addTo(map);
        });
      });
    })();

    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (wsRef.current) { try { wsRef.current.close(); } catch {} wsRef.current = null; }
      if (mapRef.current) {
        const map = mapRef.current;
        [TRAIL_LAYER, OTHERS_LAYER_UNCLUSTERED, OTHERS_LAYER_CLUSTER, OTHERS_LAYER_COUNT].forEach(
          (id) => map.getLayer(id) && map.removeLayer(id)
        );
        [TRAIL_SRC, OTHERS_SRC, myAccuracySrcId].forEach((id) => map.getSource(id) && map.removeSource(id));
        map.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // ----- Self marker + accuracy (clamped to ≤10m) -----
  const renderSelf = (lng, lat, accuracy) => {
    const map = mapRef.current;
    if (!map) return;
    myLastSelfRef.current = { lng, lat };

    if (!myMarkerRef.current) {
      const el = document.createElement("div");
      el.style.width = "14px"; el.style.height = "14px"; el.style.borderRadius = "50%";
      el.style.background = "#10b981"; el.style.boxShadow = "0 0 0 2px #fff";
      myMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
    } else {
      myMarkerRef.current.setLngLat([lng, lat]);
    }

    if (typeof accuracy === "number") {
      const m = clamp(Math.max(accuracy, ACCURACY_MIN_M), ACCURACY_MIN_M, ACCURACY_MAX_M);
      const circle = turf.circle([lng, lat], m / 1000, { steps: 50, units: "kilometers" });
      if (!map.getSource(myAccuracySrcId)) {
        map.addSource(myAccuracySrcId, { type: "geojson", data: circle });
        map.addLayer({ id: myAccuracyLayerId, type: "fill", source: myAccuracySrcId, paint: { "fill-color": "#10b981", "fill-opacity": 0.12 } });
      } else {
        map.getSource(myAccuracySrcId).setData(circle);
      }
    }
  };

  const updateTrail = () => {
    const map = mapRef.current;
    if (!map) return;
    const coords = trailCoordsRef.current;
    const src = map.getSource(TRAIL_SRC);
    if (!src) return;
    if (coords.length >= 2) src.setData(turf.lineString(coords));
    else src.setData(turf.featureCollection([]));
  };

  // ----- Group helpers -----
  const handleCreateGroup = async () => {
    try {
      const name = groupName?.trim() || "My Group";
      const res = await createGroup({ displayName: name });
      if (!res?.groupId) throw new Error("No groupId returned");
      setGroupId(res.groupId);
      localStorage.setItem("pt_group", res.groupId);
      setGroupName(res.displayName || name);
      showToast(`Created “${res.displayName || name}” (code ${res.groupId})`);
    } catch (e) {
      console.error(e);
      showToast("Create group error");
    }
  };

  const handleJoinGroup = async () => {
    if (!groupId) return;
    try {
      await joinGroup({ groupId });
      localStorage.setItem("pt_group", groupId);
      const g = await getGroup({ groupId });
      setGroupName(g.displayName || "");
      showToast(`Joined group ${groupId}`);
    } catch (e) {
      console.error(e);
      showToast("Join group failed");
    }
  };

  // ----- Tracking -----
  const startTracking = async () => {
    setIsTracking(true);
    if (groupId) await handleJoinGroup();

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { longitude: lng, latitude: lat, accuracy } = pos.coords;
          renderSelf(lng, lat, accuracy);
          mapRef.current?.flyTo({ center: [lng, lat], zoom: 15, essential: true });
          trailCoordsRef.current.push([lng, lat]);
          updateTrail();
          try {
            await updateLocation({ lat, lng, accuracy, groupId, status: myStatusText });
          } catch (e) {
            console.warn("updateLocation failed", e);
          }
        },
        (err) => console.warn("getCurrentPosition error", err),
        { enableHighAccuracy: true }
      );
    }

    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(refreshOthers, 3000);
  };

  const stopTracking = () => {
    setIsTracking(false);
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
  };

  // ----- Re-center -----
  const recenterSelf = () => {
    const p = myLastSelfRef.current;
    if (mapRef.current && p) {
      mapRef.current.flyTo({ center: [p.lng, p.lat], zoom: 15, essential: true });
    }
  };
  const recenterLondon = () => {
    if (mapRef.current) {
      mapRef.current.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, essential: true });
    }
  };

  // ----- Poll others -----
  const refreshOthers = async () => {
    const map = mapRef.current;
    if (!map || !groupId) return;
    try {
      const data = await getGroupLocations({ groupId });
      const features = (data.items || []).map((u) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [u.lng, u.lat] },
        properties: {
          userId: u.userId,
          status: u.status || "",
          updatedAt: u.updatedAt || "",
          updatedMs: u.updatedAt ? new Date(u.updatedAt).getTime() : 0,
          nowMs: Date.now(),
          // If your API returns a username, show it; otherwise userId will be visible.
          username: u.username || "",
        },
      }));
      const fc = { type: "FeatureCollection", features };
      const src = map.getSource(OTHERS_SRC);
      if (src) src.setData(fc);
    } catch (e) {
      console.warn("getGroupLocations failed", e);
    }
  };

  // ----- Status -----
  const sendStatus = async (txt) => {
    setMyStatusText(txt);
    try {
      await setStatus({ groupId, status: txt });
      showToast(`Status set: ${txt}`);
    } catch (e) {
      console.warn("setStatus failed", e);
    }
  };

  // ----- Toasts -----
  const showToast = (text) => {
    const t = { id: Date.now() + Math.random(), text };
    setToasts((prev) => [...prev, t]);
    setTimeout(() => { setToasts((prev) => prev.filter((x) => x.id !== t.id)); }, 3200);
  };

  return (
    <div style={styles.pageOuter}>
      {/* Header row */}
      <div style={styles.headerRow}>
        <div style={styles.titleWrap}>
          <div style={styles.title}>Real-Time Personal Tracker</div>
          <div style={styles.titleSub}>
            {groupName ? `Group: ${groupName} (${groupId})` : groupId ? `Code: ${groupId}` : ""}
          </div>
        </div>
        {/* Intentionally empty right side (you keep the Amplify white banner Sign Out) */}
        <div />
      </div>

      {/* Group controls */}
      <div style={styles.topBar}>
        <input
          placeholder="Group name"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          style={styles.input}
        />
        {/* Create = lighter blue */}
        <button style={{ ...styles.btnBase, ...styles.btnBlue }} onClick={handleCreateGroup}>Create</button>

        <input
          placeholder="Group ID"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value.trim())}
          style={styles.input}
        />
        {/* Join/Invite = darker blue */}
        <button style={{ ...styles.btnBase, ...styles.btnBlueDk }} onClick={handleJoinGroup}>Join group</button>
        <button
          style={{ ...styles.btnBase, ...styles.btnBlueDk }}
          onClick={async () => {
            if (!groupId) return;
            await navigator.clipboard.writeText(groupId);
            showToast("Group code copied");
          }}
        >
          Invite (copy code)
        </button>

        {/* Start/Stop tracking: green/red */}
        {!isTracking ? (
          <button style={{ ...styles.btnBase, ...styles.btnGreen }} onClick={startTracking}>Start tracking</button>
        ) : (
          <button style={{ ...styles.btnBase, ...styles.btnRed }} onClick={stopTracking}>Stop tracking</button>
        )}
      </div>

      {/* Status buttons */}
      <div style={styles.statusBar}>
        {STATUSES.map((s) => (
          <button
            key={s.label}
            style={{ ...styles.btnBase, background: s.color }}
            onClick={() => sendStatus(s.label)}
          >
            {s.label}
          </button>
        ))}
        <div style={{ marginLeft: 8, fontWeight: 600, color: "#cbd5e1" }}>
          Current: {myStatusText}
        </div>
      </div>

      {/* Map card */}
      <div style={styles.card}>
        <div ref={mapDivRef} style={styles.map} />
        <div style={styles.footerBar}>
          <div style={styles.spacer} />
          <button style={{ ...styles.btnBase, ...styles.btnSlate }} onClick={recenterSelf}>Re-center me</button>
          <button style={{ ...styles.btnBase, ...styles.btnSlate }} onClick={recenterLondon}>Re-center London</button>
        </div>
      </div>

      {/* Toasts */}
      <div style={styles.toastWrap}>
        {toasts.map((t) => (<div key={t.id} style={styles.toast}>{t.text}</div>))}
      </div>
    </div>
  );
}
