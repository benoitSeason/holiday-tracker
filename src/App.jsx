import { useState, useEffect } from "react";

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
};

const COLORS = ["#E84855","#3A86FF","#06D6A0","#FFB703","#9B5DE5","#F77F00","#4CC9F0","#43AA8B"];

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

export default function App() {
  const [employees, setEmployees] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState("overview");
  const [newEmp, setNewEmp] = useState("");
  const [form, setForm] = useState({ employeeId: "", start: "", end: "", note: "" });
  const [filterEmp, setFilterEmp] = useState("all");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [emps, hols] = await Promise.all([db.getEmployees(), db.getHolidays()]);
      setEmployees(emps);
      setHolidays(hols);
    } catch (e) {
      setError("Could not connect to database. Check your Supabase setup.");
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
    } catch (e) { setError("Failed to add employee."); }
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
      });
      setHolidays(prev => [h, ...prev]);
      setForm({ employeeId: "", start: "", end: "", note: "" });
      setView("overview");
    } catch (e) { setError("Failed to save holiday."); }
    setSaving(false);
  }

  async function deleteHoliday(id) {
    try {
      await db.deleteHoliday(id);
      setHolidays(prev => prev.filter(h => h.id !== id));
    } catch (e) { setError("Failed to delete."); }
  }

  async function deleteEmployee(id) {
    try {
      await db.deleteEmployee(id);
      setEmployees(prev => prev.filter(e => e.id !== id));
      setHolidays(prev => prev.filter(h => h.employee_id !== id));
    } catch (e) { setError("Failed to delete employee."); }
  }

  const totalByEmp = employees.reduce((acc, e) => {
    acc[e.id] = holidays.filter(h => h.employee_id === e.id).reduce((s, h) => s + h.days, 0);
    return acc;
  }, {});

  const filteredHolidays = filterEmp === "all" ? holidays : holidays.filter(h => h.employee_id === filterEmp);
  const empMap = employees.reduce((m, e) => { m[e.id] = e; return m; }, {});

  if (loading) return (
    <div style={styles.center}>
      <div style={styles.spinner} />
      <div style={{ marginTop: 16, color: "#888", fontSize: 13 }}>Connecting to database…</div>
    </div>
  );

  return (
    <div style={styles.app}>
      <style>{css}</style>

      <header style={styles.header}>
        <div>
          <div style={styles.logo}>CONGÉS</div>
          <div style={styles.subtitle}>Holiday Tracker · Supabase</div>
        </div>
        <div style={styles.headerActions}>
          <button style={styles.btnSecondary} onClick={() => setView("add-employee")}>+ Employee</button>
          <button
            style={{ ...styles.btnPrimary, opacity: employees.length === 0 ? 0.4 : 1 }}
            disabled={employees.length === 0}
            onClick={() => { setForm({ employeeId: employees[0]?.id || "", start: "", end: "", note: "" }); setView("add-holiday"); }}
          >+ Holiday</button>
        </div>
      </header>

      {error && (
        <div style={styles.errorBanner}>
          {error}
          <button style={styles.errorClose} onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div style={styles.cards}>
        {employees.map(emp => (
          <div key={emp.id} style={{ ...styles.card, borderTop: `3px solid ${COLORS[emp.color_idx % COLORS.length]}` }}>
            <div style={styles.cardTop}>
              <div style={{ ...styles.avatar, background: COLORS[emp.color_idx % COLORS.length] }}>{getInitials(emp.name)}</div>
              <button style={styles.delBtn} onClick={() => deleteEmployee(emp.id)} title="Remove employee">×</button>
            </div>
            <div style={styles.empName}>{emp.name}</div>
            <div style={styles.dayCount}>{totalByEmp[emp.id] || 0}<span style={styles.dayLabel}> days</span></div>
            <div style={styles.holCount}>{holidays.filter(h => h.employee_id === emp.id).length} period(s)</div>
          </div>
        ))}
        {employees.length === 0 && (
          <div style={styles.empty}>No employees yet. Add one to get started.</div>
        )}
      </div>

      {employees.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <div style={styles.sectionTitle}>Holiday Periods</div>
            <select style={styles.select} value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
              <option value="all">All employees</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          {filteredHolidays.length === 0 && <div style={styles.emptyList}>No holidays recorded.</div>}
          {filteredHolidays.length > 0 && (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Employee</th>
                  <th style={styles.th}>Start</th>
                  <th style={styles.th}>End</th>
                  <th style={styles.th}>Days</th>
                  <th style={styles.th}>Note</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {filteredHolidays.map(h => {
                  const emp = empMap[h.employee_id];
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
                      <td style={{ ...styles.td, color: "#888" }}>{h.note || "—"}</td>
                      <td style={styles.td}>
                        <button style={styles.delBtn} onClick={() => deleteHoliday(h.id)}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {view === "add-holiday" && (
        <div style={styles.overlay} onClick={() => setView("overview")}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalTitle}>Log Holiday</div>
            <label style={styles.label}>Employee</label>
            <select style={styles.input} value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })}>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <label style={styles.label}>Start Date</label>
            <input type="date" style={styles.input} value={form.start} onChange={e => setForm({ ...form, start: e.target.value })} />
            <label style={styles.label}>End Date</label>
            <input type="date" style={styles.input} value={form.end} onChange={e => setForm({ ...form, end: e.target.value })} />
            {form.start && form.end && diffDays(form.start, form.end) > 0 && (
              <div style={styles.preview}>{diffDays(form.start, form.end)} calendar day(s)</div>
            )}
            <label style={styles.label}>Note (optional)</label>
            <input style={styles.input} placeholder="e.g. Summer vacation" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
            <div style={styles.modalActions}>
              <button style={styles.btnSecondary2} onClick={() => setView("overview")}>Cancel</button>
              <button style={{ ...styles.btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={addHoliday} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {view === "add-employee" && (
        <div style={styles.overlay} onClick={() => setView("overview")}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalTitle}>Add Employee</div>
            <label style={styles.label}>Full Name</label>
            <input
              style={styles.input}
              placeholder="e.g. Marie Dupont"
              value={newEmp}
              onChange={e => setNewEmp(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addEmployee()}
              autoFocus
            />
            <div style={styles.modalActions}>
              <button style={styles.btnSecondary2} onClick={() => setView("overview")}>Cancel</button>
              <button style={{ ...styles.btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={addEmployee} disabled={saving}>
                {saving ? "Adding…" : "Add"}
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
  subtitle: { fontSize: 11, color: "#666", letterSpacing: 2, marginTop: 2 },
  headerActions: { display: "flex", gap: 10 },
  btnPrimary: { background: "#E84855", color: "#fff", border: "none", borderRadius: 6, padding: "9px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13 },
  btnSecondary: { background: "transparent", color: "#fff", border: "1px solid #444", borderRadius: 6, padding: "9px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13 },
  btnSecondary2: { background: "transparent", color: "#333", border: "1px solid #ddd", borderRadius: 6, padding: "9px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13 },
  errorBanner: { background: "#FFF0F0", color: "#C0392B", padding: "10px 32px", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #FFCCCC" },
  errorClose: { background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#C0392B" },
  cards: { display: "flex", flexWrap: "wrap", gap: 16, padding: "28px 32px 0" },
  card: { background: "#fff", borderRadius: 10, padding: "20px 20px 16px", minWidth: 160, flex: "0 0 180px", boxShadow: "0 1px 4px rgba(0,0,0,.07)", position: "relative" },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  avatar: { width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13 },
  delBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#bbb", lineHeight: 1, padding: 0 },
  empName: { fontWeight: 600, fontSize: 14, marginBottom: 6, color: "#111" },
  dayCount: { fontSize: 28, fontWeight: 800, color: "#111", lineHeight: 1 },
  dayLabel: { fontSize: 13, fontWeight: 400, color: "#888" },
  holCount: { fontSize: 12, color: "#aaa", marginTop: 4 },
  empty: { color: "#aaa", fontSize: 14, padding: "20px 0" },
  section: { margin: "28px 32px 0" },
  sectionHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontWeight: 700, fontSize: 15, letterSpacing: 1, textTransform: "uppercase", color: "#111" },
  select: { border: "1px solid #ddd", borderRadius: 6, padding: "6px 10px", fontSize: 13, background: "#fff", cursor: "pointer" },
  table: { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.07)" },
  th: { textAlign: "left", padding: "12px 16px", fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: 1, borderBottom: "1px solid #F0F0EE" },
  td: { padding: "12px 16px", fontSize: 13, color: "#333", borderBottom: "1px solid #F7F7F5" },
  empCell: { display: "flex", alignItems: "center", gap: 8, fontWeight: 500 },
  dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  emptyList: { color: "#aaa", fontSize: 14, padding: "16px 0" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
  modal: { background: "#fff", borderRadius: 12, padding: 28, width: 360, maxWidth: "90vw", display: "flex", flexDirection: "column", gap: 6 },
  modalTitle: { fontWeight: 800, fontSize: 18, marginBottom: 10, color: "#111" },
  label: { fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginTop: 6 },
  input: { border: "1px solid #E0E0DD", borderRadius: 6, padding: "9px 12px", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" },
  preview: { fontSize: 12, color: "#E84855", fontWeight: 600 },
  modalActions: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 },
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
`;
