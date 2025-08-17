import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { createMap } from "maplibre-gl-js-amplify";
import * as turf from "@turf/turf";
import {
  updateLocation,
  getGroupLocations,
  setStatus,
  joinGroup,
  createGroup, // ADDED
  getGroup      // ADDED
} from "../api";
import { getCurrentUser } from "@aws-amplify/auth";

// ---- Optional WebSocket push for geofence events ----
const WS_URL = "wss://ed5ifhavha.execute-api.eu-central-1.amazonaws.com/prod/";

// London default
const DEFAULT_CENTER = [-0.1276, 51.5074];
const DEFAULT_ZOOM = 12;

// presence thresholds
const ONLINE_WINDOW_MS = 60 * 1000;

// clamp accuracy circle radius (in meters) — widened so poor accuracy is visible
const ACCURACY_MIN_M = 10;
const ACCURACY_MAX_M = 2000;

// layers / sources
const TRAIL_SRC = "my-trail-src";
const TRAIL_LAYER = "my-trail-layer";
const OTHERS_SRC = "others-src";
const OTHERS_LAYER_UNCLUSTERED = "others-unclustered";
const OTHERS_LAYER_CLUSTER = "others-clusters";
const OTHERS_LAYER_COUNT = "cluster-count";
const OTHERS_STATUS = "others-status"; // ADDED
const FENCE_SRC = "fences-src";
const FENCE_FILL = "fences-fill";
const FENCE_LINE = "fences-line";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function timeAgo(ts) {
  try {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60 * 1000) return `${Math.max(1, Math.floor(diff / 1000))}s ago`;
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  } catch {
    return "";
  }
}

