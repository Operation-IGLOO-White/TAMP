import { Star } from "lucide-react";
import { useState } from "react";
import type { Rating } from "@/lib/tamp-types";

const RATING_TAGS = [
  "On time",
  "Professional",
  "Cargo secured",
  "Good comms",
  "Late",
  "Damaged",
  "Poor comms",
  "Doc issues",
];

/**
 * Two-way rating surface for graphite panels. Shows the form until the current
 * party has rated, then a summary; and the rating received from the other side.
 */
export function RatingBox({
  title,
  receivedTitle,
  myRating,
  receivedRating,
  onRate,
}: {
  title: string;
  receivedTitle: string;
  myRating: Rating | undefined;
  receivedRating: Rating | undefined;
  onRate: (stars: 1 | 2 | 3 | 4 | 5, comment: string, tags: string[]) => void;
}) {
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const toggle = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  return (
    <div className="space-y-3 border-t border-border px-4 py-3">
      <div>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {title}
        </div>
        {myRating ? (
          <RatingSummary rating={myRating} />
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {RATING_TAGS.map((t) => (
                <button
                  key={t}
                  onClick={() => toggle(t)}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    tags.includes(t)
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional feedback"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-signal"
            />
            <div className="flex gap-1">
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => onRate(n, note || "No comment", tags)}
                  className="flex-1 rounded-md border border-border py-1.5 text-xs font-bold hover:bg-signal hover:text-signal-foreground"
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {receivedRating && (
        <div className="border-t border-border pt-2">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {receivedTitle}
          </div>
          <RatingSummary rating={receivedRating} />
        </div>
      )}
    </div>
  );
}

function RatingSummary({ rating }: { rating: Rating }) {
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-center gap-1 font-bold">
        <Star className="size-3.5 fill-signal text-signal" /> {rating.stars}/5
        {rating.comment && (
          <span className="ml-1 font-normal italic text-muted-foreground">{rating.comment}</span>
        )}
      </div>
      {rating.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {rating.tags.map((t) => (
            <span key={t} className="rounded-full bg-steel px-2 py-0.5 text-[10px] font-semibold">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
