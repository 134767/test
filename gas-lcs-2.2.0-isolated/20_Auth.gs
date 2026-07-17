function verifyAndAuthorizeIdToken_(idToken) {
  const claims = verifyGoogleIdToken_(idToken);
  const authorizedEmails = getSettings_().authorizedEmails;
  const email = String(claims.email || '').trim().toLowerCase();

  if (!email || claims.email_verified !== 'true' && claims.email_verified !== true) {
    throw lcsError_('TOKEN_INVALID', 'Google email is not verified.');
  }
  if (authorizedEmails.indexOf(email) === -1) {
    throw lcsError_('ACCESS_DENIED', 'Google account is not authorized.');
  }

  return {
    email: email,
    sub: String(claims.sub || ''),
    exp: Number(claims.exp || 0)
  };
}

function verifyGoogleIdToken_(idToken) {
  const token = String(idToken || '').trim();
  if (!token) throw lcsError_('TOKEN_REQUIRED', 'Google ID token is required.');

  const cache = CacheService.getScriptCache();
  const cacheKey = 'idtoken:' + sha256Hex_(token);
  const cached = cache.get(cacheKey);
  if (cached) {
    const claims = JSON.parse(cached);
    assertTokenClaims_(claims);
    return claims;
  }

  const response = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
    { muteHttpExceptions: true, followRedirects: true }
  );

  if (response.getResponseCode() !== 200) {
    throw lcsError_('TOKEN_INVALID', 'Google ID token verification failed.');
  }

  const claims = JSON.parse(response.getContentText());
  assertTokenClaims_(claims);
  const remainingSeconds = Math.max(1, Number(claims.exp) - Math.floor(Date.now() / 1000));
  cache.put(cacheKey, JSON.stringify(claims), Math.min(LCS_TEST.TOKEN_CACHE_SECONDS, remainingSeconds));
  return claims;
}

function assertTokenClaims_(claims) {
  const settings = getSettings_();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issuer = String(claims.iss || '');

  if (String(claims.aud || '') !== settings.googleClientId) {
    throw lcsError_('TOKEN_INVALID', 'Google ID token audience mismatch.');
  }
  if (issuer !== 'accounts.google.com' && issuer !== 'https://accounts.google.com') {
    throw lcsError_('TOKEN_INVALID', 'Google ID token issuer mismatch.');
  }
  if (!Number(claims.exp) || Number(claims.exp) <= nowSeconds) {
    throw lcsError_('TOKEN_EXPIRED', 'Google ID token expired.');
  }
  if (!String(claims.sub || '')) {
    throw lcsError_('TOKEN_INVALID', 'Google ID token subject missing.');
  }
}

function sha256Hex_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text)
    .map(function(byte) {
      const value = byte < 0 ? byte + 256 : byte;
      return ('0' + value.toString(16)).slice(-2);
    })
    .join('');
}
