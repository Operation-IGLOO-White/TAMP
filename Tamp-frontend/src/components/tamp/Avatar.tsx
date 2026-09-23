import { useState } from "react";
import type { Party } from "@/lib/tamp-types";

// Deterministic portrait for a party. Uses the party's own avatarUrl when set,
// otherwise a stable generated photo keyed by id, with an initials fallback if
// the image fails to load (keeps profiles working offline).
export function avatarSrc(party: Pick<Party, "id" | "avatarUrl">): string {
  return party.avatarUrl ?? `https://i.pravatar.cc/160?u=${encodeURIComponent(party.id)}`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const SIZES = {
  sm: "size-8 text-[11px]",
  md: "size-10 text-xs",
  lg: "size-20 text-2xl",
} as const;

export function Avatar({
  party,
  size = "md",
  className = "",
}: {
  party: Pick<Party, "id" | "avatarUrl" | "contactName" | "companyName">;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const label = party.contactName || party.companyName;
  const base = `${SIZES[size]} shrink-0 rounded-full overflow-hidden ring-1 ring-border ${className}`;

  if (failed) {
    return (
      <div
        className={`${base} bg-steel text-foreground font-bold uppercase flex items-center justify-center`}
        aria-hidden="true"
      >
        {initials(label)}
      </div>
    );
  }

  return (
    <img
      src={avatarSrc(party)}
      alt={label}
      onError={() => setFailed(true)}
      className={`${base} object-cover bg-steel`}
    />
  );
}
