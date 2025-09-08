import { handleAuth } from '@auth0/nextjs-auth0';

// Function to determine the correct base URL
function getBaseURL() {
  // In development, prefer localhost for better debugging
  if (process.env.NODE_ENV === 'development') {
    return process.env.AUTH0_BASE_URL || 'http://localhost:3000';
  }
  // In production, use ngrok or configured URL
  return process.env.NGROK_BASE_URL || process.env.AUTH0_BASE_URL || 'http://localhost:3000';
}

export default handleAuth({
  baseURL: getBaseURL(),
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  clientID: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  secret: process.env.AUTH0_SECRET,
  
  session: {
    rollingDuration: 30 * 60, // 30 minutes
    absoluteDuration: 24 * 60 * 60, // 24 hours
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    }
  },
  
  onError: (err, req, res) => {
    console.error('Auth0 Error:', err);
    console.error('Error details:', {
      message: err.message,
      code: err.code,
      statusCode: err.statusCode,
      timestamp: new Date().toISOString()
    });
    
    // Log request details for debugging
    if (req) {
      console.error('Request details:', {
        url: req.url,
        method: req.method,
        query: req.query,
        headers: {
          host: req.headers?.host,
          'user-agent': req.headers?.['user-agent'],
          referer: req.headers?.referer
        }
      });
    }
    
    throw err;
  },
  
  onCallback: (req, res, session) => {
    console.log('Auth0 callback successful:', {
      email: session?.user?.email,
      sub: session?.user?.sub,
      timestamp: new Date().toISOString()
    });
    
    return session;
  },
  
  authorizationParams: {
    scope: 'openid profile email',
    ...(process.env.AUTH0_AUDIENCE && { audience: process.env.AUTH0_AUDIENCE })
  }
});
