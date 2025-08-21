// src/api.js
import { Auth } from "aws-amplify";

const RAW_BASE = process.env.REACT_APP_API_BASE_URL || "";
// normalize: drop trailing slash
const BASE_URL = RAW_BASE.replace(/\/+$/, "");

async function authHeader() {
  // Grab the Cognito *ID* token (JWT) from the current session
  const session = await Auth.currentSession();
  const idToken = session.getIdToken().getJwtToken();
  return { Authorization: idToken };
}

async function http(method, path, body) {
  const headers = {
    "Content-Type": "application/json",
    ...(await authHeader()),
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Try to parse JSON, but surface useful errors if not
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

/** POST /CreateGroup { displayName } */
export function createGroup(displayName) {
  return http("POST", "/CreateGroup", { displayName });
}

/** POST /JoinGroup { groupId } */
export function joinGroup(groupId) {
  return http("POST", "/JoinGroup", { groupId });
}

/** GET /GetGroupLocations?groupId=... */
export function getGroupLocations(groupId) {
  const qs = groupId ? `?groupId=${encodeURIComponent(groupId)}` : "";
  return http("GET", `/GetGroupLocations${qs}`);
}

/** POST /SetStatus { status } */
export function setStatus(status) {
  return http("POST", "/SetStatus", { status });
}

/** POST /UpdateLocation { lat, lon } */
export function updateLocation(lat, lon) {
  return http("POST", "/UpdateLocation", { lat, lon });
}
