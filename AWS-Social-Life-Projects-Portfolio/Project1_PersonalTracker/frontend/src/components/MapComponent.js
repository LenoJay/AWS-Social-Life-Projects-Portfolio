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
        const region = awsExports.aws_project_region; // e.g. "eu-central-1"
        // IMPORTANT: in your aws-exports.js the key is "cognito_identity_pool_id"
        const identityPoolId = awsExports.cognito_identity_pool_id;
        // Default map name from Amplify Geo config
        const mapName =
          awsExports?.geo?.amazon_location_service?.maps?.default;

        if (!region || !identityPoolId || !mapName) {
          console.error("Missing config:", {
            region,
            identityPoolId,
            mapName,
          });
          return;
        }

        // Auth helper that signs Amazon Location requests
        const authHelper = await withIdentityPool({
          identityPoolId,
          region,
        });

        if (!isMounted || !mapContainer.current) return;

        const map = new maplibregl.Map({
          container: mapContainer.current,
          style: `https://maps.geo.${region}.amazonaws.com/maps/v0/maps/${encodeURIComponent(
            mapName
          )}/style-descriptor`,
          center: [0, 0],
          zoom: 2,
          transformRequest: authHelper.transformRequest,
        });

        mapRef.current = map;

        // Optional: zoom to current user position
        if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const { latitude, longitude } = pos.coords;
              map.jumpTo({ center: [longitude, latitude], zoom: 12 });
              new maplibregl.Marker().setLngLat([longitude, latitude]).addTo(map);
            },
            (err) => console.warn("Geolocation error:", err),
            { enableHighAccuracy: true }
          );
        }
      } catch (e) {
        console.error("Map init error (likely missing creds):", e);
      }
    }

    if (!mapRef.current) {
      init();
    }

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
      style={{ width: "100%", height: "500px", borderRadius: "12px" }}
    />
  );
}

export default MapComponent;