export default function MapComponent() {
  const mapRef = useRef(null);
  const mapDivRef = useRef(null);
  const myMarkerRef = useRef(null);
  const myLastSelfRef = useRef(null);
  const myAccuracySrcId = "self-accuracy-src";
  const myAccuracyLayerId = "self-accuracy-layer";
  const trailCoordsRef = useRef([]);
  const pollTimerRef = useRef(null);
  const wsRef = useRef(null);

  const [groupId, setGroupId] = useState("");
  const [groupName, setGroupName] = useState("");       // friendly name
  const [newGroupName, setNewGroupName] = useState(""); // create UI
  const [recentGroups, setRecentGroups] = useState([]); // [{id,name}]
  const [isTracking, setIsTracking] = useState(false);
  const [myStatusText, setMyStatusText] = useState("idle");
  const [toasts, setToasts] = useState([]);
  const [username, setUsername] = useState("");
  const [lastAccuracy, setLastAccuracy] = useState(null); // meters

  // ---- styles
  const styles = {
    pageOuter: {
      minHeight: "100vh",
      width: "100%",
      background:
        "radial-gradient(1200px 600px at 10% -10%, #1a2a6c22 30%, transparent 60%)," +
        "radial-gradient(800px 500px at 90% 0%, #b21f1f22 20%, transparent 55%)," +
        "linear-gradient(180deg, #0a101d 0%, #0d1426 50%, #0a101d 100%)",
      color: "#e5e7eb",
      padding: 20,
      boxSizing: "border-box",
    },
    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14,
    },
    title: {
      fontSize: 24,
      fontWeight: 800,
      letterSpacing: 0.3,
    },
    subTitle: { marginTop: 4, opacity: 0.85, fontSize: 13 },
    userBadge: {
      fontSize: 13,
      padding: "6px 10px",
      borderRadius: 999,
      background: "#111827",
      border: "1px solid #374151",
      color: "#e5e7eb",
    },
    topBar: {
      display: "flex",
      flexWrap: "wrap",
      gap: 10,
      alignItems: "center",
      marginBottom: 12,
    },
    chipRow: {
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 8,
    },
    chip: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 10px",
      borderRadius: 999,
      background: "#0b1220",
      border: "1px solid #1f2937",
      cursor: "pointer",
    },
    chipX: {
      border: "none",
      background: "transparent",
      color: "#9ca3af",
      cursor: "pointer",
      fontSize: 14,
      padding: 0,
      lineHeight: 1,
    },
    input: {
      padding: "8px 10px",
      borderRadius: 8,
      border: "1px solid #374151",
      background: "#0f172a",
      color: "#e5e7eb",
      outline: "none",
      minWidth: 180,
    },
    btn: {
      padding: "8px 12px",
      borderRadius: 8,
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
      borderRadius: 12,
      overflow: "hidden",
      background: "#0f172a",
      border: "1px solid #1f2937",
      boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
    },
    map: { width: "100%", height: "520px" },
    footerBar: {
      display: "flex",
      gap: 10,
      alignItems: "center",
      padding: 10,
      borderTop: "1px solid #1f2937",
      background: "#0b1220",
      color: "#cbd5e1",
      fontSize: 13,
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

  // signed-in username
  useEffect(() => {
    (async () => {
      try {
        const user = await getCurrentUser();
        setUsername(user.username || "");
      } catch {
        setUsername("");
      }
    })();
  }, []);

  // load saved group + friendly name + recent groups
  useEffect(() => {
    const saved = localStorage.getItem("pt_group");
    if (saved) {
      setGroupId(saved);
      (async () => {
        try {
          const g = await getGroup({ groupId: saved });
          if (g?.displayName) setGroupName(g.displayName);
        } catch {}
      })();
    }
    try {
      const raw = localStorage.getItem("pt_groups");
      if (raw) setRecentGroups(JSON.parse(raw));
    } catch {}
  }, []);

  // helper: save recent groups
  const addRecentGroup = (id, name) => {
    if (!id) return;
    setRecentGroups((prev) => {
      const filtered = prev.filter((g) => g.id !== id);
      const updated = [{ id, name: name || "" }, ...filtered].slice(0, 8);
      localStorage.setItem("pt_groups", JSON.stringify(updated));
      return updated;
    });
  };
  const removeRecentGroup = (id) => {
    setRecentGroups((prev) => {
      const updated = prev.filter((g) => g.id !== id);
      localStorage.setItem("pt_groups", JSON.stringify(updated));
      return updated;
    });
  };
  const switchToGroup = async (id) => {
    setGroupId(id);
    localStorage.setItem("pt_group", id);
    try {
      const g = await getGroup({ groupId: id });
      setGroupName(g?.displayName || "");
    } catch {
      setGroupName("");
    }
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({ action: "hello", groupId: id }));
    }
    showToast(`Switched to ${id}`);
    refreshOthers();
  };

  // init map
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

      map.on("load", async () => {
        const canvas = map.getCanvas();
        canvas.style.cursor = "grab";
        map.on("dragstart", () => (canvas.style.cursor = "grabbing"));
        map.on("dragend", () => (canvas.style.cursor = "grab"));
        setTimeout(() => map.resize(), 0);

        // trail
        if (!map.getSource(TRAIL_SRC)) {
          map.addSource(TRAIL_SRC, {
            type: "geojson",
            data: turf.featureCollection([]),
          });
        }
        if (!map.getLayer(TRAIL_LAYER)) {
          map.addLayer({
            id: TRAIL_LAYER,
            type: "line",
            source: TRAIL_SRC,
            paint: { "line-color": "#3b82f6", "line-width": 3 },
          });
        }

        // others (cluster)
        if (!map.getSource(OTHERS_SRC)) {
          map.addSource(OTHERS_SRC, {
            type: "geojson",
            data: turf.featureCollection([]),
            cluster: true,
            clusterRadius: 40,
          });
        }
        if (!map.getLayer(OTHERS_LAYER_CLUSTER)) {
          map.addLayer({
            id: OTHERS_LAYER_CLUSTER,
            type: "circle",
            source: OTHERS_SRC,
            filter: ["has", "point_count"],
            paint: {
              "circle-color": "#334155",
              "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 25, 28],
              "circle-stroke-width": 1.5,
              "circle-stroke-color": "#0f172a",
            },
          });
        }
        if (!map.getLayer(OTHERS_LAYER_COUNT)) {
          map.addLayer({
            id: OTHERS_LAYER_COUNT,
            type: "symbol",
            source: OTHERS_SRC,
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
              "text-size": 12,
            },
            paint: { "text-color": "#e5e7eb" },
          });
        }
        if (!map.getLayer(OTHERS_LAYER_UNCLUSTERED)) {
          map.addLayer({
            id: OTHERS_LAYER_UNCLUSTERED,
            type: "circle",
            source: OTHERS_SRC,
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": [
                "case",
                [
                  "<",
                  [
                    "-",
                    ["to-number", ["get", "nowMs"]],
                    ["to-number", ["get", "updatedMs"]],
                  ],
                  ONLINE_WINDOW_MS,
                ],
                "#10b981",
                "#6b7280",
              ],
              "circle-radius": 7,
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff",
            },
          });
        }

        // ADDED: show each user's status above their marker
        if (!map.getLayer(OTHERS_STATUS)) {
          map.addLayer({
            id: OTHERS_STATUS,
            type: "symbol",
            source: OTHERS_SRC,
            filter: ["!", ["has", "point_count"]],
            layout: {
              "text-field": ["coalesce", ["get", "status"], ""],
              "text-size": 11,
              "text-anchor": "bottom",
              "text-offset": [0, -1.2],
            },
            paint: {
              "text-color": "#111111",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.5,
            },
          });
        }

        map.on("click", OTHERS_LAYER_CLUSTER, (e) => {
          const features = map.queryRenderedFeatures(e.point, {
            layers: [OTHERS_LAYER_CLUSTER],
          });
          const clusterId = features[0].properties.cluster_id;
          map
            .getSource(OTHERS_SRC)
            .getClusterExpansionZoom(clusterId, (err, zoom) => {
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
                 <div style="opacity:.8">updated ${timeAgo(updatedAt)}</div>
               </div>`
            )
            .addTo(map);
        });

        // Optional: fences layer if you provide /public/geojson/fences.geojson
        try {
          const res = await fetch("/geojson/fences.geojson", { cache: "no-store" });
          if (res.ok) {
            const gj = await res.json();
            if (!map.getSource(FENCE_SRC)) {
              map.addSource(FENCE_SRC, { type: "geojson", data: gj });
              map.addLayer({
                id: FENCE_FILL,
                type: "fill",
                source: FENCE_SRC,
                paint: { "fill-color": "#f59e0b", "fill-opacity": 0.08 },
              });
              map.addLayer({
                id: FENCE_LINE,
                type: "line",
                source: FENCE_SRC,
                paint: { "line-color": "#f59e0b", "line-width": 2 },
              });
            }
          }
        } catch {}
      });
    })();

    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
      if (mapRef.current) {
        const map = mapRef.current;
        [TRAIL_LAYER, OTHERS_LAYER_UNCLUSTERED, OTHERS_LAYER_CLUSTER, OTHERS_LAYER_COUNT, OTHERS_STATUS, FENCE_FILL, FENCE_LINE].forEach(
          (id) => map.getLayer(id) && map.removeLayer(id)
        );
        [TRAIL_SRC, OTHERS_SRC, FENCE_SRC, myAccuracySrcId].forEach(
          (id) => map.getSource(id) && map.removeSource(id)
        );
        map.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // ---- optional WebSocket for SNS -> browser geofence events
  useEffect(() => {
    if (!WS_URL) return; // disabled
    if (wsRef.current) return;
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (groupId) {
          ws.send(JSON.stringify({ action: "hello", groupId }));
        }
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "geofence") {
            const t =
              (msg.action === "ENTER" ? "Entered" : "Exited") +
              (msg.fenceName ? ` ${msg.fenceName}` : " geofence");
            showToast(t);
          }
        } catch {}
      };
      ws.onclose = () => {
        wsRef.current = null;
      };
    } catch {
      wsRef.current = null;
    }
  }, [groupId]);

  // render self marker + accuracy (clamped)
  const renderSelf = (lng, lat, accuracy) => {
    const map = mapRef.current;
    if (!map) return;
    myLastSelfRef.current = { lng, lat };

    if (!myMarkerRef.current) {
      const el = document.createElement("div");
      el.style.width = "14px";
      el.style.height = "14px";
      el.style.borderRadius = "50%";
      el.style.background = "#10b981";
      el.style.boxShadow = "0 0 0 2px #fff";
      myMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);
    } else {
      myMarkerRef.current.setLngLat([lng, lat]);
    }

    if (typeof accuracy === "number") {
      setLastAccuracy(Math.round(accuracy)); // show in footer
      const m = clamp(accuracy, ACCURACY_MIN_M, ACCURACY_MAX_M);
      const circle = turf.circle([lng, lat], m / 1000, {
        steps: 50,
        units: "kilometers",
      });
      if (!map.getSource(myAccuracySrcId)) {
        map.addSource(myAccuracySrcId, { type: "geojson", data: circle });
        map.addLayer({
          id: myAccuracyLayerId,
          type: "fill",
          source: myAccuracySrcId,
          paint: { "fill-color": "#10b981", "fill-opacity": 0.12 },
        });
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

  const handleJoinGroup = async () => {
    if (!groupId) return;
    try {
      await joinGroup({ groupId });
      localStorage.setItem("pt_group", groupId);
      showToast(`Joined group "${groupId}"`);
      if (wsRef.current && wsRef.current.readyState === 1) {
        wsRef.current.send(JSON.stringify({ action: "hello", groupId }));
      }
      // refresh friendly name & save in recents
      try {
        const g = await getGroup({ groupId });
        const name = g?.displayName || "";
        setGroupName(name);
        addRecentGroup(groupId, name);
      } catch {
        addRecentGroup(groupId, "");
      }
      refreshOthers();
    } catch {
      showToast("Failed to join group");
    }
  };

  // Create group (friendly name -> code) + keep in recents
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      showToast("Enter a group name");
      return;
    }
    try {
      const res = await createGroup({ displayName: newGroupName.trim() });
      if (res?.groupId) {
        setGroupId(res.groupId);
        localStorage.setItem("pt_group", res.groupId);
        setGroupName(newGroupName.trim());
        setNewGroupName("");
        showToast(`Created "${res.displayName}" (code: ${res.groupId})`);
        addRecentGroup(res.groupId, res.displayName || newGroupName.trim());
        if (wsRef.current && wsRef.current.readyState === 1) {
          wsRef.current.send(JSON.stringify({ action: "hello", groupId: res.groupId }));
        }
      } else {
        showToast("Create group failed");
      }
    } catch (e) {
      showToast("Create group error");
    }
  };

  const copyInvite = async () => {
    if (!groupId) return;
    try {
      await navigator.clipboard.writeText(groupId);
      showToast("Group ID copied to clipboard");
    } catch {
      showToast("Copy failed");
    }
  };

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
            await updateLocation({ groupId, lat, lng, accuracy });
          } catch (e) {
            console.warn("updateLocation failed", e);
          }
        },
        (err) => console.warn("getCurrentPosition error", err),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );
    }

    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(refreshOthers, 3000);
  };

  const stopTracking = () => {
    setIsTracking(false);
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
  };

  const recenter = () => {
    const p = myLastSelfRef.current;
    if (mapRef.current && p) {
      mapRef.current.flyTo({ center: [p.lng, p.lat], zoom: 15, essential: true });
    }
  };

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
        },
      }));
      const fc = { type: "FeatureCollection", features };
      const src = map.getSource(OTHERS_SRC);
      if (src) src.setData(fc);
    } catch (e) {
      console.warn("getGroupLocations failed", e);
    }
  };

  const sendStatus = async (txt) => {
    setMyStatusText(txt);
    try {
      await setStatus({ groupId, status: txt });
    } catch (e) {
      console.warn("setStatus failed", e);
    }
  };

  const showToast = (text) => {
    const t = { id: Date.now() + Math.random(), text };
    setToasts((prev) => [...prev, t]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== t.id));
    }, 3500);
  };

  return (
    <div style={styles.pageOuter}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.title}>
            Real-Time Personal Tracker{groupName ? ` – ${groupName}` : ""}
          </div>
          {groupId ? <div style={styles.subTitle}>Group code: {groupId}</div> : null}
        </div>
        {username ? <div style={styles.userBadge}>Signed in as <b>{username}</b></div> : null}
      </div>

      {/* Recent groups chips */}
      {recentGroups.length > 0 && (
        <div style={styles.chipRow}>
          {recentGroups.map((g) => (
            <span
              key={g.id}
              style={styles.chip}
              onClick={() => switchToGroup(g.id)}
              title={g.name || g.id}
            >
              {g.name ? `${g.name} • ${g.id}` : g.id}
              <button
                style={styles.chipX}
                onClick={(e) => {
                  e.stopPropagation();
                  removeRecentGroup(g.id);
                }}
                aria-label="Remove group"
                title="Remove"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Controls */}
      <div style={styles.topBar}>
        {/* Create Group (friendly name -> code) */}
        <input
          placeholder="Group name"
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          style={styles.input}
        />
        <button style={{ ...styles.btn, ...styles.btnGreen }} onClick={handleCreateGroup}>
          Create
        </button>

        {/* Join by code */}
        <input
          placeholder="Group ID"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value.trim())}
          style={styles.input}
        />
        <button style={{ ...styles.btn, ...styles.btnSlate }} onClick={handleJoinGroup}>
          Join group
        </button>
        <button style={{ ...styles.btn, ...styles.btnSlate }} onClick={copyInvite}>
          Invite (copy code)
        </button>

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
          <div>Accuracy: {lastAccuracy != null ? `${lastAccuracy} m` : "—"}</div>
          <div style={styles.spacer} />
          <button style={{ ...styles.btn, ...styles.btnSlate }} onClick={recenter}>
            Re-center
          </button>
        </div>
      </div>

      {/* Toasts */}
      <div style={styles.toastWrap}>
        {toasts.map((t) => (
          <div key={t.id} style={styles.toast}>{t.text}</div>
        ))}
      </div>
    </div>
  );
}
