const PREFIX = "tamp-read-notifications";

function storageKey(userId?: string, organisationId?: string | null) {
  return `${PREFIX}:${userId ?? "anonymous"}:${organisationId ?? "default"}`;
}

export function loadReadNotificationIds(userId?: string, organisationId?: string | null) {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(userId, organisationId)) ?? "[]");
    return new Set<string>(Array.isArray(value) ? value.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set<string>();
  }
}

export function saveReadNotificationIds(
  userId: string | undefined,
  organisationId: string | null | undefined,
  ids: Iterable<string>,
) {
  const values = [...new Set(ids)].slice(-500);
  localStorage.setItem(storageKey(userId, organisationId), JSON.stringify(values));
  return new Set(values);
}
