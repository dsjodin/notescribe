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

export async function logout() {
  try {
    await authFetch(`${API_BASE}/auth/logout`, { method: "DELETE" });
  } catch {
    // Ignore errors — clear token regardless
  }
  clearToken();
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
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || "Wrong password");
  }
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

export async function updateSummary(id: number, summary: string) {
  const form = new FormData();
  form.append("summary", summary);
  const res = await authFetch(`${API_BASE}/meetings/${id}/summary`, {
    method: "PUT",
    body: form,
  });
  if (!res.ok) throw new Error("Failed to update summary");
  return res.json();
}

export async function getTranscriptEdits(meetingId: number) {
  const res = await authFetch(`${API_BASE}/meetings/${meetingId}/transcript-edits`);
  return res.json();
}

export async function saveTranscriptEdit(
  meetingId: number,
  lineIndex: number,
  originalText: string,
  editedText: string,
) {
  const form = new FormData();
  form.append("original_text", originalText);
  form.append("edited_text", editedText);
  const res = await authFetch(
    `${API_BASE}/meetings/${meetingId}/transcript-edits/${lineIndex}`,
    { method: "PUT", body: form },
  );
  if (!res.ok) throw new Error("Failed to save transcript edit");
  return res.json();
}

export async function deleteTranscriptEdit(meetingId: number, lineIndex: number) {
  const res = await authFetch(
    `${API_BASE}/meetings/${meetingId}/transcript-edits/${lineIndex}`,
    { method: "DELETE" },
  );
  return res.json();
}

export function getAudioUrl(id: number): string {
  return `${API_BASE}/meetings/${id}/audio`;
}

export { getToken };
