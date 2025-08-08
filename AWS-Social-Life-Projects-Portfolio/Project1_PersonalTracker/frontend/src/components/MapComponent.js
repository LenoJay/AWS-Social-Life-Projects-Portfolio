import React, { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Amplify } from "aws-amplify";
import awsExports from "../aws-exports";
import { withIdentityPool } from "@aws/amazon-location-utilities-auth-helper";

Amplify.configure(awsExports);

function MapComponent() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        const region = awsExports.aws_project_region;
        const identityPoolId = awsExports.cognito_identity_pool_id; // NOTE: exact key in your aws-exports.js
        const mapName =
          awsExports?.geo?.amazon_location_service?.maps?.default;

        console.log("[Map] Config", { region, identityPoolId, mapName });

        if (!region || !identityPoolId || !mapName) {
          console.error(
            "[Map] Missing config. Check aws-exports.js values above are not undefined."
          );
          return;
        }

        // Create the signing helper (this MUST succeed for map tiles to load)
        const authHelper = await withIdentityPool({
          identityPoolId,
          region,
        });

        console.log("[Map] Auth helper ready");

        if (!isMounted || !mapContainer.current) return;

        const styleUrl = `https://maps.geo.${region}.amazonaws.com/maps/v0/maps/${encodeURIComponent(
          mapName
        )}/style-descriptor`;

        console.log("[Map] Style URL", styleUrl);

        const map = new maplibregl.Map({
          container: mapContainer.current,
          style: styleUrl,
          center: [0, 0],
          zoom: 2,
          transformRequest: authHelper.transformRequest,
        });

        mapRef.current = map;

        map.on("load", () => {
          console.log("[Map] load event fired");
        });

        map.on("error", (e) => {
          console.error("[Map] map error", e && e.error ? e.error : e);
        });

        // Optional: center on current position
        if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const { latitude, longitude } = pos.coords;
              console.log("[Map] Geolocation", { latitude, longitude });
              map.jumpTo({ center: [longitude, latitude], zoom: 12 });
              new maplibregl.Marker().setLngLat([longitude, latitude]).addTo(map);
            },
            (err) => console.warn("[Map] Geolocation error", err),
            { enableHighAccuracy: true }
          );
        }
      } catch (e) {
        console.error("[Map] init exception", e);
      }
    }

    if (!mapRef.current) init();

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={mapContainer}
      style={{ width: "100%", height: "500px", borderRadius: "12px", background: "#111" }}
    />
  );
}

export default MapComponent;
