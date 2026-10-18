-- Email allowlist entries only match emails the identity provider says are verified.
ALTER TABLE users ADD COLUMN email_verified boolean NOT NULL DEFAULT false;
