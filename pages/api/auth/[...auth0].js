import { handleAuth } from '@auth0/nextjs-auth0';

export default handleAuth({
  // Explicit configuration to resolve 400 errors
  baseURL: process.env.AUTH0_BASE_URL,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  clientID: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  secret: process.env.AUTH0_SECRET,
  
  onError: (err, req, res) => {
    console.error('Auth0 Error:', err);
    console.error('Error details:', {
      message: err.message,
      code: err.code,
      statusCode: err.statusCode
    });
    
    // Redirect to home with error
    res.writeHead(302, {
      Location: `/?error=${encodeURIComponent(err.message)}`
    });
    res.end();
  },
  
  // Login handling
  onLogin: (req, res, session) => {
    console.log('Login successful:', session?.user?.email);
    return session;
  },
  
  // Callback handling
  onCallback: (req, res, session) => {
    console.log('Callback successful:', session?.user?.email);
    return session;
  },
  
  // Authorization parameters
  authorizationParams: {
    scope: 'openid profile email',
    audience: process.env.AUTH0_AUDIENCE
  }
});
