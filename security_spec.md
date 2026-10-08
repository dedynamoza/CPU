# Security Specification for SAPA

## 1. Data Invariants

1. **User Identity & Isolation**: A user can only write and modify their own `/users/{userId}` record (`request.auth.uid == userId`). Display names and statuses cannot be forged for other users.
2. **Chat Privacy (Master Gate)**: A `/chatSessions/{sessionId}` can ONLY be read or updated by participants (`userA` or `userB`). No third-party user may read or list sessions they are not part of.
3. **Strict Ephemeral Message Retention & Lifetime**:
   - Every message MUST belong to an active participant in that specific chat session.
   - `senderId` MUST equal `request.auth.uid`.
   - `createdAt` MUST equal `request.time`.
   - `expiresAt` MUST NOT exceed 5 minutes from `createdAt` (`request.time + duration.value(305, 's')`). Users CANNOT inject arbitrary long-lived expiration dates (e.g., year 2099).
   - Once created, message fields are immutable.
   - Either participant or the message owner can delete the message when it expires or when ending the session.
4. **Queue Integrity**:
   - Match queue documents are keyed by `uid` (`/matchQueue/{uid}`).
   - Only the owner can create or cancel their queue entry.
   - Another authenticated user may only update status from `waiting` to `matched` when atomic matchmaking occurs.
5. **Report & Block Isolation**:
   - A user can only submit a report where `reporterId == request.auth.uid`.
   - A user can only create a block where `userId == request.auth.uid`.
   - Blocks can only be read by the user who created them (`userId == request.auth.uid`).

---

## 2. The "Dirty Dozen" Payloads (Anti-Patterns to Reject)

1. **Payload 1: Unauthenticated Profile Write**
   - Attempt: Write to `/users/alice` with `request.auth = null`.
   - Expected: `PERMISSION_DENIED`.
2. **Payload 2: Impersonated Profile Update**
   - Attempt: User `bob` attempts to update `/users/alice`.
   - Expected: `PERMISSION_DENIED`.
3. **Payload 3: Session Peeking (Non-Participant Read)**
   - Attempt: User `eve` attempts to `get` `/chatSessions/session_123` where `userA = alice` and `userB = bob`.
   - Expected: `PERMISSION_DENIED`.
4. **Payload 4: Spoofed Message Sender**
   - Attempt: User `bob` creates message in `/chatSessions/session_123/messages/msg1` with `senderId = "alice"`.
   - Expected: `PERMISSION_DENIED`.
5. **Payload 5: Message Lifetime Tampering (Immortal Message)**
   - Attempt: User `alice` creates message with `expiresAt = 2099-01-01T00:00:00Z` or `expiresAt > createdAt + 5 minutes`.
   - Expected: `PERMISSION_DENIED`.
6. **Payload 6: Intruder Message Injection**
   - Attempt: User `eve` (not in session) creates a message in `/chatSessions/session_123/messages/msg2`.
   - Expected: `PERMISSION_DENIED`.
7. **Payload 7: Post-Creation Message Mutation**
   - Attempt: User `alice` attempts to update `/chatSessions/session_123/messages/msg1` text after sending.
   - Expected: `PERMISSION_DENIED`.
8. **Payload 8: Giant Message Payload (>500 chars)**
   - Attempt: User `alice` sends a text message with 5,000 characters.
   - Expected: `PERMISSION_DENIED`.
9. **Payload 9: Hijacking Queue Item**
   - Attempt: User `eve` sets `uid: "alice"` in `/matchQueue/alice`.
   - Expected: `PERMISSION_DENIED`.
10. **Payload 10: Fake Reporter In Safety Report**
    - Attempt: User `bob` files report with `reporterId = "alice"`.
    - Expected: `PERMISSION_DENIED`.
11. **Payload 11: Foreign Block Read**
    - Attempt: User `bob` tries to list blocks belonging to `alice`.
    - Expected: `PERMISSION_DENIED`.
12. **Payload 12: Premature/Overriding Session Mutator**
    - Attempt: Non-participant `eve` modifies `status` or participants of `chatSessions/session_123`.
    - Expected: `PERMISSION_DENIED`.

---

## 3. Test Runner Design

The rules are validated ensuring that all unauthorized reads, non-participant writes, lifespan extensions, and identity spoofing operations are rejected with PERMISSION_DENIED.
