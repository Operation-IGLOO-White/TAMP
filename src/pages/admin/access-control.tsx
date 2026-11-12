import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, KeyRound, LockKeyhole, Search, ShieldCheck, UserCog, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { Avatar } from "@/components/tamp/Avatar";
import { useTamp } from "@/context/TampContext";
import { listOrganisationMembers, listOrganisations, setOrganisationMemberRoles } from "@/fns/organisations";
import { getRbacConfiguration, setRolePermission, setUserPermission } from "@/fns/admin-config";
import { PERMISSION_DESCRIPTIONS, ROLE_IDS, ROLE_LABELS, ROLE_PERMISSIONS, type BuiltInRole } from "@/lib/rbac";
import type { OrganisationRole } from "@/types/domain";

type Tab = "assignments" | "matrix" | "user-rights";
const MATRIX_ROLES: BuiltInRole[] = ["SYSTEM_SUPER_USER", "ADMIN", "FREIGHT_OWNER", "TRANSPORTER", "CARGO_OPERATOR", "DISPATCHER", "DRIVER"];

export default function AccessControl() {
  const { authParty, parties } = useTamp();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("assignments");
  const [selectedOrganisationId, setSelectedOrganisationId] = useState("");
  const [query, setQuery] = useState("");
  const [permissionQuery, setPermissionQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const { data: organisations = [] } = useQuery({ queryKey: ["organisations"], queryFn: listOrganisations });
  const { data: rbac } = useQuery({ queryKey: ["admin-rbac"], queryFn: getRbacConfiguration, enabled: authParty?.systemRole === "system_super_user" });
  const activeOrganisationId = selectedOrganisationId || organisations[0]?.id || "";
  const activeOrganisation = organisations.find((organisation) => organisation.id === activeOrganisationId);
  const { data: members = [], isLoading } = useQuery({
    queryKey: ["organisation-members", activeOrganisationId],
    queryFn: () => listOrganisationMembers(activeOrganisationId),
    enabled: Boolean(activeOrganisationId),
  });
  const assignment = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: OrganisationRole }) => setOrganisationMemberRoles(activeOrganisationId, userId, [role]),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["organisation-members", activeOrganisationId] });
      toast.success("Organisation role updated");
    },
    onError: (error) => toast.error("Role was not changed", { description: error.message }),
  });
  const rolePermission = useMutation({
    mutationFn: ({ roleId, permission, enabled }: { roleId: string; permission: string; enabled: boolean }) => setRolePermission(roleId, permission, enabled),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin-rbac"] }); toast.success("Role permission updated"); },
    onError: (error) => toast.error("Permission was not changed", { description: error.message }),
  });
  const userPermission = useMutation({
    mutationFn: ({ userId, permission, enabled }: { userId: string; permission: string; enabled: boolean }) => setUserPermission(userId, permission, enabled),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin-rbac"] }); toast.success("User permission updated"); },
    onError: (error) => toast.error("User permission was not changed", { description: error.message }),
  });

  const carrier = ["CARRIER", "TRANSPORTER", "DRIVER_NETWORK"].includes(activeOrganisation?.type ?? "");
  const allowedRoles: OrganisationRole[] = authParty?.systemRole === "system_super_user"
    ? carrier ? ["TRANSPORTER", "DISPATCHER", "DRIVER"] : ["FREIGHT_OWNER", "CARGO_OPERATOR"]
    : carrier ? ["DISPATCHER", "DRIVER"] : ["CARGO_OPERATOR"];
  const visibleMembers = members.filter((member) => `${member.contactName} ${member.email} ${member.companyName}`.toLowerCase().includes(query.trim().toLowerCase()));
  const permissions = useMemo(() => Object.entries(PERMISSION_DESCRIPTIONS).filter(([code, description]) => `${code} ${description}`.toLowerCase().includes(permissionQuery.trim().toLowerCase())), [permissionQuery]);
  const canConfigure = authParty?.systemRole === "system_super_user" && Boolean(rbac);
  const selectedUser = parties.find((party) => party.id === (selectedUserId || parties.find((party) => party.systemRole !== "system_super_user")?.id));
  const liveRole = (role: BuiltInRole) => rbac?.roles.find((item) => item.id === (role === "SYSTEM_SUPER_USER" ? "ROLE-SYSTEM-SUPER-USER" : `ROLE-${role === "ADMIN" ? "PLATFORM-ADMIN" : role.replaceAll("_", "-")}`));

  return (
    <AppShell>
      <PageHeader title="Access Control" />
      <div className="space-y-5 p-4 sm:p-6">
        <div className="app-surface flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex items-center gap-2"><ShieldCheck className="size-5 text-signal" /><h2 className="font-black">Roles and permissions</h2></div><p className="mt-1 max-w-2xl text-xs text-muted-foreground">Assign backend-enforced organisation roles and inspect exactly what each built-in role can do.</p></div>
          <span className="inline-flex items-center gap-2 self-start rounded-full border border-border px-3 py-1.5 text-[10px] font-bold uppercase text-muted-foreground"><LockKeyhole className="size-3.5" /> Platform roles locked</span>
        </div>

        <div className="flex gap-1 border-b border-border">
          <button onClick={() => setTab("assignments")} className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold ${tab === "assignments" ? "border-signal text-foreground" : "border-transparent text-muted-foreground"}`}><Users className="size-4" /> User assignments</button>
          <button onClick={() => setTab("matrix")} className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold ${tab === "matrix" ? "border-signal text-foreground" : "border-transparent text-muted-foreground"}`}><KeyRound className="size-4" /> Permission matrix</button>
          <button onClick={() => setTab("user-rights")} className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold ${tab === "user-rights" ? "border-signal text-foreground" : "border-transparent text-muted-foreground"}`}><UserCog className="size-4" /> User overrides</button>
        </div>

        {tab === "assignments" && (
          <section className="app-surface overflow-hidden">
            <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[280px_minmax(240px,1fr)_auto] md:items-center">
              <select value={activeOrganisationId} onChange={(event) => setSelectedOrganisationId(event.target.value)} aria-label="Select organisation" className="h-11 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-signal">{organisations.map((organisation) => <option key={organisation.id} value={organisation.id}>{organisation.name} · {organisation.type.replaceAll("_", " ")}</option>)}</select>
              <label className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search members" className="h-11 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-signal" /></label>
              <span className="text-xs text-muted-foreground">{members.length} member{members.length === 1 ? "" : "s"}</span>
            </div>
            <div className="divide-y divide-border">
              {isLoading && <p className="p-10 text-center text-sm text-muted-foreground">Loading organisation access…</p>}
              {!isLoading && visibleMembers.length === 0 && <p className="p-10 text-center text-sm text-muted-foreground">No members found.</p>}
              {visibleMembers.map((member) => {
                const currentRole = (Object.entries(ROLE_IDS).find(([, id]) => member.roleIds.includes(id))?.[0] ?? allowedRoles[0]) as OrganisationRole;
                const role = allowedRoles.includes(currentRole) ? currentRole : allowedRoles[0]!;
                return (
                  <div key={member.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(220px,1fr)_minmax(180px,.6fr)_minmax(220px,.8fr)] md:items-center">
                    <div className="flex min-w-0 items-center gap-3"><Avatar party={member} size="sm" /><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-bold">{member.contactName}</p>{member.isPrimary && <span className="rounded bg-signal/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-signal">Primary admin</span>}</div><p className="truncate text-xs text-muted-foreground">{member.email}</p></div></div>
                    <div><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Account</p><p className="mt-1 text-xs font-semibold">{member.verification}{member.suspended ? " · Suspended" : ""}</p></div>
                    <label><span className="sr-only">Role for {member.contactName}</span><select value={role} disabled={assignment.isPending} onChange={(event) => assignment.mutate({ userId: member.id, role: event.target.value as OrganisationRole })} className="h-10 w-full rounded-md border border-border bg-background px-3 text-xs font-semibold outline-none focus:border-signal disabled:opacity-50">{allowedRoles.map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}</select></label>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === "matrix" && (
          <section className="app-surface overflow-hidden">
            <div className="border-b border-border p-4"><label className="relative block max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={permissionQuery} onChange={(event) => setPermissionQuery(event.target.value)} placeholder="Search permissions" className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-signal" /></label></div>
            <div className="overflow-x-auto"><table className="min-w-[1120px] w-full text-left text-xs"><thead><tr className="border-b border-border bg-steel/30 text-[10px] uppercase tracking-wide text-muted-foreground"><th className="sticky left-0 z-10 bg-graphite px-4 py-3">Permission</th>{MATRIX_ROLES.map((role) => <th key={role} className="px-3 py-3 text-center">{ROLE_LABELS[role]}</th>)}</tr></thead><tbody className="divide-y divide-border">{permissions.map(([code, description]) => <tr key={code} className="hover:bg-steel/20"><td className="sticky left-0 z-10 bg-graphite px-4 py-3"><p className="font-mono font-bold">{code}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{description}</p></td>{MATRIX_ROLES.map((role) => { const live = liveRole(role); const enabled = live ? live.permissions.includes(code) : ROLE_PERMISSIONS[role].includes(code); const locked = role === "SYSTEM_SUPER_USER" || !canConfigure; return <td key={role} className="px-3 py-3 text-center"><PermissionToggle enabled={enabled} disabled={locked || rolePermission.isPending} label={`${ROLE_LABELS[role]}: ${code}`} onChange={(value) => live && rolePermission.mutate({ roleId: live.id, permission: code, enabled: value })} /></td>; })}</tr>)}</tbody></table></div>
            <div className="border-t border-border px-4 py-3 text-[10px] text-muted-foreground">Role changes are enforced by the backend immediately. System super-user permissions remain immutable to prevent platform lockout.</div>
          </section>
        )}

        {tab === "user-rights" && (
          <section className="app-surface overflow-hidden">
            <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[320px_1fr] md:items-center">
              <select value={selectedUser?.id ?? ""} onChange={(event) => setSelectedUserId(event.target.value)} aria-label="Select user" className="h-11 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-signal">{parties.filter((party) => party.systemRole !== "system_super_user").map((party) => <option key={party.id} value={party.id}>{party.contactName} · {party.companyName}</option>)}</select>
              <p className="text-xs text-muted-foreground">Overrides apply only to this user and take precedence over their assigned role. Toggle a right on to grant it, or off to deny it.</p>
            </div>
            {selectedUser ? <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">{permissions.map(([code, description]) => { const override = rbac?.userOverrides[selectedUser.id]?.[code]; const inherited = selectedUser.permissions?.includes(code) ?? false; const enabled = override ?? inherited; return <div key={code} className="rounded-xl border border-border bg-background p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold">{code}</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{description}</p></div><PermissionToggle enabled={enabled} disabled={!canConfigure || userPermission.isPending} label={`${selectedUser.contactName}: ${code}`} onChange={(value) => userPermission.mutate({ userId: selectedUser.id, permission: code, enabled: value })} /></div><p className="mt-2 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{override === undefined ? "Inherited from role" : `User override: ${override ? "allowed" : "denied"}`}</p></div>; })}</div> : <p className="p-10 text-center text-sm text-muted-foreground">No configurable user selected.</p>}
          </section>
        )}
      </div>
    </AppShell>
  );
}

function PermissionToggle({ enabled, disabled, label, onChange }: { enabled: boolean; disabled: boolean; label: string; onChange: (enabled: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={enabled} aria-label={label} disabled={disabled} onClick={() => onChange(!enabled)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? "bg-positive" : "bg-steel"} disabled:cursor-not-allowed disabled:opacity-50`}><span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`}>{enabled && <Check className="m-1 size-3 text-positive" />}</span></button>;
}
