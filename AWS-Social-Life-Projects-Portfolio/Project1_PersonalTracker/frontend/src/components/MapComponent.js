// src/components/MapComponent.js
import React, { useEffect, useRef, useState } from "react";
import { Amplify } from "aws-amplify";
import awsExports from "../aws-exports";
import { createMap } from "maplibre-gl-js-amplify";
import "maplibre-gl/dist/maplibre-gl.css";
import { startLocationUpdates, stopLocationUpdates, isRunning } from "./LocationUpdater";

// Configure Amplify (reads your Cognito + Location settings)
Amplify.configure(awsExports);

export default function MapComponent() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | ready | tracking

  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        // Center over London, UK
        const map = await createMap({
          container: mapContainerRef.current,
          center: [-0.1276, 51.5074], // London
          zoom: 12,
        });

        if (disposed) return;
        mapRef.current = map;

        map.on("load", () => {
          setStatus("ready");
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
    };
  }, []);

  const handleStart = () => {
    if (!mapRef.current) return;
    if (!isRunning()) {
      try {
        startLocationUpdates(mapRef.current, { follow: true });
        setStatus("tracking");
      } catch (e) {
        console.error(e);
        alert(e.message);
      }
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
    if (src && src._data?.features?.[0]?.geometry?.coordinates) {
      const [lng, lat] = src._data.features[0].geometry.coordinates;
      map.easeTo({ center: [lng, lat], duration: 600 });
    } else {
      // If we don't have a live position yet, recenter back to London
      map.easeTo({ center: [-0.1276, 51.5074], duration: 600 });
    }
  };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div
        ref={mapContainerRef}
        style={{ width: "100%", height: "520px", borderRadius: 12, background: "#111" }}
      />

      <div
        style={{
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
        }}
      >
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
          Recenter
        </button>
        <span style={{ opacity: 0.8 }}>
          Status: <strong>{status}</strong>
        </span>
      </div>
    </div>
  );
}

const btnStyle = {
  background: "#0EA5E9",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "6px 10px",
  cursor: "pointer",
};
