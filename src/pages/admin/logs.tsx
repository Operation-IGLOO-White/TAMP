import { Download, FileText, Folder, RefreshCw, Search, Server } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/tamp/AppShell";
import { listSystemLogs, readSystemLog, systemLogDownloadUrl, type SystemLogFile, type SystemLogGroup } from "@/fns/system-logs";

const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

function SystemLogsPage() {
  const [groups, setGroups] = useState<SystemLogGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState("modules");
  const [selected, setSelected] = useState<SystemLogFile | null>(null);
  const [content, setContent] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadIndex = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listSystemLogs();
      setGroups(result.groups);
      const files = result.groups.find((group) => group.name === activeGroup)?.files ?? [];
      setSelected((previous) => files.find((file) => file.path === previous?.path) ?? files[0] ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "System logs could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [activeGroup]);

  useEffect(() => { void loadIndex(); }, [loadIndex]);
  useEffect(() => {
    if (!selected) { setContent(""); return; }
    let active = true;
    readSystemLog(activeGroup, selected.name)
      .then((result) => { if (active) { setContent(result.content); setTruncated(result.truncated); } })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : "Log could not be read"));
    return () => { active = false; };
  }, [activeGroup, selected]);

  const files = useMemo(
    () => groups.find((group) => group.name === activeGroup)?.files ?? [],
    [activeGroup, groups],
  );
  const visibleFiles = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value ? files.filter((file) => file.name.toLowerCase().includes(value)) : files;
  }, [files, query]);

  const chooseGroup = (name: string) => {
    setActiveGroup(name);
    setQuery("");
    setSelected(groups.find((group) => group.name === name)?.files[0] ?? null);
  };

  return (
    <AppShell>
      <PageHeader title="System Logs" actions={
        <button onClick={() => void loadIndex()} className="inline-flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-xs font-semibold hover:bg-steel/30">
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      } />
      <div className="flex min-h-full flex-col bg-[#f7f9fb] p-4 sm:p-6">
        <p className="mb-5 text-sm text-muted-foreground">Browse backend module and service log files directly from the server.</p>
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm">
          <Server className="size-4 text-muted-foreground" /><span className="text-muted-foreground">logs</span><span>›</span><strong>{activeGroup}</strong>
        </div>
        {error && <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</div>}
        <div className="grid min-h-[620px] flex-1 overflow-hidden rounded-xl border border-border bg-white lg:grid-cols-[minmax(280px,40%)_1fr]">
          <section className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
            <div className="grid grid-cols-2 border-b border-border bg-[#f8fafc]">
              {groups.map((group) => (
                <button key={group.name} onClick={() => chooseGroup(group.name)} className={`flex items-center justify-center gap-2 px-3 py-3 text-xs font-bold capitalize ${activeGroup === group.name ? "bg-white text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  <Folder className="size-4" />{group.name}<span className="rounded-full bg-steel/50 px-1.5 text-[10px]">{group.files.length}</span>
                </button>
              ))}
            </div>
            <label className="m-3 flex items-center gap-2 rounded-md border border-border px-3 py-2">
              <Search className="size-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter this folder…" className="w-full bg-transparent text-sm outline-none" />
            </label>
            <div className="min-h-0 flex-1 overflow-y-auto border-t border-border">
              {visibleFiles.map((file) => (
                <button key={file.path} onClick={() => setSelected(file)} className={`flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left text-sm hover:bg-[#f4f7f9] ${selected?.path === file.path ? "bg-[#edf3f7]" : ""}`}>
                  <FileText className="size-4 shrink-0 text-slate-500" /><span className="min-w-0 flex-1 truncate">{file.name}</span><span className="text-[11px] text-muted-foreground">{formatBytes(file.size)}</span>
                </button>
              ))}
              {!loading && visibleFiles.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No log files found.</p>}
            </div>
          </section>
          <section className="flex min-h-0 flex-col">
            {selected ? <>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div><div className="flex items-center gap-2 text-sm font-bold"><Folder className="size-4" />{activeGroup}/{selected.name}</div><p className="mt-0.5 text-[11px] text-muted-foreground">{formatBytes(selected.size)} · modified {new Date(selected.modifiedAt * 1000).toLocaleString("en-ZA")}</p></div>
                <a href={systemLogDownloadUrl(activeGroup, selected.name)} download className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-semibold hover:bg-steel/30"><Download className="size-3.5" /> Download</a>
              </header>
              {truncated && <div className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs text-muted-foreground">Showing the latest 512 KB of this log.</div>}
              <pre className="min-h-0 flex-1 overflow-auto bg-[#fbfcfd] p-4 font-mono text-[12px] leading-5 text-slate-800">{content || "This log file is currently empty."}</pre>
            </> : <div className="grid flex-1 place-items-center text-center text-sm text-muted-foreground"><div><FileText className="mx-auto mb-2 size-8" />Select a log file to inspect it.</div></div>}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

export default SystemLogsPage;
