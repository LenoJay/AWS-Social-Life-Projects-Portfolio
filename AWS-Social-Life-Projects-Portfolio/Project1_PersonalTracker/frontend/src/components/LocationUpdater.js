// src/components/LocationUpdater.js
import { useEffect } from "react";
import { fetchAuthSession } from "@aws-amplify/auth";
import {
  LocationClient,
  BatchUpdateDevicePositionCommand,
} from "@aws-sdk/client-location";
import awsExports from "../aws-exports";

// ✅ Change this to your actual Amazon Location tracker name
const TRACKER_NAME = "PersonalTracker";

// How often to send updates (ms)
const UPDATE_INTERVAL_MS = 15_000; // 15s is usually fine for testing

export default function LocationUpdater() {
  useEffect(() => {
    let isMounted = true;
    let timerId;

    const start = async () => {
      try {
        // Get Cognito identity + temporary AWS credentials from Amplify
        const session = await fetchAuthSession();
        const { credentials, identityId } = session;

        if (!credentials || !identityId) {
          console.warn(
            "[LocationUpdater] Missing credentials/identity. Are you signed in?"
          );
          return;
        }

        // Use the region from your aws-exports.js so everything stays in sync
        const region =
          awsExports.aws_project_region ||
          awsExports.aws_cognito_region ||
          awsExports.region;

        if (!region) {
          console.error(
            "[LocationUpdater] Region not found in aws-exports.js. Aborting."
          );
          return;
        }

        // Create an Amazon Location client with the signed credentials
        const client = new LocationClient({
          region,
          credentials: {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            sessionToken: credentials.sessionToken,
            expiration: credentials.expiration,
          },
        });

        const sendUpdate = async (lng, lat) => {
          try {
            const cmd = new BatchUpdateDevicePositionCommand({
              TrackerName: TRACKER_NAME,
              Updates: [
                {
                  DeviceId: identityId,
                  Position: [lng, lat], // [longitude, latitude]
                  SampleTime: new Date().toISOString(),
                },
              ],
            });

            const res = await client.send(cmd);
            if (res.Errors && res.Errors.length) {
              console.error(
                "[LocationUpdater] BatchUpdateDevicePosition errors:",
                res.Errors
              );
            } else {
              // console.log("[LocationUpdater] Position updated:", { lng, lat });
            }
          } catch (err) {
            console.error("[LocationUpdater] Update failed:", err);
          }
        };

        const updateFromNavigator = () => {
          if (!("geolocation" in navigator)) {
            console.warn(
              "[LocationUpdater] Geolocation not available in this browser."
            );
            return;
          }

          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const { latitude, longitude } = pos.coords;
              sendUpdate(longitude, latitude);
            },
            (err) => {
              console.warn("[LocationUpdater] Geolocation error:", err);
            },
            { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
          );
        };

        // Kick off immediately, then on an interval
        updateFromNavigator();
        timerId = setInterval(updateFromNavigator, UPDATE_INTERVAL_MS);
      } catch (e) {
        console.error("[LocationUpdater] init error:", e);
      }
    };

    if (isMounted) start();

    return () => {
      isMounted = false;
      if (timerId) clearInterval(timerId);
    };
  }, []);

  // This component has no UI; it just runs side effects
  return null;
}
