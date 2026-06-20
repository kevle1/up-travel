// KV key constants used by auth + Up token storage. Kept in one place so the
// reset endpoint and the cron handler agree on names.

export const PASSWORD_HASH_KEY = "auth:passwordHash";
export const COOKIE_SECRET_KEY = "auth:cookieSecret";
export const UP_TOKEN_KEY = "up:apiToken";
