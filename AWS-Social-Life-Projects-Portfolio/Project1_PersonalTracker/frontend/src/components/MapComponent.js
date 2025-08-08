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
        // Log the whole config so we can verify exact keys
        console.log("[Map] awsExports:", awsExports);

        // Be robust to different key names
        const region =
          awsExports.aws_project_region ||
          awsExports.aws_cognito_region ||
          awsExports.region;

        const identityPoolId =
          awsExports.cognito_identity_pool_id ||
          awsExports.aws_cognito_identity_pool_id ||
          awsExports.identityPoolId;

        const geoCfg =
          awsExports?.geo?.amazon_location_service ||
          awsExports?.amazon_location_service ||
          {};

        const mapRegion = geoCfg.region || region; // map service region
        const mapName =
          geoCfg?.maps?.default ||
          geoCfg?.defaultMap ||
          awsExports?.maps?.default;

        console.log("[Map] Resolved config:", {
          region,
          mapRegion,
          identityPoolId,
          mapName,
        });

        if (!region || !mapRegion || !identityPoolId || !mapName) {
          console.error(
            "[Map] Missing config. One of region/mapRegion/identityPoolId/mapName is undefined."
          );
          return;
        }

        const authHelper = await withIdentityPool({
          identityPoolId,
          region, // identity (Cognito) region
        });

        if (!isMounted || !mapContainer.current) return;

        const styleUrl = `https://maps.geo.${mapRegion}.amazonaws.com/maps/v0/maps/${encodeURIComponent(
          mapName
        )}/style-descriptor`;

        console.log("[Map] Style URL:", styleUrl);

        const map = new maplibregl.Map({
          container: mapContainer.current,
          style: styleUrl,
          center: [0, 0],
          zoom: 2,
          transformRequest: authHelper.transformRequest,
        });

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

export default MapComponent;
