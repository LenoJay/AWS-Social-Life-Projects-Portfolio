import { Amplify } from 'aws-amplify';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: 'eu-central-1_5vEin043Y',        // User pool ID
      userPoolClientId: '3ise332facgkaap5nIns9409qo', // *web* app client ID
      loginWith: {
        oauth: {
          domain: 'personaltracker-dev.auth.eu-central-1.amazoncognito.com',
          scopes: ['openid','email','profile'],
          redirectSignIn: ['http://localhost:3000/','https://oauth.pstmn.io/v1/callback'], // first is your dev app
          redirectSignOut: ['http://localhost:3000/'],
          responseType: 'code',   // Authorization Code + PKCE
        }
      }
    }
  }
});
