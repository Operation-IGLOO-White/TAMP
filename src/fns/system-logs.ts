export interface SystemLogFile { name: string; path: string; size: number; modifiedAt: number }
export interface SystemLogGroup { name: "modules" | "services"; files: SystemLogFile[] }

const apiRoot = (import.meta.env["VITE_API_URL"] || "/api/v1").replace(/\/$/, "");

async function request<Result>(path: string): Promise<Result> {
  const response = await fetch(`${apiRoot}${path}`, { credentials: "include" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "System logs could not be loaded");
  }
  return response.json() as Promise<Result>;
}

export const listSystemLogs = () => request<{ groups: SystemLogGroup[] }>("/system-logs");
export const readSystemLog = (group: string, filename: string) =>
  request<{ content: string; size: number; truncated: boolean }>(`/system-logs/${encodeURIComponent(group)}/${encodeURIComponent(filename)}/content`);
export const systemLogDownloadUrl = (group: string, filename: string) =>
  `${apiRoot}/system-logs/${encodeURIComponent(group)}/${encodeURIComponent(filename)}/download`;
