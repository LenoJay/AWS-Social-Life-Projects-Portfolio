import React, { useEffect, useRef } from "react";
import { Amplify } from "aws-amplify";
import awsExports from "../aws-exports";
import { createMap } from "maplibre-gl-js-amplify"; // ✅ does the auth/signing for Amazon Location
import "maplibre-gl/dist/maplibre-gl.css";

Amplify.configure(awsExports);

export default function MapComponent() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        // Use the exact keys from your aws-exports.js
        const region = awsExports.aws_project_region; // "eu-central-1"
        const identityPoolId = awsExports.aws_cognito_identity_pool_id; // "eu-central-1:xxxx-...."
        const mapRegion =
          awsExports.geo?.amazon_location_service?.region || region; // "eu-central-1"
        const mapName =
          awsExports.geo?.amazon_location_service?.maps?.default; // "PersonalTrackerMap-dev"

        if (!region || !identityPoolId || !mapRegion || !mapName) {
          console.error("[Map] Missing config:", {
            region,
            identityPoolId,
            mapRegion,
            mapName,
          });
          return;
        }

        // createMap returns a configured MapLibre-gl map with SigV4 signing wired up
        const map = await createMap({
          container: mapContainer.current,
          center: [0, 0],
          zoom: 2,
          region: mapRegion,         // where the map resource lives
          identityPoolId,            // for auth/signed requests
          mapName,                   // "PersonalTrackerMap-dev"
        });

        if (!isMounted) {
          map?.remove();
          return;
        }

        mapRef.current = map;
        map.on("load", () => console.log("[Map] load event fired"));
        map.on("error", (e) => console.error("[Map] map error", e?.error ?? e));
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
