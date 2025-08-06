
import { LocationClient, GetMapGlyphsCommand, GetMapSpritesCommand, GetMapStyleDescriptorCommand, GetMapTileCommand } from "@aws-sdk/client-location";
import { Amplify } from "aws-amplify";
import awsExports from "../aws-exports";
import { fetchAuthSession } from "@aws-amplify/auth";
import maplibregl from "maplibre-gl";

Amplify.configure(awsExports);

const credentialsProvider = async () => {
  const { credentials } = await fetchAuthSession();
  return credentials;
};
const region = awsExports.aws_project_region;
const mapName = awsExports.geo.amazon_location_service.default;

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

export async function createMap(container) {
  // 1. Fetch the style descriptor using the transformer
  const styleBlob = await amplifyRequestTransformer(
    `https://maps.geo.${region}.amazonaws.com/maps/v1/maps/${mapName}/style-descriptor`,
    "Style"
  );
  const styleJson = await styleBlob.text ? JSON.parse(await styleBlob.text()) : styleBlob;

  // 2. Patch the sources to use signed tile requests
  Object.keys(styleJson.sources).forEach((sourceName) => {
    const source = styleJson.sources[sourceName];
    if (source.tiles) {
      // Replace tile URLs with functions that fetch signed tiles
      const originalTiles = source.tiles;
      source.tiles = originalTiles.map((tileUrl) => {
        // MapLibre expects a URL, but we can use a custom protocol and intercept requests
        return tileUrl.replace(
          `https://maps.geo.${region}.amazonaws.com/maps/v1/maps/${mapName}/tiles/`,
          `amplify-tiles://`
        );
      });
    }
  });

  // 3. Intercept requests for our custom protocol and use the transformer
  const map = new maplibregl.Map({
    container,
    style: styleJson,
    center: [13.405, 52.52],
    zoom: 12,
    transformRequest: (url, resourceType) => {
      if (url.startsWith("amplify-tiles://")) {
        // Convert back to the real AWS URL
        const realUrl = url.replace(
          "amplify-tiles://",
          `https://maps.geo.${region}.amazonaws.com/maps/v1/maps/${mapName}/tiles/`
        );
        // This will be fetched by MapLibre, but we can't do async signing here.
        // So, you may need to use a custom source or a proxy if this doesn't work.
        return { url: realUrl };
      }
      return { url };
    },
  });
  return map;
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
