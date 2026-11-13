# Hamba Routes Security Specification

## Collections & Ownership Model

1. **`/users/{userId}`** (`UserWorkspace`)
   - Stores business name, fuel settings (`fuelPricePerLitre`, `fuelConsumptionLPer100Km`), shift hours, fleet size, and savings calculator assumptions.
   - Contains business settings linked to the authenticated Google account.
   - **Access**: Strictly owner-only (`request.auth.uid == userId` and verified email). No cross-user reads or writes.

2. **`/users/{userId}/customers/{customerId}`** (`CustomerStop`)
   - Stores customer names, South African phone numbers (`+27`), street addresses, GPS coordinates, gate/access notes, service types, fees, and weekday/vehicle assignments.
   - Contains customer PII.
   - **Access**: Strictly owner-only (`request.auth.uid == userId` and verified email, plus `resource.data.ownerUid == request.auth.uid`). No public reads or cross-business sharing.

## Authorization & Integrity Invariants

- **Global Deny**: Default catch-all `match /{document=**} { allow read, write: if false; }` denies access to all unspecified paths.
- **No Unauthenticated Writes or Reads**: All user data requires `request.auth != null` and `request.auth.token.email_verified == true`.
- **Ownership Immutability**: `ownerUid` and `createdAt` cannot be modified on update.
- **Server Timestamps**: `createdAt` must equal `request.time` on create; `updatedAt` must equal `request.time` on create and update.
- **Field & Type Validation**: Strict allowlists (`keys().hasOnly`), required fields (`keys().hasAll`), bounded string lengths, numeric ranges for coordinates/fuel/fees/durations, and finite enum checks (`serviceCategory`, `urgency`, `status`, `assignedWeekday`, `baselineMode`).
- **Delete All My Data**: Owners can batch-delete all documents in `/users/{userId}/customers` and `/users/{userId}` cleanly.
