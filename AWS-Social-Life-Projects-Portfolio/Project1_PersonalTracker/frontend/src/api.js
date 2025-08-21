// App.js
import React, { useEffect, useState } from "react";
import { Auth, Hub } from "aws-amplify";

// NOTE: these helpers must exist in your ./api.js (you already uploaded them)
import {
  createGroup,
  joinGroup,
  getGroup,               // (optional – used by the “Fetch Group” button)
  getGroupLocations,      // (optional – used by the “Fetch Group Locations” button)
  setStatus,              // (optional)
  updateLocation          // (optional)
} from "./api";

/**
 * Small banner that shows whether you’re signed in and gives
 * Sign in / Sign out buttons. It uses the Hosted UI.
 */
function SignInBar() {
  const [user, setUser] = useState(null);

  const refreshUser = async () => {
    try {
      const u = await Auth.currentAuthenticatedUser();
      setUser({ username: u.username });
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    // Initial check
    refreshUser();

    // React to auth events (signIn, signOut, etc.)
    const unsub = Hub.listen("auth", ({ payload: { event } }) => {
      if (event === "signIn" || event === "tokenRefresh") refreshUser();
      if (event === "signOut") setUser(null);
    });
    return () => unsub();
  }, []);

  const handleSignIn = async () => {
    // Triggers Cognito Hosted UI
    await Auth.federatedSignIn();
  };

  const handleSignOut = async () => {
    await Auth.signOut({ global: true });
    setUser(null);
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        padding: "8px 12px",
        background: "#f6f8fa",
        borderBottom: "1px solid #eaecef",
        position: "sticky",
        top: 0,
        zIndex: 1
      }}
    >
      <strong>User:</strong>{" "}
      {user ? <span>{user.username}</span> : <span>Not signed in</span>}
      <div style={{ marginLeft: "auto" }}>
        {user ? (
          <button onClick={handleSignOut}>Sign out</button>
        ) : (
          <button onClick={handleSignIn}>Sign in</button>
        )}
      </div>
    </div>
  );
}

export default function App() {
  // Form state
  const [displayName, setDisplayName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [status, setStatusText] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  // Results
  const [lastResponse, setLastResponse] = useState(null);
  const [groupInfo, setGroupInfo] = useState(null);
  const [locations, setLocations] = useState(null);

  // Helpers to show JSON
  const show = (obj) => JSON.stringify(obj, null, 2);

  // —— Button handlers ——

  const handleCreateGroup = async () => {
    try {
      if (!displayName.trim()) {
        alert("Please enter your display name first.");
        return;
      }
      const res = await createGroup({ displayName: displayName.trim() });
      setLastResponse(res);
      if (res?.groupId) setGroupId(res.groupId);
    } catch (err) {
      console.error(err);
      setLastResponse({ error: err?.message || "Create group failed" });
    }
  };

  const handleJoinGroup = async () => {
    try {
      if (!groupId.trim() || !displayName.trim()) {
        alert("Group ID and display name are required.");
        return;
      }
      const res = await joinGroup({
        groupId: groupId.trim(),
        displayName: displayName.trim(),
      });
      setLastResponse(res);
    } catch (err) {
      console.error(err);
      setLastResponse({ error: err?.message || "Join group failed" });
    }
  };

  const handleFetchGroup = async () => {
    try {
      if (!groupId.trim()) {
        alert("Enter a Group ID first.");
        return;
      }
      const res = await getGroup(groupId.trim());
      setGroupInfo(res);
    } catch (err) {
      console.error(err);
      setGroupInfo({ error: err?.message || "Get group failed" });
    }
  };

  const handleFetchLocations = async () => {
    try {
      if (!groupId.trim()) {
        alert("Enter a Group ID first.");
        return;
      }
      const res = await getGroupLocations(groupId.trim());
      setLocations(res);
    } catch (err) {
      console.error(err);
      setLocations({ error: err?.message || "Get locations failed" });
    }
  };

  const handleSetStatus = async () => {
    try {
      if (!status.trim()) {
        alert("Enter a status message first.");
        return;
      }
      const res = await setStatus({ status: status.trim() });
      setLastResponse(res);
    } catch (err) {
      console.error(err);
      setLastResponse({ error: err?.message || "Set status failed" });
    }
  };

  const handleUpdateLocation = async () => {
    try {
      const latNum = Number(lat);
      const lngNum = Number(lng);
      if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
        alert("Enter numeric latitude and longitude.");
        return;
      }
      const res = await updateLocation({ latitude: latNum, longitude: lngNum });
      setLastResponse(res);
    } catch (err) {
      console.error(err);
      setLastResponse({ error: err?.message || "Update location failed" });
    }
  };

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      {/* 👇 Render this ONCE near the top */}
      <SignInBar />

      <main style={{ maxWidth: 900, margin: "24px auto", padding: "0 16px" }}>
        <h1>PersonalTracker – Test Panel</h1>

        {/* Inputs */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span>Display name</span>
            <input
              type="text"
              placeholder="e.g. Leno"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span>Group ID</span>
            <input
              type="text"
              placeholder="Paste a groupId"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span>Status</span>
            <input
              type="text"
              placeholder="e.g. On my way!"
              value={status}
              onChange={(e) => setStatusText(e.target.value)}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span>Latitude</span>
              <input
                type="text"
                placeholder="52.52"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span>Longitude</span>
              <input
                type="text"
                placeholder="13.405"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
              />
            </label>
          </div>
        </section>

        {/* Actions */}
        <section style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 28 }}>
          <button onClick={handleCreateGroup}>Create Group</button>
          <button onClick={handleJoinGroup}>Join Group</button>
          <button onClick={handleFetchGroup}>Fetch Group</button>
          <button onClick={handleFetchLocations}>Fetch Group Locations</button>
          <button onClick={handleSetStatus}>Set Status</button>
          <button onClick={handleUpdateLocation}>Update Location</button>
        </section>

        {/* Results */}
        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <h3>Last Response</h3>
            <pre
              style={{
                background: "#0f172a",
                color: "#e5e7eb",
                padding: 12,
                borderRadius: 8,
                minHeight: 120,
                overflowX: "auto",
              }}
            >
              {show(lastResponse || {})}
            </pre>
          </div>
          <div>
            <h3>Group</h3>
            <pre
              style={{
                background: "#0f172a",
                color: "#e5e7eb",
                padding: 12,
                borderRadius: 8,
                minHeight: 120,
                overflowX: "auto",
              }}
            >
              {show(groupInfo || {})}
            </pre>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <h3>Locations</h3>
            <pre
              style={{
                background: "#0f172a",
                color: "#e5e7eb",
                padding: 12,
                borderRadius: 8,
                minHeight: 120,
                overflowX: "auto",
              }}
            >
              {show(locations || {})}
            </pre>
          </div>
        </section>

        {/* If you have a Map component in your project, render it below.
            Leaving this as a comment so we don't disturb your current setup. */}
        {/* <Map groupId={groupId} locations={locations} /> */}
      </main>
    </div>
  );
}
