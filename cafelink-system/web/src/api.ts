import type { DiagnosticsSnapshot, GuestScope, SessionInfo, Snapshot } from "./models";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
async function http<T>(
  path: string,
  body?: unknown,
  csrf?: string,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
    });
  } catch {
    throw new ApiError(
      "NETWORK_LOST",
      "Không kết nối được tới quán. Kết quả thao tác có thể chưa rõ; hãy đối chiếu trước khi gửi lại.",
      0,
    );
  }
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      data.code ?? "HTTP_ERROR",
      data.message ?? "Không thể hoàn tất thao tác.",
      response.status,
    );
  return data as T;
}
export const api = {
  join: (grant: string, table = false) =>
    http<SessionInfo>("/api/guest/join", { grant, table }),
  leave: () => http("/api/guest/leave", {}),
  continueVisit: (session: SessionInfo) => http<SessionInfo>("/api/guest/continue", {membershipId:session.identity.membershipId}, session.csrfToken),
  session: () => http<SessionInfo>("/api/session"),
  login: (username: string, password: string) =>
    http<SessionInfo>("/api/login", { username, password }),
  logout: (csrf: string) => http("/api/logout", {}, csrf),
  state: () => http<Snapshot>("/api/state"),
  diagnostics: (signal?: AbortSignal) => http<DiagnosticsSnapshot>("/api/admin/diagnostics", undefined, undefined, signal),
  command: <T>(
    csrf: string,
    action: string,
    data: unknown,
    commandId: string = crypto.randomUUID(),
    scope?: GuestScope | { storeId: string; username: string },
  ) => http<T>("/api/command", { commandId, action, data, scope }, csrf),
};
