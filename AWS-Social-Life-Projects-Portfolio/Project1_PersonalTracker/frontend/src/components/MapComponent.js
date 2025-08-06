import React, { useEffect, useRef } from "react";
import {
  createMap,
  createPopup,
  updateMapLocation,
} from "./amazon-location-helpers-maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

function MapComponent() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (mapRef.current) return;

    const setupMap = async () => {
      const map = await createMap(mapContainer.current);
      mapRef.current = map;

      // Simulated device location
      const deviceLocation = {
        lat: 52.52,
        lng: 13.405,
      };

      const popup = createPopup("Device Location");
      updateMapLocation(map, deviceLocation, popup);
    };

    setupMap();
  }, []);

  return (
    <div>
      <div
        ref={mapContainer}
        style={{ width: "100%", height: "500px", borderRadius: "12px" }}
      />
    </div>
  );
}

export default MapComponent;
