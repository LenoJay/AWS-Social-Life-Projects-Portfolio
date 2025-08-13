import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { createMap } from "maplibre-gl-js-amplify";
import * as turf from "@turf/turf";
import { updateLocation, getGroupLocations, setStatus, joinGroup } from "../api"; // adjust path if needed

// London default
const DEFAULT_CENTER = [-0.1276, 51.5074]; // [lng, lat]
const DEFAULT_ZOOM = 12;

function MapComponent() {
  const mapRef = useRef(null);
  const mapDivRef = useRef(null);

  const myMarkerRef = useRef(null);
  const myAccuracyRef = useRef(null);

  const trailCoordsRef = useRef([]); // [[lng,lat], ...]
  const trailSourceId = "my-trail-source";
  const trailLayerId = "my-trail-line";

  const othersRef = useRef({}); // userId -> { marker, bubble }
  const pollTimerRef = useRef(null);

  const [isTracking, setIsTracking] = useState(false);
  const [myStatusText, setMyStatusText] = useState("idle");
  const [groupId, setGroupId] = useState(""); // set this somewhere in your UI if you want to join

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
        // Add empty source for trail (we will set data later)
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
        // Cleanly remove layers/sources we added
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
      // Show nothing when < 2 points
      src.setData(turf.featureCollection([]));
    }
  };

  // ----- GEOLOCATION: Start / Stop -----
  const startTracking = async () => {
    setIsTracking(true);
    // If you have a default group to join, do it here
    try {
      if (groupId) {
        await joinGroup({ groupId });
      }
    } catch (_) {}

    // First position update to center
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { longitude: lng, latitude: lat, accuracy } = pos.coords;
          renderSelf(lng, lat, accuracy);
          mapRef.current?.flyTo({ center: [lng, lat], zoom: 15, essential: true });
          // push trail point
          trailCoordsRef.current.push([lng, lat]);
          updateTrail();

          // send to backend
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

    // Start polling other users every 5s
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(refreshOthers, 5000);
  };

  const stopTracking = () => {
    setIsTracking(false);
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
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
        el.style.background = "#ef4444"; // red for others
        el.style.boxShadow = "0 0 0 2px #fff";
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);

        // bubble (status)
        const bubble = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
          .setLngLat([lng, lat])
          .setHTML(`<div style="padding:4px 8px;border-radius:8px;background:#111;color:#fff;font-size:12px">${u.status || ""}</div>`)
          .addTo(map);

        existing[key] = { marker, bubble };
      } else {
        existing[key].marker.setLngLat([lng, lat]);
        existing[key].bubble.setLngLat([lng, lat]).setHTML(
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
    <div style={{ height: "100%", width: "100%" }}>
      <div style={{ padding: 8, display: "flex", gap: 8 }}>
        <input
          placeholder="Group ID"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value.trim())}
          style={{ padding: "6px 8px", border: "1px solid #ddd", borderRadius: 6 }}
        />
        {!isTracking ? (
          <button onClick={startTracking}>Start tracking</button>
        ) : (
          <button onClick={stopTracking}>Stop tracking</button>
        )}
        <button onClick={() => sendStatus("OMW!")}>OMW!</button>
        <button onClick={() => sendStatus("I'm safe")}>I'm safe</button>
        <button onClick={() => sendStatus("Need help")}>Need help</button>
        <div style={{ marginLeft: 8 }}>Status: {myStatusText}</div>
      </div>

      <div ref={mapDivRef} style={{ height: "calc(100% - 48px)", width: "100%" }} />
    </div>
  );
}

export default MapComponent;
