import { fetchAuthSession } from "@aws-amplify/auth";
const BASE = "https://gogr7cxttb.execute-api.eu-central-1.amazonaws.com/dev";

async function authFetch(path, opts = {}) {
  const sess = await fetchAuthSession();
  const idToken = sess.tokens?.idToken?.toString();
  const headers = { "Content-Type": "application/json", Authorization: idToken, ...(opts.headers || {}) };
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

export const updateLocation = (p) => authFetch("/update-location", { method: "POST", body: JSON.stringify(p) });
export const getGroupLocations = ({ groupId }) => authFetch(`/get-group-locations?groupId=${encodeURIComponent(groupId)}`);
export const setStatus = (p) => authFetch("/set-status", { method: "POST", body: JSON.stringify(p) });
