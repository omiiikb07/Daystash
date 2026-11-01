export class ApiError extends Error {
  constructor(message, code, status) { super(message); this.code = code; this.status = status; }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch('/api' + path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('Cannot reach the Daystash server. Make sure it is still running (npm start).', 'NETWORK', 0);
  }
  let json;
  try { json = await res.json(); } catch { throw new ApiError('The server sent an unreadable response.', 'BAD_RESPONSE', res.status); }
  if (!json.ok) throw new ApiError(json.error.message, json.error.code, res.status);
  return json.data;
}
