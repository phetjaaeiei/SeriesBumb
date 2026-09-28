-- The site uses Google only for identity; provider tokens are no longer stored.
UPDATE `account` SET `accessToken` = NULL, `refreshToken` = NULL, `idToken` = NULL, `accessTokenExpiresAt` = NULL, `refreshTokenExpiresAt` = NULL;
