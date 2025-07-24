# Semaphore OAuth Demo

A demo project integrating Semaphore v3.15.2 zero-knowledge proofs with OAuth (Google) authentication, using Next.js API routes.
This project demonstrates how to generate and verify Semaphore proofs for authenticated users.

## Tech Stack

- Next.js (API routes)

- Semaphore v3.15.2 (@semaphore-protocol/proof, @semaphore-protocol/group, @semaphore-protocol/identity)

- Open Authentication (Google, via NextAuth.js)

- Session cookies for authentication

- Node.js (backend)

- @zk-kit/utils(Poseidon hashing utilities used for encoding signals)

## Folder Structure
```
semaphore-oauth-demo/
  ├── data/
  │   └── group.json
  ├── lib/
  │   ├── groupData.js
  │   └── semaphore/
  │       ├── group.js
  │       └── identity.js
  ├── pages/
  │   ├── index.js
  │   ├── _app.js
  │   ├── _document.js
  │   └── api/
  │       ├── auth/
  │       │   └── [...nextauth].js
  │       └── zk/
  │           ├── group/
  │           │   ├── full.js
  │           │   ├── info.js
  │           │   ├── members.js
  │           │   └── reset.js
  │           ├── identity/
  │           │   └── init.js
  │           ├── proof.js
  │           └── verify.js
  ├── public/
  │   └── semaphore/
  │       └── 20/
  │           ├── semaphore.wasm
  │           └── semaphore.zkey
  ├── package.json
  ├── package-lock.json
  ├── README.md
  └── ...
```

## API Endpoints

### Authentication

```POST /api/auth/[...nextauth]```

Handles Google OAuth login and session management.

### Group Management

```GET /api/zk/group/members```

Returns the list of group members.

```POST /api/zk/group/members```

Adds a new member (identity commitment) to the group.

```POST /api/zk/group/reset```

Resets the group to its initial state (clears all members).

```GET /api/zk/group/full```

Returns the full group object (id, members, tree depth, etc.).

### Identity
```POST /api/zk/identity/init```

Initializes a new Semaphore identity for the authenticated user.

### Proof Generation & Verification

```POST /api/zk/proof```

Generates a Semaphore proof for the authenticated user and a given signal.

```POST /api/zk/verify```

Verifies a Semaphore proof (off-chain).

## API Flow Order
 1. User logs in via Google OAuth ```(/api/auth/[...nextauth])```
 2. User registers their identity commitment to the group ```(POST /api/zk/group/members)```
 3. User generates a proof ```(POST /api/zk/proof)```
 4. User (or verifier) verifies the proof ```(POST /api/zk/verify)```
#### (Optional)
 5. View group object ```(GET /api/zk/group/full)```
 6. View group members ```(GET /api/zk/group/members)```
 7. Reset group ```(POST /api/zk/group/reset)```

## Testing the API

### Authentication:
All endpoints except group info/members require a valid session cookie (Google login via NextAuth).

### Proof Generation:
- The user must be a member of the group (their commitment must be in the group).
- The signal can be a number.
- Circuit files (semaphore.wasm, semaphore.zkey) must exist in ```public/semaphore/20/```
#### Example request to generate a proof:
```POST /api/zk/proof```
```json
{
  "signal": 1
}
```

### Proof Verification:
Pass the full proof object and the correct tree depth (e.g., 20) to ```/api/zk/verify```
#### Example request to verify a proof:
```POST /api/zk/verify```
```json
{
  "fullProof": {" "}
}
```

## Environment Setup
- Set up your Google OAuth credentials in .env:
```
GOOGLE_CLIENT_ID=your-client-id

GOOGLE_CLIENT_SECRET=your-client-secret

NEXTAUTH_SECRET=your-random-secret

NEXTAUTH_URL=your-nextauth-url
```
- Place trusted setup files in ```public/semaphore/20/```:

1. semaphore.wasm

2. semaphore.zkey

## Install dependencies & start server:
```bash
npm install
npm run dev
```

## Notes for Developers
- All group and identity logic is in ```lib/semaphore/```
- Group data is persisted in ```data/group.json``` (update logic as needed for production).
- All API endpoints are in ```pages/api/zk/```
- Signal strings are hashed using Poseidon internally via `@zk-kit/utils`, ensuring compatibility with Semaphore circuits.
- Use Postman or curl for manual API testing (see above for authentication).
