import { LocationClient, GetMapGlyphsCommand, GetMapSpritesCommand, GetMapStyleDescriptorCommand, GetMapTileCommand } from "@aws-sdk/client-location";
import { Amplify } from "aws-amplify";
import awsExports from "../aws-exports";

Amplify.configure(awsExports);

import { Auth } from "@aws-amplify/auth";
const credentialsProvider = () => Auth.currentCredentials();
const region = awsExports.aws_project_region;
const mapName = awsExports.geo.default;

const client = new LocationClient({
  region,
  credentials: credentialsProvider,
});

export const amplifyRequestTransformer = (url, resourceType) => {
  const cleanUrl = url.split("?")[0];
  let command;
  let path = cleanUrl.split(`/${mapName}/`)[1];

  switch (resourceType) {
    case "Style":
      command = new GetMapStyleDescriptorCommand({ MapName: mapName });
      break;
    case "Sprite":
      const spriteType = cleanUrl.endsWith(".png") ? "png" : "json";
      command = new GetMapSpritesCommand({ MapName: mapName, FileName: `sprites.${spriteType}` });
      break;
    case "Glyphs":
      const fontStack = path.split("/")[1];
      const fontFile = path.split("/")[2];
      command = new GetMapGlyphsCommand({ MapName: mapName, FontStack: fontStack, FontUnicodeRange: fontFile });
      break;
    case "Tile":
      const [z, x, yExt] = path.split("/");
      const y = yExt.split(".")[0];
      const ext = yExt.split(".")[1];
      command = new GetMapTileCommand({ MapName: mapName, X: parseInt(x), Y: parseInt(y), Z: parseInt(z) });
      break;
    default:
      throw new Error(`Unsupported resource type: ${resourceType}`);
  }

  return client.send(command).then(response => {
    if (response?.Blob) {
      return response.Blob;
    } else {
      throw new Error("No Blob found in response.");
    }
  });
};

// MapLibre helpers
import maplibregl from "maplibre-gl";

export function createMap(container) {
  return new maplibregl.Map({
    container,
    style: `https://maps.geo.${region}.amazonaws.com/maps/v1/maps/${mapName}/style-descriptor`,
    center: [13.405, 52.52],
    zoom: 12,
  });
}

export function createPopup(text) {
  return new maplibregl.Popup().setText(text);
}

export function updateMapLocation(map, location, popup) {
  const marker = new maplibregl.Marker()
    .setLngLat([location.lng, location.lat])
    .setPopup(popup)
    .addTo(map);
}
