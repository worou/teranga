import { useState, useEffect, useMemo } from "react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

// ═══════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════
const MOCK = {
  stats: {
    totalUsers: 14832,
    activeWomen: 8291,
    activeMen: 6541,
    ratioMaleFemale: 0.79,
    activeSubscriptions: 2187,
    conversionRate: 0.33,
    totalConversations: 9456,
    pendingReports: 23,
    mrr30dFcfa: 8740000,
  },
  usersGrowth: [
    { month: "Oct", users: 8200, women: 4600, men: 3600 },
    { month: "Nov", users: 9450, women: 5300, men: 4150 },
    { month: "Déc", users: 10800, women: 6050, men: 4750 },
    { month: "Jan", users: 11900, women: 6700, men: 5200 },
    { month: "Fév", users: 13200, women: 7400, men: 5800 },
    { month: "Mar", users: 14100, women: 7900, men: 6200 },
    { month: "Avr", users: 14832, women: 8291, men: 6541 },
  ],
  mrrGrowth: [
    { month: "Oct", mrr: 4200000 },
    { month: "Nov", mrr: 5100000 },
    { month: "Déc", mrr: 5800000 },
    { month: "Jan", mrr: 6500000 },
    { month: "Fév", mrr: 7400000 },
    { month: "Mar", mrr: 8100000 },
    { month: "Avr", mrr: 8740000 },
  ],
  planDistribution: [
    { name: "Free", value: 4354, color: "#B4B2A9" },
    { name: "Discovery", value: 1012, color: "#85B7EB" },
    { name: "Standard", value: 768, color: "#5DCAA5" },
    { name: "Engagement", value: 407, color: "#D4537E" },
  ],
  paymentMethods: [
    { name: "Orange Money", value: 38 },
    { name: "Wave", value: 27 },
    { name: "MTN MoMo", value: 15 },
    { name: "Carte", value: 10 },
    { name: "Moov Money", value: 6 },
    { name: "Airtel Money", value: 4 },
  ],
  users: [
    { id: "u1", firstName: "Aminata", lastName: "Diop", phone: "+221771234567", gender: "FEMALE", city: "Dakar", country: "SN", intent: "MARRIAGE", isVerified: true, status: "ACTIVE", plan: "FREE", createdAt: "2025-11-02T10:00:00Z" },
    { id: "u2", firstName: "Moussa", lastName: "Konaté", phone: "+221776543210", gender: "MALE", city: "Dakar", country: "SN", intent: "SERIOUS_RELATIONSHIP", isVerified: true, status: "ACTIVE", plan: "STANDARD", createdAt: "2025-11-15T08:30:00Z" },
    { id: "u3", firstName: "Fatou", lastName: "Sow", phone: "+221778889999", gender: "FEMALE", city: "Thiès", country: "SN", intent: "FAMILY", isVerified: false, status: "ACTIVE", plan: "FREE", createdAt: "2025-12-01T14:20:00Z" },
    { id: "u4", firstName: "Ibrahim", lastName: "Touré", phone: "+22507654321", gender: "MALE", city: "Abidjan", country: "CI", intent: "MARRIAGE", isVerified: true, status: "ACTIVE", plan: "ENGAGEMENT", createdAt: "2025-12-20T09:15:00Z" },
    { id: "u5", firstName: "Aïssatou", lastName: "Ba", phone: "+224622111222", gender: "FEMALE", city: "Conakry", country: "GN", intent: "SERIOUS_RELATIONSHIP", isVerified: true, status: "ACTIVE", plan: "FREE", createdAt: "2026-01-05T11:00:00Z" },
    { id: "u6", firstName: "Ousmane", lastName: "Ndiaye", phone: "+221773334444", gender: "MALE", city: "Saint-Louis", country: "SN", intent: "MARRIAGE", isVerified: false, status: "ACTIVE", plan: "DISCOVERY", createdAt: "2026-01-18T16:45:00Z" },
    { id: "u7", firstName: "Mariama", lastName: "Camara", phone: "+223901234567", gender: "FEMALE", city: "Bamako", country: "ML", intent: "FAMILY", isVerified: true, status: "ACTIVE", plan: "FREE", createdAt: "2026-02-02T07:30:00Z" },
    { id: "u8", firstName: "Cheikh", lastName: "Fall", phone: "+221775556666", gender: "MALE", city: "Dakar", country: "SN", intent: "MARRIAGE", isVerified: true, status: "BANNED", plan: "FREE", createdAt: "2026-02-14T13:00:00Z" },
    { id: "u9", firstName: "Adama", lastName: "Traoré", phone: "+22670123456", gender: "MALE", city: "Ouagadougou", country: "BF", intent: "SERIOUS_RELATIONSHIP", isVerified: true, status: "ACTIVE", plan: "STANDARD", createdAt: "2026-03-01T10:20:00Z" },
    { id: "u10", firstName: "Khady", lastName: "Mbaye", phone: "+221779990000", gender: "FEMALE", city: "Dakar", country: "SN", intent: "MARRIAGE", isVerified: true, status: "ACTIVE", plan: "FREE", createdAt: "2026-03-15T15:10:00Z" },
    { id: "u11", firstName: "Boubacar", lastName: "Diallo", phone: "+224623456789", gender: "MALE", city: "Conakry", country: "GN", intent: "FAMILY", isVerified: false, status: "ACTIVE", plan: "DISCOVERY", createdAt: "2026-03-22T08:00:00Z" },
    { id: "u12", firstName: "Awa", lastName: "Sy", phone: "+221774445555", gender: "FEMALE", city: "Ziguinchor", country: "SN", intent: "MARRIAGE", isVerified: true, status: "ACTIVE", plan: "FREE", createdAt: "2026-04-01T12:00:00Z" },
  ],
  reports: [
    { id: "r1", reporter: { id: "u5", firstName: "Aïssatou" }, reported: { id: "u8", firstName: "Cheikh" }, reason: "SCAM", description: "Demande d'argent répétée, prétend être en urgence médicale.", status: "PENDING", createdAt: "2026-04-20T14:30:00Z" },
    { id: "r2", reporter: { id: "u1", firstName: "Aminata" }, reported: { id: "u6", firstName: "Ousmane" }, reason: "FAKE_PROFILE", description: "Photos visiblement volées d'un mannequin.", status: "PENDING", createdAt: "2026-04-19T09:15:00Z" },
    { id: "r3", reporter: { id: "u10", firstName: "Khady" }, reported: { id: "u9", firstName: "Adama" }, reason: "HARASSMENT", description: "Messages insistants et menaçants après refus de communiquer.", status: "PENDING", createdAt: "2026-04-18T22:00:00Z" },
    { id: "r4", reporter: { id: "u7", firstName: "Mariama" }, reported: { id: "u11", firstName: "Boubacar" }, reason: "INAPPROPRIATE_CONTENT", description: "Photos inappropriées envoyées dans la messagerie.", status: "PENDING", createdAt: "2026-04-17T18:45:00Z" },
    { id: "r5", reporter: { id: "u3", firstName: "Fatou" }, reported: { id: "u8", firstName: "Cheikh" }, reason: "SCAM", description: "Se fait passer pour un médecin, demande des virements.", status: "RESOLVED", createdAt: "2026-04-15T11:20:00Z" },
  ],
  payments: [
    { id: "p1", userId: "u2", userName: "Moussa Konaté", plan: "STANDARD", method: "ORANGE_MONEY", status: "COMPLETED", amountFcfa: 21000, phoneNumber: "+221776543210", createdAt: "2026-04-10T08:00:00Z" },
    { id: "p2", userId: "u4", userName: "Ibrahim Touré", plan: "ENGAGEMENT", method: "WAVE", status: "COMPLETED", amountFcfa: 72000, phoneNumber: "+22507654321", createdAt: "2026-04-08T14:30:00Z" },
    { id: "p3", userId: "u6", userName: "Ousmane Ndiaye", plan: "DISCOVERY", method: "MTN_MOMO", status: "COMPLETED", amountFcfa: 3000, phoneNumber: "+221773334444", createdAt: "2026-04-05T10:15:00Z" },
    { id: "p4", userId: "u9", userName: "Adama Traoré", plan: "STANDARD", method: "CARD", status: "COMPLETED", amountFcfa: 21000, phoneNumber: null, createdAt: "2026-04-03T16:00:00Z" },
    { id: "p5", userId: "u11", userName: "Boubacar Diallo", plan: "DISCOVERY", method: "ORANGE_MONEY", status: "FAILED", amountFcfa: 3000, phoneNumber: "+224623456789", createdAt: "2026-04-02T09:45:00Z" },
    { id: "p6", userId: "u2", userName: "Moussa Konaté", plan: "STANDARD", method: "ORANGE_MONEY", status: "COMPLETED", amountFcfa: 21000, phoneNumber: "+221776543210", createdAt: "2026-03-10T08:00:00Z" },
    { id: "p7", userId: "u4", userName: "Ibrahim Touré", plan: "ENGAGEMENT", method: "WAVE", status: "COMPLETED", amountFcfa: 72000, phoneNumber: "+22507654321", createdAt: "2026-03-01T11:20:00Z" },
    { id: "p8", userId: "u9", userName: "Adama Traoré", plan: "STANDARD", method: "MOOV_MONEY", status: "COMPLETED", amountFcfa: 21000, phoneNumber: "+22670123456", createdAt: "2026-02-28T14:00:00Z" },
  ],
  events: [
    { id: "e1", title: "Soirée rencontres Dakar", type: "IN_PERSON", city: "Dakar", country: "SN", startsAt: "2026-05-10T19:00:00Z", maxParticipants: 60, participantsCount: 42, hasJoined: false },
    { id: "e2", title: "Café virtuel — Parlons mariage", type: "VIRTUAL", city: null, country: null, startsAt: "2026-05-05T18:00:00Z", maxParticipants: 100, participantsCount: 67, hasJoined: false },
    { id: "e3", title: "Speed dating Abidjan", type: "IN_PERSON", city: "Abidjan", country: "CI", startsAt: "2026-05-15T20:00:00Z", maxParticipants: 40, participantsCount: 38, hasJoined: false },
    { id: "e4", title: "Atelier confiance en soi", type: "VIRTUAL", city: null, country: null, startsAt: "2026-05-20T17:00:00Z", maxParticipants: 200, participantsCount: 89, hasJoined: false },
  ],
};

