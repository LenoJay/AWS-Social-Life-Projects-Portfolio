// src/App.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Amplify } from "aws-amplify";
import awsExports from "./aws-exports";

import {
  Authenticator,
  useAuthenticator,
  Button,
  Flex,
  Heading,
  Card,
  Badge,
} from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";

import { setApiBase } from "./api"; // only used to set base URL once
import MapComponent from "./components/MapComponent";

// ---------- Amplify + API base ----------
Amplify.configure(awsExports);
if (process.env.REACT_APP_API_BASE_URL) {
  setApiBase(process.env.REACT_APP_API_BASE_URL);
}

// ---------- Header ----------
function Header() {
  const { user, signOut } = useAuthenticator((c) => [c.user]);
  return (
    <Flex
      justifyContent="space-between"
      alignItems="center"
      padding="12px 16px"
      backgroundColor="#0f172a"
      color="white"
      style={{ borderBottom: "1px solid #1e293b" }}
    >
      <Heading level={5} margin="0">
        Personal Tracker
      </Heading>
      <Flex alignItems="center" gap="12px">
        <div>
          Signed in as <strong>{user?.username}</strong>
        </div>
        <Button variation="primary" onClick={signOut}>
          Sign out
        </Button>
      </Flex>
    </Flex>
  );
}

// ---------- Geofence alerts (optional, via WebSocket) ----------
function useGeofenceSocket(user) {
  const [alerts, setAlerts] = useState([]);
  const wsRef = useRef(null);
  const url = process.env.REACT_APP_WS_URL; // e.g. wss://xxxx.execute-api.eu-central-1.amazonaws.com/dev

  // Helper: normalize incoming payloads
  function parseEvent(data) {
    // Accept either string or object
    let obj = data;
    if (typeof data === "string") {
      try {
        obj = JSON.parse(data);
      } catch {
        return null;
      }
    }
    // Expected keys: type ENTER|EXIT, fenceId, userId, at
    const type = String(obj.type || obj.event || "").toUpperCase();
    if (!["ENTER", "EXIT"].includes(type)) return null;
    return {
      type,
      fenceId: obj.fenceId || obj.geofenceId || "unknown-area",
      userId: obj.userId || obj.subject || user?.username || "unknown-user",
      at: obj.at || obj.timestamp || new Date().toISOString(),
    };
  }

  useEffect(() => {
    if (!url) return;

    // If your WS needs a token in querystring, you could append it here.
    // Browsers can't set custom WS headers, so query param is typical:
    // const token = await fetchAuthSession()...; // if you later add it
    const qsUser = encodeURIComponent(user?.username || "anon");
    const wsUrl = url.includes("?") ? `${url}&u=${qsUser}` : `${url}?u=${qsUser}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Optional hello
      try {
        ws.send(JSON.stringify({ op: "hello", user: user?.username || "anon" }));
      } catch {}
    };

    ws.onmessage = (e) => {
      const evt = parseEvent(e.data);
      if (!evt) return;
      setAlerts((prev) => {
        const next = [{ id: crypto.randomUUID(), ...evt }, ...prev];
        return next.slice(0, 6); // keep last 6
      });
    };

    ws.onerror = () => {
      // Silent; we don't want to nag in UI if WS is not configured
    };
    ws.onclose = () => {};

    return () => {
      try {
        ws.close(1000);
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, user?.username]);

  const dismiss = (id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  return { alerts, dismiss };
}

function AlertsTray({ alerts, onDismiss }) {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        width: 360,
        maxWidth: "calc(100vw - 32px)",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {alerts.map((a) => {
        const isEnter = a.type === "ENTER";
        const chipColor = isEnter ? "green" : "red";
        return (
          <Card
            key={a.id}
            variation="outlined"
            style={{
              boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
              background: "#0b1220",
              color: "white",
            }}
          >
            <Flex direction="column" gap="6px">
              <Flex alignItems="center" gap="10px" justifyContent="space-between">
                <Flex alignItems="center" gap="8px">
                  <Badge
                    size="small"
                    variation="success"
                    style={{
                      backgroundColor: chipColor === "green" ? "#16a34a" : "#b91c1c",
                      color: "white",
                    }}
                  >
                    {isEnter ? "ENTER" : "EXIT"}
                  </Badge>
                  <strong>{a.fenceId}</strong>
                </Flex>
                <Button size="small" onClick={() => onDismiss(a.id)}>
                  Dismiss
                </Button>
              </Flex>
              <div style={{ opacity: 0.9 }}>
                User <strong>{a.userId}</strong> {isEnter ? "entered" : "exited"}{" "}
                <em>{a.fenceId}</em>
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{a.at}</div>
            </Flex>
          </Card>
        );
      })}
    </div>
  );
}

// ---------- App ----------
export default function App() {
  return (
    <Authenticator
      loginMechanisms={['username']}
      signUpAttributes={['email']}
    >
      <Header />
      <div
  style={{
    padding: 0,
    height: 'calc(100dvh - 56px)', // 56px ≈ your header height
    minHeight: 320
  }}
>
  <MapComponent />
</div>

      <GeofenceAlertsMount />
    </Authenticator>
  );
}


// Separate component so we can access the signed-in user
function GeofenceAlertsMount() {
  const { user } = useAuthenticator((c) => [c.user]);
  const { alerts, dismiss } = useGeofenceSocket(user);

  // Render tray near the root so it's above the map controls
  return <AlertsTray alerts={alerts} onDismiss={dismiss} />;
}
