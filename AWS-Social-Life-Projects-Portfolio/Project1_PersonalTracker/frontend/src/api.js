import { fetchAuthSession } from "@aws-amplify/auth";

const BASE = "https://YOUR_API_ID.execute-api.eu-central-1.amazonaws.com/dev"; // replace with your API URL

async function authFetch(path, opts = {}) {
  const sess = await fetchAuthSession();
  const idToken = sess.tokens?.idToken?.toString();
  const headers = {
    "Content-Type": "application/json",
    Authorization: idToken,
    ...(opts.headers || {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const t = await res.text();
  return t ? JSON.parse(t) : {};
}

// --- NEW: Create a group ---
export function createGroup({ displayName }) {
  return authFetch("/create-group", {
    method: "POST",
    body: JSON.stringify({ displayName }),
  });
}

// --- NEW: Fetch group friendly name ---
export function getGroup({ groupId }) {
  return authFetch(`/group?groupId=${encodeURIComponent(groupId)}`);
}

// --- Update location with TTL ---
export function updateLocation({ groupId, lat, lng, accuracy, status }) {
  const ttlSeconds = 15 * 60; // 15 minutes
  const expireAt = Math.floor(Date.now() / 1000) + ttlSeconds;

  return authFetch("/update-location", {
    method: "POST",
    body: JSON.stringify({
      groupId,
      lat,
      lng,
      accuracy,
      status,
      expireAt, // pass TTL to backend
    }),
  });
}

// --- Existing ---
export const getGroupLocations = ({ groupId }) =>
  authFetch(`/get-group-locations?groupId=${encodeURIComponent(groupId)}`);

export const setStatus = (p) =>
  authFetch("/set-status", { method: "POST", body: JSON.stringify(p) });

export const joinGroup = (p) =>
  authFetch("/join-group", { method: "POST", body: JSON.stringify(p) });
