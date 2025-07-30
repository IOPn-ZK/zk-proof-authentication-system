# Semaphore OAuth Demo

A Next.js application demonstrating Semaphore zero-knowledge proofs with Google OAuth authentication.

## 🚀 Tech Stack

- **Frontend**: Next.js 15.3.5, React, Tailwind CSS
- **Authentication**: NextAuth.js with Google OAuth
- **Zero-Knowledge Proofs**: Semaphore Protocol v3.15.2
- **Backend**: Next.js API Routes
- **Storage**: Local JSON files for group data

## 📁 Project Structure

```
semaphore-oauth-demo/
├── data/
│   └── group.json                 # Group data storage
├── lib/
│   ├── groupData.js              # Group data utilities
│   └── semaphore/
│       ├── group.js              # Group management
│       └── identity.js           # Identity utilities
├── pages/
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...nextauth].js  # NextAuth configuration
│   │   └── zk/
│   │       ├── group/
│   │       │   ├── full.js       # GET group details
│   │       │   ├── members.js    # POST add member
│   │       │   └── reset.js      # POST reset group
│   │       ├── identity/
│   │       │   └── init.js       # POST initialize identity
│   │       ├── proof.js          # POST generate proof
│   │       └── verify.js         # POST verify proof
│   └── index.js                  # Main frontend page
├── public/
│   └── semaphore/
│       └── 20/
│           ├── semaphore.wasm    # SNARK circuit file
│           └── semaphore.zkey    # SNARK proving key
└── package.json
```

## 🔌 API Endpoints

### Authentication
- **`GET /api/auth/session`** - Get current session
- **`POST /api/auth/signin`** - Sign in with Google
- **`POST /api/auth/signout`** - Sign out

### Group Management
- **`GET /api/zk/group/full`** - Get complete group data
  - Returns: `{ id, treeDepth, members, root, memberCount, success }`
- **`POST /api/zk/group/members`** - Add member to group
  - Body: `{ commitment: string }`
  - Returns: `{ message, success }`
- **`POST /api/zk/group/reset`** - Reset group (remove all members)
  - Returns: `{ message, success }`

### Identity Management
- **`POST /api/zk/identity/init`** - Initialize new identity
  - Returns: `{ commitment, success }`

### Zero-Knowledge Proofs
- **`POST /api/zk/proof`** - Generate Semaphore proof
  - Body: `{ signal: string }`
  - Returns: `{ fullProof }` (contains `proof` and `publicSignals`)
- **`POST /api/zk/verify`** - Verify Semaphore proof
  - Body: `{ fullProof }`
  - Returns: `{ valid: boolean }`

## 🔄 API Flow Order

1. **Authentication**: User signs in with Google OAuth
2. **Initialize Server Identity**: Create server-side identity using user's email
3. **Join Group**: Add identity commitment to the Semaphore group
4. **Show Group Details**: Fetch and display group information
5. **Generate & Verify Proof**: Create and verify zero-knowledge proof
6. **Complete**: Flow completed successfully

## 🧪 Testing Instructions

### 1. Setup Environment Variables
Create a `.env.local` file:
```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=http://localhost:3000
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start Development Server
```bash
npm run dev
```

### 4. Test Frontend Flow
1. Open `http://localhost:3000`
2. Click "Login with Google"
3. After authentication, you'll see a step-by-step interface:
   - **Step 1**: Initialize Server Identity - Create a server-side identity
   - **Step 2**: Join Group - Add identity commitment to the group
   - **Step 3**: Show Group Details - Fetch and display group information
   - **Step 4**: Generate & Verify Proof - Create and verify ZK proof
   - **Step 5**: Complete - Flow completed successfully
4. Each step must be completed in order to proceed to the next
5. Use "Reset Flow" to start over or "Reset Group" to clear all members

### 5. Test API Endpoints with Postman

#### Test Group Info
```http
GET http://localhost:3000/api/zk/group/info
```

#### Test Group Full Details
```http
GET http://localhost:3000/api/zk/group/full
```

#### Test Add Member
```http
POST http://localhost:3000/api/zk/group/members
Content-Type: application/json

{
  "commitment": "1234567890123456789012345678901234567890123456789012345678901234"
}
```

#### Test Reset Group
```http
POST http://localhost:3000/api/zk/group/reset
```

#### Test Initialize Server Identity
```http
POST http://localhost:3000/api/zk/identity/init
```

#### Test Generate Proof
```http
POST http://localhost:3000/api/zk/proof
Content-Type: application/json

{
  "signal": "my-test-signal"
}
```

#### Test Verify Proof
```http
POST http://localhost:3000/api/zk/verify
Content-Type: application/json

{
  "fullProof": {
    "proof": [...],
    "publicSignals": [...]
  }
}
```

## 🔧 Key Features

### Frontend Integration
- **Google OAuth**: Seamless authentication flow
- **Identity Management**: Automatic identity creation and storage
- **Group Management**: Manual group joining (no auto-join)
- **Proof Generation**: Client-side proof generation with Semaphore
- **Real-time Logs**: Detailed logging of all operations

### Backend Features
- **Session Management**: NextAuth.js session handling
- **Group Persistence**: JSON file-based group storage
- **Proof Generation**: Server-side proof generation with SNARK artifacts
- **Proof Verification**: Off-chain proof verification
- **Error Handling**: Comprehensive error handling and logging

### Security Features
- **Authentication Required**: All ZK operations require valid session
- **Identity Validation**: Ensures user identity is in group before proof generation
- **Session Validation**: Server-side session verification
- **Input Validation**: Comprehensive input validation for all endpoints

## 🐛 Troubleshooting

### Common Issues

1. **"ENOENT: no such file or directory"**
   - Ensure `public/semaphore/20/semaphore.wasm` and `semaphore.zkey` exist
   - Check file permissions

2. **"Cannot convert undefined to a BigInt"**
   - Group data may contain invalid members
   - Try resetting the group: `POST /api/zk/group/reset`

3. **"Invalid fullProof structure"**
   - Ensure you're using the raw output from `/api/zk/proof`
   - Check that `fullProof` contains both `proof` and `publicSignals`

4. **"Parameter 'merkleTreeDepth' is not a number"**
   - Ensure you're using Semaphore v3.15.2
   - Check that `Group` instance is properly initialized

### Debug Steps

1. **Check Logs**: View the detailed logs in the frontend
2. **Verify Files**: Ensure SNARK artifacts exist in `public/semaphore/20/`
3. **Test Endpoints**: Use Postman to test individual endpoints
4. **Clear Storage**: Clear localStorage and try again
5. **Reset Group**: Use the "Reset Group" button to start fresh

## 📚 Dependencies

```json
{
  "@semaphore-protocol/group": "^3.15.2",
  "@semaphore-protocol/identity": "^3.15.2",
  "@semaphore-protocol/proof": "^3.15.2",
  "next": "^15.3.5",
  "next-auth": "^4.24.5",
  "react": "^18.3.1"
}
```

## 🎯 Next Steps

- [ ] Add on-chain proof verification
- [ ] Implement group member removal
- [ ] Add proof history tracking
- [ ] Implement multiple group support
- [ ] Add proof export/import functionality
- [ ] Implement proof sharing between users