// ═══════════════════════════════════════════════════
// API SERVICE
// ═══════════════════════════════════════════════════
const API_BASE = "http://localhost:3000/api/v1";

function createApiService(token) {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const get = (path) => fetch(`${API_BASE}${path}`, { headers }).then((r) => r.json());
  const post = (path, body) => fetch(`${API_BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) }).then((r) => r.json());
  return {
    getStats: () => get("/admin/stats"),
    getReports: () => get("/admin/reports"),
    banUser: (userId) => post(`/admin/users/${userId}/ban`),
    getPayments: (userId) => get(`/payments/me`),
    getEvents: () => get("/events"),
    getPricing: () => get("/pricing"),
  };
}

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════
const fmtCFA = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n)) + " F";
const fmtPct = (n) => Math.round(n * 100) + "%";
const fmtDate = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
const fmtDateTime = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const REASON_LABELS = { HARASSMENT: "Harcèlement", FAKE_PROFILE: "Faux profil", SCAM: "Arnaque", INAPPROPRIATE_CONTENT: "Contenu inapproprié", SPAM: "Spam", OTHER: "Autre" };
const STATUS_COLORS = { ACTIVE: "bg-emerald-100 text-emerald-800", BANNED: "bg-red-100 text-red-800", SUSPENDED: "bg-amber-100 text-amber-800", DELETED: "bg-gray-100 text-gray-600" };
const PLAN_COLORS = { FREE: "bg-gray-100 text-gray-700", DISCOVERY: "bg-blue-100 text-blue-700", STANDARD: "bg-teal-100 text-teal-700", ENGAGEMENT: "bg-pink-100 text-pink-700" };
const PAY_STATUS = { COMPLETED: "bg-emerald-100 text-emerald-700", PENDING: "bg-amber-100 text-amber-700", PROCESSING: "bg-blue-100 text-blue-700", FAILED: "bg-red-100 text-red-700", REFUNDED: "bg-gray-100 text-gray-600" };
const REPORT_STATUS = { PENDING: "bg-amber-100 text-amber-700", RESOLVED: "bg-emerald-100 text-emerald-700", DISMISSED: "bg-gray-100 text-gray-600" };

// ═══════════════════════════════════════════════════
// ICONS (simple SVG)
// ═══════════════════════════════════════════════════
const Icon = ({ d, size = 20, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);

const Icons = {
  dashboard: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M9 7a4 4 0 1 0-8 0 4 4 0 0 0 8 0 M16 3.13a4 4 0 0 1 0 7.75",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  creditCard: "M1 4h22v16H1z M1 10h22",
  calendar: "M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M16 2v4 M8 2v4 M3 10h18",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35",
  ban: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M4.93 4.93l14.14 14.14",
  check: "M20 6L9 17l-5-5",
  x: "M18 6L6 18 M6 6l12 12",
  chevron: "M9 18l6-6-6-6",
  alert: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01",
  trending: "M23 6l-9.5 9.5-5-5L1 18",
  dollarSign: "M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  heart: "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  server: "M2 2h20v8H2z M2 14h20v8H2z M6 6h.01 M6 18h.01",
};

// ═══════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════
const Badge = ({ label, className }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>{label}</span>
);

const MetricCard = ({ label, value, sub, icon, color = "text-gray-600" }) => (
  <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-3">
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color} bg-opacity-10`} style={{ background: "var(--iconBg, #f3f4f6)" }}>
      <Icon d={icon} size={18} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-semibold text-gray-900 mt-0.5">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════
// PAGE: DASHBOARD
// ═══════════════════════════════════════════════════
const DashboardPage = ({ data }) => {
  const s = data.stats;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Utilisateurs" value={new Intl.NumberFormat("fr-FR").format(s.totalUsers)} sub={`${new Intl.NumberFormat("fr-FR").format(s.activeWomen)} F / ${new Intl.NumberFormat("fr-FR").format(s.activeMen)} H`} icon={Icons.users} color="text-blue-600" />
        <MetricCard label="MRR (30j)" value={fmtCFA(s.mrr30dFcfa)} sub="Revenu mensuel récurrent" icon={Icons.dollarSign} color="text-emerald-600" />
        <MetricCard label="Abonnements actifs" value={new Intl.NumberFormat("fr-FR").format(s.activeSubscriptions)} sub={`Conversion : ${fmtPct(s.conversionRate)}`} icon={Icons.trending} color="text-pink-600" />
        <MetricCard label="Conversations" value={new Intl.NumberFormat("fr-FR").format(s.totalConversations)} sub={`${s.pendingReports} signalements en attente`} icon={Icons.heart} color="text-purple-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Croissance utilisateurs</h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data.usersGrowth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => new Intl.NumberFormat("fr-FR").format(v)} />
              <Area type="monotone" dataKey="women" stackId="1" stroke="#D4537E" fill="#FBEAF0" name="Femmes" />
              <Area type="monotone" dataKey="men" stackId="1" stroke="#185FA5" fill="#E6F1FB" name="Hommes" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Évolution MRR (F CFA)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.mrrGrowth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${Math.round(v / 1000000)}M`} />
              <Tooltip formatter={(v) => fmtCFA(v)} />
              <Line type="monotone" dataKey="mrr" stroke="#1D9E75" strokeWidth={2} dot={{ r: 4 }} name="MRR" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Répartition des abonnements</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data.planDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}>
                {data.planDistribution.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => new Intl.NumberFormat("fr-FR").format(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Méthodes de paiement (%)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.paymentMethods} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 12 }} unit="%" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Bar dataKey="value" fill="#D4537E" radius={[0, 4, 4, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════
// PAGE: USERS
// ═══════════════════════════════════════════════════
const UsersPage = ({ data, onBan }) => {
  const [search, setSearch] = useState("");
  const [filterGender, setFilterGender] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [selectedUser, setSelectedUser] = useState(null);

  const filtered = useMemo(() => {
    return data.users.filter((u) => {
      const q = search.toLowerCase();
      const matchSearch = !q || u.firstName.toLowerCase().includes(q) || u.lastName.toLowerCase().includes(q) || u.phone.includes(q) || u.city.toLowerCase().includes(q);
      const matchGender = filterGender === "ALL" || u.gender === filterGender;
      const matchStatus = filterStatus === "ALL" || u.status === filterStatus;
      return matchSearch && matchGender && matchStatus;
    });
  }, [data.users, search, filterGender, filterStatus]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Icon d={Icons.search} size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Rechercher un utilisateur..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-pink-300" />
        </div>
        <select value={filterGender} onChange={(e) => setFilterGender(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2">
          <option value="ALL">Tous genres</option>
          <option value="FEMALE">Femmes</option>
          <option value="MALE">Hommes</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2">
          <option value="ALL">Tous statuts</option>
          <option value="ACTIVE">Actif</option>
          <option value="BANNED">Banni</option>
        </select>
        <span className="text-xs text-gray-400">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3">Utilisateur</th>
              <th className="px-4 py-3">Ville</th>
              <th className="px-4 py-3">Intent</th>
              <th className="px-4 py-3">Abo</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Inscription</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${u.gender === "FEMALE" ? "bg-pink-100 text-pink-700" : "bg-blue-100 text-blue-700"}`}>
                      {u.firstName[0]}{u.lastName[0]}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{u.firstName} {u.lastName}</p>
                      <p className="text-xs text-gray-400">{u.phone}</p>
                    </div>
                    {u.isVerified && <span className="text-emerald-500 text-xs" title="Vérifié">&#10003;</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">{u.city}, {u.country}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">{u.intent.replace(/_/g, " ")}</td>
                <td className="px-4 py-3"><Badge label={u.plan} className={PLAN_COLORS[u.plan] || "bg-gray-100 text-gray-600"} /></td>
                <td className="px-4 py-3"><Badge label={u.status} className={STATUS_COLORS[u.status] || "bg-gray-100 text-gray-600"} /></td>
                <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(u.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setSelectedUser(u)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Voir profil">
                      <Icon d={Icons.eye} size={15} />
                    </button>
                    {u.status !== "BANNED" && (
                      <button onClick={() => onBan(u.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400" title="Bannir">
                        <Icon d={Icons.ban} size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={() => setSelectedUser(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Profil utilisateur</h3>
              <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-gray-600"><Icon d={Icons.x} size={18} /></button>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-medium ${selectedUser.gender === "FEMALE" ? "bg-pink-100 text-pink-700" : "bg-blue-100 text-blue-700"}`}>
                {selectedUser.firstName[0]}{selectedUser.lastName[0]}
              </div>
              <div>
                <p className="font-semibold">{selectedUser.firstName} {selectedUser.lastName}</p>
                <p className="text-sm text-gray-500">{selectedUser.phone}</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              {[["Ville", `${selectedUser.city}, ${selectedUser.country}`], ["Genre", selectedUser.gender], ["Intention", selectedUser.intent.replace(/_/g, " ")], ["Vérifié", selectedUser.isVerified ? "Oui" : "Non"], ["Abonnement", selectedUser.plan], ["Statut", selectedUser.status], ["Inscription", fmtDate(selectedUser.createdAt)]].map(([k, v]) => (
                <div key={k} className="flex justify-between py-1 border-b border-gray-50">
                  <span className="text-gray-500">{k}</span>
                  <span className="text-gray-900 font-medium">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════
// PAGE: MODERATION
// ═══════════════════════════════════════════════════
const ModerationPage = ({ data, onBan, onResolve }) => {
  const [filter, setFilter] = useState("PENDING");
  const filtered = data.reports.filter((r) => filter === "ALL" || r.status === filter);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="En attente" value={data.reports.filter((r) => r.status === "PENDING").length} icon={Icons.alert} color="text-amber-600" />
        <MetricCard label="Résolus" value={data.reports.filter((r) => r.status === "RESOLVED").length} icon={Icons.check} color="text-emerald-600" />
        <MetricCard label="Total signalements" value={data.reports.length} icon={Icons.shield} color="text-gray-600" />
      </div>

      <div className="flex items-center gap-2">
        {["PENDING", "RESOLVED", "ALL"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${filter === f ? "bg-pink-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {f === "PENDING" ? "En attente" : f === "RESOLVED" ? "Résolus" : "Tous"}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((r) => (
          <div key={r.id} className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge label={REASON_LABELS[r.reason] || r.reason} className="bg-red-50 text-red-700" />
                <Badge label={r.status} className={REPORT_STATUS[r.status]} />
                <span className="text-xs text-gray-400">{fmtDateTime(r.createdAt)}</span>
              </div>
              {r.status === "PENDING" && (
                <div className="flex gap-1">
                  <button onClick={() => onResolve(r.id)} className="px-3 py-1 text-xs rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium">Résoudre</button>
                  <button onClick={() => onBan(r.reported.id)} className="px-3 py-1 text-xs rounded-lg bg-red-50 text-red-700 hover:bg-red-100 font-medium">Bannir</button>
                </div>
              )}
            </div>
            <p className="text-sm text-gray-700 mb-2">{r.description}</p>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>Signalé par : <span className="font-medium text-gray-700">{r.reporter.firstName}</span></span>
              <span>Accusé : <span className="font-medium text-gray-700">{r.reported.firstName}</span></span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-center text-gray-400 py-8">Aucun signalement dans cette catégorie.</p>}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════
// PAGE: PAYMENTS
// ═══════════════════════════════════════════════════
const PaymentsPage = ({ data }) => {
  const [filterStatus, setFilterStatus] = useState("ALL");

  const totalRevenue = data.payments.filter((p) => p.status === "COMPLETED").reduce((s, p) => s + p.amountFcfa, 0);
  const avgPayment = data.payments.filter((p) => p.status === "COMPLETED").length > 0 ? totalRevenue / data.payments.filter((p) => p.status === "COMPLETED").length : 0;

  const filtered = data.payments.filter((p) => filterStatus === "ALL" || p.status === filterStatus);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Revenu total" value={fmtCFA(totalRevenue)} icon={Icons.dollarSign} color="text-emerald-600" />
        <MetricCard label="Paiement moyen" value={fmtCFA(avgPayment)} icon={Icons.trending} color="text-blue-600" />
        <MetricCard label="Transactions" value={data.payments.length} icon={Icons.creditCard} color="text-pink-600" />
        <MetricCard label="Taux de succès" value={fmtPct(data.payments.filter((p) => p.status === "COMPLETED").length / Math.max(data.payments.length, 1))} icon={Icons.check} color="text-purple-600" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Répartition par plan</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={[
            { plan: "Discovery", amount: data.payments.filter(p => p.plan === "DISCOVERY" && p.status === "COMPLETED").reduce((s, p) => s + p.amountFcfa, 0) },
            { plan: "Standard", amount: data.payments.filter(p => p.plan === "STANDARD" && p.status === "COMPLETED").reduce((s, p) => s + p.amountFcfa, 0) },
            { plan: "Engagement", amount: data.payments.filter(p => p.plan === "ENGAGEMENT" && p.status === "COMPLETED").reduce((s, p) => s + p.amountFcfa, 0) },
          ]}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="plan" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip formatter={(v) => fmtCFA(v)} />
            <Bar dataKey="amount" fill="#D4537E" radius={[4, 4, 0, 0]} barSize={40} name="Revenus" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-2 mb-2">
        {["ALL", "COMPLETED", "FAILED", "PENDING"].map((f) => (
          <button key={f} onClick={() => setFilterStatus(f)} className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${filterStatus === f ? "bg-pink-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {f === "ALL" ? "Tous" : f === "COMPLETED" ? "Complétés" : f === "FAILED" ? "Échoués" : "En attente"}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3">Utilisateur</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Méthode</th>
              <th className="px-4 py-3">Montant</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{p.userName}</td>
                <td className="px-4 py-3"><Badge label={p.plan} className={PLAN_COLORS[p.plan]} /></td>
                <td className="px-4 py-3 text-gray-600 text-xs">{p.method.replace(/_/g, " ")}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{fmtCFA(p.amountFcfa)}</td>
                <td className="px-4 py-3"><Badge label={p.status} className={PAY_STATUS[p.status]} /></td>
                <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(p.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════
// PAGE: EVENTS
// ═══════════════════════════════════════════════════
const EventsPage = ({ data }) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Événements" value={data.events.length} icon={Icons.calendar} color="text-purple-600" />
        <MetricCard label="Participants total" value={data.events.reduce((s, e) => s + e.participantsCount, 0)} icon={Icons.users} color="text-blue-600" />
        <MetricCard label="En présentiel" value={data.events.filter((e) => e.type === "IN_PERSON").length} icon={Icons.heart} color="text-pink-600" />
        <MetricCard label="Virtuels" value={data.events.filter((e) => e.type === "VIRTUAL").length} icon={Icons.server} color="text-teal-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.events.map((ev) => {
          const pct = ev.maxParticipants ? Math.round((ev.participantsCount / ev.maxParticipants) * 100) : 0;
          return (
            <div key={ev.id} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">{ev.title}</h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {ev.type === "VIRTUAL" ? "Virtuel" : `${ev.city}, ${ev.country}`}
                    {" — "}
                    {fmtDateTime(ev.startsAt)}
                  </p>
                </div>
                <Badge label={ev.type === "VIRTUAL" ? "Virtuel" : "Présentiel"} className={ev.type === "VIRTUAL" ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"} />
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{ev.participantsCount} / {ev.maxParticipants} participants</span>
                  <span>{pct}%</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct > 90 ? "#E24B4A" : pct > 70 ? "#EF9F27" : "#1D9E75" }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════
const NAV_ITEMS = [
  { key: "dashboard", label: "Tableau de bord", icon: Icons.dashboard },
  { key: "users", label: "Utilisateurs", icon: Icons.users },
  { key: "moderation", label: "Modération", icon: Icons.shield },
  { key: "payments", label: "Paiements", icon: Icons.creditCard },
  { key: "events", label: "Événements", icon: Icons.calendar },
];

export default function AdminDashboard() {
  const [page, setPage] = useState("dashboard");
  const [useMock, setUseMock] = useState(true);
  const [token, setToken] = useState("");
  const [data, setData] = useState(MOCK);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleBan = (userId) => {
    if (!confirm("Confirmer le bannissement de cet utilisateur ?")) return;
    setData((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === userId ? { ...u, status: "BANNED" } : u)),
    }));
  };

  const handleResolve = (reportId) => {
    setData((prev) => ({
      ...prev,
      reports: prev.reports.map((r) => (r.id === reportId ? { ...r, status: "RESOLVED" } : r)),
    }));
  };

  const fetchFromApi = async () => {
    if (!token) { alert("Entrez un token JWT admin pour utiliser l'API réelle."); return; }
    setLoading(true);
    try {
      const api = createApiService(token);
      const stats = await api.getStats();
      const reports = await api.getReports();
      const events = await api.getEvents();
      setData((prev) => ({ ...prev, stats, reports, events }));
    } catch (e) {
      alert("Erreur API : " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!useMock) fetchFromApi();
    else setData(MOCK);
  }, [useMock]);

  const pageTitle = NAV_ITEMS.find((n) => n.key === page)?.label || "";

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      {/* SIDEBAR */}
      <aside className={`${sidebarOpen ? "w-56" : "w-16"} flex-shrink-0 bg-white border-r border-gray-100 flex flex-col transition-all duration-200`}>
        <div className="flex items-center gap-2 px-4 h-14 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-pink-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">T</div>
          {sidebarOpen && <span className="text-sm font-semibold text-gray-900">Téranga Admin</span>}
        </div>
        <nav className="flex-1 py-3 space-y-1 px-2">
          {NAV_ITEMS.map((item) => (
            <button key={item.key} onClick={() => setPage(item.key)} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${page === item.key ? "bg-pink-50 text-pink-700 font-medium" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}>
              <Icon d={item.icon} size={18} />
              {sidebarOpen && <span>{item.label}</span>}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-100">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="w-full flex items-center justify-center p-2 rounded-lg text-gray-400 hover:bg-gray-50">
            <Icon d={Icons.chevron} size={16} className={`transition-transform ${sidebarOpen ? "rotate-180" : ""}`} />
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* HEADER */}
        <header className="h-14 flex items-center justify-between px-6 border-b border-gray-100 bg-white flex-shrink-0">
          <h1 className="text-base font-semibold text-gray-900">{pageTitle}</h1>
          <div className="flex items-center gap-3">
            {/* DATA SOURCE TOGGLE */}
            <div className="flex items-center gap-2 text-xs">
              <span className={useMock ? "text-gray-900 font-medium" : "text-gray-400"}>Mock</span>
              <button onClick={() => setUseMock(!useMock)} className={`relative w-10 h-5 rounded-full transition-colors ${useMock ? "bg-gray-300" : "bg-pink-500"}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${useMock ? "left-0.5" : "left-5.5 translate-x-0"}`} style={{ left: useMock ? 2 : 22 }} />
              </button>
              <span className={!useMock ? "text-gray-900 font-medium" : "text-gray-400"}>API</span>
            </div>
            {!useMock && (
              <input type="text" placeholder="JWT token..." value={token} onChange={(e) => setToken(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 w-48 focus:outline-none focus:ring-1 focus:ring-pink-200" />
            )}
            {loading && <span className="text-xs text-pink-600 animate-pulse">Chargement...</span>}
          </div>
        </header>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-6">
          {page === "dashboard" && <DashboardPage data={data} />}
          {page === "users" && <UsersPage data={data} onBan={handleBan} />}
          {page === "moderation" && <ModerationPage data={data} onBan={handleBan} onResolve={handleResolve} />}
          {page === "payments" && <PaymentsPage data={data} />}
          {page === "events" && <EventsPage data={data} />}
        </div>
      </main>
    </div>
  );
}
