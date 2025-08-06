
import { LocationClient, GetMapGlyphsCommand, GetMapSpritesCommand, GetMapStyleDescriptorCommand, GetMapTileCommand } from "@aws-sdk/client-location";
import { Amplify } from "aws-amplify";
import awsExports from "../aws-exports";
import { fetchAuthSession } from "@aws-amplify/auth";
import maplibregl from "maplibre-gl";

Amplify.configure(awsExports);

const credentialsProvider = async () => {
  const session = await fetchAuthSession();
  const creds = session.credentials;
  if (!creds || !creds.accessKeyId || !creds.secretAccessKey) {
    console.error("[AWS] No valid credentials found in fetchAuthSession()! Session:", session);
    throw new Error("AWS credentials are missing. Make sure the user is signed in and Amplify is configured correctly.");
  }
  return {
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken,
    expiration: creds.expiration,
  };
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

  // 2. Remove the raster tile source from the style (we'll add it manually)
  let rasterSourceName = null;
  for (const [sourceName, source] of Object.entries(styleJson.sources)) {
    if (source.type === "raster" && source.tiles && source.tiles[0].includes("tiles")) {
      rasterSourceName = sourceName;
      delete styleJson.sources[sourceName];
      break;
    }
  }

  // 3. Create the map with the modified style
  const map = new maplibregl.Map({
    container,
    style: styleJson,
    center: [13.405, 52.52],
    zoom: 12,
  });

  // 4. Add the raster tile source with a custom tile loader
  map.on("load", () => {
    if (!rasterSourceName) return;
    map.addSource(rasterSourceName, {
      type: "raster",
      tiles: [
        // This is a dummy URL, we will override tile loading below
        `https://dummy/{z}/{x}/{y}`
      ],
      tileSize: 256,
    });

    // Override the tile loading
    map.style.sourceCaches[rasterSourceName]._tileCache.clear();
    map.style.sourceCaches[rasterSourceName].loadTile = async function(tile, callback) {
      const z = tile.tileID.z;
      const x = tile.tileID.x;
      const y = tile.tileID.y;
      const url = `https://maps.geo.${region}.amazonaws.com/maps/v1/maps/${mapName}/tiles/${z}/${x}/${y}`;
      try {
        const blob = await amplifyRequestTransformer(url, "Tile");
        const objectUrl = URL.createObjectURL(blob);
        const image = new window.Image();
        image.crossOrigin = "anonymous";
        image.onload = function() {
          URL.revokeObjectURL(objectUrl);
          callback(null, image);
        };
        image.onerror = function(e) {
          callback(e, null);
        };
        image.src = objectUrl;
      } catch (e) {
        callback(e, null);
      }
    };
    // Add the raster layer back
    map.addLayer({
      id: rasterSourceName,
      type: "raster",
      source: rasterSourceName,
    });
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
