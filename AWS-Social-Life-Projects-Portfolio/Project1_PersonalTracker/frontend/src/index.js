import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { Amplify } from "aws-amplify";
import { getCurrentUser } from "@aws-amplify/auth";
import awsExports from "../aws-exports";
import * as turf from "@turf/turf";
import "maplibre-gl/dist/maplibre-gl.css";

const MapComponent = () => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [lng, setLng] = useState(0);
  const [lat, setLat] = useState(0);
  const [zoom, setZoom] = useState(2);

  useEffect(() => {
    // Get the current user's location using AWS Amplify Auth
    const fetchUserLocation = async () => {
      try {
        const user = await getCurrentUser();
        if (user && user.attributes && user.attributes['custom:location']) {
          const location = JSON.parse(user.attributes['custom:location']);
          setLng(location.coordinates[0]);
          setLat(location.coordinates[1]);
          setZoom(10); // Zoom in when user location is available
        }
      } catch (error) {
        console.error("Error fetching user location:", error);
      }
    };

    fetchUserLocation();
  }, []);

  useEffect(() => {
    if (map.current) return; // initialize map only once

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [lng, lat],
      zoom: zoom,
    });

    // Add navigation control (zoom buttons) to the map
    map.current.addControl(new maplibregl.NavigationControl(), "top-right");

    // Cleanup on unmount
    return () => map.current.remove();
  }, []);

  useEffect(() => {
    if (!map.current) return; // wait for the map to initialize
    map.current.setCenter([lng, lat]);
  }, [lng, lat]);

  return <div ref={mapContainer} style={{ width: "100%", height: "100vh" }} />;
};

export default MapComponent;