import React from "react";
import { Amplify } from "aws-amplify";
import { withAuthenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import awsExports from "./aws-exports";
import MapComponent from "./components/MapComponent";

Amplify.configure(awsExports);

function App() {
  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ textAlign: "center" }}>Real-Time Personal Tracker</h2>
      <MapComponent />
    </div>
  );
}

export default withAuthenticator(App);
