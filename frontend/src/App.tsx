import { useEffect, useMemo, useState } from 'react';
import { Activity, Bell, Gauge, Users, Search, Trash2, RefreshCcw } from 'lucide-react';

const apiBase = 'http://localhost:8000';
const reviewStorageKey = 'telegram-cleanup-review-state';
const membershipsStorageKey = 'telegram-cleanup-last-memberships';

type Membership = {
  id: string;
  name: string;
  type: 'group' | 'channel';
  category: string;
  status: 'keep' | 'remove' | 'review' | 'unclassified';
  protected: boolean;
};

function App() {
  const [status, setStatus] = useState<{ connected: boolean; account_name: string | null; membership_count: number }>({
    connected: false,
    account_name: null,
    membership_count: 0,
  });
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'group' | 'channel'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'keep' | 'remove' | 'review' | 'unclassified'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'category' | 'status'>('name');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isCleaning, setIsCleaning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'overview' | 'memberships' | 'review' | 'protected'>('overview');
  const [page, setPage] = useState(1);
  const [hasLoadedMemberships, setHasLoadedMemberships] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const pageSize = 50;

  const fetchJson = async (url: string, method: 'GET' | 'POST' = 'GET') => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(url, { method, signal: controller.signal });
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        return await response.json();
      } catch (error) {
        if (attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } finally {
        window.clearTimeout(timeout);
      }
    }
    throw new Error('Request failed');
  };

  const loadStatus = async () => {
    try {
      const data = await fetchJson(`${apiBase}/api/status`);
      setStatus(data);
    } catch (error) {
      setNotice('Telegram status is taking longer than expected. Live memberships are still available.');
    }
  };

  const loadMemberships = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const data = await fetchJson(`${apiBase}/api/memberships`);
      const saved = JSON.parse(localStorage.getItem(reviewStorageKey) || '{}') as Record<string, Partial<Membership>>;
      const loadedMemberships = (data as Membership[]).map((item) => ({ ...item, ...saved[item.id] }));
      setMemberships(loadedMemberships);
      localStorage.setItem(membershipsStorageKey, JSON.stringify(loadedMemberships));
      setStatus((current) => ({
        ...current,
        connected: true,
        membership_count: loadedMemberships.length,
      }));
      setNotice(null);
      setHasLoadedMemberships(true);
    } catch (error) {
      setNotice('Telegram is still connecting. Click Refresh in a moment.');
      setHasLoadedMemberships(true);
    } finally {
      setIsRefreshing(false);
    }
  };

  const refreshMemberships = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setNotice('Refreshing memberships from Telegram...');
    try {
      const data = await fetchJson(`${apiBase}/api/memberships/refresh`, 'POST');
      const saved = JSON.parse(localStorage.getItem(reviewStorageKey) || '{}') as Record<string, Partial<Membership>>;
      const refreshed = (data as Membership[]).map((item) => ({ ...item, ...saved[item.id] }));
      setMemberships(refreshed);
      localStorage.setItem(membershipsStorageKey, JSON.stringify(refreshed));
      setStatus((current) => ({ ...current, connected: true, membership_count: refreshed.length }));
      setNotice(`Loaded ${refreshed.length} memberships from Telegram.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Telegram refresh failed.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const reconnectTelegram = async () => {
    setIsReconnecting(true);
    setNotice('Reconnecting to Telegram...');
    try {
      const response = await fetch(`${apiBase}/api/status/reconnect`, { method: 'POST' });
      const data = await response.json() as { connected: boolean; account_name: string | null; membership_count: number; message?: string };
      setStatus(data);
      setNotice(data.message || (data.connected ? 'Telegram connected.' : 'Telegram is not connected.'));
      if (data.connected) await loadMemberships();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Reconnect failed.');
    } finally {
      setIsReconnecting(false);
    }
  };

  useEffect(() => {
    if (!hasLoadedMemberships) return;
    const reviewState = Object.fromEntries(memberships.map((item) => [item.id, { status: item.status, protected: item.protected }]));
    localStorage.setItem(reviewStorageKey, JSON.stringify(reviewState));
  }, [memberships, hasLoadedMemberships]);

  useEffect(() => {
    const cachedMemberships = localStorage.getItem(membershipsStorageKey);
    if (cachedMemberships) {
      try {
        setMemberships(JSON.parse(cachedMemberships) as Membership[]);
        setHasLoadedMemberships(true);
      } catch {
        localStorage.removeItem(membershipsStorageKey);
      }
    }
    void loadStatus();
    void loadMemberships();
  }, []);

  useEffect(() => {
    const recoveryTimer = window.setInterval(() => {
      if (!status.connected || memberships.length === 0) {
        void loadStatus();
        void loadMemberships();
      }
    }, 10000);
    return () => window.clearInterval(recoveryTimer);
  }, [status.connected, memberships.length]);

  const filteredMemberships = useMemo(() => {
    return memberships.filter((membership) => {
      const matchesSearch = membership.name.toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === 'all' || membership.type === typeFilter;
      const matchesStatus = statusFilter === 'all' || membership.status === statusFilter;
      const matchesView = activeView === 'protected'
        ? membership.protected
        : activeView === 'review'
          ? membership.status === 'review' || membership.status === 'remove'
          : true;
      return matchesSearch && matchesType && matchesStatus && (categoryFilter === 'all' || membership.category === categoryFilter) && matchesView;
    }).sort((left, right) => left[sortBy].localeCompare(right[sortBy]) || left.name.localeCompare(right.name));
  }, [memberships, search, typeFilter, statusFilter, categoryFilter, sortBy, activeView]);

  const pageCount = Math.max(1, Math.ceil(filteredMemberships.length / pageSize));
  const visibleMemberships = filteredMemberships.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, statusFilter, categoryFilter, sortBy, activeView]);

  const categories = [...new Set(memberships.map((item) => item.category))].sort();

  const totalKeep = memberships.filter((item) => item.status === 'keep').length;
  const totalRemove = memberships.filter((item) => item.status === 'remove').length;
  const totalReview = memberships.filter((item) => item.status === 'review').length;

  const setMembershipStatus = (id: string, nextStatus: Membership['status']) => {
    setMemberships((current) => current.map((item) => item.id === id ? { ...item, status: nextStatus } : item));
    if (nextStatus === 'remove') {
      setSelectedIds((current) => current.includes(id) ? current : [...current, id]);
    } else if (nextStatus === 'keep') {
      setSelectedIds((current) => current.filter((selectedId) => selectedId !== id));
    }
    setNotice(null);
  };

  const toggleSelected = (id: string) => {
    const isSelected = selectedIds.includes(id);
    setSelectedIds((current) => isSelected ? current.filter((item) => item !== id) : [...current, id]);
    setMemberships((items) => items.map((item) => item.id === id ? { ...item, status: isSelected ? 'unclassified' : 'remove' } : item));
  };

  const toggleVisibleSelection = () => {
    const allVisibleSelected = filteredMemberships.every((item) => selectedIds.includes(item.id));
    const visibleIds = new Set(filteredMemberships.map((item) => item.id));
    setMemberships((items) => items.map((item) => visibleIds.has(item.id) ? { ...item, status: allVisibleSelected ? 'unclassified' : 'remove' } : item));
    setSelectedIds((current) => allVisibleSelected ? current.filter((id) => !visibleIds.has(id)) : [...new Set([...current, ...visibleIds])]);
  };

  const toggleProtected = (id: string) => {
    setMemberships((current) => current.map((item) => item.id === id ? { ...item, protected: !item.protected } : item));
    setNotice(null);
  };

  const applyBulkStatus = (nextStatus: Membership['status']) => {
    if (selectedIds.length === 0) {
      setNotice('Select memberships first.');
      return;
    }
    const selected = new Set(selectedIds);
    setMemberships((current) => current.map((item) => selected.has(item.id) ? { ...item, status: nextStatus } : item));
    if (nextStatus === 'keep') {
      setSelectedIds([]);
    }
    setNotice(`${selectedIds.length} membership${selectedIds.length === 1 ? '' : 's'} marked ${nextStatus}.`);
  };

  const leaveSelected = async () => {
    const selected = memberships.filter((item) => selectedIds.includes(item.id));
    const removable = selected.filter((item) => !item.protected);
    if (!removable.length) {
      setNotice('Select at least one unprotected membership for cleanup.');
      return;
    }
    if (!window.confirm(`Leave ${removable.length} Telegram membership${removable.length === 1 ? '' : 's'}? Protected selections will be skipped. This cannot be undone.`)) return;

    setIsCleaning(true);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmation: 'LEAVE_CONFIRMED',
          membership_ids: selected.map((item) => item.id),
          protected_ids: selected.filter((item) => item.protected).map((item) => item.id),
        }),
      });
      if (!response.ok) throw new Error(`Cleanup failed: ${response.status}`);
      const result = await response.json() as { results: { id: string; status: string }[] };
      const completedIds = result.results.filter((item) => item.status === 'success').map((item) => item.id);
      setMemberships((current) => current.filter((item) => !completedIds.includes(item.id)));
      setSelectedIds((current) => current.filter((id) => !completedIds.includes(id)));
      const failedCount = result.results.filter((item) => item.status === 'failed').length;
      setNotice(completedIds.length ? `Left ${completedIds.length} membership${completedIds.length === 1 ? '' : 's'}${failedCount ? `; ${failedCount} failed.` : '.'}` : 'No memberships were left.');
      void loadStatus();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Cleanup failed.');
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex min-h-screen">
        <aside className="w-72 border-r border-slate-800 bg-slate-900/80 p-5 flex flex-col justify-between">
          <div>
            <div className="mb-8 text-lg font-semibold tracking-tight">Telegram Cleanup</div>
            <nav className="space-y-2 text-sm text-slate-300">
              {(['overview', 'memberships', 'review', 'protected'] as const).map((view) => (
                <button
                  key={view}
                  onClick={() => setActiveView(view)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left capitalize ${activeView === view ? 'bg-slate-800 text-slate-100' : 'hover:bg-slate-800'}`}
                >
                  {view}
                </button>
              ))}
            </nav>
          </div>

          <div className="space-y-3 border-t border-slate-800 pt-4 text-sm text-slate-300">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2"><Activity size={14} /> Telegram connection</span>
              <span className={status.connected ? 'text-emerald-400' : 'text-amber-400'}>{status.connected ? 'Connected' : 'Disconnected'}</span>
            </div>
            <div className="text-slate-400">{status.account_name ?? 'Unknown account'}</div>
            <div className="text-slate-400">{status.membership_count} memberships</div>
            <button onClick={() => void reconnectTelegram()} disabled={isReconnecting} className="w-full rounded-md border border-slate-700 px-3 py-2 text-left text-xs hover:bg-slate-800 disabled:opacity-50">
              {isReconnecting ? 'Reconnecting...' : 'Reconnect Telegram'}
            </button>
          </div>
        </aside>

        <main className="flex-1 p-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <div className="text-sm uppercase tracking-[0.2em] text-slate-400">{activeView}</div>
              <h1 className="mt-2 text-3xl font-semibold">Telegram Cleanup</h1>
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-100 hover:bg-slate-700"
              disabled={isRefreshing}
              onClick={() => { void loadStatus(); void refreshMemberships(); }}
            >
              <RefreshCcw size={14} /> {isRefreshing ? 'Refreshing...' : 'Refresh from Telegram'}
            </button>
          </div>

          <div className="mb-6 grid grid-cols-4 gap-4">
            {[
              { label: 'Connection status', value: status.connected ? 'Connected' : 'Disconnected', icon: Activity, tone: 'emerald' },
              { label: 'Account name', value: status.account_name ?? 'Unknown', icon: Users, tone: 'blue' },
              { label: 'Total memberships', value: String(memberships.length || status.membership_count), icon: Gauge, tone: 'violet' },
              { label: 'Groups / Channels', value: `${memberships.filter(m => m.type === 'group').length} / ${memberships.filter(m => m.type === 'channel').length}`, icon: Bell, tone: 'amber' },
            ].map((card) => (
              <div key={card.label} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm text-slate-400"><card.icon size={14} /> {card.label}</div>
                <div className="text-xl font-semibold">{card.value}</div>
              </div>
            ))}
          </div>

          <div className="mb-6 grid grid-cols-4 gap-4">
            {[
              { label: 'Keep', value: totalKeep },
              { label: 'Remove', value: totalRemove },
              { label: 'Review', value: totalReview },
              { label: 'Protected', value: memberships.filter((m) => m.protected).length },
            ].map((card) => (
              <div key={card.label} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <div className="text-sm text-slate-400">{card.label}</div>
                <div className="mt-2 text-2xl font-semibold">{card.value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Memberships</h2>
              <button
                className="inline-flex items-center gap-2 rounded-md bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isCleaning || selectedIds.length === 0}
                onClick={() => void leaveSelected()}
              >
                <Trash2 size={14} /> {isCleaning ? 'Leaving...' : `Leave selected (${selectedIds.length})`}
              </button>
            </div>

            {(notice || status.message) && <div className="mb-4 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300">{notice || status.message}</div>}

            <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-slate-800 pb-4">
              <span className="mr-2 text-xs uppercase tracking-wide text-slate-500">{selectedIds.length} selected</span>
              <button onClick={() => applyBulkStatus('keep')} disabled={selectedIds.length === 0} className="rounded border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-800 disabled:opacity-40">Keep selected</button>
              <button onClick={() => applyBulkStatus('remove')} disabled={selectedIds.length === 0} className="rounded border border-rose-700 px-3 py-1.5 text-xs hover:bg-rose-950 disabled:opacity-40">Remove selected</button>
              <button onClick={() => { setSelectedIds([]); setNotice('Selection cleared.'); }} disabled={selectedIds.length === 0} className="rounded border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-800 disabled:opacity-40">Clear selection</button>
            </div>

            <div className="mb-4 flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search memberships..."
                  className="w-full rounded-md border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none"
                />
              </div>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'all' | 'group' | 'channel')} className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
                <option value="all">All</option>
                <option value="group">Groups</option>
                <option value="channel">Channels</option>
              </select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as any)} className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
                <option value="all">All</option>
                <option value="keep">Keep</option>
                <option value="remove">Remove</option>
                <option value="review">Review</option>
                <option value="unclassified">Unclassified</option>
              </select>
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
                <option value="all">All categories</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as 'name' | 'category' | 'status')} className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
                <option value="name">Sort: name</option>
                <option value="category">Sort: category</option>
                <option value="status">Sort: status</option>
              </select>
            </div>

            <div className="overflow-hidden rounded-md border border-slate-800">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    <th className="p-3"><input type="checkbox" checked={filteredMemberships.length > 0 && filteredMemberships.every((item) => selectedIds.includes(item.id))} onChange={toggleVisibleSelection} /></th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950">
                  {visibleMemberships.map((membership) => (
                    <tr key={membership.id} className="hover:bg-slate-900">
                      <td className="p-3"><input type="checkbox" checked={selectedIds.includes(membership.id)} onChange={() => toggleSelected(membership.id)} /></td>
                      <td className="p-3 uppercase text-slate-400">{membership.type}</td>
                      <td className="p-3">{membership.name}</td>
                      <td className="p-3">{membership.category}</td>
                      <td className="p-3">
                        <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-1 text-xs uppercase tracking-wide text-slate-200">
                          {membership.status}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <button onClick={() => setMembershipStatus(membership.id, 'keep')} className="rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800">Keep</button>
                          <button onClick={() => setMembershipStatus(membership.id, 'remove')} className="rounded border border-rose-700 px-2 py-1 text-xs hover:bg-rose-950">Remove</button>
                          <button onClick={() => toggleProtected(membership.id)} className="rounded border border-amber-700 px-2 py-1 text-xs hover:bg-amber-950">{membership.protected ? 'Unprotect' : 'Protect'}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {visibleMemberships.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-500">No memberships match this view.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
              <span>{filteredMemberships.length} memberships in view</span>
              <div className="flex items-center gap-2">
                <button disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded border border-slate-700 px-3 py-1 disabled:opacity-40">Previous</button>
                <span>Page {page} of {pageCount}</span>
                <button disabled={page === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} className="rounded border border-slate-700 px-3 py-1 disabled:opacity-40">Next</button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
