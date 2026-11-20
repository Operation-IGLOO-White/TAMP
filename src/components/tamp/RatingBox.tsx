import { Send, Star } from "lucide-react";
import { useState } from "react";
import type { Rating } from "@/types/domain";

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
  const [selectedStars, setSelectedStars] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
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
            <div className="flex items-center justify-center gap-1 rounded-lg border border-border bg-background/50 p-2">
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSelectedStars(n)}
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  aria-pressed={selectedStars === n}
                  className="group grid size-9 place-items-center rounded-md transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                >
                  <Star
                    className={`size-6 transition-colors ${
                      selectedStars !== null && n <= selectedStars
                        ? "fill-signal text-signal"
                        : "text-muted-foreground/45 group-hover:text-signal"
                    }`}
                  />
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-semibold text-muted-foreground">
                {selectedStars ? `${selectedStars} out of 5 selected` : "Choose a rating"}
              </span>
              <button
                type="button"
                disabled={selectedStars === null}
                onClick={() => {
                  if (selectedStars === null) return;
                  onRate(selectedStars, note.trim(), tags);
                }}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-signal px-4 text-[10px] font-black uppercase tracking-wide text-signal-foreground transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="size-3.5" /> Submit rating
              </button>
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
