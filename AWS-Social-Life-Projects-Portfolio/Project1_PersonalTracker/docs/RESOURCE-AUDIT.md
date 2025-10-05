# Resource Audit (Rebuild V3)


## Cognito — User Pool
- **Name/ID:**
- **Region:** eu-central-1
- **Purpose:** AuthN; (optional) protect frontend
- **Linked to:** Identity Pool, frontend
- **Key settings:** (policies, app client, domain if any)
- **Screenshots:** ...


## Cognito — Identity Pool
- **ID:**
- **Purpose:** AWS credentials for map tile signing
- **IAM roles:** Auth/Unauth roles & policies


## Amazon Location Service
- **Map name:** ProtestTrackerMap
- **Tracker:** <name>
- **Geofence Collection:** <name>


## Lambda — GeofenceEventProcessor
- **Runtime:**
- **Trigger:** EventBridge rule for ENTER/EXIT
- **Publishes to:** SNS topic <name>


## SNS — Notifications
- **Topic ARN:**
- **Subscriptions:** (email/SMS)


## EventBridge Rule — Geofence events
- **Pattern:** ENTER/EXIT
- **Target:** Lambda


## CloudWatch Alarms
- **Alarm 1:** Lambda Error Rate
- **Alarm 2:** Geofence Event Triggered