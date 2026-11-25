# Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Identity Ownership**: Regular users may only read or write their own `/users/{userId}` document and subcollections (`gameSaves`, `gameStorage`) when `request.auth.uid == userId`.
2. **Exclusive Owner Admin (`TheGGhampter`)**: Only the verified owner account (`TheGGhampter`, permanently bound in `/config/owner`, or verified developer email `thebestteam2664@gmail.com`) can list `/users`, inspect any user's `gameSaves`/`gameStorage`, delete non-owner accounts, and read/list/delete `/gameSuggestions`.
3. **Immutable Username & Ownership**: `uid`, `ownerId`, `username`, `usernameLower`, `gameId`, `storageKey`, and `createdAt` can never be mutated after creation, preventing privilege escalation via username renaming.
4. **Immutable Singleton Owner Lock**: `/config/owner` can only be created once by the `TheGGhampter` account and cannot be updated or deleted.
5. **Account Revocation Enforcement**: Deleting an account records `/deletedAccounts/{userId}`, blocking the deleted user from recreating `/users/{userId}`.
6. **Game Suggestions Privacy & URL Safety**: Any visitor (signed in or guest) can submit a bounded suggestion to `/gameSuggestions/{suggestionId}` with optional `http(s)://` URL; only the owner can view or delete suggestions.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Fail with `PERMISSION_DENIED`)
1. **Unauthenticated Profile Read**: Unauthenticated client calls `getDoc('/users/userA')`.
2. **Non-Owner User Read**: Authenticated regular `userB` calls `getDoc('/users/userA')`.
3. **Non-Owner Directory Enumeration**: Regular `userB` calls `getDocs('/users')`.
4. **Username Rename Privilege Escalation**: Regular `userB` updates `/users/userB` to set `usernameLower: 'thegghampter'`.
5. **Owner Lock Hijack**: Regular `userB` attempts to create or overwrite `/config/owner`.
6. **Shadow Field Injection**: `userA` creates `/users/userA` with extra field `isAdmin: true`.
7. **Self-Deletion by Owner**: Owner attempts to delete `/users/{ownerUid}`.
8. **Non-Owner Account Deletion**: Regular `userB` attempts to delete `/users/userA` or write `/deletedAccounts/userA`.
9. **Deleted Account Recreation**: Deleted `userA` attempts to recreate `/users/userA`.
10. **Non-Owner Suggestion Read/Delete**: Regular `userB` or guest calls `getDocs('/gameSuggestions')` or `deleteDoc('/gameSuggestions/s1')`.
11. **Unsafe Suggestion URL (`javascript:`)**: Visitor submits a suggestion with `siteUrl: 'javascript:alert(1)'`.
12. **Connection Probe Write**: Any client attempts `setDoc('/test/connection', { status: 'hacked' })`.
