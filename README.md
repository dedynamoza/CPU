# SAPA — Ephemeral Random Chat Application

> *"One tap. One stranger. One conversation."*

SAPA is a fast, fun, modern, Gen Z friendly anonymous random chat web application where users instantly match with strangers based on their vibe. Conversations and media automatically disintegrate after 5 minutes, leaving zero digital footprints or permanent chat logs.

---

## Architecture & Technology Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Motion / hardware-accelerated CSS animations
- **Backend & Database**: Google Cloud Firestore (Enterprise), Firebase Authentication, Firebase Storage
- **Security**: Strict zero-trust Firestore Security Rules (enforcing maximum 5-minute message lifespan, identity immutability, relational master gate authorization)
- **Real-Time Matchmaking**: Atomic Firestore transactions pairing waiting users while avoiding self-matches and blocked users

---

## Key Features

1. **One-Tap Matchmaking**:
   - Vibe filter: 😂 Fun, 🗣 Talk, 🎮 Gaming, 🎵 Music, 🤔 Random
   - Live pulse / radar animation with status updates
   - Atomic matching algorithm preventing race conditions or self-pairing
2. **Ephemeral Disintegrating Messages**:
   - Strict 5-minute countdown on every individual text and image message
   - Synchronized server timestamp logic (`expiresAt - serverSyncedCurrentTime`) immune to device clock drift or background tab suspension
   - **Visual Disintegration Effect**: At 0 seconds, message shakes slightly, blurs, breaks into ~24 outward-scattering micro-particles, fades away, and is deleted from both Cloud Firestore and Firebase Storage
   - Messages never reappear on refresh or reconnect
3. **Images with Automatic Storage Cleanup**:
   - Upload from Camera or Gallery (JPG, PNG, WebP)
   - Client-side compression (< 1280px, WebP/JPEG) for snappy mobile transmission
   - Fullscreen tap-to-view modal
   - Both Firestore message record and Firebase Storage file are wiped upon expiration
4. **Safety & Moderation**:
   - 🚨 Safety Report modal (Harassment, Sexual Content, Hate Speech, Spam, Scam, Violence, Other)
   - 🚫 Block system: blocked strangers are persisted in Firestore and permanently excluded from future matchmaking
   - ⏭ **NEXT →** button: instantly concludes current session and initiates matchmaking with a new stranger
5. **Real-time Online Counter**:
   - Backed by live `/presence` heartbeat collection (not hardcoded fake data)

---

## Security Rules

### Firestore Security Rules (`firestore.rules`)
- **Default Deny**: `match /{document=**} { allow read, write: if false; }`
- **Users**: Users may only read public handles and only update their own profile (`request.auth.uid == userId`).
- **Chat Sessions**: Master Gate restricts reading or updating to participants (`userA == request.auth.uid || userB == request.auth.uid`).
- **Messages**:
  - Participant check verified against parent session
  - `senderId` strictly validated to `request.auth.uid`
  - `createdAt` strictly bound to `request.time`
  - `expiresAt` strictly bound to `request.time + duration.value(305, 's')` to mathematically prevent client-side lifetime extension attacks
  - Message updates are denied (messages are immutable once created)
  - Deletions permitted by session participants upon expiration
- **Reports & Blocks**:
  - Reports write-only by authenticated reporter
  - Blocks isolated to blocker (`userId == request.auth.uid`)

### Firebase Storage Rules (`storage.rules`)
- Storage restricted to authenticated users
- Maximum image file size enforced (5 MB)
- MIME type restricted to `image/*`
- Deletion allowed for session media cleanup

---

## How to Test Two Users Simultaneously

1. Open the application URL in a standard browser window (User A). User A is assigned a fun anonymous name (e.g. `BluePanda47`).
2. Open an **Incognito / Private Window** (or a second browser like Chrome/Firefox) and navigate to the same URL (User B). User B is assigned their own unique anonymous identity (e.g. `CoffeeCat83`).
3. Select the same vibe (e.g. `Fun`) on both windows.
4. On User A's window, tap **RANDOM CHAT**. The radar animation will start searching.
5. On User B's window, tap **RANDOM CHAT**.
6. The atomic transaction immediately matches User A and User B, transitioning both into the active Chat Room simultaneously!
7. **Test Messaging**:
   - Send a text message from User A: User B receives it in real time with the countdown timer (`4:59`, `4:58`...).
   - Send an image from User B: tap `+` -> Gallery / Camera -> image compresses, uploads, and displays in User A's chat.
   - Tap image to test fullscreen viewer.
8. **Test 5-Minute Disintegration**:
   - Observe the countdown timer. When less than 10 seconds remain, the timer pulses urgently.
   - At 0 seconds, the message dissolves into scattering particles and vanishes completely from both screens and Firestore.
9. **Test NEXT**:
   - Tap `NEXT →` on User A. The session ends instantly and User A starts searching for another stranger.
10. **Test Safety**:
    - Tap `🚨` to submit a report or `🚫` to block. Blocked users will never match again.
