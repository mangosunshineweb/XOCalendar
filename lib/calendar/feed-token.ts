import crypto from "node:crypto";

const TOKEN_VERSION = "v1";

type FeedClaims = {
  userId: string;
  teamId: string;
};

function getFeedSecret() {
  return process.env.CALENDAR_FEED_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
}

function signPayload(payload: string) {
  const secret = getFeedSecret();
  if (!secret) {
    return null;
  }

  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createCalendarFeedToken({ userId, teamId }: FeedClaims) {
  const payload = [TOKEN_VERSION, userId, teamId].join(".");
  const signature = signPayload(payload);

  if (!signature) {
    return null;
  }

  return `${payload}.${signature}`;
}

export function verifyCalendarFeedToken(token: string): FeedClaims | null {
  const parts = token.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const [version, userId, teamId, signature] = parts;
  if (version !== TOKEN_VERSION || !userId || !teamId || !signature) {
    return null;
  }

  const payload = [version, userId, teamId].join(".");
  const expectedSignature = signPayload(payload);

  if (!expectedSignature) {
    return null;
  }

  const expectedBuffer = Buffer.from(expectedSignature);
  const receivedBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== receivedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
    return null;
  }

  return { userId, teamId };
}
