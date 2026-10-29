import { createTRPCUntypedClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { userFacingError } from "@/lib/api-errors";

// Backend source is not required to build the frontend. Response contracts live
// in types/ and fns/; verify them against the backend when it is available.
const client = createTRPCUntypedClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers: { "X-TAMP-Request": "1" },
      fetch: async (url, options) => {
        const response = await fetch(url, {
          ...options,
          signal: options?.signal ?? null,
          credentials: "include",
        });
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          const message = [502, 503, 504].includes(response.status)
            ? "The service is temporarily unavailable. Please try again shortly."
            : response.status === 401
              ? "Your session has expired. Sign in again and retry."
              : "The server returned an invalid response. Please try again shortly.";
          throw new Error(message);
        }
        return response;
      },
    }),
  ],
});

// This is the single unchecked wire boundary until a shared backend contract
// package is available. The fns/ wrappers specify the expected response types.
export const trpc = {
  async query<Result>(path: string, input?: unknown): Promise<Result> {
    try {
      return (await client.query(path, input)) as Result;
    } catch (error) {
      throw new Error(userFacingError(error));
    }
  },
  async mutation<Result>(path: string, input?: unknown): Promise<Result> {
    try {
      return (await client.mutation(path, input)) as Result;
    } catch (error) {
      throw new Error(userFacingError(error));
    }
  },
};
