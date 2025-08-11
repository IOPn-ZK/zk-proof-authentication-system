export default function handler(req, res) {
  // Only allow in development or with a secret key
  if (process.env.NODE_ENV === 'production' && req.headers['x-debug-key'] !== process.env.DEBUG_SECRET) {
    return res.status(403).json({ error: 'Debug endpoint not available in production' });
  }

  const auth0Config = {
    secret: process.env.AUTH0_SECRET ? 'SET' : 'MISSING',
    issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
    baseURL: process.env.AUTH0_BASE_URL,
    clientID: process.env.AUTH0_CLIENT_ID ? 'SET' : 'MISSING',
    clientSecret: process.env.AUTH0_CLIENT_SECRET ? 'SET' : 'MISSING',
    audience: process.env.AUTH0_AUDIENCE || 'NOT_SET',
    nodeEnv: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  };

  // Check for missing required variables
  const missingVars = [];
  if (!process.env.AUTH0_SECRET) missingVars.push('AUTH0_SECRET');
  if (!process.env.AUTH0_ISSUER_BASE_URL) missingVars.push('AUTH0_ISSUER_BASE_URL');
  if (!process.env.AUTH0_BASE_URL) missingVars.push('AUTH0_BASE_URL');
  if (!process.env.AUTH0_CLIENT_ID) missingVars.push('AUTH0_CLIENT_ID');
  if (!process.env.AUTH0_CLIENT_SECRET) missingVars.push('AUTH0_CLIENT_SECRET');

  res.status(200).json({
    message: 'Auth0 Configuration Debug',
    config: auth0Config,
    missingVariables: missingVars,
    hasAllRequired: missingVars.length === 0,
    recommendations: missingVars.length > 0 ? [
      'Set all missing environment variables in Vercel dashboard',
      'Ensure AUTH0_BASE_URL matches your deployed URL exactly',
      'Check that Auth0 application settings include your callback URLs'
    ] : ['Configuration looks good!']
  });
}
