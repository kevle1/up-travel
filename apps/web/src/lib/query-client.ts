import { QueryCache, QueryClient } from "@tanstack/react-query";
import { HttpError } from "./api";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: true, staleTime: 30_000 } },
  // Any 401 from a query invalidates auth/me, which bounces the user back to
  // the Login screen via AuthGate. Cheap way to handle expired/cleared cookies
  // without threading "are you authed?" into every component.
  queryCache: new QueryCache({
    onError: (err, query) => {
      if (err instanceof HttpError && err.status === 401) {
        if (query.queryKey[0] !== "auth") {
          queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
        }
      }
    },
  }),
});
