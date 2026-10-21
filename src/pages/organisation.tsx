import { Building2, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { useTamp } from "@/context/TampContext";
import {
  addOrganisationMember,
  createOrganisation,
  listOrganisationMembers,
  listOrganisations,
  removeOrganisationMember,
  setOrganisationMemberRoles,
  switchOrganisation,
  updateOrganisation,
} from "@/fns/organisations";
import type { Role } from "@/types/domain";

const ROLE_IDS: Record<Exclude<Role, "ADMIN">, string> = {
  FREIGHT_OWNER: "ROLE-FREIGHT-OWNER",
  TRANSPORTER: "ROLE-TRANSPORTER",
  DRIVER: "ROLE-DRIVER",
};
const ROLE_LABEL: Record<Exclude<Role, "ADMIN">, string> = {
  FREIGHT_OWNER: "Freight owner",
  TRANSPORTER: "Transporter",
  DRIVER: "Driver",
};

export default function OrganisationPage() {
  const { authParty } = useTamp();
  const queryClient = useQueryClient();
  const canManage = authParty?.permissions?.includes("organisations.manage") ?? false;
  const { data: organisations = [] } = useQuery({ queryKey: ["organisations"], queryFn: listOrganisations });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeId = selectedId ?? authParty?.activeOrganisationId ?? organisations[0]?.id ?? null;
  const active = organisations.find((item) => item.id === activeId);
  const { data: members = [] } = useQuery({
    queryKey: ["organisation-members", activeId],
    queryFn: () => listOrganisationMembers(activeId!),
    enabled: Boolean(activeId),
  });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<Role, "ADMIN">>("DRIVER");
  const [newName, setNewName] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["organisation-members", activeId] });
  const add = useMutation({
    mutationFn: () => addOrganisationMember({ organisationId: activeId!, email, role }),
    onSuccess: () => { setEmail(""); void refresh(); toast.success("Member added"); },
    onError: (error) => toast.error("Could not add member", { description: error.message }),
  });
  const create = useMutation({
    mutationFn: () => createOrganisation({ name: newName, type: "CARRIER" }),
    onSuccess: (organisation) => { setNewName(""); setSelectedId(organisation.id); void queryClient.invalidateQueries({ queryKey: ["organisations"] }); toast.success("Organisation created"); },
    onError: (error) => toast.error("Could not create organisation", { description: error.message }),
  });

  return <AppShell><PageHeader title="Organisation" />
    <div className="grid gap-5 p-5 xl:grid-cols-[280px_1fr]">
      <aside className="rounded-lg border border-border bg-white p-3">
        <div className="mb-3 flex items-center gap-2 px-2 text-xs font-bold uppercase tracking-widest text-muted-foreground"><Building2 className="size-4" /> Organisations</div>
        <div className="space-y-1">{organisations.map((organisation) => <button key={organisation.id} onClick={() => setSelectedId(organisation.id)} className={`w-full rounded-md px-3 py-2 text-left ${organisation.id === activeId ? "bg-signal/10 ring-1 ring-signal/30" : "hover:bg-steel/40"}`}><div className="truncate text-sm font-bold">{organisation.name}</div><div className="mt-0.5 text-[10px] uppercase text-muted-foreground">{organisation.type.replaceAll("_", " ")}{organisation.id === authParty?.activeOrganisationId ? " · Active" : ""}</div></button>)}</div>
        {canManage && <form className="mt-4 border-t border-border pt-3" onSubmit={(event) => { event.preventDefault(); if (newName.trim()) create.mutate(); }}><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="New organisation name" className="w-full rounded-md border border-border px-3 py-2 text-sm" /><button disabled={!newName.trim() || create.isPending} className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-foreground px-3 py-2 text-xs font-bold text-background disabled:opacity-40"><Plus className="size-4" /> Create</button></form>}
      </aside>
      <main className="min-w-0 space-y-5">
        {active ? <>
          <section className="rounded-lg border border-border bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Building2 className="size-5 text-signal" /><h2 className="text-xl font-black">{active.name}</h2></div><p className="mt-1 text-xs text-muted-foreground">{active.type.replaceAll("_", " ")} · {active.verification}</p></div>{active.id !== authParty?.activeOrganisationId && <button onClick={() => void switchOrganisation(active.id).then(() => window.location.reload())} className="rounded-md bg-signal px-4 py-2 text-xs font-bold text-signal-foreground">Use this organisation</button>}</div>{canManage && <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); const input = new FormData(event.currentTarget).get("name")?.toString().trim(); if (input) void updateOrganisation(active.id, input).then(() => queryClient.invalidateQueries({ queryKey: ["organisations"] })); }}><input name="name" defaultValue={active.name} className="flex-1 rounded-md border border-border px-3 py-2 text-sm" /><button className="rounded-md border border-border px-4 text-xs font-bold">Save name</button></form>}</section>
          <section className="rounded-lg border border-border bg-white"><div className="flex items-center gap-2 border-b border-border p-4"><Users className="size-4 text-signal" /><h3 className="font-bold">Members</h3><span className="ml-auto text-xs text-muted-foreground">{members.length}</span></div>
            {canManage && <form className="grid gap-2 border-b border-border p-4 sm:grid-cols-[1fr_180px_auto]" onSubmit={(event) => { event.preventDefault(); if (email) add.mutate(); }}><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Registered user email" className="rounded-md border border-border px-3 py-2 text-sm" /><select value={role} onChange={(event) => setRole(event.target.value as Exclude<Role, "ADMIN">)} className="rounded-md border border-border px-3 py-2 text-sm"><option value="DRIVER">Driver</option><option value="TRANSPORTER">Transporter</option><option value="FREIGHT_OWNER">Freight owner</option></select><button disabled={add.isPending || !email} className="rounded-md bg-signal px-4 py-2 text-xs font-bold text-signal-foreground disabled:opacity-40">Add member</button></form>}
            <div className="divide-y divide-border">{members.map((member) => { const currentRole = (Object.entries(ROLE_IDS).find(([, id]) => member.roleIds.includes(id))?.[0] ?? "DRIVER") as Exclude<Role, "ADMIN">; return <div key={member.id} className="flex flex-wrap items-center gap-3 p-4"><div className="grid size-9 place-items-center rounded-full bg-steel text-xs font-black">{member.contactName.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{member.contactName}</div><div className="truncate text-xs text-muted-foreground">{member.email}</div></div>{canManage ? <select value={currentRole} onChange={(event) => void setOrganisationMemberRoles(active.id, member.id, [event.target.value as Exclude<Role, "ADMIN">]).then(refresh)} className="rounded-md border border-border px-2 py-1.5 text-xs">{Object.entries(ROLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <span className="flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" />{ROLE_LABEL[currentRole]}</span>}{canManage && member.id !== authParty?.id && <button aria-label={`Remove ${member.contactName}`} onClick={() => void removeOrganisationMember(active.id, member.id).then(refresh).catch((error: Error) => toast.error("Could not remove member", { description: error.message }))} className="grid size-8 place-items-center rounded-md text-danger hover:bg-danger/10"><Trash2 className="size-4" /></button>}</div>; })}</div>
          </section>
        </> : <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">No organisation selected.</div>}
      </main>
    </div>
  </AppShell>;
}
