// A stand-in for Google's token endpoint, so no test talks to Google. It records
// every request and answers with an ID token built from the claims a test chooses.

export const TEST_GOOGLE = { clientId: "test-client.apps.googleusercontent.com", clientSecret: "test-secret" };

// An unsigned JWT with these claims (the client checks claims, not signatures, D22).
export function idToken(claims) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256", typ: "JWT" })}.${part(claims)}.signature`;
}

// claimsFor(form) → claims for the ID token, or a function returning a Response
// (to simulate failures). requests: every token call, with its parsed form body.
// pictures(url, init) → the Response for a profile photo download (default 404);
// pictureRequests records them.
export function fakeGoogle(claimsFor, { pictures } = {}) {
  const requests = [];
  const pictureRequests = [];
  async function fetch(url, init = {}) {
    if (new URL(url).hostname.endsWith("googleusercontent.com")) {
      pictureRequests.push({ url, init });
      return pictures ? pictures(url, init) : new Response("not found", { status: 404 });
    }
    const form = Object.fromEntries(new URLSearchParams(String(init.body)));
    requests.push({ url, form, init });
    const answer = await claimsFor(form);
    if (answer instanceof Response) return answer;
    return Response.json({ access_token: "unused", token_type: "Bearer", id_token: idToken(answer) });
  }
  return { fetch, requests, pictureRequests };
}

// Claims Google would send for a person, valid now (pass the clock's now).
export function claims(now, overrides = {}) {
  return {
    iss: "https://accounts.google.com",
    aud: TEST_GOOGLE.clientId,
    sub: "google-sub-1",
    email: "person@example.com",
    email_verified: true,
    name: "Asha Rao",
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(now.getTime() / 1000) + 3600,
    ...overrides,
  };
}
