import React, { useState, useMemo, useEffect } from "react";
import {
  LayoutDashboard, Users, Briefcase, CheckSquare, FileText, Wallet,
  BarChart3, Settings, Bell, Search, Plus, X, Trash2, Pencil,
  Calendar as CalendarIcon, Download, ArrowUpRight, ArrowDownRight,
  ChevronRight, ChevronLeft, CircleDot, Eye, Printer, AlertTriangle, LogOut, Paperclip, UploadCloud,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { useAuth } from "./context/AuthContext.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
import {
  clientsApi, projectsApi, tasksApi, invoicesApi, expensesApi, profileApi, attachmentsApi, loadAllData,
} from "./lib/api.js";

// ---------- palette ----------
const INK = "#161B22";
const INK_SOFT = "#232B33";
const PAPER = "#F1EEE6";
const PAPER_DIM = "#E7E2D6";
const LINE = "#D8D2C2";
const GOLD = "#C08A28";
const GREEN = "#2F6F4E";
const RUST = "#B4432D";
const TEXT_MUTED = "#6B7280";

const fmt = (n) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const uid = () => Math.random().toString(36).slice(2, 9);

function initials(nameOrEmail) {
  if (!nameOrEmail) return "?";
  const parts = nameOrEmail.includes("@") ? [nameOrEmail[0]] : nameOrEmail.trim().split(/\s+/).map((p) => p[0]);
  return parts.slice(0, 2).join("").toUpperCase();
}

// Illustrative revenue/expense trend for the dashboard chart. Swap for a
// real monthly aggregate (e.g. a Supabase RPC/view) once you have enough
// invoice/expense history to chart.
const monthlyTrend = [
  { m: "Mar", revenue: 3000, expense: 900 },
  { m: "Apr", revenue: 5200, expense: 1100 },
  { m: "May", revenue: 6100, expense: 1400 },
  { m: "Jun", revenue: 7300, expense: 1250 },
  { m: "Jul", revenue: 5400, expense: 1600 },
  { m: "Aug", revenue: 10500, expense: 1193 },
];

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "clients", label: "Clients", icon: Users },
  { id: "projects", label: "Projects", icon: Briefcase },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "calendar", label: "Calendar", icon: CalendarIcon },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "expenses", label: "Expenses", icon: Wallet },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

function invoiceTotal(inv) {
  const sub = inv.items.reduce((s, it) => s + it.qty * it.rate, 0);
  return sub + inv.tax - inv.discount;
}

function statusColor(status) {
  const map = {
    Paid: GREEN, Active: GREEN, "In Progress": GOLD, Pending: GOLD,
    Lead: "#6E7B8B", "To Do": "#6E7B8B", Planning: "#6E7B8B",
    Overdue: RUST, Past: "#6E7B8B", Review: "#3D6E93",
    Completed: GREEN, Partial: GOLD, Urgent: RUST, High: GOLD,
    Medium: "#3D6E93", Low: "#6E7B8B",
  };
  return map[status] || TEXT_MUTED;
}

function Badge({ children }) {
  const c = statusColor(children);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
      style={{ color: c, backgroundColor: c + "1A", border: `1px solid ${c}33` }}
    >
      <CircleDot size={9} strokeWidth={3} />
      {children}
    </span>
  );
}

