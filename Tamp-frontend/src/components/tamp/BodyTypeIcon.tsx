import type { BodyType } from "@/lib/tamp-types";

// Human-readable labels for each truck body type.
export const BODY_TYPE_LABEL: Record<BodyType, string> = {
  TAUTLINER: "Tautliner",
  FLATBED: "Flatbed",
  TIPPER: "Tipper",
  TANKER: "Tanker",
  REFRIGERATED: "Refrigerated",
  SIDE_TIPPER: "Side Tipper",
  LOWBED: "Lowbed",
  DROPSIDE: "Dropside",
};

// Shared axle/wheels drawn under every body so the silhouettes read as trucks.
function Wheels() {
  return (
    <>
      <circle cx="7.5" cy="18.5" r="1.75" />
      <circle cx="16.5" cy="18.5" r="1.75" />
    </>
  );
}

// Distinct line-art body for each type, in lucide's stroke style (currentColor,
// no fill), so icons sit alongside the lucide set already used across the app.
const BODY_PATHS: Record<BodyType, React.ReactNode> = {
  // Enclosed curtain-side van — box with pleated curtain lines.
  TAUTLINER: (
    <>
      <rect x="2.5" y="6" width="19" height="9" rx="1.2" />
      <path d="M7 7v7M10.3 7v7M13.6 7v7M16.9 7v7" />
    </>
  ),
  // Open flat deck with a headboard at the front.
  FLATBED: (
    <>
      <path d="M2 13.5h20" />
      <path d="M3.5 13.5V7" />
    </>
  ),
  // Raised dump bin, tilted up at the rear (hinged at the back).
  TIPPER: (
    <>
      <path d="M3.5 15 6 6.5l14.5 3V15Z" />
      <path d="M20.5 15v1.5" />
    </>
  ),
  // Cylindrical tank — a capsule with an end cap and top hatch.
  TANKER: (
    <>
      <rect x="2" y="7" width="20" height="8" rx="4" />
      <path d="M16 7v8M11 6v1.2" />
    </>
  ),
  // Reefer box with a snowflake to mark refrigeration.
  REFRIGERATED: (
    <>
      <rect x="2.5" y="6" width="19" height="9" rx="1.2" />
      <path d="M12 8v5M9.7 9.3l4.6 2.4M14.3 9.3l-4.6 2.4" />
    </>
  ),
  // Bin tipping to the side — box with material spilling straight down.
  SIDE_TIPPER: (
    <>
      <rect x="4" y="6" width="15" height="7" rx="1" />
      <path d="M9 14.5l-1 2M12 14.5l-1 2M15 14.5l-1 2" />
    </>
  ),
  // Low-loader with a dropped deck (gooseneck front) for machinery.
  LOWBED: (
    <>
      <path d="M2 8h4v4.5h11.5V9.5H21" />
    </>
  ),
  // Open box with low fold-down sides (open top).
  DROPSIDE: <path d="M3 8v6.5h18V8" />,
};

export function BodyTypeIcon({
  type,
  className = "size-5",
}: {
  type: BodyType;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label={`${BODY_TYPE_LABEL[type]} body`}
    >
      {BODY_PATHS[type]}
      <Wheels />
    </svg>
  );
}
