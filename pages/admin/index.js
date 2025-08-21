import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [tenantId, setTenantId] = useState('');
  const [audit, setAudit] = useState([]);
  const [tables, setTables] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch('/api/admin/users/self');
        const data = await resp.json();
        if (!resp.ok || !data.success || !data.isAdmin) {
          setAuthorized(false);
          setError('You are not authorized to view this page');
        } else {
          setAuthorized(true);
          await loadData();
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function loadData() {
    try {
      const [auditResp, tablesResp, dbResp] = await Promise.all([
        fetch('/api/admin/audit/list'),
        fetch('/api/security/status'),
        fetch('/api/admin/db/overview')
      ]);
      const auditData = await auditResp.json();
      const tablesData = await tablesResp.json();
      const dbData = await dbResp.json();
      setAudit(auditData.logs || []);
      setTables({ ...tablesData.status, db: dbData.data });
    } catch (e) {
      setError('Failed loading admin data');
    }
  }

  function runExport(sub) {
    router.push(`/api/compliance/export?userSub=${encodeURIComponent(sub)}`);
  }

  async function runErase(sub) {
    if (!confirm('Erase user data? This cannot be undone.')) return;
    const resp = await fetch('/api/compliance/erase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userSub: sub }) });
    if (resp.ok) {
      alert('Erasure complete');
      loadData();
    } else {
      alert('Erasure failed');
    }
  }

  if (loading) return <div className="p-6">Loading...</div>;
  if (!authorized) return <div className="p-6 text-red-600">{error || 'Unauthorized'}</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-black">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <div className="flex items-center gap-2">
            <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="Tenant ID" className="border rounded px-2 py-1 text-sm" />
            <button onClick={loadData} className="px-3 py-1 text-sm bg-blue-500 text-white rounded">Refresh</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h2 className="font-semibold mb-3">Audit Logs (latest)</h2>
            <div className="overflow-x-auto text-sm">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-2">Time</th>
                    <th className="py-2 pr-2">Action</th>
                    <th className="py-2 pr-2">Entity</th>
                    <th className="py-2 pr-2">User Sub</th>
                    <th className="py-2 pr-2">Session</th>
                    <th className="py-2 pr-2">Ops</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((row) => (
                    <tr key={row.id} className="border-b">
                      <td className="py-1 pr-2">{new Date(row.createdAt || row.created_at).toLocaleString()}</td>
                      <td className="py-1 pr-2">{row.action}</td>
                      <td className="py-1 pr-2">{row.entityType}:{row.entityId}</td>
                      <td className="py-1 pr-2 font-mono text-xs">{row.userSub || '-'}</td>
                      <td className="py-1 pr-2 font-mono text-xs truncate">{row.sessionId || '-'}</td>
                      <td className="py-1 pr-2">
                        {row.userSub && (
                          <div className="flex gap-2">
                            <button onClick={() => runExport(row.userSub)} className="text-blue-600 hover:underline">Export</button>
                            <button onClick={() => runErase(row.userSub)} className="text-red-600 hover:underline">Erase</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h2 className="font-semibold mb-3">Database Overview</h2>
            <div className="text-sm space-y-2">
              <div>Sessions: {tables?.sessions?.total ?? tables?.sessions?.active ?? '-'}</div>
              <div>Rate Limit Window: limit {tables?.rateLimit?.current?.limit}, remaining {tables?.rateLimit?.current?.remaining}</div>
              <div>Features: {Object.keys(tables?.features || {}).filter(k => tables.features[k]).join(', ')}</div>
            </div>
            {tables?.db && (
              <div className="mt-4 space-y-6">
                {Object.entries(tables.db).map(([name, rows]) => (
                  <div key={name}>
                    <h3 className="font-semibold mb-2">{name}</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b">
                            {rows[0] && Object.keys(rows[0]).map((h) => (
                              <th key={h} className="text-left py-1 pr-2">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, i) => (
                            <tr key={i} className="border-b">
                              {Object.values(r).map((v, j) => (
                                <td key={j} className="py-1 pr-2 max-w-[240px] truncate">{String(v)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

