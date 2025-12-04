import "@/styles/globals.css";
import { UserProvider } from '@auth0/nextjs-auth0/client';
import { GoogleOAuthProvider } from '@react-oauth/google';

export default function App({ Component, pageProps }) {
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}>
      <UserProvider>
        <Component {...pageProps} />
      </UserProvider>
    </GoogleOAuthProvider>
  );
}
