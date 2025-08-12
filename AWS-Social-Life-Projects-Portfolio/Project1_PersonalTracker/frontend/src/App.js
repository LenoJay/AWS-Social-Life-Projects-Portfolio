// src/App.js
import React from "react";
import { Amplify } from "aws-amplify";
import awsExports from "./aws-exports";
import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import MapComponent from "./components/MapComponent";

Amplify.configure(awsExports);

function Header() {
  const { user, signOut } = useAuthenticator((c) => [c.user]);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: 12 }}>
      <div>Signed in as: <strong>{user?.username || "Unknown"}</strong></div>
      <button onClick={signOut} style={{ padding: "6px 10px", borderRadius: 6, border: "none", background: "#334155", color: "#fff" }}>
        Sign out
      </button>
    </div>
  );
}

export default function App() {
  return (
    <Authenticator>
      <Header />
      <div style={{ padding: 12 }}>
        <MapComponent />
      </div>
    </Authenticator>
  );
}
