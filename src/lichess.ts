const origin = "https://lichess.org";
const client = "chess-recall";
const b64 = (a: Uint8Array) =>
  btoa(String.fromCharCode(...a))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
export const signedIn = () => Boolean(sessionStorage.getItem("lichess-token"));
let queue: Promise<unknown> = Promise.resolve();
let cooldown = 0;
export function request(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const next = queue.then(async () => {
    if (Date.now() < cooldown)
      throw Error("Lichess is rate limiting requests. Please wait a minute.");
    const token = sessionStorage.getItem("lichess-token");
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(origin + path, { ...init, headers });
    if (response.status === 429) cooldown = Date.now() + 60000;
    if (response.status === 401) sessionStorage.removeItem("lichess-token");
    if (!response.ok)
      throw Error(
        response.status === 401
          ? "Please sign in to Lichess again."
          : response.status === 403
            ? "You do not have permission to modify this study."
            : `Lichess request failed (${response.status}).`,
      );
    return response;
  });
  queue = next.catch(() => {});
  return next;
}
export async function login() {
  const verifier = b64(crypto.getRandomValues(new Uint8Array(48))),
    state = b64(crypto.getRandomValues(new Uint8Array(24)));
  const redirect = location.origin + location.pathname;
  sessionStorage.setItem(
    "oauth",
    JSON.stringify({ verifier, state, redirect, at: Date.now() }),
  );
  const challenge = b64(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
  );
  location.assign(
    origin +
      "/oauth?" +
      new URLSearchParams({
        response_type: "code",
        client_id: client,
        redirect_uri: redirect,
        scope: "study:read study:write",
        code_challenge_method: "S256",
        code_challenge: challenge,
        state,
      }),
  );
}
export async function callback() {
  const q = new URLSearchParams(location.search);
  if (!q.has("code") && !q.has("error")) return;
  const saved = JSON.parse(sessionStorage.getItem("oauth") || "null");
  history.replaceState({}, "", location.pathname);
  sessionStorage.removeItem("oauth");
  if (q.has("error")) throw Error("Lichess sign-in was cancelled.");
  if (
    !saved ||
    saved.state !== q.get("state") ||
    Date.now() - saved.at > 600000
  )
    throw Error("Sign-in expired. Please try again.");
  const r = await request("/api/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: q.get("code")!,
      code_verifier: saved.verifier,
      redirect_uri: saved.redirect,
      client_id: client,
    }),
  });
  const token = await r.json();
  sessionStorage.setItem("lichess-token", token.access_token);
}
export async function logout() {
  try {
    await request("/api/token", { method: "DELETE" });
  } finally {
    sessionStorage.removeItem("lichess-token");
  }
}
export async function studies(): Promise<{ id: string; name: string }[]> {
  const account = await (await request("/api/account")).json();
  const text = await (
    await request(`/api/study/by/${encodeURIComponent(account.username)}`)
  ).text();
  return text.trim()
    ? text
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
    : [];
}
export function studyId(input: string) {
  const m = input
    .trim()
    .match(
      /^(?:https:\/\/lichess\.org\/study\/)?([a-zA-Z0-9]{8})(?:\/[^\s]*)?$/,
    );
  if (!m) throw Error("Enter a Lichess study URL or its eight-character ID.");
  return m[1];
}
export async function readStudy(id: string) {
  return (
    await request(
      `/api/study/${id}.pgn?clocks=false&comments=false&variations=false`,
    )
  ).text();
}
export async function addChapter(id: string, pgn: string, name: string) {
  return request(`/api/study/${id}/import-pgn`, {
    method: "POST",
    body: new URLSearchParams({ pgn, name }),
  });
}
