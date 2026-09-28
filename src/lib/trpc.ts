import { createTRPCUntypedClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

// Backend source is not required to build the frontend. Response contracts live
// in types/ and fns/; verify them against the backend when it is available.
const client = createTRPCUntypedClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers: { "X-TAMP-Request": "1" },
      fetch: (url, options) =>
        fetch(url, { ...options, signal: options?.signal ?? null, credentials: "include" }),
    }),
  ],
});

// This is the single unchecked wire boundary until a shared backend contract
// package is available. The fns/ wrappers specify the expected response types.
export const trpc = {
  query<Result>(path: string, input?: unknown): Promise<Result> {
    return client.query(path, input) as Promise<Result>;
  },
  mutation<Result>(path: string, input?: unknown): Promise<Result> {
    return client.mutation(path, input) as Promise<Result>;
  },
};
