# Semaphore + OAuth Demo

A Next.js application demonstrating zero-knowledge proof authentication using Semaphore protocol and Auth0 OAuth.

This project includes both:
- **Next.js Demo Application**: Full-featured web application with OAuth integration
- **SDK Package** (`@semaphore-oauth/sdk`): Reusable npm package for Semaphore + OAuth functionality

## Features

- **OAuth Authentication**: Secure login with Google via Auth0
- **Zero-Knowledge Proofs**: Generate and verify Semaphore proofs
- **Group Management**: Add/remove members from Semaphore groups
- **Deterministic Identities**: HKDF-based identity generation for consistent user experience
- **SDK Package**: Framework-agnostic SDK for integrating Semaphore + OAuth into any project

## Prerequisites

- Node.js 18+ 
- npm or yarn
- Auth0 account and application

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd semaphore-zk-oauth
npm install
```

### 2. Environment Configuration

Create a `.env.local` file in the root directory with the following variables:

```bash
# Auth0 Configuration (REQUIRED)
AUTH0_SECRET=your-very-long-random-secret-key-here-minimum-32-characters
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://your-domain.auth0.com
AUTH0_CLIENT_ID=your-auth0-client-id
AUTH0_CLIENT_SECRET=your-auth0-client-secret

# Encryption (OPTIONAL - will generate one if not provided)
ENCRYPTION_KEY=your-32-character-encryption-key-here

# Development
NODE_ENV=development
```

### 3. Auth0 Application Setup

1. Go to [Auth0 Dashboard](https://manage.auth0.com/)
2. Create a new application (Regular Web Application)
3. Configure the following settings:
   - **Allowed Callback URLs**: `http://localhost:3000/api/auth/callback`
   - **Allowed Logout URLs**: `http://localhost:3000`
   - **Allowed Web Origins**: `http://localhost:3000`
4. Enable Google as a social connection
5. Copy the Client ID and Client Secret to your `.env.local`

### 4. Generate Required Secrets

#### AUTH0_SECRET
Generate a long, random secret:
```bash
# Option 1: Using openssl
openssl rand -hex 32

# Option 2: Using node
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### ENCRYPTION_KEY (Optional)
Generate a 32-character encryption key:
```bash
# Option 1: Using openssl
openssl rand -hex 16

# Option 2: Using node
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

### 5. Run the Application

```bash
# Development mode
npm run dev

# Production build
npm run build
npm start
```

The application will be available at `http://localhost:3000`

## Troubleshooting

### Common Issues

#### 1. "AUTH0_SECRET not configured" Error
- Ensure `AUTH0_SECRET` is set in `.env.local`
- The secret must be at least 32 characters long
- Restart the development server after adding environment variables

#### 2. "No valid session found" Error
- Check that Auth0 configuration is correct
- Verify callback URLs are properly configured
- Ensure the user is properly authenticated

#### 3. File System Errors
- The application creates a `data/` directory automatically
- Ensure the application has write permissions to the project directory
- Check that `data/group.json` exists and is readable

#### 4. Environment Variable Issues
- Use the `/api/test-env` endpoint to verify all required variables are set
- Ensure `.env.local` is in the root directory (not in subdirectories)
- Restart the development server after environment changes

### Debug Endpoints

- `/api/test-env` - Check environment variable configuration
- `/api/debug-auth` - Debug authentication status
- `/api/security/status` - Check security middleware status

## SDK Package

This project includes a reusable SDK package located in `packages/semaphore-sdk/`. The SDK provides:

- Deterministic identity generation from OAuth identifiers
- Wallet generation from OAuth identifiers
- Group management with configurable storage adapters
- Zero-knowledge proof generation
- Security utilities (encryption, hashing)

### Using the SDK

```bash
# Install the SDK
npm install @semaphore-oauth/sdk
```

```javascript
import { generateDeterministicIdentity, generateDeterministicWallet } from '@semaphore-oauth/sdk';

const identity = generateDeterministicIdentity(auth0Sub, appSecret);
const wallet = generateDeterministicWallet(auth0Sub, appSecret);
```

See `packages/semaphore-sdk/README.md` and `packages/semaphore-sdk/EXAMPLES.md` for detailed documentation.

### Publishing the SDK

```bash
cd packages/semaphore-sdk
npm run build
npm publish
```

## Project Structure

```
semaphore-oauth-demo/
├── packages/
│   └── semaphore-sdk/  # SDK package (npm package)
│       ├── src/        # Source code
│       ├── dist/        # Built files
│       └── README.md    # SDK documentation
├── pages/
│   ├── api/           # API endpoints
│   │   ├── auth/      # Auth0 authentication
│   │   ├── zk/        # Zero-knowledge proof endpoints
│   │   └── security/  # Security and status endpoints
│   └── index.js       # Main application page
├── lib/               # Application-specific utilities (uses SDK)
├── data/              # Application data storage
└── public/            # Static assets
```

## Security Features

- **Session Management**: Secure session handling with Auth0
- **Input Validation**: Comprehensive request validation and sanitization
- **Rate Limiting**: Built-in rate limiting for API endpoints
- **CORS Protection**: Proper CORS configuration for security
- **Error Handling**: Secure error handling without information leakage

## Development

### Adding New Endpoints

1. Create a new file in `pages/api/`
2. Use the security middleware: `withSecurityConfig('endpointType')`
3. Follow the established error handling patterns

### Testing

```bash
# Run the development server
npm run dev

# Test environment configuration
curl http://localhost:3000/api/test-env

# Test authentication flow
# 1. Visit http://localhost:3000
# 2. Click "Login with Google"
# 3. Complete OAuth flow
# 4. Test Semaphore operations
```

## Production Deployment

1. Set `NODE_ENV=production`
2. Use strong, unique secrets for all environment variables
3. Configure proper CORS origins for production domains
4. Set up proper logging and monitoring
5. Use HTTPS in production

## License

This project is licensed under the MIT License.
