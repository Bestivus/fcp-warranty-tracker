import React, { useState, useEffect, useMemo } from 'react';
import {
  Package, RefreshCcw, DollarSign, Truck, Plus, Search,
  Car, ArrowRight, Trash2, Upload, Pencil, XCircle, Tag, CheckCircle2, X, Clock
} from 'lucide-react';

// --- Status model ---
// We deliberately reuse the original status strings ('Active', 'RMA Ready',
// 'RMA Sent', 'Refunded', 'Discarded') so existing rows in an already-running
// instance keep working with zero migration. 'RMA Ready' now means two
// different things depending on whether an RMA number has been assigned yet:
// no rmaNumber => still sitting in the garage, unfiled; has rmaNumber => filed
// and waiting to ship. That split is what lets "In Garage" and "Filed" be two
// distinct tabs without a new status value.
const STATUS_META = {
  onCar: { label: 'On Car', badge: 'bg-green-100 text-green-800 border-green-200' },
  inGarage: { label: 'In Garage', badge: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  filed: { label: 'Filed', badge: 'bg-amber-100 text-amber-800 border-amber-200' },
  shipped: { label: 'Shipped', badge: 'bg-blue-100 text-blue-800 border-blue-200' },
  refunded: { label: 'Refunded', badge: 'bg-gray-100 text-gray-600 border-gray-200' },
  discarded: { label: 'Discarded', badge: 'bg-red-50 text-red-700 border-red-200' },
};

const statusKey = (order) => {
  if (order.status === 'Active') return 'onCar';
  if (order.status === 'RMA Ready') return order.rmaNumber ? 'filed' : 'inGarage';
  if (order.status === 'RMA Sent') return 'shipped';
  if (order.status === 'Refunded') return 'refunded';
  if (order.status === 'Discarded') return 'discarded';
  return 'onCar';
};

const StatusBadge = ({ order }) => {
  const meta = STATUS_META[statusKey(order)];
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${meta.badge}`}>
      {meta.label}
    </span>
  );
};

const TABS = [
  { id: 'onCar', label: 'On Car' },
  { id: 'inGarage', label: 'In Garage' },
  { id: 'filedShipped', label: 'Filed & Shipped' },
  { id: 'refunded', label: 'Refunded' },
  { id: 'all', label: 'All Parts' },
];

const matchesTab = (order, tabId) => {
  const key = statusKey(order);
  if (tabId === 'all') return true;
  if (tabId === 'onCar') return key === 'onCar';
  if (tabId === 'inGarage') return key === 'inGarage';
  if (tabId === 'filedShipped') return key === 'filed' || key === 'shipped';
  if (tabId === 'refunded') return key === 'refunded';
  return true;
};

const todayStr = () => new Date().toISOString().split('T')[0];

const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(String(d).replace(/\//g, '-') + 'T00:00:00');
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// --- API Helper ---
const isPreviewEnv = typeof window !== 'undefined' &&
  (window.location.protocol.includes('blob') || window.location.hostname.includes('usercontent'));

const apiCall = async (method, path, body = null) => {
  if (isPreviewEnv) {
    await new Promise(r => setTimeout(r, 150));
    let data = JSON.parse(localStorage.getItem('fcp_mock_db') || '[]');
    const id = path.split('/').pop();

    if (method === 'GET') return data;
    if (method === 'POST') {
      const newRecord = { ...body, id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) };
      data.push(newRecord);
      localStorage.setItem('fcp_mock_db', JSON.stringify(data));
      return newRecord;
    }
    if (method === 'PUT') {
      data = data.map(item => item.id === id ? { ...item, ...body } : item);
      localStorage.setItem('fcp_mock_db', JSON.stringify(data));
      return { success: true };
    }
    if (method === 'DELETE') {
      data = data.filter(item => item.id !== id);
      localStorage.setItem('fcp_mock_db', JSON.stringify(data));
      return { success: true };
    }
  }

  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(path, options);
  if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
};

const API_URL = '/api/orders';

const bulkUpdate = async (ids, updates) => {
  await Promise.all(ids.map((id) => apiCall('PUT', `${API_URL}/${id}`, updates)));
};

export default function App() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('onCar');
  const [searchTerm, setSearchTerm] = useState('');

  // Inline confirm popovers (Remove from Car / Write Off)
  const [actionTarget, setActionTarget] = useState(null); // { id, type: 'remove' | 'writeoff' }
  const [removeDateDraft, setRemoveDateDraft] = useState(todayStr());

  // File RMA + Part History right-side drawer
  const [rightPanel, setRightPanel] = useState(null); // null | 'file' | 'history'
  const [garageSelected, setGarageSelected] = useState({});
  const [rmaInput, setRmaInput] = useState('');
  const [rmaError, setRmaError] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [lastFiled, setLastFiled] = useState(null); // { ids }
  const [historySku, setHistorySku] = useState(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Import State
  const [importText, setImportText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');

  // Form States
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState({
    date: todayStr(),
    orderNumber: '',
    sku: '',
    description: '',
    vehicle: '',
    price: '',
    quantity: 1,
    status: 'Active',
    rmaNumber: '',
    removedDate: '',
    filedDate: '',
  });

  const fetchOrders = async () => {
    try {
      const data = await apiCall('GET', API_URL);
      setOrders(data);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // --- Derived Stats ---
  const stats = useMemo(() => {
    const garageParts = orders.filter(o => statusKey(o) === 'inGarage');
    const pendingValue = orders
      .filter(o => statusKey(o) === 'filed' || statusKey(o) === 'shipped')
      .reduce((acc, o) => acc + (parseFloat(o.price) * (o.quantity || 1) || 0), 0);
    const totalRefunded = orders
      .filter(o => statusKey(o) === 'refunded')
      .reduce((acc, o) => acc + (parseFloat(o.price) * (o.quantity || 1) || 0), 0);

    return {
      pendingValue,
      totalRefunded,
      needsFilingCount: garageParts.length,
    };
  }, [orders]);

  // --- Inline actions ---
  const openRemove = (id) => {
    setActionTarget({ id, type: 'remove' });
    setRemoveDateDraft(todayStr());
  };
  const openWriteOff = (id) => setActionTarget({ id, type: 'writeoff' });
  const closeAction = () => setActionTarget(null);

  const confirmRemove = async (id) => {
    await apiCall('PUT', `${API_URL}/${id}`, { status: 'RMA Ready', removedDate: removeDateDraft || todayStr() });
    setActionTarget(null);
    fetchOrders();
  };

  const confirmWriteOff = async (id) => {
    await apiCall('PUT', `${API_URL}/${id}`, { status: 'Discarded' });
    setActionTarget(null);
    setGarageSelected(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    fetchOrders();
  };

  // --- Garage / File RMA drawer ---
  const toggleGarageSelect = (id) => {
    setGarageSelected(prev => {
      const next = { ...prev };
      if (next[id]) delete next[id]; else next[id] = true;
      return next;
    });
  };

  const openFilePanel = () => {
    setRightPanel('file');
    setRmaInput('');
    setRmaError(false);
  };

  const openHistory = (sku) => {
    setRightPanel('history');
    setHistorySku(sku);
  };

  const closeRightPanel = () => {
    if (rightPanel === 'file') setGarageSelected({});
    setRightPanel(null);
    setRmaError(false);
    setRmaInput('');
  };

  const submitFile = async () => {
    const ids = Object.keys(garageSelected);
    if (ids.length === 0) return;
    const rma = rmaInput.trim();
    if (!rma) {
      setRmaError(true);
      return;
    }
    await bulkUpdate(ids, { rmaNumber: rma, filedDate: todayStr() });
    setSuccessMessage(`Filed ${ids.length} ${ids.length === 1 ? 'part' : 'parts'} under ${rma}`);
    setLastFiled({ ids });
    setGarageSelected({});
    setRightPanel(null);
    setRmaInput('');
    fetchOrders();
  };

  const undoFile = async () => {
    if (!lastFiled) return;
    await bulkUpdate(lastFiled.ids, { rmaNumber: null, filedDate: null });
    setSuccessMessage('');
    setLastFiled(null);
    fetchOrders();
  };

  // --- Group-level RMA actions (Filed & Shipped tab) ---
  const markShippedByRma = async (rma) => {
    const ids = orders.filter(o => o.rmaNumber === rma && statusKey(o) === 'filed').map(o => o.id);
    if (ids.length === 0) return;
    await bulkUpdate(ids, { status: 'RMA Sent' });
    fetchOrders();
  };

  const markRefundedByRma = async (rma) => {
    const ids = orders.filter(o => o.rmaNumber === rma && statusKey(o) === 'shipped').map(o => o.id);
    if (ids.length === 0) return;
    await bulkUpdate(ids, { status: 'Refunded' });
    fetchOrders();
  };

  // --- Add / Edit / Delete ---
  const resetForm = () => {
    setFormData({
      date: todayStr(),
      orderNumber: '',
      sku: '',
      description: '',
      vehicle: '',
      price: '',
      quantity: 1,
      status: 'Active',
      rmaNumber: '',
      removedDate: '',
      filedDate: '',
    });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiCall('POST', API_URL, {
        ...formData,
        price: parseFloat(formData.price) || 0,
        quantity: parseInt(formData.quantity, 10) || 1,
      });
      setShowAddModal(false);
      resetForm();
      fetchOrders();
    } catch (err) {
      console.error('Error adding part', err);
    }
  };

  const openEditModal = (order) => {
    setEditId(order.id);
    let safeDate = order.date || todayStr();
    safeDate = safeDate.replace(/\//g, '-');

    setFormData({
      date: safeDate,
      orderNumber: order.orderNumber,
      sku: order.sku,
      description: order.description,
      vehicle: order.vehicle,
      price: order.price,
      quantity: order.quantity || 1,
      status: order.status,
      rmaNumber: order.rmaNumber || '',
      removedDate: order.removedDate || '',
      filedDate: order.filedDate || '',
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editId) return;
    try {
      await apiCall('PUT', `${API_URL}/${editId}`, {
        ...formData,
        price: parseFloat(formData.price) || 0,
        quantity: parseInt(formData.quantity, 10) || 1,
        rmaNumber: formData.rmaNumber || null,
        removedDate: formData.removedDate || null,
        filedDate: formData.filedDate || null,
      });
      setShowEditModal(false);
      setEditId(null);
      resetForm();
      fetchOrders();
    } catch (err) {
      console.error('Error editing part', err);
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Are you sure? This cannot be undone.')) {
      await apiCall('DELETE', `${API_URL}/${id}`);
      fetchOrders();
    }
  };

  // --- Import (unchanged from prior behavior; still populates the same
  // status/rmaNumber fields, which the new tabs already know how to read) ---
  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!importText) return;
    setIsImporting(true);
    setImportStatus('Parsing rows...');

    const rows = importText.trim().split(/\r?\n/);
    const importedDocs = [];

    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.trim()) continue;

        let cols = row.split('\t');
        if (cols.length === 1 && row.includes(',')) cols = row.split(',');
        if (cols.length < 5) continue;

        let date = cols[0]?.trim() || todayStr();
        date = date.replace(/\//g, '-');

        const sku = cols[1]?.trim() || '';
        const description = cols[2]?.trim() || 'Imported Part';
        const vehicle = cols[3]?.trim() || '';
        const orderNumber = cols[4]?.trim() || 'Unknown';
        const hasBeenRma = cols[5]?.trim().toUpperCase() === 'YES';
        const replacedByStr = cols[6]?.trim() || '';
        const replacesStr = cols[7]?.trim() || '';
        const rmaForPrevStr = cols[9]?.trim() || '';

        const priceVal = cols[10] ? cols[10].replace(/[^0-9.]/g, '') : '0';
        const price = parseFloat(priceVal) || 0;

        let status = 'Active';
        if (hasBeenRma) status = 'Refunded';
        else if (replacedByStr && !hasBeenRma) status = 'RMA Ready';

        setImportStatus(`Importing ${i + 1}/${rows.length}: ${description}...`);

        const newDoc = await apiCall('POST', API_URL, {
          date, sku, description, vehicle, orderNumber, price, quantity: 1, status,
          rmaNumber: status === 'RMA Ready' && rmaForPrevStr ? rmaForPrevStr : null,
        });

        importedDocs.push({ part: newDoc, replacedByStr, replacesStr });
      }

      const allParts = [...orders, ...importedDocs.map(d => d.part)];

      const findTargetPart = (targetOrderNum, currentPart) => {
        const candidates = allParts.filter(p => String(p.orderNumber).trim() === String(targetOrderNum).trim());
        if (candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];
        const exactMatch = candidates.find(p => p.sku && p.sku === currentPart.sku);
        if (exactMatch) return exactMatch;
        const descMatch = candidates.find(p => p.description && p.description === currentPart.description);
        if (descMatch) return descMatch;
        return candidates[0];
      };

      setImportStatus('Linking relationships...');

      for (const item of importedDocs) {
        const currentPart = item.part;
        if (item.replacedByStr) {
          const target = findTargetPart(item.replacedByStr, currentPart);
          if (target) await apiCall('PUT', `${API_URL}/${target.id}`, { replacesOrderId: currentPart.id });
        }
        if (item.replacesStr) {
          const target = findTargetPart(item.replacesStr, currentPart);
          if (target) await apiCall('PUT', `${API_URL}/${target.id}`, { replacedByOrderId: currentPart.id });
        }
      }

      setImportStatus('Done!');
      fetchOrders();
      setTimeout(() => {
        setShowImportModal(false);
        setImportText('');
        setImportStatus('');
      }, 1000);
    } catch (err) {
      console.error('Import failed', err);
      setImportStatus('Error! Check console.');
    } finally {
      setIsImporting(false);
    }
  };

  // --- Grouping: by order number normally, by RMA number on Filed & Shipped ---
  const groupByRma = activeTab === 'filedShipped';

  const filteredAndGroupedOrders = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    const matchesSearch = (order) => {
      if (!search) return true;
      return (
        order.description?.toLowerCase().includes(search) ||
        order.sku?.toLowerCase().includes(search) ||
        order.orderNumber?.toString().toLowerCase().includes(search) ||
        order.vehicle?.toLowerCase().includes(search)
      );
    };

    const filtered = orders.filter(o => matchesTab(o, activeTab) && matchesSearch(o));

    const groups = {};
    filtered.forEach((item) => {
      const key = groupByRma ? (item.rmaNumber || 'Unassigned') : (item.orderNumber || 'Unknown Order');
      const groupDate = groupByRma ? (item.filedDate || item.date) : item.date;
      if (!groups[key]) {
        groups[key] = { key, date: groupDate, vehicles: new Set(), items: [] };
      }
      if (item.vehicle) groups[key].vehicles.add(item.vehicle);
      groups[key].items.push(item);
    });

    return Object.values(groups)
      .map((g) => {
        const allFiled = groupByRma && g.items.every(it => statusKey(it) === 'filed');
        const allShipped = groupByRma && g.items.every(it => statusKey(it) === 'shipped');
        return {
          ...g,
          vehicleStr: Array.from(g.vehicles).join(', ') || 'Unknown Vehicle',
          showGroupShip: allFiled,
          showGroupRefund: allShipped,
        };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [orders, searchTerm, activeTab, groupByRma]);

  // --- Part History (grouped by SKU across all statuses) ---
  const historyDetail = useMemo(() => {
    if (!historySku) return null;
    const cycles = orders
      .filter(o => o.sku === historySku)
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (cycles.length === 0) return null;
    const refundedTotal = cycles
      .filter(c => statusKey(c) === 'refunded')
      .reduce((s, c) => s + (parseFloat(c.price) * (c.quantity || 1) || 0), 0);
    return {
      description: cycles[0].description,
      vehicle: cycles[0].vehicle,
      sku: historySku,
      cycles,
      refundedTotal,
    };
  }, [orders, historySku]);

  const garageParts = orders.filter(o => statusKey(o) === 'inGarage');
  const garageSelectedIds = Object.keys(garageSelected);
  const garageSelectedTotal = garageParts
    .filter(p => garageSelected[p.id])
    .reduce((s, p) => s + (parseFloat(p.price) * (p.quantity || 1) || 0), 0);

  if (loading) return <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-400">Loading your garage...</div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20 md:pb-0 relative overflow-x-hidden">

      {/* Top Navigation */}
      <div className="bg-slate-900 text-white p-4 sticky top-0 z-10 shadow-lg">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <RefreshCcw className="text-blue-400" />
            <h1 className="text-xl font-bold tracking-tight">FCP Warranty Tracker</h1>
          </div>

          <div className="flex gap-4 text-sm overflow-x-auto pb-2 md:pb-0">
            <div className="bg-slate-800 px-4 py-2 rounded-lg border border-slate-700 flex flex-col items-center min-w-[100px]">
              <span className="text-slate-400 text-xs uppercase font-bold">Pending Credit</span>
              <span className="text-lg font-mono text-amber-400">${stats.pendingValue.toFixed(2)}</span>
            </div>
            <div className="bg-slate-800 px-4 py-2 rounded-lg border border-slate-700 flex flex-col items-center min-w-[100px]">
              <span className="text-slate-400 text-xs uppercase font-bold">Lifetime Refunded</span>
              <span className="text-lg font-mono text-green-400">${stats.totalRefunded.toFixed(2)}</span>
            </div>
            <div className="bg-slate-800 px-4 py-2 rounded-lg border border-slate-700 flex flex-col items-center min-w-[100px]">
              <span className="text-slate-400 text-xs uppercase font-bold">Needs Filing</span>
              <span className="text-lg font-mono text-amber-400">{stats.needsFilingCount}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">

        {/* Controls */}
        <div className="flex flex-col md:flex-row justify-between gap-4 items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="flex bg-slate-100 p-1 rounded-lg w-full md:w-auto overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {tab.label}
                {tab.id === 'inGarage' && stats.needsFilingCount > 0 && (
                  <span className="ml-2 bg-amber-500 text-white text-[10px] px-1.5 rounded-full">{stats.needsFilingCount}</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex w-full md:w-auto gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search part, SKU, car..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {activeTab === 'inGarage' && (
              <button
                onClick={openFilePanel}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-bold transition-colors shadow-sm ${rightPanel === 'file' ? 'bg-slate-900 text-amber-400' : 'bg-amber-400 text-slate-900 hover:bg-amber-500'}`}
              >
                <Tag className="w-4 h-4" /> File RMA
              </button>
            )}
            <button
              onClick={() => setShowImportModal(true)}
              className="bg-white border border-slate-300 text-slate-700 px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm"
              title="Import from Sheets"
            >
              <Upload className="w-4 h-4" />
            </button>
            <button
              onClick={() => { resetForm(); setShowAddModal(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add Part</span>
            </button>
          </div>
        </div>

        {successMessage && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-2.5 flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{successMessage}</span>
            <button onClick={undoFile} className="font-semibold underline hover:text-green-900">Undo</button>
            <button onClick={() => setSuccessMessage('')} className="text-green-700 hover:text-green-900"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* Main List - Grouped by Order (or by RMA on Filed & Shipped) */}
        <div className="space-y-6">
          {filteredAndGroupedOrders.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
              <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-slate-600">No parts found</h3>
              <p className="text-slate-400 text-sm">Import your Google Sheet or add a purchase.</p>
            </div>
          ) : (
            filteredAndGroupedOrders.map(group => {
              const groupTotal = group.items.reduce((sum, item) => sum + (parseFloat(item.price) * (item.quantity || 1)), 0);
              return (
                <div key={group.key} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

                  {/* Group Header */}
                  <div className="bg-slate-100/50 border-b border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div>
                        <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">{groupByRma ? 'RMA' : 'Order'}</span>
                        <h2 className="text-lg font-bold text-slate-800 font-mono">{groupByRma ? group.key : `#${group.key}`}</h2>
                      </div>
                      <div className="h-8 w-px bg-slate-300 hidden sm:block"></div>
                      <div className="text-sm text-slate-500 flex flex-col">
                        <span>{fmtDate(group.date)}</span>
                        <div className="flex items-center gap-1">
                          <Car className="w-3 h-3 text-slate-400" />
                          <span className="truncate max-w-[200px]" title={group.vehicleStr}>{group.vehicleStr}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">{groupByRma ? 'RMA Total' : 'Order Total'}</span>
                      <div className="text-lg font-bold text-slate-800">${groupTotal.toFixed(2)}</div>
                      {group.showGroupShip && (
                        <button onClick={() => markShippedByRma(group.key)} className="mt-2 flex items-center gap-1.5 ml-auto px-3 py-1.5 bg-amber-100 text-amber-800 hover:bg-amber-200 rounded-lg text-xs font-medium transition-colors shadow-sm">
                          <Truck className="w-3.5 h-3.5" /> Mark Shipped
                        </button>
                      )}
                      {group.showGroupRefund && (
                        <button onClick={() => markRefundedByRma(group.key)} className="mt-2 flex items-center gap-1.5 ml-auto px-3 py-1.5 bg-green-100 text-green-800 hover:bg-green-200 rounded-lg text-xs font-medium transition-colors shadow-sm">
                          <DollarSign className="w-3.5 h-3.5" /> Mark Refunded
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Items in this Group */}
                  <div className="divide-y divide-slate-100">
                    {group.items.map(part => {
                      const key = statusKey(part);
                      return (
                        <div key={part.id} className="p-4 hover:bg-slate-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">

                          {/* Part Details (click to open History) */}
                          <div className="flex-1 cursor-pointer" onClick={() => openHistory(part.sku)}>
                            <div className="flex items-start gap-3">
                              <div className="bg-slate-200 text-slate-600 font-bold text-xs px-2 py-1 rounded-md mt-0.5">
                                {part.quantity || 1}x
                              </div>
                              <div>
                                <h3 className="font-semibold text-slate-800 text-base">{part.description}</h3>
                                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm text-slate-500">
                                  <span className="flex items-center gap-1 font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md text-xs border border-slate-200 shadow-sm">
                                    <Car className="w-3 h-3 text-slate-400" /> {part.vehicle || 'Unknown'}
                                  </span>
                                  <span className="font-mono bg-white border border-slate-200 px-1.5 rounded text-xs">SKU: {part.sku}</span>
                                  <span className="flex items-center"><DollarSign className="w-3 h-3 text-slate-400" />{parseFloat(part.price).toFixed(2)} ea</span>
                                  <StatusBadge order={part} />
                                  {key === 'inGarage' && (
                                    <span className="text-xs bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md">
                                      {part.removedDate ? `In garage since ${fmtDate(part.removedDate)}` : 'In garage'}
                                    </span>
                                  )}
                                  {groupByRma && (
                                    <span className="font-mono bg-slate-100 border border-slate-200 px-1.5 rounded text-xs text-slate-500">Order #{part.orderNumber}</span>
                                  )}
                                  {!groupByRma && part.rmaNumber && (
                                    <span className="bg-slate-800 text-white px-2 py-1 rounded border border-slate-900 font-mono text-xs">RMA: {part.rmaNumber}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2 mt-2 md:mt-0 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 w-full md:w-auto flex-wrap" onClick={(e) => e.stopPropagation()}>
                            {key === 'onCar' && (
                              <button onClick={() => openRemove(part.id)} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-1.5 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 rounded-lg text-sm font-medium transition-colors shadow-sm">
                                <ArrowRight className="w-4 h-4" /> Remove from Car
                              </button>
                            )}
                            {(key === 'onCar' || key === 'inGarage') && (
                              <button onClick={() => openWriteOff(part.id)} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-sm font-medium transition-colors shadow-sm" title="Mark as Lost/Discarded">
                                <XCircle className="w-4 h-4" /> Write Off
                              </button>
                            )}
                            <div className="flex items-center border-l border-slate-200 pl-2 gap-1 ml-auto md:ml-0">
                              <button onClick={() => openEditModal(part)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="Edit Part">
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete(part.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Delete Part">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {actionTarget?.id === part.id && actionTarget.type === 'remove' && (
                            <div className="w-full mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-3 flex-wrap" onClick={(e) => e.stopPropagation()}>
                              <span className="text-sm text-slate-600 font-medium">Removed from car on</span>
                              <input type="date" value={removeDateDraft} onChange={(e) => setRemoveDateDraft(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
                              <button onClick={() => confirmRemove(part.id)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">Confirm</button>
                              <button onClick={closeAction} className="px-3 py-1.5 text-slate-600 hover:text-slate-800 font-medium text-sm">Cancel</button>
                            </div>
                          )}
                          {actionTarget?.id === part.id && actionTarget.type === 'writeoff' && (
                            <div className="w-full mt-3 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-3 flex-wrap" onClick={(e) => e.stopPropagation()}>
                              <span className="text-sm text-red-700 font-medium">Mark this part lost/discarded? It stays in history but drops out of active tracking.</span>
                              <button onClick={() => confirmWriteOff(part.id)} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium">Confirm Write Off</button>
                              <button onClick={closeAction} className="px-3 py-1.5 text-slate-600 hover:text-slate-800 font-medium text-sm">Cancel</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* --- Right-side drawer: File RMA / Part History (mutually exclusive) --- */}
      <div
        className={`fixed inset-0 bg-slate-900/45 z-40 transition-opacity ${rightPanel ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={closeRightPanel}
      />
      <div className={`fixed top-0 right-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col transition-transform duration-200 ${rightPanel ? 'translate-x-0' : 'translate-x-full'}`}>
        {rightPanel === 'file' && (
          <>
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
              <div className="flex items-center gap-2 font-semibold text-slate-800"><Tag className="w-5 h-5 text-amber-600" /> File RMA</div>
              <button onClick={closeRightPanel} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              <p className="text-sm text-slate-500">Check off the parts going back together. One RMA number covers this whole batch.</p>
              {garageParts.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">Nothing in the garage right now.</div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  {garageParts.map(p => (
                    <label key={p.id} className="flex items-start gap-3 p-3 border-t border-slate-100 first:border-t-0 cursor-pointer hover:bg-slate-50">
                      <input type="checkbox" checked={!!garageSelected[p.id]} onChange={() => toggleGarageSelect(p.id)} className="mt-1 w-4 h-4 accent-blue-600" />
                      <div className="flex-1">
                        <div className="font-semibold text-slate-800 text-sm">{p.description}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{p.vehicle} · SKU {p.sku} · {p.quantity || 1}x · removed {fmtDate(p.removedDate)}</div>
                      </div>
                      <div className="font-mono text-sm text-slate-600 flex-shrink-0">${(parseFloat(p.price) * (p.quantity || 1)).toFixed(2)}</div>
                    </label>
                  ))}
                </div>
              )}
              {garageSelectedIds.length > 0 && (
                <div className="text-sm text-slate-500 flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <span>{garageSelectedIds.length} {garageSelectedIds.length === 1 ? 'part' : 'parts'} selected</span>
                  <span className="font-mono font-semibold text-slate-700">${garageSelectedTotal.toFixed(2)}</span>
                </div>
              )}
              {garageParts.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">RMA Number</label>
                  <input
                    type="text"
                    value={rmaInput}
                    onChange={(e) => { setRmaInput(e.target.value); setRmaError(false); }}
                    placeholder="e.g. RMA-59214"
                    className={`w-full border rounded-lg px-3 py-2.5 text-sm ${rmaError ? 'border-red-300 bg-red-50' : 'border-slate-300'}`}
                  />
                  {rmaError && <div className="text-red-600 text-xs mt-1.5">Enter the RMA number FCP Euro gave you before filing.</div>}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end gap-2 flex-shrink-0">
              <button onClick={closeRightPanel} className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium text-sm">{garageSelectedIds.length > 0 ? 'Cancel' : 'Close'}</button>
              {garageSelectedIds.length > 0 && (
                <button onClick={submitFile} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm shadow-sm">
                  File {garageSelectedIds.length} {garageSelectedIds.length === 1 ? 'Part' : 'Parts'}
                </button>
              )}
            </div>
          </>
        )}

        {rightPanel === 'history' && historyDetail && (
          <>
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
              <div className="flex items-center gap-2 font-semibold text-slate-800"><Clock className="w-5 h-5 text-slate-500" /> Part History</div>
              <button onClick={closeRightPanel} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              <div>
                <div className="font-semibold text-slate-800 text-base">{historyDetail.description}</div>
                <div className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5 text-slate-400" /> {historyDetail.vehicle} &middot; <span className="font-mono">{historyDetail.sku}</span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2">
                  <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wide">Cycles</div>
                  <div className="text-sm font-bold text-slate-800 mt-0.5">{historyDetail.cycles.length}</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2">
                  <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wide">Currently</div>
                  <div className="mt-0.5"><StatusBadge order={historyDetail.cycles[0]} /></div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2">
                  <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wide">Refunded</div>
                  <div className="text-sm font-bold text-green-600 font-mono mt-0.5">${historyDetail.refundedTotal.toFixed(2)}</div>
                </div>
              </div>
              <div className="relative pl-6 pt-1">
                <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-200"></div>
                {historyDetail.cycles.map((cy, idx) => (
                  <div key={cy.id} className="relative mb-4 last:mb-0">
                    <div className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full bg-white border-[3px] ${idx === 0 ? 'border-blue-600' : 'border-slate-300'}`}></div>
                    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                      <div className="flex justify-between items-center gap-2 flex-wrap">
                        <div className="font-bold text-slate-800 text-sm">{fmtDate(cy.date)}</div>
                        <StatusBadge order={cy} />
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2 text-xs text-slate-500">
                        <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded font-mono">Order #{cy.orderNumber}</span>
                        <span>${(parseFloat(cy.price) * (cy.quantity || 1)).toFixed(2)}{cy.quantity > 1 ? ` (${cy.quantity}x)` : ''}</span>
                        {cy.rmaNumber && <span className="bg-slate-800 text-white px-2 py-0.5 rounded font-mono">RMA: {cy.rmaNumber}</span>}
                      </div>
                    </div>
                    {idx < historyDetail.cycles.length - 1 && (
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 mt-1 ml-0.5">
                        <ArrowRight className="w-3 h-3 rotate-90" /> replaced this part
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end gap-2 flex-shrink-0">
              <button onClick={closeRightPanel} className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium text-sm">Close</button>
            </div>
          </>
        )}
      </div>

      {/* --- MODALS --- */}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-slate-600" />
                <h3 className="font-semibold text-slate-800">Import from Spreadsheet</h3>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="p-6 overflow-y-auto">
              <div className="mb-4 bg-blue-50 border border-blue-100 p-3 rounded-lg text-sm text-blue-800">
                <strong>Instructions:</strong>
                <ol className="list-decimal ml-4 mt-1 space-y-1">
                  <li>In Google Sheets, select your columns in this exact order <strong>(Columns A to J)</strong>:</li>
                  <li className="font-mono text-xs bg-white inline-block px-1 rounded border border-blue-200 mt-1">
                    Date | Part# | Desc | Car | Order# | HasBeenRMA | ReplacedBy | Replaces | PrevRMAYet | RMA#
                  </li>
                  <li>Copy (Ctrl+C) the cells.</li>
                  <li>Paste them into the box below.</li>
                </ol>
                <p className="mt-2 text-xs opacity-80">Note: All imported items will default to Quantity 1. You can edit them later if needed.</p>
              </div>

              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={`2025-12-01\tBOS-26A\tWiper\tMalibu\tR638\tNO\tR999\t...\n...`}
                className="w-full h-48 p-3 font-mono text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />

              {importStatus && (
                <div className="mt-2 text-sm font-medium text-blue-600 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                  {importStatus}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button onClick={() => setShowImportModal(false)} className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium">Cancel</button>
              <button onClick={handleImportSubmit} disabled={isImporting || !importText} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors shadow-sm">
                {isImporting ? 'Processing...' : 'Run Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Order Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-semibold text-slate-800">Add Line Item</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
                  <input required type="date" name="date" value={formData.date} onChange={handleInputChange} className="w-full p-2 border border-slate-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Order #</label>
                  <input required type="text" name="orderNumber" value={formData.orderNumber} onChange={handleInputChange} className="w-full p-2 border border-slate-200 rounded-lg text-sm" placeholder="e.g. 123456" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Vehicle</label>
                <input required type="text" name="vehicle" value={formData.vehicle} onChange={handleInputChange} className="w-full p-2 border border-slate-200 rounded-lg text-sm" placeholder="e.g. E46 M3" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Part Name</label>
                <input required type="text" name="description" value={formData.description} onChange={handleInputChange} className="w-full p-2 border border-slate-200 rounded-lg text-sm" placeholder="e.g. Control Arm Kit" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-blue-600 mb-1">Quantity</label>
                  <input required type="number" min="1" name="quantity" value={formData.quantity} onChange={handleInputChange} className="w-full p-2 border border-blue-300 bg-blue-50 rounded-lg text-sm font-bold" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Price per item ($)</label>
                  <input required type="number" step="0.01" name="price" value={formData.price} onChange={handleInputChange} className="w-full p-2 border border-slate-200 rounded-lg text-sm" placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">SKU</label>
                <input type="text" name="sku" value={formData.sku} onChange={handleInputChange} className="w-full p-2 border border-slate-200 rounded-lg text-sm font-mono" placeholder="Optional SKU" />
              </div>
              <button type="submit" className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm mt-2">
                Save Item
              </button>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-semibold text-slate-800">Edit Part</h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="overflow-y-auto p-6">
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
                    <input required type="date" name="date" value={formData.date} onChange={handleInputChange} className="w-full p-2 border border-slate-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Order #</label>
                    <input required type="text" name="orderNumber" value={formData.orderNumber} onChange={handleInputChange} className="w-full p-2 border border-slate-200 rounded-lg text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Vehicle</label>
                  <input required type="text" name="vehicle" value={formData.vehicle} onChange={handleInputChange} className="w-full p-2 border border-slate-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Part Name</label>
                  <input required type="text" name="description" value={formData.description} onChange={handleInputChange} className="w-full p-2 border border-slate-200 rounded-lg text-sm" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-blue-600 mb-1">Quantity</label>
                    <input required type="number" min="1" name="quantity" value={formData.quantity} onChange={handleInputChange} className="w-full p-2 border border-blue-300 bg-blue-50 rounded-lg text-sm font-bold" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Price per item ($)</label>
                    <input required type="number" step="0.01" name="price" value={formData.price} onChange={handleInputChange} className="w-full p-2 border border-slate-200 rounded-lg text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">SKU</label>
                    <input type="text" name="sku" value={formData.sku} onChange={handleInputChange} className="w-full p-2 border border-slate-200 rounded-lg text-sm font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">RMA # (Optional)</label>
                    <input type="text" name="rmaNumber" value={formData.rmaNumber || ''} onChange={handleInputChange} className="w-full p-2 border border-slate-200 rounded-lg text-sm font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
                    <select name="status" value={formData.status} onChange={handleInputChange} className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white">
                      <option value="Active">On Car</option>
                      <option value="RMA Ready">In Garage / Filed</option>
                      <option value="RMA Sent">Shipped</option>
                      <option value="Refunded">Refunded</option>
                      <option value="Discarded">Discarded</option>
                    </select>
                    <p className="text-[11px] text-slate-400 mt-1">With an RMA# set, "In Garage / Filed" shows as Filed. Without one, it shows as In Garage.</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Removed From Car (Optional)</label>
                    <input type="date" name="removedDate" value={formData.removedDate || ''} onChange={handleInputChange} className="w-full p-2 border border-slate-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">RMA Filed (Optional)</label>
                    <input type="date" name="filedDate" value={formData.filedDate || ''} onChange={handleInputChange} className="w-full p-2 border border-slate-200 rounded-lg text-sm" />
                  </div>
                </div>

                <button type="submit" className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm mt-2">
                  Save Changes
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
