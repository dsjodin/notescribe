const API_BASE = "/api";

function getToken(): string {
  return localStorage.getItem("notescribe_token") || "";
}

export function setToken(token: string) {
  localStorage.setItem("notescribe_token", token);
}

export function clearToken() {
  localStorage.removeItem("notescribe_token");
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      ...init?.headers,
    },
  });
  if (res.status === 401) {
    clearToken();
    window.location.reload();
  }
  return res;
}

export async function login(password: string): Promise<string> {
  const form = new FormData();
  form.append("password", password);
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("Wrong password");
  const data = await res.json();
  setToken(data.token);
  return data.token;
}

export async function getMeetings() {
  const res = await authFetch(`${API_BASE}/meetings`);
  return res.json();
}

export async function getMeeting(id: number) {
  const res = await authFetch(`${API_BASE}/meetings/${id}`);
  return res.json();
}

export async function createMeeting(
  title: string,
  transcript: string,
  audio: File
) {
  const form = new FormData();
  form.append("title", title);
  form.append("transcript", transcript);
  form.append("audio", audio);
  const res = await authFetch(`${API_BASE}/meetings`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}

export async function deleteMeeting(id: number) {
  const res = await authFetch(`${API_BASE}/meetings/${id}`, {
    method: "DELETE",
  });
  return res.json();
}

export function getAudioUrl(id: number): string {
  return `${API_BASE}/meetings/${id}/audio`;
}

export { getToken };
