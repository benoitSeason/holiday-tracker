import { useState, useEffect, useMemo } from "react";

const SUPABASE_URL = "https://poavpcbmhyndliohomoy.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvYXZwY2JtaHluZGxpb2hvbW95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjA4MDksImV4cCI6MjA4NzY5NjgwOX0.lFYuteKNQvVNymhS_vx3mUsK3RH9aSk0bgccUTVbtNo";

const headers = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Prefer": "return=representation",
};

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { headers, ...options });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

const db = {
  getEmployees: () => sbFetch("/employees?select=*&order=created_at.asc"),
  addEmployee: (data) => sbFetch("/employees", { method: "POST", body: JSON.stringify(data) }),
  deleteEmployee: (id) => sbFetch(`/employees?id=eq.${id}`, { method: "DELETE" }),
  getHolidays: () => sbFetch("/holidays?select=*&order=start_date.desc"),
  addHoliday: (data) => sbFetch("/holidays", { method: "POST", body: JSON.stringify(data) }),
  deleteHoliday: (id) => sbFetch(`/holidays?id=eq.${id}`, { method: "DELETE" }),
  updateHoliday: (id, data) => sbFetch(`/holidays?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  }),
};

const COLORS = ["#E84855","#3A86FF","#06D6A0","#FFB703","#9B5DE5","#F77F00","#4CC9F0","#43AA8B"];
const MONTHS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];

function getInitials(name) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

function diffDays(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start), e = new Date(end);
  if (e < s) return 0;
  return Math.round((e - s) / 86400000) + 1;
}

function formatDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function daysInMonthForHoliday(startStr, endStr) {
  // Returns { monthIndex: days } for the distribution across months
  const result = {};
  const s = new Date(startStr);
  const e = new Date(endStr);
  const cursor = new Date(s);
  while (cursor <= e) {
    const m = cursor.getMonth();
    result[m] = (result[m] || 0) + 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function todayStr() {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

// ── Status Badge ──────────────────────────────────────────────────────────
const STATUS_STYLES = {
  "En attente": { background: "#FFF8E1", color: "#F59E0B" },
  "Confirmé":   { background: "#E8FFF3", color: "#06D6A0" },
  "Refusé":     { background: "#FFF0F0", color: "#E84855" },
  "Terminé":    { background: "#F0F0F0", color: "#888" },
};

const ALL_STATUSES = ["En attente", "Confirmé", "Refusé", "Terminé"];

// Auto-derive "Terminé" for past holidays that haven't been manually set
function effectiveStatus(h, today) {
  if (h.end_date < today && (h.status === "En attente" || !h.status)) return "Terminé";
  return h.status || "En attente";
}

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES["En attente"];
  return (
    <span style={{ ...s, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap" }}>
      {status || "En attente"}
    </span>
  );
}

// ── KPI Card ───────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent }) {
  return (
    <div style={{ ...styles.kpiCard, borderTop: `3px solid ${accent}` }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: "#111", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#333", marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Horizontal Bar ─────────────────────────────────────────────────────────
function HBar({ pct, color }) {
  return (
    <div style={styles.hbarTrack}>
      <div style={{ ...styles.hbarFill, width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  );
}

// ── Section Header ─────────────────────────────────────────────────────────
function SectionHead({ title, children }) {
  return (
    <div style={styles.sectionHeader}>
      <div style={styles.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

export default function App() {
  const [employees, setEmployees] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState("overview");
  const [activeTab, setActiveTab] = useState("overview"); // "overview" | "dashboard"
  const [newEmp, setNewEmp] = useState("");
  const [form, setForm] = useState({ employeeId: "", start: "", end: "", note: "", status: "En attente" });
  const [filterEmp, setFilterEmp] = useState("all");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [annualAllowance, setAnnualAllowance] = useState(25);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [emps, hols] = await Promise.all([db.getEmployees(), db.getHolidays()]);
      setEmployees(emps);
      setHolidays(hols);
    } catch (e) {
      setError("Impossible de se connecter à la base de données. Vérifiez votre configuration Supabase.");
    }
    setLoading(false);
  }

  async function addEmployee() {
    const name = newEmp.trim();
    if (!name) return;
    setSaving(true);
    try {
      const [emp] = await db.addEmployee({ name, color_idx: employees.length % COLORS.length });
      setEmployees(prev => [...prev, emp]);
      setNewEmp("");
      setView("overview");
    } catch (e) { setError("Impossible d'ajouter l'employé."); }
    setSaving(false);
  }

  async function addHoliday() {
    if (!form.employeeId || !form.start || !form.end) return;
    const days = diffDays(form.start, form.end);
    if (days <= 0) return;
    setSaving(true);
    try {
      const [h] = await db.addHoliday({
        employee_id: form.employeeId,
        start_date: form.start,
        end_date: form.end,
        days,
        note: form.note || null,
        status: form.status || "En attente",
      });
      setHolidays(prev => [h, ...prev]);
      setForm({ employeeId: "", start: "", end: "", note: "", status: "En attente" });
      setView("overview");
    } catch (e) { setError("Impossible d'enregistrer le congé."); }
    setSaving(false);
  }

  async function deleteHoliday(id) {
    try {
      await db.deleteHoliday(id);
      setHolidays(prev => prev.filter(h => h.id !== id));
    } catch (e) { setError("Impossible de supprimer."); }
  }

  async function updateHolidayStatus(id, status) {
    try {
      await db.updateHoliday(id, { status });
      setHolidays(prev => prev.map(h => h.id === id ? { ...h, status } : h));
    } catch (e) { setError("Impossible de modifier le statut."); }
  }

  async function deleteEmployee(id) {
    try {
      await db.deleteEmployee(id);
      setEmployees(prev => prev.filter(e => e.id !== id));
      setHolidays(prev => prev.filter(h => h.employee_id !== id));
    } catch (e) { setError("Impossible de supprimer l'employé."); }
  }

  // ── Derived data ────────────────────────────────────────────────────────
  const empMap = useMemo(() => employees.reduce((m, e) => { m[e.id] = e; return m; }, {}), [employees]);

  const yearHolidays = useMemo(
    () => holidays.filter(h => h.start_date?.startsWith(String(selectedYear)) || h.end_date?.startsWith(String(selectedYear))),
    [holidays, selectedYear]
  );

  const totalByEmp = useMemo(() => employees.reduce((acc, e) => {
    acc[e.id] = holidays.filter(h => h.employee_id === e.id).reduce((s, h) => s + h.days, 0);
    return acc;
  }, {}), [employees, holidays]);

  const yearTotalByEmp = useMemo(() => employees.reduce((acc, e) => {
    acc[e.id] = yearHolidays.filter(h => h.employee_id === e.id).reduce((s, h) => s + h.days, 0);
    return acc;
  }, {}), [employees, yearHolidays]);

  const today = todayStr();

  const currentlyOnHoliday = useMemo(
    () => employees.filter(e => holidays.some(h => h.employee_id === e.id && h.start_date <= today && h.end_date >= today)),
    [employees, holidays, today]
  );

  const upcomingHolidays = useMemo(
    () => holidays
      .filter(h => h.start_date > today)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .slice(0, 5),
    [holidays, today]
  );

  const recentHolidays = useMemo(
    () => holidays
      .filter(h => h.end_date < today)
      .sort((a, b) => b.end_date.localeCompare(a.end_date))
      .slice(0, 5),
    [holidays, today]
  );

  // Monthly distribution for selected year
  const monthlyDays = useMemo(() => {
    const counts = Array(12).fill(0);
    yearHolidays.forEach(h => {
      const dist = daysInMonthForHoliday(h.start_date, h.end_date);
      Object.entries(dist).forEach(([m, d]) => {
        const date = new Date(h.start_date);
        if (date.getFullYear() === selectedYear || new Date(h.end_date).getFullYear() === selectedYear) {
          counts[Number(m)] += d;
        }
      });
    });
    return counts;
  }, [yearHolidays, selectedYear]);

  const maxMonthDays = Math.max(...monthlyDays, 1);

  // Available years from holidays data
  const availableYears = useMemo(() => {
    const yrs = new Set(holidays.map(h => h.start_date?.slice(0, 4)).filter(Boolean));
    yrs.add(String(new Date().getFullYear()));
    return [...yrs].sort().reverse();
  }, [holidays]);

  const totalDaysThisYear = yearHolidays.reduce((s, h) => s + h.days, 0);
  const avgDaysPerEmp = employees.length > 0 ? (totalDaysThisYear / employees.length).toFixed(1) : 0;

  // Top period (longest holiday)
  const longestHoliday = useMemo(
    () => [...yearHolidays].sort((a, b) => b.days - a.days)[0] || null,
    [yearHolidays]
  );

  const filteredHolidays = filterEmp === "all" ? holidays : holidays.filter(h => h.employee_id === filterEmp);

  // ── Available years derived from data + current year
  const yearOptions = availableYears.length ? availableYears : [String(new Date().getFullYear())];

  if (loading) return (
    <div style={styles.center}>
      <div style={styles.spinner} />
      <div style={{ marginTop: 16, color: "#888", fontSize: 13 }}>Connexion à la base de données…</div>
    </div>
  );

  return (
    <div style={styles.app}>
      <style>{css}</style>

      {/* ── Header ── */}
      <header style={styles.header}>
        <div>
          <div style={styles.logo}>CONGÉS</div>
          <div style={styles.subtitle}>Suivi des congés · Supabase</div>
        </div>
        <div style={styles.headerActions}>
          <button style={styles.btnSecondary} onClick={() => setView("add-employee")}>+ Employé</button>
          <button
            style={{ ...styles.btnPrimary, opacity: employees.length === 0 ? 0.4 : 1 }}
            disabled={employees.length === 0}
            onClick={() => { setForm({ employeeId: employees[0]?.id || "", start: "", end: "", note: "", status: "En attente" }); setView("add-holiday"); }}
          >+ Congé</button>
        </div>
      </header>

      {error && (
        <div style={styles.errorBanner}>
          {error}
          <button style={styles.errorClose} onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* ── Tab Bar ── */}
      <div style={styles.tabBar}>
        <button
          className={`tab-btn${activeTab === "overview" ? " tab-active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >Vue d'ensemble</button>
        <button
          className={`tab-btn${activeTab === "dashboard" ? " tab-active" : ""}`}
          onClick={() => setActiveTab("dashboard")}
        >Tableau de bord</button>
      </div>

      {/* ════════════════ OVERVIEW TAB ════════════════ */}
      {activeTab === "overview" && (
        <>
          <div style={styles.cards}>
            {employees.map(emp => (
              <div key={emp.id} style={{ ...styles.card, borderTop: `3px solid ${COLORS[emp.color_idx % COLORS.length]}` }}>
                <div style={styles.cardTop}>
                  <div style={{ ...styles.avatar, background: COLORS[emp.color_idx % COLORS.length] }}>{getInitials(emp.name)}</div>
                  <button style={styles.delBtn} onClick={() => deleteEmployee(emp.id)} title="Supprimer l'employé">×</button>
                </div>
                <div style={styles.empName}>{emp.name}</div>
                <div style={styles.dayCount}>{totalByEmp[emp.id] || 0}<span style={styles.dayLabel}> jours</span></div>
                <div style={styles.holCount}>{holidays.filter(h => h.employee_id === emp.id).length} période(s)</div>
                {currentlyOnHoliday.some(e => e.id === emp.id) && (
                  <div style={styles.onHolidayBadge}>En congé</div>
                )}
              </div>
            ))}
            {employees.length === 0 && (
              <div style={styles.empty}>Aucun employé. Ajoutez-en un pour commencer.</div>
            )}
          </div>

          {employees.length > 0 && (
            <div style={styles.section}>
              <SectionHead title="Périodes de congés">
                <select style={styles.select} value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
                  <option value="all">Tous les employés</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </SectionHead>
              {filteredHolidays.length === 0 && <div style={styles.emptyList}>Aucun congé enregistré.</div>}
              {filteredHolidays.length > 0 && (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Employé</th>
                      <th style={styles.th}>Début</th>
                      <th style={styles.th}>Fin</th>
                      <th style={styles.th}>Jours</th>
                      <th style={styles.th}>Statut</th>
                      <th style={styles.th}>Note</th>
                      <th style={styles.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHolidays.map(h => {
                      const emp = empMap[h.employee_id];
                      const isActive = h.start_date <= today && h.end_date >= today;
                      const effStatus = effectiveStatus(h, today);
                      const statusStyle = STATUS_STYLES[effStatus] || STATUS_STYLES["En attente"];
                      return (
                        <tr key={h.id} className="table-row">
                          <td style={styles.td}>
                            <div style={styles.empCell}>
                              <div style={{ ...styles.dot, background: emp ? COLORS[emp.color_idx % COLORS.length] : "#ccc" }} />
                              {emp?.name || "Unknown"}
                            </div>
                          </td>
                          <td style={styles.td}>{formatDate(h.start_date)}</td>
                          <td style={styles.td}>{formatDate(h.end_date)}</td>
                          <td style={{ ...styles.td, fontWeight: 600 }}>{h.days}</td>
                          <td style={styles.td}>
                            <select
                              value={effStatus}
                              onChange={e => updateHolidayStatus(h.id, e.target.value)}
                              style={{
                                ...statusStyle,
                                fontSize: 10,
                                fontWeight: 700,
                                padding: "2px 6px",
                                borderRadius: 20,
                                textTransform: "uppercase",
                                letterSpacing: 0.4,
                                border: "none",
                                cursor: "pointer",
                                outline: "none",
                                appearance: "none",
                                WebkitAppearance: "none",
                                paddingRight: 18,
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'%3E%3Cpath fill='%23888' d='M0 2l4 4 4-4z'/%3E%3C/svg%3E")`,
                                backgroundRepeat: "no-repeat",
                                backgroundPosition: "right 5px center",
                                backgroundColor: statusStyle.background,
                                color: statusStyle.color,
                              }}
                            >
                              {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td style={{ ...styles.td, color: "#888" }}>{h.note || "—"}</td>
                          <td style={styles.td}>
                            {isActive && <span style={styles.activePill}>Actif</span>}
                            <button style={{ ...styles.delBtn, marginLeft: 8 }} onClick={() => deleteHoliday(h.id)}>×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* ════════════════ DASHBOARD TAB ════════════════ */}
      {activeTab === "dashboard" && (
        <div style={{ padding: "0 32px 60px" }}>

          {/* ── Year + Allowance Controls ── */}
          <div style={styles.controls}>
            <div style={styles.controlGroup}>
              <span style={styles.controlLabel}>Année</span>
              <select style={styles.select} value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div style={styles.controlGroup}>
              <span style={styles.controlLabel}>Quota annuel</span>
              <div style={styles.allowanceInput}>
                <button style={styles.stepBtn} onClick={() => setAnnualAllowance(v => Math.max(1, v - 1))}>−</button>
                <span style={{ fontWeight: 700, fontSize: 14, minWidth: 28, textAlign: "center" }}>{annualAllowance}</span>
                <button style={styles.stepBtn} onClick={() => setAnnualAllowance(v => v + 1)}>+</button>
                <span style={{ fontSize: 12, color: "#888" }}>jours / an</span>
              </div>
            </div>
          </div>

          {/* ── KPI Cards ── */}
          <div style={styles.kpiRow}>
            <KpiCard
              label="Employés"
              value={employees.length}
              sub="effectif total"
              accent="#3A86FF"
            />
            <KpiCard
              label={`Jours pris (${selectedYear})`}
              value={totalDaysThisYear}
              sub={`${yearHolidays.length} période(s)`}
              accent="#E84855"
            />
            <KpiCard
              label="Moy. jours / employé"
              value={avgDaysPerEmp}
              sub={`quota : ${annualAllowance} jours`}
              accent="#06D6A0"
            />
            <KpiCard
              label="En congé aujourd'hui"
              value={currentlyOnHoliday.length}
              sub={currentlyOnHoliday.map(e => e.name).join(", ") || "personne"}
              accent="#FFB703"
            />
            <KpiCard
              label="Période la plus longue"
              value={longestHoliday ? `${longestHoliday.days}j` : "—"}
              sub={longestHoliday ? `${empMap[longestHoliday.employee_id]?.name || ""}` : "aucune donnée"}
              accent="#9B5DE5"
            />
            <KpiCard
              label="Taux d'utilisation"
              value={employees.length > 0 ? `${Math.round((totalDaysThisYear / (annualAllowance * employees.length)) * 100)}%` : "—"}
              sub={`${totalDaysThisYear} sur ${annualAllowance * employees.length} jours au total`}
              accent="#F77F00"
            />
          </div>

          {/* ── Two-column layout ── */}
          <div style={styles.dashGrid}>

            {/* Left column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Employee Allowance Progress */}
              <div style={styles.panel}>
                <div style={styles.panelTitle}>Utilisation du quota · {selectedYear}</div>
                {employees.length === 0 && <div style={styles.emptyList}>Aucun employé.</div>}
                {employees.map(emp => {
                  const used = yearTotalByEmp[emp.id] || 0;
                  const pct = (used / annualAllowance) * 100;
                  const color = COLORS[emp.color_idx % COLORS.length];
                  const remaining = Math.max(annualAllowance - used, 0);
                  const isOver = used > annualAllowance;
                  return (
                    <div key={emp.id} style={styles.progressRow}>
                      <div style={styles.progressTop}>
                        <div style={styles.empCell}>
                          <div style={{ ...styles.avatar, background: color, width: 28, height: 28, fontSize: 11 }}>{getInitials(emp.name)}</div>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{emp.name}</span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: isOver ? "#E84855" : "#111" }}>{used}</span>
                          <span style={{ fontSize: 12, color: "#aaa" }}> / {annualAllowance} j</span>
                          {isOver && <span style={styles.overBadge}>+{used - annualAllowance} dépassement</span>}
                          {!isOver && <div style={{ fontSize: 11, color: "#aaa" }}>{remaining} restants</div>}
                        </div>
                      </div>
                      <HBar pct={pct} color={isOver ? "#E84855" : color} />
                    </div>
                  );
                })}
              </div>

              {/* Currently on holiday */}
              <div style={styles.panel}>
                <div style={styles.panelTitle}>En congé aujourd'hui</div>
                {currentlyOnHoliday.length === 0 && <div style={styles.emptyList}>Personne n'est en congé aujourd'hui.</div>}
                {currentlyOnHoliday.map(emp => {
                  const h = holidays.find(h => h.employee_id === emp.id && h.start_date <= today && h.end_date >= today);
                  const color = COLORS[emp.color_idx % COLORS.length];
                  const daysLeft = diffDays(today, h?.end_date);
                  return (
                    <div key={emp.id} style={{ ...styles.timelineRow, borderLeft: `3px solid ${color}` }}>
                      <div style={styles.empCell}>
                        <div style={{ ...styles.avatar, background: color, width: 28, height: 28, fontSize: 11 }}>{getInitials(emp.name)}</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{emp.name}</div>
                          <div style={{ fontSize: 11, color: "#888" }}>{formatDate(h?.start_date)} → {formatDate(h?.end_date)}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color }}>{daysLeft}j</div>
                        <div style={{ fontSize: 11, color: "#aaa" }}>restants</div>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>

            {/* Right column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Monthly Distribution Chart */}
              <div style={styles.panel}>
                <div style={styles.panelTitle}>Répartition mensuelle · {selectedYear}</div>
                {totalDaysThisYear === 0 && <div style={styles.emptyList}>Aucune donnée pour cette année.</div>}
                {totalDaysThisYear > 0 && (
                  <div style={styles.barChart}>
                    {MONTHS.map((m, i) => {
                      const val = monthlyDays[i];
                      const barPct = (val / maxMonthDays) * 100;
                      const isCurrent = i === new Date().getMonth() && selectedYear === new Date().getFullYear();
                      return (
                        <div key={m} style={styles.barCol}>
                          <div style={styles.barValLabel}>{val > 0 ? val : ""}</div>
                          <div style={styles.barOuter}>
                            <div
                              style={{
                                ...styles.barInner,
                                height: `${barPct}%`,
                                background: isCurrent ? "#E84855" : "#3A86FF",
                                opacity: val === 0 ? 0.15 : 1,
                              }}
                            />
                          </div>
                          <div style={{ ...styles.barLabel, color: isCurrent ? "#E84855" : "#aaa", fontWeight: isCurrent ? 700 : 400 }}>{m}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Upcoming Holidays */}
              <div style={styles.panel}>
                <div style={styles.panelTitle}>Congés à venir</div>
                {upcomingHolidays.length === 0 && <div style={styles.emptyList}>Aucun congé à venir.</div>}
                {upcomingHolidays.map(h => {
                  const emp = empMap[h.employee_id];
                  const color = emp ? COLORS[emp.color_idx % COLORS.length] : "#ccc";
                  const daysUntil = diffDays(today, h.start_date) - 1;
                  return (
                    <div key={h.id} style={{ ...styles.timelineRow, borderLeft: `3px solid ${color}` }}>
                      <div style={styles.empCell}>
                        <div style={{ ...styles.avatar, background: color, width: 28, height: 28, fontSize: 11 }}>{emp ? getInitials(emp.name) : "?"}</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{emp?.name || "Unknown"}</div>
                          <div style={{ fontSize: 11, color: "#888" }}>{formatDate(h.start_date)} → {formatDate(h.end_date)} · {h.days}j</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color }}>{daysUntil > 0 ? `dans ${daysUntil}j` : "Demain"}</div>
                        <StatusBadge status={effectiveStatus(h, today)} />
                        {h.note && <div style={{ fontSize: 11, color: "#aaa" }}>{h.note}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Recent Holidays */}
              <div style={styles.panel}>
                <div style={styles.panelTitle}>Congés récents</div>
                {recentHolidays.length === 0 && <div style={styles.emptyList}>Aucun congé passé.</div>}
                {recentHolidays.map(h => {
                  const emp = empMap[h.employee_id];
                  const color = emp ? COLORS[emp.color_idx % COLORS.length] : "#ccc";
                  return (
                    <div key={h.id} style={{ ...styles.timelineRow, borderLeft: `3px solid ${color}`, opacity: 0.7 }}>
                      <div style={styles.empCell}>
                        <div style={{ ...styles.avatar, background: color, width: 28, height: 28, fontSize: 11 }}>{emp ? getInitials(emp.name) : "?"}</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{emp?.name || "Unknown"}</div>
                          <div style={{ fontSize: 11, color: "#888" }}>{formatDate(h.start_date)} → {formatDate(h.end_date)}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#111" }}>{h.days}j</div>
                        <StatusBadge status={effectiveStatus(h, today)} />
                        {h.note && <div style={{ fontSize: 11, color: "#aaa" }}>{h.note}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>

          {/* ── Leaderboard ── */}
          {employees.length > 0 && (
            <div style={{ ...styles.panel, marginTop: 0 }}>
              <div style={styles.panelTitle}>Comparatif employés · {selectedYear}</div>
              <table style={{ ...styles.table, boxShadow: "none", marginTop: 8 }}>
                <thead>
                  <tr>
                    <th style={styles.th}>#</th>
                    <th style={styles.th}>Employé</th>
                    <th style={styles.th}>Jours pris</th>
                    <th style={styles.th}>Périodes</th>
                    <th style={styles.th}>Restants</th>
                    <th style={styles.th}>Utilisation</th>
                  </tr>
                </thead>
                <tbody>
                  {[...employees]
                    .sort((a, b) => (yearTotalByEmp[b.id] || 0) - (yearTotalByEmp[a.id] || 0))
                    .map((emp, i) => {
                      const used = yearTotalByEmp[emp.id] || 0;
                      const pct = Math.round((used / annualAllowance) * 100);
                      const remaining = Math.max(annualAllowance - used, 0);
                      const periods = yearHolidays.filter(h => h.employee_id === emp.id).length;
                      const color = COLORS[emp.color_idx % COLORS.length];
                      return (
                        <tr key={emp.id} className="table-row">
                          <td style={{ ...styles.td, color: "#aaa", fontWeight: 700, width: 32 }}>{i + 1}</td>
                          <td style={styles.td}>
                            <div style={styles.empCell}>
                              <div style={{ ...styles.dot, background: color }} />
                              {emp.name}
                            </div>
                          </td>
                          <td style={{ ...styles.td, fontWeight: 700 }}>{used}</td>
                          <td style={styles.td}>{periods}</td>
                          <td style={{ ...styles.td, color: remaining === 0 ? "#E84855" : "#111" }}>{remaining}</td>
                          <td style={styles.td}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ ...styles.hbarTrack, flex: 1, maxWidth: 100 }}>
                                <div style={{ ...styles.hbarFill, width: `${Math.min(pct, 100)}%`, background: used > annualAllowance ? "#E84855" : color }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 600, minWidth: 36, color: used > annualAllowance ? "#E84855" : "#333" }}>{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

        </div>
      )}

      {/* ── Modals ── */}
      {view === "add-holiday" && (
        <div style={styles.overlay} onClick={() => setView("overview")}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalTitle}>Saisir un congé</div>
            <label style={styles.label}>Employé</label>
            <select style={styles.input} value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })}>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <label style={styles.label}>Date de début</label>
            <input type="date" style={styles.input} value={form.start} onChange={e => setForm({ ...form, start: e.target.value })} />
            <label style={styles.label}>Date de fin</label>
            <input type="date" style={styles.input} value={form.end} onChange={e => setForm({ ...form, end: e.target.value })} />
            {form.start && form.end && diffDays(form.start, form.end) > 0 && (
              <div style={styles.preview}>{diffDays(form.start, form.end)} jour(s) calendaire(s)</div>
            )}
            <label style={styles.label}>Statut</label>
            <select style={styles.input} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="En attente">En attente</option>
              <option value="Confirmé">Confirmé</option>
              <option value="Refusé">Refusé</option>
            </select>
            <label style={styles.label}>Note (facultatif)</label>
            <input style={styles.input} placeholder="ex : Vacances d'été" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
            <div style={styles.modalActions}>
              <button style={styles.btnSecondary2} onClick={() => setView("overview")}>Annuler</button>
              <button style={{ ...styles.btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={addHoliday} disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {view === "add-employee" && (
        <div style={styles.overlay} onClick={() => setView("overview")}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalTitle}>Ajouter un employé</div>
            <label style={styles.label}>Nom complet</label>
            <input
              style={styles.input}
              placeholder="ex : Marie Dupont"
              value={newEmp}
              onChange={e => setNewEmp(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addEmployee()}
              autoFocus
            />
            <div style={styles.modalActions}>
              <button style={styles.btnSecondary2} onClick={() => setView("overview")}>Annuler</button>
              <button style={{ ...styles.btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={addEmployee} disabled={saving}>
                {saving ? "Ajout…" : "Ajouter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  app: { minHeight: "100vh", background: "#F7F7F5", fontFamily: "'DM Sans', sans-serif", paddingBottom: 60 },
  header: { background: "#111", color: "#fff", padding: "24px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  logo: { fontSize: 22, fontWeight: 800, letterSpacing: 4, fontFamily: "'DM Mono', monospace" },
  subtitle: { fontSize: 11, color: "#666", letterSpacing: 1, marginTop: 2 },
  headerActions: { display: "flex", gap: 10 },
  btnPrimary: { background: "#E84855", color: "#fff", border: "none", borderRadius: 6, padding: "9px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13 },
  btnSecondary: { background: "transparent", color: "#fff", border: "1px solid #444", borderRadius: 6, padding: "9px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13 },
  btnSecondary2: { background: "transparent", color: "#333", border: "1px solid #ddd", borderRadius: 6, padding: "9px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13 },
  errorBanner: { background: "#FFF0F0", color: "#C0392B", padding: "10px 32px", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #FFCCCC" },
  errorClose: { background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#C0392B" },
  // Tab bar
  tabBar: { display: "flex", gap: 0, padding: "0 32px", background: "#fff", borderBottom: "1px solid #EBEBEB" },
  // Overview cards
  cards: { display: "flex", flexWrap: "wrap", gap: 16, padding: "28px 32px 0" },
  card: { background: "#fff", borderRadius: 10, padding: "20px 20px 16px", minWidth: 160, flex: "0 0 180px", boxShadow: "0 1px 4px rgba(0,0,0,.07)", position: "relative" },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  avatar: { width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13, flexShrink: 0 },
  delBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#bbb", lineHeight: 1, padding: 0 },
  empName: { fontWeight: 600, fontSize: 14, marginBottom: 6, color: "#111" },
  dayCount: { fontSize: 28, fontWeight: 800, color: "#111", lineHeight: 1 },
  dayLabel: { fontSize: 13, fontWeight: 400, color: "#888" },
  holCount: { fontSize: 12, color: "#aaa", marginTop: 4 },
  onHolidayBadge: { marginTop: 8, display: "inline-block", background: "#E8FFF3", color: "#06D6A0", fontSize: 10, fontWeight: 700, letterSpacing: 0.5, padding: "2px 7px", borderRadius: 20, textTransform: "uppercase" },
  empty: { color: "#aaa", fontSize: 14, padding: "20px 0" },
  // Sections
  section: { margin: "28px 32px 0" },
  sectionHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontWeight: 700, fontSize: 15, letterSpacing: 1, textTransform: "uppercase", color: "#111" },
  activePill: { background: "#E8FFF3", color: "#06D6A0", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, textTransform: "uppercase", marginRight: 4 },
  // Table
  select: { border: "1px solid #ddd", borderRadius: 6, padding: "6px 10px", fontSize: 13, background: "#fff", cursor: "pointer" },
  table: { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.07)" },
  th: { textAlign: "left", padding: "12px 16px", fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: 1, borderBottom: "1px solid #F0F0EE" },
  td: { padding: "12px 16px", fontSize: 13, color: "#333", borderBottom: "1px solid #F7F7F5" },
  empCell: { display: "flex", alignItems: "center", gap: 8, fontWeight: 500 },
  dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  emptyList: { color: "#aaa", fontSize: 14, padding: "16px 0" },
  // Modal
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
  modal: { background: "#fff", borderRadius: 12, padding: 28, width: 360, maxWidth: "90vw", display: "flex", flexDirection: "column", gap: 6 },
  modalTitle: { fontWeight: 800, fontSize: 18, marginBottom: 10, color: "#111" },
  label: { fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginTop: 6 },
  input: { border: "1px solid #E0E0DD", borderRadius: 6, padding: "9px 12px", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" },
  preview: { fontSize: 12, color: "#E84855", fontWeight: 600 },
  modalActions: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 },
  // Dashboard
  controls: { display: "flex", alignItems: "center", gap: 24, padding: "20px 0 4px" },
  controlGroup: { display: "flex", alignItems: "center", gap: 10 },
  controlLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#888" },
  allowanceInput: { display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #ddd", borderRadius: 6, padding: "4px 10px" },
  stepBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#666", lineHeight: 1, padding: "0 2px", fontWeight: 700 },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 14, margin: "16px 0 20px" },
  kpiCard: { background: "#fff", borderRadius: 10, padding: "18px 18px 14px", boxShadow: "0 1px 4px rgba(0,0,0,.07)" },
  dashGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start", marginBottom: 20 },
  panel: { background: "#fff", borderRadius: 10, padding: "20px 20px 16px", boxShadow: "0 1px 4px rgba(0,0,0,.07)" },
  panelTitle: { fontWeight: 700, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", color: "#111", marginBottom: 16 },
  // Progress bars
  progressRow: { marginBottom: 14 },
  progressTop: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  hbarTrack: { height: 8, background: "#F0F0EE", borderRadius: 4, overflow: "hidden" },
  hbarFill: { height: "100%", borderRadius: 4, transition: "width 0.4s ease" },
  overBadge: { marginLeft: 6, background: "#FFF0F0", color: "#E84855", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10 },
  // Timeline rows
  timelineRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", marginBottom: 8, background: "#FAFAF8", borderRadius: 6, gap: 8 },
  // Bar chart
  barChart: { display: "flex", alignItems: "flex-end", gap: 6, height: 120, paddingTop: 20, position: "relative" },
  barCol: { display: "flex", flexDirection: "column", alignItems: "center", flex: 1 },
  barValLabel: { fontSize: 10, color: "#888", fontWeight: 600, marginBottom: 2, height: 14, lineHeight: "14px" },
  barOuter: { flex: 1, width: "100%", display: "flex", alignItems: "flex-end" },
  barInner: { width: "100%", borderRadius: "3px 3px 0 0", minHeight: 2, transition: "height 0.4s ease" },
  barLabel: { fontSize: 10, marginTop: 4 },
  // Misc
  center: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh" },
  spinner: { width: 32, height: 32, border: "3px solid #eee", borderTop: "3px solid #E84855", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
  * { box-sizing: border-box; }
  body { margin: 0; }
  .table-row:hover td { background: #FAFAF8; }
  .table-row:last-child td { border-bottom: none; }
  @keyframes spin { to { transform: rotate(360deg); } }
  button:hover { opacity: 0.88; }
  select:focus, input:focus { border-color: #E84855; outline: none; }
  .tab-btn {
    padding: 12px 20px;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    color: #888;
    border-bottom: 2px solid transparent;
    font-family: inherit;
    transition: color 0.15s, border-color 0.15s;
  }
  .tab-btn:hover { color: #111; opacity: 1; }
  .tab-active { color: #111 !important; border-bottom-color: #E84855 !important; }
  @media (max-width: 768px) {
    .dash-grid { grid-template-columns: 1fr !important; }
  }
`;
