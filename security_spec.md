# Security Specification — Dayline Suggestions & Owner Inbox

## 1. Data Invariants
1. **Verified Authentication Gate**: No anonymous or unverified (`email_verified != true`) user may create, read, update, or delete any document in `/suggestions/{suggestionId}`.
2. **Author Identity Binding**: On creation, `authorUid` MUST strictly match `request.auth.uid`, and `authorEmail` MUST strictly match `request.auth.token.email`. Both fields, along with `createdAt`, are strictly immutable on every subsequent update.
3. **PII Isolation & Query Enforcement**: Because suggestion documents contain `authorEmail` (PII), `get` and `list` operations MUST strictly restrict access to either the suggestion's author (`resource.data.authorUid == request.auth.uid`) or the verified bootstrapped App Owner (`request.auth.token.email == 'ranjeetkumarsah286@gmail.com' && request.auth.token.email_verified == true`). Blanket `isSignedIn()` reads or client-delegated filters are forbidden.
4. **Creation State Integrity**: Newly created suggestions MUST start with `status == 'new'` and `ownerReply == ''`, and MUST set `createdAt == request.time` and `updatedAt == request.time`.
5. **Tiered Action-Based Updates & Terminal State Locking**:
   - **Author Tier**: May only update `['category', 'title', 'message', 'authorName', 'updatedAt']`, and ONLY while `existing().status == 'new'`. Once the owner moves status to `reviewing`, `planned`, `implemented`, or `archived`, author edits and author deletes are locked.
   - **App Owner Tier**: Only the verified owner (`ranjeetkumarsah286@gmail.com` with `email_verified == true`) may update `['status', 'ownerReply', 'updatedAt']` or delete already-triaged suggestions.
6. **Volumetric & ID Poisoning Guards**: Document IDs must match `^[a-zA-Z0-9_\-]+$` (1–128 chars), and every string field enforces explicit minimum/maximum `.size()` bounds matching `firebase-blueprint.json`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Payload 1 — Identity Spoofing (`authorUid` mismatch)**: Authenticated user `user_alpha` creates `/suggestions/sug_1` with `authorUid: "user_victim"`. -> `PERMISSION_DENIED`
2. **Payload 2 — Email Spoofing on Admin Read/Update (`email_verified: false`)**: Attacker authenticates with `email: "ranjeetkumarsah286@gmail.com"` and `email_verified: false` and attempts to `list` all suggestions or update `status`. -> `PERMISSION_DENIED`
3. **Payload 3 — Shadow Field Injection on Create (`isAdmin: true`)**: Verified user sends all valid fields plus unexpected ghost key `isAdmin: true`. -> `PERMISSION_DENIED` via `hasOnly()`.
4. **Payload 4 — Self-Promoted Triage Status on Create**: Verified user creates a suggestion with `status: "implemented"` or non-empty `ownerReply: "Approved!"`. -> `PERMISSION_DENIED`
5. **Payload 5 — Privilege Escalation on Update (Author modifies `status` or `ownerReply`)**: Author updates their own `'new'` suggestion attempting to change `status` to `'planned'`. -> `PERMISSION_DENIED` via `affectedKeys().hasOnly(...)`.
6. **Payload 6 — PII Blanket Leak (`get` on another user's suggestion)**: Verified `user_beta` attempts `getDoc` on `/suggestions/sug_owned_by_alpha`. -> `PERMISSION_DENIED`
7. **Payload 7 — Unscoped List Scraping (`list` without `where('authorUid', '==', uid)`)**: Verified `user_beta` queries the entire `/suggestions` collection without scoping to their own `authorUid`. -> `PERMISSION_DENIED`
8. **Payload 8 — Terminal State Lock Bypass**: After owner sets `status: "archived"` (or `"implemented"`), original author attempts to rewrite `message` or `delete` the suggestion. -> `PERMISSION_DENIED`
9. **Payload 9 — Immortal Field Mutation (`createdAt` or `authorUid` altered during update)**: Verified user or owner attempts to alter `createdAt` or `authorUid` during an update. -> `PERMISSION_DENIED`
10. **Payload 10 — Client Timestamp Forgery (`createdAt` in the past/future)**: Verified user passes a hardcoded `Timestamp.fromMillis(1700000000000)` instead of `serverTimestamp()` (`request.time`). -> `PERMISSION_DENIED`
11. **Payload 11 — Value / Volumetric Poisoning (10KB `message` or invalid `category`)**: Verified user updates whitelisted key `message` with a 5,000-character string (> 1500 max) or `category: "hacked"`. -> `PERMISSION_DENIED` via `isValidSuggestion(incoming())`.
12. **Payload 12 — Path ID Poisoning**: Verified user attempts `setDoc` on `/suggestions/bad$id!with spaces` or a 200-character ID. -> `PERMISSION_DENIED` via `isValidId(suggestionId)`.

## 3. Phase 5 Red Team Audit Report
- **Shadow Update Test**: PASS — `isValidSuggestion` enforces strict `hasAll` + `hasOnly` on create, and `allow update` wraps both `isValidSuggestion(incoming())` AND `affectedKeys().hasOnly(...)` on every action branch.
- **Email Spoofing Test**: PASS — `isBootstrappedOwner()` calls `isVerifiedUser()`, requiring `request.auth.token.email_verified == true` alongside `request.auth.token.email == 'ranjeetkumarsah286@gmail.com'`.
- **PII Blanket Test**: PASS — `authorEmail` is only stored in `/suggestions/{suggestionId}`, where `allow get` requires `existing().authorUid == request.auth.uid || isBootstrappedOwner()`.
- **Query Trust Test**: PASS — `allow list` enforces `resource.data.authorUid == request.auth.uid || isBootstrappedOwner()` with zero `get()`/`exists()` calls inside `list`.
- **Value Poisoning & ID Poisoning**: PASS — Every string has explicit `.size()` bounds synchronized with `firebase-blueprint.json`, and `isValidId(suggestionId)` guards `get`, `create`, `update`, and `delete`.
