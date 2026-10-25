/**
 * FOBS TV - Google Authentication & JWT Security Service
 */

const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '801556393860-ca25tgjcb5dn5asmhes887c6d44o98he.apps.googleusercontent.com';
const JWT_SECRET = process.env.JWT_SECRET || 'fobs_tv_super_secret_jwt_key_2026_kvm8';
const JWT_EXPIRES_IN = '30d'; // 30-day session

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

/**
 * Verify Google ID Token received from Google One-Tap or Sign-In button
 */
async function verifyGoogleToken(idToken) {
  if (!idToken) throw new Error('Google ID token is required');

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();

    return {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
      picture: payload.picture || '',
      emailVerified: payload.email_verified
    };
  } catch (err) {
    // If verifyIdToken fails (e.g. from mobile direct userInfo fetch), attempt Google userinfo API fallback
    try {
      const axios = require('axios');
      const res = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
      if (res.data && res.data.sub) {
        return {
          googleId: res.data.sub,
          email: res.data.email,
          name: res.data.name || res.data.email.split('@')[0],
          picture: res.data.picture || '',
          emailVerified: res.data.email_verified === 'true' || res.data.email_verified === true
        };
      }
    } catch (e2) {}
    throw new Error(`Invalid Google Token: ${err.message}`);
  }
}

/**
 * Generate long-lived JWT for FOBS TV session
 */
function generateAppToken(user) {
  return jwt.sign(
    {
      googleId: user.googleId,
      email: user.email,
      name: user.name
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Express Middleware to verify JWT and attach user info
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
    }
    req.user = decoded;
    next();
  });
}

/**
 * Optional Auth Middleware: attaches user if token is valid, but does not block if absent
 */
function optionalAuthenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (!err && decoded) {
      req.user = decoded;
    } else {
      req.user = null;
    }
    next();
  });
}

module.exports = {
  GOOGLE_CLIENT_ID,
  verifyGoogleToken,
  generateAppToken,
  authenticateToken,
  optionalAuthenticateToken
};
