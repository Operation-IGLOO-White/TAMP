import { useQuery } from "@tanstack/react-query";
import { useTamp } from "@/context/TampContext";
import { trpc } from "@/lib/trpc";

export function useCharterEngagements() {
  const { authParty, role } = useTamp();
  return useQuery({
    queryKey: ["charter-bookings", authParty?.id, authParty?.activeOrganisationId],
    queryFn: () => trpc.query<{ incoming: boolean; status: string }[]>("charter.list"),
    enabled: role === "TRANSPORTER" && Boolean(authParty?.permissions?.includes("matches.read")),
    refetchInterval: 20_000,
    select: (rows) => rows.filter((row) => row.incoming && row.status === "REQUESTED").length,
  });
}
