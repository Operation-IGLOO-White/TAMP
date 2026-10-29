type ErrorWithData = Error & {
  data?: { httpStatus?: number; code?: string };
};

const TECHNICAL_RESPONSE =
  /unexpected token|not valid json|json\.parse|json at position|<!doctype|<html|syntaxerror/i;

export const MAX_UPLOAD_SIZE_LABEL = "10 MB";
export const MAX_ACCOUNT_UPLOAD_LABEL = "100 MB";

/** Convert transport/backend failures into text suitable for an end user. */
export function userFacingError(error: unknown, fallback = "We could not complete that request.") {
  const value = error as Partial<ErrorWithData> | null;
  const status = value?.data?.httpStatus;
  const raw = typeof value?.message === "string" ? value.message.trim() : "";

  if (status === 401) return "Your session has expired. Sign in again and retry.";
  if (status === 403) return "You do not have permission to perform this action.";
  if (status === 429) return "Too many attempts were made. Wait a moment and try again.";
  if (status === 502 || status === 503 || status === 504)
    return "The service is temporarily unavailable. Please try again shortly.";
  if (TECHNICAL_RESPONSE.test(raw))
    return "We could not reach the TAMP service. Please try again shortly.";
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(raw))
    return "We could not connect to the server. Check your connection and try again.";
  if (/internal server error/i.test(raw))
    return "Something went wrong while processing your request. Please try again.";
  if (/account upload quota exceeded/i.test(raw))
    return `Your account has reached its ${MAX_ACCOUNT_UPLOAD_LABEL} upload limit. Remove files you no longer need or contact support for more storage.`;
  if (/file exceeds size limit|request too large/i.test(raw))
    return `This file is too large. The maximum size for one file is ${MAX_UPLOAD_SIZE_LABEL}.`;
  return raw || fallback;
}

export function truckRegistrationError(error: unknown) {
  const message = userFacingError(error, "The truck could not be registered. Please try again.");
  const normalized = message.toLowerCase();

  if (normalized.includes("vin") || normalized.includes("match the expected pattern"))
    return "Check the VIN. It must contain exactly 17 letters and numbers, excluding I, O and Q.";
  if (normalized.includes("registration") && normalized.includes("conflict"))
    return "A truck with this registration is already registered.";
  if (normalized.includes("registration")) return "Check the registration number and try again.";
  if (normalized.includes("payloadcapacitykg") || normalized.includes("payload capacity"))
    return "Payload capacity must be between 1 and 200,000 kg.";
  if (normalized.includes("currentlocation") || normalized.includes("current location"))
    return "Select the truck's current location from the address suggestions.";
  if (normalized.includes("availablefrom") || normalized.includes("availableto"))
    return "The truck's availability dates are invalid. Review them and try again.";
  if (normalized.includes("preferredlanes"))
    return "One or more preferred lanes are invalid. Review the route preferences and try again.";
  if (normalized.includes("photo")) return "One or more truck photos could not be saved.";
  if (normalized.includes("document")) return "One or more vehicle documents could not be saved.";
  if (/conflicting record|already exists|duplicate/i.test(normalized))
    return "This truck appears to be registered already. Check the registration and VIN.";
  return message;
}

export async function responseError(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      detail?: string;
      message?: string;
    } | null;
    return userFacingError(new Error(body?.error || body?.detail || body?.message || ""), fallback);
  }
  if ([502, 503, 504].includes(response.status))
    return "The service is temporarily unavailable. Please try again shortly.";
  return fallback;
}
