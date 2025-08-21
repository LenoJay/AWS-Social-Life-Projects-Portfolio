// src/App.js
import React, { useEffect, useMemo, useState } from "react";
import { Amplify } from "aws-amplify";
import awsExports from "./aws-exports";

import {
  Authenticator,
  useAuthenticator,
  Button,
  Flex,
  Heading,
  TextField,
  View,
  Card,
} from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";

import {
  createGroup,
  joinGroup,
  getMyGroup,
  getGroupLocations,
  setApiBase,
} from "./api";

// Keep your map component unchanged
import MapComponent from "./components/MapComponent";

// Configure Amplify + API base
Amplify.configure(awsExports);
if (process.env.REACT_APP_API_BASE_URL) {
  setApiBase(process.env.REACT_APP_API_BASE_URL);
}

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

function GroupPanel() {
  const [loading, setLoading] = useState(false);
  const [myGroup, setMyGroup] = useState(null);
  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [status, setStatus] = useState("");
  const [locations, setLocations] = useState([]);

  async function refresh() {
    setStatus("");
    setLoading(true);
    try {
      // getMyGroup() currently returns null (no backend endpoint).
      const g = await getMyGroup();
      setMyGroup(g || null);
      if (g?.groupId) {
        const loc = await getGroupLocations(g.groupId);
        setLocations(Array.isArray(loc) ? loc : []);
      } else {
        setLocations([]);
      }
    } catch (e) {
      setStatus(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onCreate() {
    if (!createName.trim()) {
      setStatus("Please enter a display name for the group.");
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      const created = await createGroup(createName.trim());
      setMyGroup(created);
      setCreateName("");
      setStatus(`Created group ${created?.groupId || ""}`);
      if (created?.groupId) {
        const loc = await getGroupLocations(created.groupId);
        setLocations(Array.isArray(loc) ? loc : []);
      }
    } catch (e) {
      setStatus(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function onJoin() {
    if (!joinCode.trim()) {
      setStatus("Enter a group code to join.");
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      const joined = await joinGroup(joinCode.trim());
      setMyGroup(joined);
      setJoinCode("");
      setStatus(`Joined group ${joined?.groupId || ""}`);
      if (joined?.groupId) {
        const loc = await getGroupLocations(joined.groupId);
        setLocations(Array.isArray(loc) ? loc : []);
      }
    } catch (e) {
      setStatus(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  const groupId = useMemo(() => myGroup?.groupId || "", [myGroup]);

  return (
    <View padding="16px" maxWidth="1000px" margin="0 auto">
      <Card variation="outlined" padding="16px" marginBottom="16px">
        <Heading level={4} marginBottom="8px">
          Your Group
        </Heading>
        {loading ? (
          <div>Loading…</div>
        ) : myGroup ? (
          <div>
            <div>
              <strong>ID:</strong> {myGroup.groupId}
            </div>
            <div>
              <strong>Name:</strong> {myGroup.displayName || "—"}
            </div>
            <Button marginTop="12px" onClick={refresh}>
              Refresh
            </Button>
          </div>
        ) : (
          <div>No group yet.</div>
        )}
      </Card>

      <Flex gap="16px" wrap="wrap">
        <Card variation="outlined" padding="16px" style={{ flex: "1 1 280px" }}>
          <Heading level={5} marginBottom="8px">
            Create a new group
          </Heading>
          <TextField
            label="Display name"
            labelHidden
            placeholder="e.g. Family"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
          />
          <Button marginTop="12px" onClick={onCreate} isDisabled={loading}>
            Create
          </Button>
        </Card>

        <Card variation="outlined" padding="16px" style={{ flex: "1 1 280px" }}>
          <Heading level={5} marginBottom="8px">
            Join an existing group
          </Heading>
          <TextField
            label="Group code"
            labelHidden
            placeholder="6-char code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
          />
          <Button marginTop="12px" onClick={onJoin} isDisabled={loading}>
            Join
          </Button>
        </Card>
      </Flex>

      <Card variation="outlined" padding="16px" marginTop="16px">
        <Heading level={5} marginBottom="8px">
          Recent locations {groupId ? `(group ${groupId})` : ""}
        </Heading>
        {locations.length === 0 ? (
          <div>No locations yet.</div>
        ) : (
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {JSON.stringify(locations, null, 2)}
          </pre>
        )}
      </Card>

      {status ? (
        <Card variation="outlined" marginTop="16px" padding="12px">
          {status}
        </Card>
      ) : null}
    </View>
  );
}

export default function App() {
  return (
    <Authenticator>
      <Header />
      {/* Your existing map UI remains */}
      <div style={{ padding: 16 }}>
        <MapComponent />
      </div>
      {/* Simple panel to exercise the HTTP API */}
      <GroupPanel />
    </Authenticator>
  );
}
