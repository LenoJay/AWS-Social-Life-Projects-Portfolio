// src/api.js
import { fetchAuthSession } from "@aws-amplify/auth";

// Use your *full* Invoke URL incl. stage (you already have this)
const BASE = "https://gogr7cxttb.execute-api.eu-central-1.amazonaws.com/dev";

async function authFetch(path, opts = {}) {
  const sess = await fetchAuthSession();
  const idToken = sess.tokens?.idToken?.toString();
  if (!idToken) throw new Error("Not authenticated");
  const headers = { "Content-Type": "application/json", Authorization: idToken, ...(opts.headers || {}) };
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  // Some endpoints might return no content; try to JSON-parse safely
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

export function joinGroup({ groupId, userId }) {
  // Only call this if you have a /join-group route; otherwise skip and add membership in DynamoDB manually.
  return authFetch("/join-group", {
    method: "POST",
    body: JSON.stringify({ groupId, userId }),
  });
}

export function updateLocation({ groupId, lat, lng, status }) {
  return authFetch("/update-location", {
    method: "POST",
    body: JSON.stringify({ groupId, lat, lng, status }),
  });
}

export function getGroupLocations({ groupId }) {
  return authFetch(`/get-group-locations?groupId=${encodeURIComponent(groupId)}`, { method: "GET" });
}

export function setStatus({ groupId, status }) {
  return authFetch("/set-status", {
    method: "POST",
    body: JSON.stringify({ groupId, status }),
  });
}
