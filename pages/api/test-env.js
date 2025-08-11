export default function handler(req, res) {
  res.status(200).json({
    message: 'Environment Variables Test',
    auth0_secret: process.env.AUTH0_SECRET ? 'SET' : 'MISSING',
    auth0_base_url: process.env.AUTH0_BASE_URL,
    auth0_issuer: process.env.AUTH0_ISSUER_BASE_URL,
    auth0_client_id: process.env.AUTH0_CLIENT_ID ? 'SET' : 'MISSING',
    auth0_client_secret: process.env.AUTH0_CLIENT_SECRET ? 'SET' : 'MISSING',
    node_env: process.env.NODE_ENV,
  });
}
