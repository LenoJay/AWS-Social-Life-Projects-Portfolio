// src/api.js
// Amplify v6 compatible. Provides named exports and a default export.

import { Amplify } from "aws-amplify";
import awsExports from "./aws-exports"; // your generated config
import { fetchAuthSession } from "aws-amplify/auth";

// Configure Amplify once (safe if invoked multiple times)
Amplify.configure(awsExports);

// -------- API base management --------
let API_BASE =
  process.env.REACT_APP_API_BASE_URL ||
  window.__API_BASE__ || // optional runtime override in index.html
  "";

export function setApiBase(url) {
  API_BASE = (url || "").replace(/\/+$/, ""); // strip trailing slash(es)
}

export function getApiBase() {
  return API_BASE;
}

// -------- ID token for Cognito User Pool (JWT authorizer) --------
async function getIdToken() {
  try {
    const { tokens } = await fetchAuthSession();
    return tokens?.idToken?.toString() || "";
  } catch {
    return "";
  }
}

// -------- generic fetch wrapper --------
async function apiRequest(method, path, body, withAuth = true) {
  if (!API_BASE) {
    throw new Error(
      "API base URL not set. Put REACT_APP_API_BASE_URL in .env or call setApiBase(...)."
    );
  }

  const headers = { "Content-Type": "application/json" };
  if (withAuth) {
    const token = await getIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return data;
}

// -------- concrete API helpers (match your routes) --------

// POST /CreateGroup
export async function createGroup(displayNameOrId) {
  // Back end expects { groupId, ownerId? }. Use provided text as groupId/displayName.
  // If your Lambda expects different fields, tweak here.
  return apiRequest(
    "POST",
    "/CreateGroup",
    { groupId: String(displayNameOrId).trim() },
    true
  );
}

// POST /JoinGroup
export async function joinGroup(groupId) {
  return apiRequest(
    "POST",
    "/JoinGroup",
    { groupId: String(groupId).trim() },
    true
  );
}

// GET /GetGroupLocations?groupId=...
export async function getGroupLocations(groupId) {
  const qs = new URLSearchParams({ groupId: String(groupId).trim() }).toString();
  return apiRequest("GET", `/GetGroupLocations?${qs}`, undefined, true);
}

// Optional convenience alias used in your code
export async function getGroup(groupId) {
  return getGroupLocations(groupId);
}

// Your UI calls getMyGroup() on load. If you don’t have a backend
// endpoint for “my current group”, return null so the UI stays graceful.
export async function getMyGroup() {
  return null;
}

// POST /SetStatus
export async function setStatus({ groupId, status }) {
  return apiRequest(
    "POST",
    "/SetStatus",
    { groupId: String(groupId).trim(), status },
    true
  );
}

// POST /UpdateLocation
export async function updateLocation({ groupId, lat, lng, timestamp }) {
  return apiRequest(
    "POST",
    "/UpdateLocation",
    {
      groupId: String(groupId).trim(),
      lat,
      lng,
      timestamp: timestamp || Date.now(),
    },
    true
  );
}

// Keep a default export for legacy imports
const api = {
  setApiBase,
  getApiBase,
  createGroup,
  joinGroup,
  getGroup,
  getMyGroup,
  getGroupLocations,
  setStatus,
  updateLocation,
};

export default api;
