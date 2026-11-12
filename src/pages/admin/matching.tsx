import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RotateCcw, Save, Scale, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { getMatchingConfiguration, saveMatchingConfiguration, type MatchingConfiguration } from "@/fns/admin-config";

const DEFAULTS: MatchingConfiguration = {
  maxPickupRadiusKm: 150,
  minimumScore: 70,
  weights: { proximity: 30, capacity: 25, timing: 20, lane: 15, rating: 10 },
  requireValidLicence: true,
  requireDocuments: true,
  requireVerifiedParties: true,
};

const WEIGHT_LABELS: Record<keyof MatchingConfiguration["weights"], { label: string; help: string }> = {
  proximity: { label: "Pickup proximity", help: "Rewards trucks that are closer to the collection point." },
  capacity: { label: "Capacity fit", help: "Rewards efficient payload utilisation without overloading." },
  timing: { label: "Pickup timing", help: "Measures overlap between load and truck availability." },
  lane: { label: "Preferred lane", help: "Rewards saved lanes and destination-province alignment." },
  rating: { label: "Carrier rating", help: "Uses the carrier's verified platform rating." },
};

export default function MatchingControls() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["matching-config"], queryFn: getMatchingConfiguration });
  const [form, setForm] = useState<MatchingConfiguration>(DEFAULTS);
  useEffect(() => { if (data) setForm(data); }, [data]);
  const totalWeight = useMemo(() => Object.values(form.weights).reduce((sum, value) => sum + Number(value), 0), [form.weights]);
  const valid = Math.abs(totalWeight - 100) < 0.01;
  const save = useMutation({
    mutationFn: () => saveMatchingConfiguration(form),
    onSuccess: (updated) => { queryClient.setQueryData(["matching-config"], updated); toast.success("Matching rules activated", { description: "New suggestions and acceptance checks now use this configuration." }); },
    onError: (error) => toast.error("Matching rules were not saved", { description: error.message }),
  });
  const setWeight = (key: keyof MatchingConfiguration["weights"], value: number) => setForm((current) => ({ ...current, weights: { ...current.weights, [key]: value } }));

  return (
    <AppShell>
      <PageHeader title="Matching Engine" actions={<button type="button" disabled={!valid || save.isPending || isLoading} onClick={() => save.mutate()} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-signal px-4 text-xs font-bold uppercase text-signal-foreground disabled:opacity-40"><Save className="size-4" /> Activate rules</button>} />
      <div className="space-y-5 p-4 sm:p-6">
        <div className="app-surface flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div><div className="flex items-center gap-2"><SlidersHorizontal className="size-5 text-signal" /><h2 className="font-black">Live rule configuration</h2></div><p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">These controls affect suggestion generation and the final eligibility check performed when either party accepts a match.</p></div>
          <button type="button" onClick={() => setForm(DEFAULTS)} className="inline-flex min-h-10 items-center gap-2 self-start rounded-md border border-border px-3 text-xs font-bold text-muted-foreground hover:text-foreground"><RotateCcw className="size-4" /> Restore recommended defaults</button>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,.6fr)]">
          <section className="app-surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h3 className="font-bold">Score weights</h3><p className="mt-0.5 text-xs text-muted-foreground">The five components must total 100 points.</p></div><span className={`rounded-full px-3 py-1 font-mono text-sm font-black ${valid ? "bg-positive/15 text-positive" : "bg-danger/15 text-danger"}`}>{totalWeight}/100</span></div>
            <div className="divide-y divide-border">
              {(Object.keys(WEIGHT_LABELS) as (keyof MatchingConfiguration["weights"])[]).map((key) => <div key={key} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(180px,1fr)_minmax(220px,1.2fr)_76px] sm:items-center"><div><p className="text-sm font-bold">{WEIGHT_LABELS[key].label}</p><p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{WEIGHT_LABELS[key].help}</p></div><input type="range" min="0" max="60" step="1" value={form.weights[key]} onChange={(event) => setWeight(key, Number(event.target.value))} className="accent-signal" /><div className="relative"><input type="number" min="0" max="100" value={form.weights[key]} onChange={(event) => setWeight(key, Number(event.target.value))} className="h-10 w-full rounded-md border border-border bg-background px-3 pr-7 text-right font-mono text-sm font-bold outline-none focus:border-signal" /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span></div></div>)}
            </div>
            {!valid && <div className="flex items-center gap-2 border-t border-danger/20 bg-danger/5 px-5 py-3 text-xs font-semibold text-danger"><AlertTriangle className="size-4" /> Adjust the weights by {Math.abs(100 - totalWeight)} points before saving.</div>}
          </section>

          <div className="space-y-5">
            <section className="app-surface p-5"><div className="flex items-center gap-2"><Scale className="size-4 text-signal" /><h3 className="font-bold">Eligibility thresholds</h3></div><label className="mt-5 block"><span className="flex items-center justify-between text-xs font-bold"><span>Maximum pickup radius</span><strong className="font-mono text-signal">{form.maxPickupRadiusKm} km</strong></span><input type="range" min="10" max="500" step="10" value={form.maxPickupRadiusKm} onChange={(event) => setForm((current) => ({ ...current, maxPickupRadiusKm: Number(event.target.value) }))} className="mt-3 w-full accent-signal" /><p className="mt-1 text-[10px] text-muted-foreground">Trucks outside this radius fail the hard filter.</p></label><label className="mt-6 block"><span className="flex items-center justify-between text-xs font-bold"><span>Minimum suggestion score</span><strong className="font-mono text-signal">{form.minimumScore}/100</strong></span><input type="range" min="0" max="100" step="1" value={form.minimumScore} onChange={(event) => setForm((current) => ({ ...current, minimumScore: Number(event.target.value) }))} className="mt-3 w-full accent-signal" /><p className="mt-1 text-[10px] text-muted-foreground">Eligible matches below this score are not suggested automatically.</p></label></section>
            <section className="app-surface overflow-hidden"><div className="flex items-center gap-2 border-b border-border px-5 py-4"><ShieldCheck className="size-4 text-signal" /><h3 className="font-bold">Mandatory safeguards</h3></div><div className="divide-y divide-border"><RuleSwitch label="Valid vehicle licence" help="Licence number and expiry must cover the pickup date." checked={form.requireValidLicence} onChange={(value) => setForm((current) => ({ ...current, requireValidLicence: value }))} /><RuleSwitch label="Required documents" help="All three vehicle compliance documents must be present." checked={form.requireDocuments} onChange={(value) => setForm((current) => ({ ...current, requireDocuments: value }))} /><RuleSwitch label="Verified parties" help="Both cargo owner and carrier must be verified and active." checked={form.requireVerifiedParties} onChange={(value) => setForm((current) => ({ ...current, requireVerifiedParties: value }))} /></div></section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function RuleSwitch({ label, help, checked, onChange }: { label: string; help: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <div className="flex items-start justify-between gap-4 px-5 py-4"><div><p className="text-xs font-bold">{label}</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{help}</p></div><button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-positive" : "bg-steel"}`}><span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} /></button></div>;
}
