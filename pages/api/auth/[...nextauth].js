import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

// Simple environment variable check
if (!process.env.NEXTAUTH_SECRET) {
  console.error('NEXTAUTH_SECRET is not set')
}
if (!process.env.GOOGLE_CLIENT_ID) {
  console.error('GOOGLE_CLIENT_ID is not set')
}
if (!process.env.GOOGLE_CLIENT_SECRET) {
  console.error('GOOGLE_CLIENT_SECRET is not set')
}

export default NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: 'select_account',
        },
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, account, user }) {
      if (account && user) {
        token.accessToken = account.access_token
        token.userId = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.accessToken = token.accessToken
        session.userId = token.userId
      }
      return session
    },
    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`
      // Allows callback URLs on the same origin
      else if (new URL(url).origin === baseUrl) return url
      return baseUrl
    },
  },
  pages: {
    signIn: '/',
    error: '/auth/error',
  },
  debug: process.env.NODE_ENV === 'development',
})

// import NextAuth from 'next-auth'
// import GoogleProvider from 'next-auth/providers/google'

// export default NextAuth({
  // providers: [
  //   GoogleProvider({
  //     clientId: process.env.GOOGLE_CLIENT_ID,
  //     clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  //     authorization: {
  //       params: {
  //         prompt: 'select_account',
  //       },
  //     },
  //   }),
  // ],
//   session: {
//     strategy: 'jwt', 
//   },
//   jwt: {
//     encryption: true
//   },
//   secret: process.env.NEXTAUTH_SECRET,
//   callbacks: {
//     async redirect({ url, baseUrl }) {
//       if (url.startsWith("/")) return `${baseUrl}${url}`
//       else if (new URL(url).origin === baseUrl) return url
//       return baseUrl
//     },
//   },
//   debug: process.env.NODE_ENV === 'development',
// })