function SectionTitle({ eyebrow, title, action }) {
  return (
    <div className="flex items-end justify-between mb-6 pb-4" style={{ borderBottom: `1px solid ${LINE}` }}>
      <div>
        {eyebrow && <div className="text-xs mb-1" style={{ color: TEXT_MUTED }}>{eyebrow}</div>}
        <h1 className="text-2xl" style={{ fontFamily: "Georgia, serif", color: INK }}>{title}</h1>
      </div>
      {action}
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", icon: Icon, type = "button" }) {
  const base = "inline-flex items-center gap-1.5 rounded px-3.5 py-2 text-sm font-medium transition-colors";
  const styles =
    variant === "primary"
      ? { backgroundColor: INK, color: PAPER }
      : variant === "danger"
      ? { backgroundColor: "transparent", color: RUST, border: `1px solid ${RUST}55` }
      : { backgroundColor: "transparent", color: INK, border: `1px solid ${LINE}` };
  return (
    <button type={type} onClick={onClick} className={base} style={styles}>
      {Icon && <Icon size={15} />}
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>{label}</span>
      {children}
    </label>
  );
}

const inputCls = "w-full rounded px-3 py-2 text-sm outline-none";
const inputStyle = { border: `1px solid ${LINE}`, backgroundColor: "#FFFFFF", color: INK };

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "#00000055" }}>
      <div className="w-full max-w-lg rounded-lg overflow-hidden" style={{ backgroundColor: PAPER, border: `1px solid ${LINE}` }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${LINE}` }}>
          <h3 style={{ fontFamily: "Georgia, serif", color: INK }} className="text-lg">{title}</h3>
          <button onClick={onClose}><X size={18} color={TEXT_MUTED} /></button>
        </div>
        <div className="p-5 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Top-level export: gates on auth, then loads the signed-in user's data
// from Supabase before handing off to the dashboard shell below.
export default function App() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!user) { setData(null); return; }
    let cancelled = false;
    setLoadError("");
    Promise.all([loadAllData(), profileApi.get().catch(() => null)])
      .then(([d, p]) => {
        if (cancelled) return;
        setData(d);
        setProfile(p);
      })
      .catch((err) => !cancelled && setLoadError(err.message || "Failed to load your data."));
    return () => { cancelled = true; };
  }, [user]);

  if (authLoading) return <CenteredMessage>Loading…</CenteredMessage>;
  if (!user) return <AuthScreen />;
  if (loadError) return <CenteredMessage>{loadError}</CenteredMessage>;
  if (!data) return <CenteredMessage>Loading your workspace…</CenteredMessage>;

  return <FreelancerOS initialData={data} profile={profile} setProfile={setProfile} onSignOut={signOut} />;
}

function CenteredMessage({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: PAPER, color: INK }}>
      {children}
    </div>
  );
}

function FreelancerOS({ initialData, profile, setProfile, onSignOut }) {
  const [tab, setTab] = useState("dashboard");
  const [clients, setClients] = useState(initialData.clients);
  const [projects, setProjects] = useState(initialData.projects);
  const [tasks, setTasks] = useState(initialData.tasks);
  const [invoices, setInvoices] = useState(initialData.invoices);
  const [expenses, setExpenses] = useState(initialData.expenses);
  const [modal, setModal] = useState(null); // { kind, data }
  const [search, setSearch] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [printInvoiceId, setPrintInvoiceId] = useState(null);

  const clientName = (id) => clients.find((c) => c.id === id)?.name || "—";
  const projectName = (id) => projects.find((p) => p.id === id)?.name || "—";

  const totals = useMemo(() => {
    const revenue = invoices.filter((i) => i.status === "Paid").reduce((s, i) => s + invoiceTotal(i), 0);
    const pending = invoices.filter((i) => i.status !== "Paid").reduce((s, i) => s + invoiceTotal(i), 0);
    const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
    const profit = revenue - expenseTotal;
    return { revenue, pending, expenseTotal, profit };
  }, [invoices, expenses]);

  const upcoming = useMemo(() => {
    const items = [
      ...tasks.filter((t) => t.status !== "Completed").map((t) => ({ label: t.title, date: t.deadline, type: "Task" })),
      ...projects.filter((p) => p.status !== "Completed").map((p) => ({ label: p.name, date: p.deadline, type: "Project" })),
      ...invoices.filter((i) => i.status !== "Paid").map((i) => ({ label: i.number, date: i.due, type: "Invoice" })),
    ];
    return items.sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 6);
  }, [tasks, projects, invoices]);

  const expenseByCategory = useMemo(() => {
    const m = {};
    expenses.forEach((e) => (m[e.category] = (m[e.category] || 0) + e.amount));
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [expenses]);

  const revenueByClient = useMemo(() => {
    const m = {};
    invoices.filter((i) => i.status === "Paid").forEach((i) => {
      const n = clientName(i.clientId);
      m[n] = (m[n] || 0) + invoiceTotal(i);
    });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [invoices, clients]);

  const PIE_COLORS = [GOLD, GREEN, "#3D6E93", RUST, "#6E7B8B"];

  const notifications = useMemo(() => {
    const today = new Date();
    const inDays = (d) => (new Date(d) - today) / 86400000;
    const items = [];
    invoices.forEach((i) => {
      if (i.status === "Overdue") items.push({ label: `${i.number} is overdue`, sub: clientName(i.clientId), urgent: true, tab: "invoices" });
      else if (i.status === "Pending" && inDays(i.due) <= 3) items.push({ label: `${i.number} due ${i.due}`, sub: clientName(i.clientId), urgent: false, tab: "invoices" });
    });
    tasks.forEach((t) => {
      if (t.status !== "Completed" && inDays(t.deadline) <= 3) items.push({ label: t.title, sub: `Task due ${t.deadline}`, urgent: inDays(t.deadline) < 0, tab: "tasks" });
    });
    projects.forEach((p) => {
      if (p.status !== "Completed" && inDays(p.deadline) <= 3) items.push({ label: p.name, sub: `Project due ${p.deadline}`, urgent: inDays(p.deadline) < 0, tab: "projects" });
    });
    return items;
  }, [invoices, tasks, projects, clients]);

  // ---------- Supabase-backed mutation helpers ----------
  // Each entity gets delete + save (create/update) wired to the matching api module.
  const [actionError, setActionError] = useState("");
  const withErrorHandling = (fn) => async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      setActionError(err.message || "Something went wrong. Please try again.");
    }
  };

  const del = (api, setter) => withErrorHandling(async (id) => {
    await api.remove(id);
    setter((arr) => arr.filter((x) => x.id !== id));
  });

  const delClient = del(clientsApi, setClients);
  const delProject = del(projectsApi, setProjects);
  const delTask = del(tasksApi, setTasks);
  const delInvoice = del(invoicesApi, setInvoices);
  const delExpense = del(expensesApi, setExpenses);

  // Called by EditModal after a successful create/update.
  function handleSaved(kind, record, isEdit) {
    const setterMap = { client: setClients, project: setProjects, task: setTasks, invoice: setInvoices, expense: setExpenses };
    const setter = setterMap[kind];
    setter((arr) => (isEdit ? arr.map((x) => (x.id === record.id ? record : x)) : [record, ...arr]));
  }

  const moveTask = withErrorHandling(async (id, status) => {
    const updated = await tasksApi.update(id, { status });
    setTasks((arr) => arr.map((t) => (t.id === id ? updated : t)));
  });

  return (
    <div className="flex min-h-screen w-full" style={{ backgroundColor: PAPER, fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif" }}>
      {/* Sidebar */}
      <aside className="w-56 shrink-0 flex flex-col" style={{ backgroundColor: INK }}>
        <div className="px-5 py-5" style={{ borderBottom: `1px solid ${INK_SOFT}` }}>
          <div className="text-[10px] tracking-wide" style={{ color: GOLD }}>Ledger for freelancers</div>
          <div className="text-lg mt-0.5" style={{ fontFamily: "Georgia, serif", color: PAPER }}>FreelancerOS</div>
        </div>
        <nav className="flex-1 py-3">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = tab === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className="w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-colors"
                style={{
                  color: active ? PAPER : "#8B93A0",
                  backgroundColor: active ? INK_SOFT : "transparent",
                  borderLeft: active ? `2px solid ${GOLD}` : "2px solid transparent",
                }}
              >
                <Icon size={16} />
                {n.label}
              </button>
            );
          })}
        </nav>
        <div className="px-5 py-4 flex items-center justify-between text-xs" style={{ color: "#5B6472", borderTop: `1px solid ${INK_SOFT}` }}>
          <div>
            {profile?.full_name || profile?.email || "Your account"}
            {profile?.business_name && <><br />{profile.business_name}</>}
          </div>
          <button onClick={onSignOut} title="Sign out"><LogOut size={14} /></button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0">
        <header className="flex items-center justify-between px-8 py-4" style={{ borderBottom: `1px solid ${LINE}` }}>
          <div className="flex items-center gap-2 rounded px-3 py-1.5 w-72" style={{ border: `1px solid ${LINE}`, backgroundColor: "#FFFFFF" }}>
            <Search size={15} color={TEXT_MUTED} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients, projects, invoices…"
              className="text-sm outline-none w-full bg-transparent"
            />
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <button className="relative" onClick={() => setNotifOpen((v) => !v)}>
                <Bell size={18} color={INK} />
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ backgroundColor: RUST }} />
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-3 w-80 rounded z-40" style={{ backgroundColor: "#FFFFFF", border: `1px solid ${LINE}`, boxShadow: "0 8px 24px #00000022" }}>
                  <div className="px-4 py-3 text-xs font-medium" style={{ borderBottom: `1px solid ${LINE}`, color: TEXT_MUTED }}>
                    {notifications.length ? `${notifications.length} alerts` : "No alerts"}
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {notifications.map((n, i) => (
                      <button
                        key={i}
                        onClick={() => { setTab(n.tab); setNotifOpen(false); }}
                        className="w-full flex items-start gap-2.5 px-4 py-3 text-left"
                        style={{ borderTop: i ? `1px solid ${LINE}` : "none" }}
                      >
                        <AlertTriangle size={14} color={n.urgent ? RUST : GOLD} className="mt-0.5 shrink-0" />
                        <div>
                          <div className="text-sm" style={{ color: INK }}>{n.label}</div>
                          <div className="text-xs" style={{ color: TEXT_MUTED }}>{n.sub}</div>
                        </div>
                      </button>
                    ))}
                    {!notifications.length && (
                      <div className="px-4 py-6 text-center text-xs" style={{ color: TEXT_MUTED }}>You're all caught up.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium" style={{ backgroundColor: GOLD, color: INK }}>
              {initials(profile?.full_name || profile?.email)}
            </div>
          </div>
        </header>

        {actionError && (
          <div className="px-8 py-2 text-xs flex items-center justify-between" style={{ backgroundColor: "#B4432D1A", color: RUST }}>
            {actionError}
            <button onClick={() => setActionError("")}><X size={13} /></button>
          </div>
        )}

        <div className="px-8 py-7">
          {tab === "dashboard" && (
            <Dashboard totals={totals} upcoming={upcoming} invoices={invoices} clientName={clientName} />
          )}
          {tab === "clients" && (
            <ClientsView
              clients={clients.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.company.toLowerCase().includes(search.toLowerCase()))}
              onAdd={() => setModal({ kind: "client" })}
              onEdit={(c) => setModal({ kind: "client", data: c })}
              onDelete={delClient}
            />
          )}
          {tab === "projects" && (
            <ProjectsView
              projects={projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))}
              clientName={clientName}
              onAdd={() => setModal({ kind: "project" })}
              onEdit={(p) => setModal({ kind: "project", data: p })}
              onDelete={delProject}
            />
          )}
          {tab === "tasks" && (
            <TasksView
              tasks={tasks}
              projectName={projectName}
              onMove={moveTask}
              onAdd={() => setModal({ kind: "task" })}
              onEdit={(t) => setModal({ kind: "task", data: t })}
              onDelete={delTask}
            />
          )}
          {tab === "calendar" && (
            <CalendarView tasks={tasks} projects={projects} invoices={invoices} clientName={clientName} projectName={projectName} setTab={setTab} />
          )}
          {tab === "invoices" && (
            <InvoicesView
              invoices={invoices.filter((i) => i.number.toLowerCase().includes(search.toLowerCase()))}
              clientName={clientName}
              onAdd={() => setModal({ kind: "invoice" })}
              onEdit={(i) => setModal({ kind: "invoice", data: i })}
              onDelete={delInvoice}
              onView={(id) => setPrintInvoiceId(id)}
              onExport={() =>
                downloadCSV("invoices.csv", [
                  ["Number", "Client", "Date", "Due", "Total", "Status"],
                  ...invoices.map((i) => [i.number, clientName(i.clientId), i.date, i.due, invoiceTotal(i), i.status]),
                ])
              }
            />
          )}
          {tab === "expenses" && (
            <ExpensesView
              expenses={expenses}
              onAdd={() => setModal({ kind: "expense" })}
              onEdit={(e) => setModal({ kind: "expense", data: e })}
              onDelete={delExpense}
              onExport={() =>
                downloadCSV("expenses.csv", [
                  ["Date", "Category", "Amount", "Note"],
                  ...expenses.map((e) => [e.date, e.category, e.amount, e.note]),
                ])
              }
            />
          )}
          {tab === "analytics" && (
            <AnalyticsView expenseByCategory={expenseByCategory} revenueByClient={revenueByClient} pieColors={PIE_COLORS} totals={totals} />
          )}
          {tab === "settings" && <SettingsView profile={profile} onSaved={setProfile} />}
        </div>
      </main>

      {modal && (
        <EditModal
          modal={modal}
          onClose={() => setModal(null)}
          clients={clients}
          projects={projects}
          onSaved={handleSaved}
        />
      )}

      {printInvoiceId && (
        <InvoicePrintView
          invoice={invoices.find((i) => i.id === printInvoiceId)}
          client={clients.find((c) => c.id === invoices.find((i) => i.id === printInvoiceId)?.clientId)}
          profile={profile}
          onClose={() => setPrintInvoiceId(null)}
        />
      )}
    </div>
  );
}

// ---------------- Dashboard ----------------
function Dashboard({ totals, upcoming, invoices, clientName }) {
  return (
    <div>
      <div className="mb-8">
        <div className="text-xs mb-1" style={{ color: TEXT_MUTED }}>Net profit, year to date</div>
        <div className="text-5xl" style={{ fontFamily: "Georgia, serif", color: INK }}>{fmt(totals.profit)}</div>
        <div className="h-px w-full mt-4" style={{ backgroundColor: LINE }} />
      </div>

      <div className="grid grid-cols-4 gap-0 mb-8" style={{ border: `1px solid ${LINE}`, borderRadius: 6, overflow: "hidden" }}>
        {[
          { label: "Revenue", value: fmt(totals.revenue), up: true },
          { label: "Expenses", value: fmt(totals.expenseTotal), up: false },
          { label: "Pending payments", value: fmt(totals.pending), up: null },
          { label: "Active clients", value: String(2), up: null },
        ].map((s, idx) => (
          <div key={s.label} className="px-5 py-4" style={{ borderLeft: idx ? `1px solid ${LINE}` : "none", backgroundColor: "#FFFFFF" }}>
            <div className="text-xs mb-1.5" style={{ color: TEXT_MUTED }}>{s.label}</div>
            <div className="flex items-center gap-1.5">
              <span className="text-xl" style={{ fontFamily: "Georgia, serif", color: INK }}>{s.value}</span>
              {s.up === true && <ArrowUpRight size={14} color={GREEN} />}
              {s.up === false && <ArrowDownRight size={14} color={RUST} />}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 rounded p-5" style={{ backgroundColor: "#FFFFFF", border: `1px solid ${LINE}` }}>
          <div className="text-sm mb-4" style={{ color: INK }}>Revenue vs. expenses</div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={monthlyTrend}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={LINE} vertical={false} />
              <XAxis dataKey="m" tick={{ fontSize: 12, fill: TEXT_MUTED }} axisLine={{ stroke: LINE }} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: TEXT_MUTED }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ border: `1px solid ${LINE}`, borderRadius: 4, fontSize: 12 }} />
              <Area type="monotone" dataKey="revenue" stroke={GOLD} fill="url(#rev)" strokeWidth={2} />
              <Area type="monotone" dataKey="expense" stroke={RUST} fill="transparent" strokeWidth={1.5} strokeDasharray="4 3" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded p-5" style={{ backgroundColor: "#FFFFFF", border: `1px solid ${LINE}` }}>
          <div className="text-sm mb-4 flex items-center gap-1.5" style={{ color: INK }}><CalendarIcon size={14} />Upcoming</div>
          <div className="space-y-3">
            {upcoming.map((u, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div>
                  <div style={{ color: INK }}>{u.label}</div>
                  <div className="text-xs" style={{ color: TEXT_MUTED }}>{u.type} · {u.date}</div>
                </div>
                <ChevronRight size={14} color={TEXT_MUTED} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded p-5" style={{ backgroundColor: "#FFFFFF", border: `1px solid ${LINE}` }}>
        <div className="text-sm mb-4" style={{ color: INK }}>Recent invoices</div>
        <table className="w-full text-sm">
          <tbody>
            {invoices.slice(0, 5).map((i) => (
              <tr key={i.id} style={{ borderTop: `1px solid ${LINE}` }}>
                <td className="py-2.5" style={{ color: INK }}>{i.number}</td>
                <td className="py-2.5" style={{ color: TEXT_MUTED }}>{clientName(i.clientId)}</td>
                <td className="py-2.5" style={{ color: TEXT_MUTED }}>{i.due}</td>
                <td className="py-2.5 text-right font-mono" style={{ color: INK }}>{fmt(invoiceTotal(i))}</td>
                <td className="py-2.5 text-right"><Badge>{i.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- Clients ----------------
function ClientsView({ clients, onAdd, onEdit, onDelete }) {
  return (
    <div>
      <SectionTitle eyebrow={`${clients.length} clients`} title="Clients" action={<Btn icon={Plus} onClick={onAdd}>Add client</Btn>} />
      <div className="rounded overflow-hidden" style={{ border: `1px solid ${LINE}`, backgroundColor: "#FFFFFF" }}>
        {clients.map((c, idx) => (
          <div key={c.id} className="flex items-center justify-between px-5 py-3.5" style={{ borderTop: idx ? `1px solid ${LINE}` : "none" }}>
            <div>
              <div className="text-sm" style={{ color: INK }}>{c.name} <span style={{ color: TEXT_MUTED }}>— {c.company}</span></div>
              <div className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{c.email} · {c.phone} · {c.address}</div>
            </div>
            <div className="flex items-center gap-4">
              <Badge>{c.status}</Badge>
              <button onClick={() => onEdit(c)}><Pencil size={14} color={TEXT_MUTED} /></button>
              <button onClick={() => onDelete(c.id)}><Trash2 size={14} color={RUST} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Projects ----------------
function ProjectsView({ projects, clientName, onAdd, onEdit, onDelete }) {
  return (
    <div>
      <SectionTitle eyebrow={`${projects.length} projects`} title="Projects" action={<Btn icon={Plus} onClick={onAdd}>Add project</Btn>} />
      <div className="grid grid-cols-2 gap-4">
        {projects.map((p) => (
          <div key={p.id} className="rounded p-4" style={{ border: `1px solid ${LINE}`, backgroundColor: "#FFFFFF" }}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm" style={{ color: INK }}>{p.name}</div>
                <div className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{clientName(p.clientId)}</div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => onEdit(p)}><Pencil size={14} color={TEXT_MUTED} /></button>
                <button onClick={() => onDelete(p.id)}><Trash2 size={14} color={RUST} /></button>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Badge>{p.status}</Badge>
              <Badge>{p.paymentStatus}</Badge>
            </div>
            <div className="mt-3">
              <div className="h-1.5 rounded-full w-full" style={{ backgroundColor: PAPER_DIM }}>
                <div className="h-1.5 rounded-full" style={{ width: `${p.progress}%`, backgroundColor: GOLD }} />
              </div>
              <div className="flex justify-between text-xs mt-1.5" style={{ color: TEXT_MUTED }}>
                <span>{p.progress}% complete</span>
                <span>{fmt(p.budget)} · due {p.deadline}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Tasks (kanban) ----------------
function TasksView({ tasks, projectName, onMove, onAdd, onEdit, onDelete }) {
  const cols = ["To Do", "In Progress", "Completed"];
  const move = onMove;
  return (
    <div>
      <SectionTitle eyebrow={`${tasks.length} tasks`} title="Tasks" action={<Btn icon={Plus} onClick={onAdd}>Add task</Btn>} />
      <div className="grid grid-cols-3 gap-4">
        {cols.map((col) => (
          <div key={col}>
            <div className="text-xs mb-2 flex items-center justify-between" style={{ color: TEXT_MUTED }}>
              {col} <span>{tasks.filter((t) => t.status === col).length}</span>
            </div>
            <div className="space-y-2 min-h-[80px]">
              {tasks.filter((t) => t.status === col).map((t) => (
                <div key={t.id} className="rounded p-3" style={{ border: `1px solid ${LINE}`, backgroundColor: "#FFFFFF" }}>
                  <div className="text-sm" style={{ color: INK }}>{t.title}</div>
                  <div className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{projectName(t.projectId)} · due {t.deadline}</div>
                  <div className="flex items-center justify-between mt-2">
                    <Badge>{t.priority}</Badge>
                    <div className="flex items-center gap-2">
                      {col !== "Completed" && (
                        <button
                          className="text-xs"
                          style={{ color: GOLD }}
                          onClick={() => move(t.id, col === "To Do" ? "In Progress" : "Completed")}
                        >
                          Move →
                        </button>
                      )}
                      <button onClick={() => onEdit(t)}><Pencil size={12} color={TEXT_MUTED} /></button>
                      <button onClick={() => onDelete(t.id)}><Trash2 size={12} color={RUST} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Invoices ----------------
function InvoicesView({ invoices, clientName, onAdd, onEdit, onDelete, onView, onExport }) {
  return (
    <div>
      <SectionTitle
        eyebrow={`${invoices.length} invoices`}
        title="Invoices"
        action={
          <div className="flex gap-2">
            <Btn variant="secondary" icon={Download} onClick={onExport}>Export CSV</Btn>
            <Btn icon={Plus} onClick={onAdd}>New invoice</Btn>
          </div>
        }
      />
      <div className="rounded overflow-hidden" style={{ border: `1px solid ${LINE}`, backgroundColor: "#FFFFFF" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs" style={{ color: TEXT_MUTED, borderBottom: `1px solid ${LINE}` }}>
              <th className="text-left px-5 py-3 font-normal">Number</th>
              <th className="text-left py-3 font-normal">Client</th>
              <th className="text-left py-3 font-normal">Due</th>
              <th className="text-right py-3 font-normal">Total</th>
              <th className="text-right py-3 font-normal">Status</th>
              <th className="text-right px-5 py-3 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id} style={{ borderTop: `1px solid ${LINE}` }}>
                <td className="px-5 py-3" style={{ color: INK }}>{i.number}</td>
                <td className="py-3" style={{ color: TEXT_MUTED }}>{clientName(i.clientId)}</td>
                <td className="py-3" style={{ color: TEXT_MUTED }}>{i.due}</td>
                <td className="py-3 text-right font-mono" style={{ color: INK }}>{fmt(invoiceTotal(i))}</td>
                <td className="py-3 text-right"><Badge>{i.status}</Badge></td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button onClick={() => onView(i.id)} title="View / download PDF"><Eye size={14} color={TEXT_MUTED} /></button>
                    <button onClick={() => onEdit(i)}><Pencil size={14} color={TEXT_MUTED} /></button>
                    <button onClick={() => onDelete(i.id)}><Trash2 size={14} color={RUST} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- Expenses ----------------
function ExpensesView({ expenses, onAdd, onEdit, onDelete, onExport }) {
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  return (
    <div>
      <SectionTitle
        eyebrow={`${fmt(total)} total`}
        title="Expenses"
        action={
          <div className="flex gap-2">
            <Btn variant="secondary" icon={Download} onClick={onExport}>Export CSV</Btn>
            <Btn icon={Plus} onClick={onAdd}>Add expense</Btn>
          </div>
        }
      />
      <div className="rounded overflow-hidden" style={{ border: `1px solid ${LINE}`, backgroundColor: "#FFFFFF" }}>
        {expenses.map((e, idx) => (
          <div key={e.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: idx ? `1px solid ${LINE}` : "none" }}>
            <div>
              <div className="text-sm" style={{ color: INK }}>{e.note}</div>
              <div className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{e.category} · {e.date}</div>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-sm" style={{ color: INK }}>{fmt(e.amount)}</span>
              <button onClick={() => onEdit(e)}><Pencil size={14} color={TEXT_MUTED} /></button>
              <button onClick={() => onDelete(e.id)}><Trash2 size={14} color={RUST} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Analytics ----------------
function AnalyticsView({ expenseByCategory, revenueByClient, pieColors, totals }) {
  return (
    <div>
      <SectionTitle eyebrow="Year to date" title="Analytics" />
      <div className="grid grid-cols-2 gap-6">
        <div className="rounded p-5" style={{ backgroundColor: "#FFFFFF", border: `1px solid ${LINE}` }}>
          <div className="text-sm mb-4" style={{ color: INK }}>Revenue by client</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={revenueByClient}>
              <CartesianGrid stroke={LINE} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: TEXT_MUTED }} axisLine={{ stroke: LINE }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: TEXT_MUTED }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ border: `1px solid ${LINE}`, borderRadius: 4, fontSize: 12 }} />
              <Bar dataKey="value" fill={GOLD} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded p-5" style={{ backgroundColor: "#FFFFFF", border: `1px solid ${LINE}` }}>
          <div className="text-sm mb-4" style={{ color: INK }}>Expenses by category</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={expenseByCategory} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                {expenseByCategory.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ border: `1px solid ${LINE}`, borderRadius: 4, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-0 mt-6" style={{ border: `1px solid ${LINE}`, borderRadius: 6, overflow: "hidden" }}>
        {[
          ["Revenue", totals.revenue], ["Expenses", totals.expenseTotal],
          ["Profit", totals.profit], ["Pending", totals.pending],
        ].map(([label, val], idx) => (
          <div key={label} className="px-5 py-4" style={{ borderLeft: idx ? `1px solid ${LINE}` : "none", backgroundColor: "#FFFFFF" }}>
            <div className="text-xs mb-1" style={{ color: TEXT_MUTED }}>{label}</div>
            <div className="font-mono text-lg" style={{ color: INK }}>{fmt(val)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Settings ----------------
function SettingsView({ profile, onSaved }) {
  const [form, setForm] = useState({
    full_name: profile?.full_name || "",
    business_name: profile?.business_name || "",
    currency: profile?.currency || "USD",
  });
  const [status, setStatus] = useState("");

  async function save() {
    setStatus("Saving…");
    try {
      const updated = await profileApi.update(form);
      onSaved(updated);
      setStatus("Saved.");
    } catch (err) {
      setStatus(err.message || "Couldn't save changes.");
    }
  }

  return (
    <div>
      <SectionTitle eyebrow="Account" title="Settings" />
      <div className="rounded p-5 max-w-md" style={{ backgroundColor: "#FFFFFF", border: `1px solid ${LINE}` }}>
        <Field label="Full name">
          <input className={inputCls} style={inputStyle} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </Field>
        <Field label="Business name">
          <input className={inputCls} style={inputStyle} value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
        </Field>
        <Field label="Email"><input disabled className={inputCls} style={{ ...inputStyle, opacity: 0.6 }} value={profile?.email || ""} /></Field>
        <Field label="Default currency">
          <select className={inputCls} style={inputStyle} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            <option>USD</option><option>EUR</option><option>JPY</option>
          </select>
        </Field>
        <Btn onClick={save}>Save changes</Btn>
        {status && <p className="text-xs mt-3" style={{ color: TEXT_MUTED }}>{status}</p>}
      </div>
    </div>
  );
}

// ---------------- Calendar ----------------
function CalendarView({ tasks, projects, invoices, clientName, projectName, setTab }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const events = useMemo(() => {
    const map = {}; // "YYYY-MM-DD" -> [ {label, type, tab} ]
    const add = (date, label, type, tab) => {
      if (!date) return;
      (map[date] ||= []).push({ label, type, tab });
    };
    tasks.forEach((t) => t.status !== "Completed" && add(t.deadline, t.title, "Task", "tasks"));
    projects.forEach((p) => p.status !== "Completed" && add(p.deadline, p.name, "Project", "projects"));
    invoices.forEach((i) => i.status !== "Paid" && add(i.due, `${i.number} due`, "Invoice", "invoices"));
    return map;
  }, [tasks, projects, invoices]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const todayStr = new Date().toISOString().slice(0, 10);

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const typeColor = { Task: GOLD, Project: "#3D6E93", Invoice: RUST };

  return (
    <div>
      <SectionTitle
        eyebrow="Deadlines"
        title="Calendar"
        action={
          <div className="flex items-center gap-3">
            <button onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft size={16} color={INK} /></button>
            <span className="text-sm w-32 text-center" style={{ color: INK }}>{monthLabel}</span>
            <button onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight size={16} color={INK} /></button>
          </div>
        }
      />
      <div className="grid grid-cols-7 text-xs mb-2" style={{ color: TEXT_MUTED }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="px-2 py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px" style={{ backgroundColor: LINE, border: `1px solid ${LINE}` }}>
        {cells.map((d, idx) => {
          const dateStr = d ? `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
          const dayEvents = dateStr ? map_get(events, dateStr) : [];
          const isToday = dateStr === todayStr;
          return (
            <div key={idx} className="min-h-[92px] p-1.5" style={{ backgroundColor: "#FFFFFF" }}>
              {d && (
                <>
                  <div
                    className="text-xs w-5 h-5 flex items-center justify-center rounded-full mb-1"
                    style={isToday ? { backgroundColor: INK, color: PAPER } : { color: TEXT_MUTED }}
                  >
                    {d}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((e, i) => (
                      <button
                        key={i}
                        onClick={() => setTab(e.tab)}
                        className="w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate block"
                        style={{ backgroundColor: typeColor[e.type] + "1A", color: typeColor[e.type] }}
                        title={e.label}
                      >
                        {e.label}
                      </button>
                    ))}
                    {dayEvents.length > 3 && <div className="text-[10px]" style={{ color: TEXT_MUTED }}>+{dayEvents.length - 3} more</div>}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 mt-4 text-xs" style={{ color: TEXT_MUTED }}>
        {Object.entries(typeColor).map(([k, c]) => (
          <div key={k} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />{k}s</div>
        ))}
      </div>
    </div>
  );
}
function map_get(map, key) { return map[key] || []; }

// ---------------- Printable invoice ----------------
function InvoicePrintView({ invoice, client, profile, onClose }) {
  if (!invoice) return null;
  const sub = invoice.items.reduce((s, it) => s + it.qty * it.rate, 0);
  const total = sub + invoice.tax - invoice.discount;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ backgroundColor: "#00000055" }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .invoice-print-area, .invoice-print-area * { visibility: visible; }
          .invoice-print-area { position: absolute; top: 0; left: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="max-w-2xl mx-auto my-10 rounded overflow-hidden" style={{ backgroundColor: "#FFFFFF" }}>
        <div className="no-print flex items-center justify-between px-6 py-3" style={{ borderBottom: `1px solid ${LINE}`, backgroundColor: PAPER }}>
          <span className="text-sm" style={{ color: INK }}>Invoice preview</span>
          <div className="flex items-center gap-2">
            <Btn variant="secondary" icon={Printer} onClick={() => window.print()}>Download PDF</Btn>
            <button onClick={onClose}><X size={18} color={TEXT_MUTED} /></button>
          </div>
        </div>
        <div className="invoice-print-area p-10">
          <div className="flex items-start justify-between mb-10">
            <div>
              <div className="text-xs" style={{ color: GOLD }}>Ledger for freelancers</div>
              <div className="text-2xl" style={{ fontFamily: "Georgia, serif", color: INK }}>FreelancerOS</div>
              <div className="text-xs mt-1" style={{ color: TEXT_MUTED }}>
                {profile?.full_name || "Your name"}{profile?.business_name ? ` · ${profile.business_name}` : ""}<br />{profile?.email}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl" style={{ fontFamily: "Georgia, serif", color: INK }}>{invoice.number}</div>
              <div className="text-xs mt-1" style={{ color: TEXT_MUTED }}>Issued {invoice.date}<br />Due {invoice.due}</div>
              <div className="mt-2"><Badge>{invoice.status}</Badge></div>
            </div>
          </div>
          <div className="mb-8">
            <div className="text-xs mb-1" style={{ color: TEXT_MUTED }}>Bill to</div>
            <div className="text-sm" style={{ color: INK }}>{client?.name}</div>
            <div className="text-xs" style={{ color: TEXT_MUTED }}>{client?.company}<br />{client?.email}<br />{client?.address}</div>
          </div>
          <table className="w-full text-sm mb-6">
            <thead>
              <tr style={{ borderBottom: `1px solid ${LINE}` }}>
                <th className="text-left py-2 font-normal" style={{ color: TEXT_MUTED }}>Description</th>
                <th className="text-right py-2 font-normal" style={{ color: TEXT_MUTED }}>Qty</th>
                <th className="text-right py-2 font-normal" style={{ color: TEXT_MUTED }}>Rate</th>
                <th className="text-right py-2 font-normal" style={{ color: TEXT_MUTED }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((it, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${LINE}` }}>
                  <td className="py-2.5" style={{ color: INK }}>{it.desc}</td>
                  <td className="py-2.5 text-right font-mono" style={{ color: INK }}>{it.qty}</td>
                  <td className="py-2.5 text-right font-mono" style={{ color: INK }}>{fmt(it.rate)}</td>
                  <td className="py-2.5 text-right font-mono" style={{ color: INK }}>{fmt(it.qty * it.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end">
            <div className="w-48 text-sm space-y-1.5">
              <div className="flex justify-between"><span style={{ color: TEXT_MUTED }}>Subtotal</span><span className="font-mono" style={{ color: INK }}>{fmt(sub)}</span></div>
              <div className="flex justify-between"><span style={{ color: TEXT_MUTED }}>Tax</span><span className="font-mono" style={{ color: INK }}>{fmt(invoice.tax)}</span></div>
              <div className="flex justify-between"><span style={{ color: TEXT_MUTED }}>Discount</span><span className="font-mono" style={{ color: INK }}>-{fmt(invoice.discount)}</span></div>
              <div className="flex justify-between pt-1.5 text-base" style={{ borderTop: `1px solid ${LINE}` }}>
                <span style={{ color: INK }}>Total</span><span className="font-mono" style={{ color: INK }}>{fmt(total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- Edit Modal (handles all entity types) ----------------
const apiMap = { client: clientsApi, project: projectsApi, task: tasksApi, invoice: invoicesApi, expense: expensesApi };

function formatBytes(n) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentsPanel({ entityType, entityId }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    attachmentsApi
      .list(entityType, entityId)
      .then((rows) => !cancelled && setFiles(rows))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [entityType, entityId]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const record = await attachmentsApi.upload(file, entityType, entityId);
      setFiles((f) => [record, ...f]);
    } catch (err) {
      setError(err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(att) {
    try {
      const url = await attachmentsApi.signedUrl(att.storage_path);
      window.open(url, "_blank");
    } catch (err) {
      setError(err.message || "Couldn't open file.");
    }
  }

  async function handleDelete(att) {
    try {
      await attachmentsApi.remove(att);
      setFiles((f) => f.filter((x) => x.id !== att.id));
    } catch (err) {
      setError(err.message || "Couldn't delete file.");
    }
  }

  return (
    <div className="mt-2 mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs flex items-center gap-1.5" style={{ color: TEXT_MUTED }}>
          <Paperclip size={12} /> Attachments
        </span>
        <label className="text-xs cursor-pointer flex items-center gap-1" style={{ color: GOLD }}>
          <UploadCloud size={13} />
          {uploading ? "Uploading…" : "Add file"}
          <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>
      {loading && <div className="text-xs" style={{ color: TEXT_MUTED }}>Loading…</div>}
      {error && <div className="text-xs mb-2" style={{ color: RUST }}>{error}</div>}
      {!loading && files.length === 0 && (
        <div className="text-xs" style={{ color: TEXT_MUTED }}>No files attached yet.</div>
      )}
      <div className="space-y-1.5">
        {files.map((f) => (
          <div key={f.id} className="flex items-center justify-between rounded px-2.5 py-1.5" style={{ border: `1px solid ${LINE}` }}>
            <button onClick={() => handleDownload(f)} className="text-xs truncate text-left mr-2" style={{ color: INK }} title={f.file_name}>
              {f.file_name}
            </button>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px]" style={{ color: TEXT_MUTED }}>{formatBytes(f.file_size)}</span>
              <button onClick={() => handleDelete(f)}><Trash2 size={12} color={RUST} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EditModal({ modal, onClose, clients, projects, onSaved }) {
  const { kind, data } = modal;
  const isEdit = !!data;
  const [form, setForm] = useState(() => data || defaultsFor(kind));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function defaultsFor(k) {
    if (k === "client") return { name: "", company: "", email: "", phone: "", address: "", notes: "", status: "Active" };
    if (k === "project") return { clientId: clients[0]?.id || "", name: "", budget: 0, start: "", deadline: "", status: "Planning", progress: 0, paymentStatus: "Pending" };
    if (k === "task") return { projectId: projects[0]?.id || "", title: "", priority: "Medium", status: "To Do", deadline: "" };
    if (k === "invoice") return { clientId: clients[0]?.id || "", number: "", date: "", due: "", items: [{ desc: "", qty: 1, rate: 0 }], tax: 0, discount: 0, status: "Pending" };
    if (k === "expense") return { date: "", category: "Software", amount: 0, note: "" };
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const api = apiMap[kind];
      const record = isEdit ? await api.update(form.id, form) : await api.create(form);
      onSaved(kind, record, isEdit);
      onClose();
    } catch (err) {
      setError(err.message || "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const titleMap = { client: "client", project: "project", task: "task", invoice: "invoice", expense: "expense" };

  return (
    <Modal title={`${isEdit ? "Edit" : "New"} ${titleMap[kind]}`} onClose={onClose}>
      {kind === "client" && (
        <>
          <Field label="Name"><input className={inputCls} style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Company"><input className={inputCls} style={inputStyle} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
          <Field label="Email"><input className={inputCls} style={inputStyle} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Phone"><input className={inputCls} style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Address"><input className={inputCls} style={inputStyle} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="Status">
            <select className={inputCls} style={inputStyle} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option>Active</option><option>Lead</option><option>Past</option>
            </select>
          </Field>
          <Field label="Notes"><input className={inputCls} style={inputStyle} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          {isEdit && <AttachmentsPanel entityType="client" entityId={form.id} />}
        </>
      )}
      {kind === "project" && (
        <>
          <Field label="Name"><input className={inputCls} style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Client">
            <select className={inputCls} style={inputStyle} value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Budget ($)"><input type="number" className={inputCls} style={inputStyle} value={form.budget} onChange={(e) => setForm({ ...form, budget: +e.target.value })} /></Field>
          <Field label="Start date"><input type="date" className={inputCls} style={inputStyle} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field>
          <Field label="Deadline"><input type="date" className={inputCls} style={inputStyle} value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></Field>
          <Field label="Status">
            <select className={inputCls} style={inputStyle} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option>Planning</option><option>In Progress</option><option>Review</option><option>Completed</option>
            </select>
          </Field>
          <Field label="Progress (%)"><input type="number" min="0" max="100" className={inputCls} style={inputStyle} value={form.progress} onChange={(e) => setForm({ ...form, progress: +e.target.value })} /></Field>
          <Field label="Payment status">
            <select className={inputCls} style={inputStyle} value={form.paymentStatus} onChange={(e) => setForm({ ...form, paymentStatus: e.target.value })}>
              <option>Pending</option><option>Partial</option><option>Paid</option>
            </select>
          </Field>
          {isEdit && <AttachmentsPanel entityType="project" entityId={form.id} />}
        </>
      )}
      {kind === "task" && (
        <>
          <Field label="Title"><input className={inputCls} style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Project">
            <select className={inputCls} style={inputStyle} value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className={inputCls} style={inputStyle} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option>Low</option><option>Medium</option><option>High</option><option>Urgent</option>
            </select>
          </Field>
          <Field label="Status">
            <select className={inputCls} style={inputStyle} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option>To Do</option><option>In Progress</option><option>Completed</option>
            </select>
          </Field>
          <Field label="Deadline"><input type="date" className={inputCls} style={inputStyle} value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></Field>
        </>
      )}
      {kind === "invoice" && (
        <>
          <Field label="Invoice number"><input className={inputCls} style={inputStyle} value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></Field>
          <Field label="Client">
            <select className={inputCls} style={inputStyle} value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Date"><input type="date" className={inputCls} style={inputStyle} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Due date"><input type="date" className={inputCls} style={inputStyle} value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} /></Field>
          <Field label="Service description"><input className={inputCls} style={inputStyle} value={form.items[0].desc} onChange={(e) => setForm({ ...form, items: [{ ...form.items[0], desc: e.target.value }] })} /></Field>
          <Field label="Amount ($)"><input type="number" className={inputCls} style={inputStyle} value={form.items[0].rate} onChange={(e) => setForm({ ...form, items: [{ ...form.items[0], rate: +e.target.value }] })} /></Field>
          <Field label="Discount ($)"><input type="number" className={inputCls} style={inputStyle} value={form.discount} onChange={(e) => setForm({ ...form, discount: +e.target.value })} /></Field>
          <Field label="Status">
            <select className={inputCls} style={inputStyle} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option>Pending</option><option>Paid</option><option>Overdue</option>
            </select>
          </Field>
          {isEdit && <AttachmentsPanel entityType="invoice" entityId={form.id} />}
        </>
      )}
      {kind === "expense" && (
        <>
          <Field label="Note"><input className={inputCls} style={inputStyle} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          <Field label="Category">
            <select className={inputCls} style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option>Software</option><option>Contractor</option><option>Travel</option><option>Office</option><option>Other</option>
            </select>
          </Field>
          <Field label="Amount ($)"><input type="number" className={inputCls} style={inputStyle} value={form.amount} onChange={(e) => setForm({ ...form, amount: +e.target.value })} /></Field>
          <Field label="Date"><input type="date" className={inputCls} style={inputStyle} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          {isEdit && <AttachmentsPanel entityType="expense" entityId={form.id} />}
        </>
      )}
      {error && <div className="text-xs mb-2" style={{ color: RUST }}>{error}</div>}
      <div className="flex justify-end gap-2 mt-4">
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>{saving ? "Saving…" : isEdit ? "Save changes" : "Create"}</Btn>
      </div>
    </Modal>
  );
}
