# Auto-Subscription Integration Spec

## Goals
- The store (App Store / Play Store) handles payment and renewal.
- Backend must remain authoritative — never trust client-only data.
- Real-time updates via webhooks; periodic re-verification as fallback.
- Correctly handle all state transitions: active, grace/on-hold, cancelled, expired.

## Components
- Client (iOS / Android)
- Backend / Edge functions
- Webhook endpoints (Apple ASN v2, Google RTDN)
- Scheduled re-verification mechanism
- Database: subscriptions, receipts/events, entitlement snapshot

## Apple (iOS) Requirements

1. Configure **Server Notifications URL (ASN v2)** in App Store Connect.  
2. Verify incoming `signedPayload`, decode transaction / renewal info.  
3. Call Apple’s **Server API** to get the latest subscription status before DB writes.  
4. Map notification types (`DID_RENEW`, `DID_FAIL_TO_RENEW`, `REFUND`, etc.) → internal states.  
5. Use `appAccountToken` / `applicationUserName` to map to your user.  
6. Handle edge cases: grace period, cancellation, refunds, price increases, renewal extensions.

## Google Play Requirements

1. Enable **RTDN** in Play Console via Pub/Sub.  
2. Decode Pub/Sub message; extract subscription event.  
3. Immediately call **Google Play Developer API** (`purchases.subscriptions.get`) for full status.  
4. Map Google’s event types (`RENEWED`, `ON_HOLD`, `CANCELED`, `REVOKED`, etc.) → your internal states.  
5. Handle upgrades, downgrades, grace / retry, refunds.

## Scheduled Re-verification (Safety Net)

- Periodically re-check subscriptions nearing expiry or stale updates.
- Use store APIs to refresh state.
- Ensure no user is incorrectly left in `active` when renewals failed.

## Database & Entitlement Snapshot

- Store full history in `subscriptions` + `receipts/events`.  
- Snapshot key state in `profiles` (or equivalent): `subscription_status`, `plan_id`, `entitlement`, `renewal_at`, `store`.

## Client / UI Logic

- On app start / resume, fetch snapshot to gate features.  
- Optionally invoke silent refresh if near expiry.  
- Present UI based on state: active, grace/on-hold, cancelled, expired.  
- Restore purchases flows.

## Errors & Safeguards

- Webhook idempotency & retries  
- Signature / authenticity validation  
- Never accept client-only receipt data  
- Logs, monitoring, and alerting  
- Out-of-order event handling  
- Fallback path via scheduled re-check

## Test Cases

- New purchase  
- Renewal  
- Cancel auto-renew  
- Billing failure / retry / grace  
- Refund / revocation  
- Upgrade / downgrade  
- Trial transitions  
- Price increase / consent (Apple)  
- Restore on new device  
- Webhook failure / delivery delay  
- Offline user for extended period