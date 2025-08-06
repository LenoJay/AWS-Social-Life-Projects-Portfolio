import { useEffect } from "react";
import { fetchAuthSession } from '@aws-amplify/auth';
import { LocationClient, BatchUpdateDevicePositionCommand } from "@aws-sdk/client-location";

function LocationUpdater() {
  useEffect(() => {
    const updateLocation = async () => {
      try {

        const session = await fetchAuthSession();
        const credentials = session.credentials;
        const identityId = session.identityId;

        const client = new LocationClient({
          region: "eu-central-1", // ✅ your region
          credentials,
        });

        if (!navigator.geolocation) {
          console.error("Geolocation is not supported by this browser.");
          return;
        }

        navigator.geolocation.watchPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;

            const input = {
              TrackerName: "UserLocationTracker",
              Updates: [
                {
                  DeviceId: identityId,
                  Position: [longitude, latitude],
                  SampleTime: new Date().toISOString(),
                },
              ],
            };

            const command = new BatchUpdateDevicePositionCommand(input);
            await client.send(command);

            console.log("📍 Location updated to tracker:", input);
          },
          (error) => {
            console.error("Failed to get geolocation:", error);
          },
          {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10000,
          }
        );
      } catch (err) {
        console.error("Error in location tracking setup:", err);
      }
    };

    updateLocation();
  }, []);

  return null; // no UI
}

export default LocationUpdater;
