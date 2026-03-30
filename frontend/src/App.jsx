import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, RefreshCcw, DollarSign, Truck, Plus, Search, 
  Car, ArrowRight, History, Trash2, Upload, Link as LinkIcon, Pencil
} from 'lucide-react';

const StatusBadge = ({ status }) => {
  const styles = {
    'Active': 'bg-green-100 text-green-800 border-green-200',
    'RMA Ready': 'bg-amber-100 text-amber-800 border-amber-200 animate-pulse',
    'RMA Sent': 'bg-blue-100 text-blue-800 border-blue-200',
    'Refunded': 'bg-gray-100 text-gray-600 border-gray-200 decoration-slice',
    'Spare': 'bg-purple-100 text-purple-800 border-purple-200',
  };

  const labels = {
    'Active': 'On Car',
    'RMA Ready': 'Ready to Return',
    'RMA Sent': 'Return Shipped',
    'Refunded': 'Completed/Refunded',
    'Spare': 'Spare Part',
  };

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${styles[status] || styles['Active']}`}>
      {labels[status] || status}
    </span>
  );
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

export default function App() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showWarrantyModal, setShowWarrantyModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  
  // Import State
  const [importText, setImportText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');

  // Form States
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    orderNumber: '',
    sku: '',
    description: '',
    vehicle: '',
    price: '',
    quantity: 1,
    status: 'Active',
    rmaNumber: '',
    replacesOrderId: '',
    replacedByOrderId: ''
  });
  
  const [selectedPart, setSelectedPart] = useState(null);

  const API_URL = '/api/orders';

  const fetchOrders = async () => {
    try {
      const data = await apiCall('GET', API_URL);
      setOrders(data);
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // --- Derived Stats ---
  const stats = useMemo(() => {
    const pendingReturns = orders.filter(o => o.status === 'RMA Ready');
    const pendingValue = pendingReturns.reduce((acc, curr) => acc + (parseFloat(curr.price) * (curr.quantity || 1) || 0), 0);
    const activeParts = orders.filter(o => o.status === 'Active');
    const totalRefunded = orders.filter(o => o.status === 'Refunded').reduce((acc, curr) => acc + (parseFloat(curr.price) * (curr.quantity || 1) || 0), 0);
    
    return {
      pendingReturnsCount: pendingReturns.length,
      pendingValue,
      activeCount: activeParts.length,
      totalRefunded
    };
  }, [orders]);

  // --- UI Handlers ---

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
        replacesOrderId: null,
        replacedByOrderId: null,
      });
      setShowAddModal(false);
      resetForm();
      fetchOrders();
    } catch (err) {
      console.error("Error adding doc", err);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editId) return;

    try {
        const originalOrder = orders.find(o => o.id === editId);
        const updates = {
            ...formData,
            price: parseFloat(formData.price) || 0,
            quantity: parseInt(formData.quantity, 10) || 1,
            replacesOrderId: formData.replacesOrderId || null,
            replacedByOrderId: formData.replacedByOrderId || null
        };
        
        await apiCall('PUT', `${API_URL}/${editId}`, updates);

        if (originalOrder.replacesOrderId !== updates.replacesOrderId) {
            if (originalOrder.replacesOrderId) await apiCall('PUT', `${API_URL}/${originalOrder.replacesOrderId}`, { replacedByOrderId: null });
            if (updates.replacesOrderId) await apiCall('PUT', `${API_URL}/${updates.replacesOrderId}`, { replacedByOrderId: editId });
        }

        if (originalOrder.replacedByOrderId !== updates.replacedByOrderId) {
            if (originalOrder.replacedByOrderId) await apiCall('PUT', `${API_URL}/${originalOrder.replacedByOrderId}`, { replacesOrderId: null });
            if (updates.replacedByOrderId) await apiCall('PUT', `${API_URL}/${updates.replacedByOrderId}`, { replacesOrderId: editId });
        }

        setShowEditModal(false);
        setEditId(null);
        resetForm();
        fetchOrders();
    } catch (err) {
        console.error("Error editing doc", err);
    }
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!importText) return;
    setIsImporting(true);
    setImportStatus('Parsing rows...');

    const rows = importText.trim().split(/\r?\n/);
    const importedDocs = []; // Array to hold new docs temporarily

    try {
        // PASS 1: Create all new records
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row.trim()) continue;

            let cols = row.split('\t');
            if (cols.length === 1 && row.includes(',')) cols = row.split(',');
            if (cols.length < 5) continue;

            let date = cols[0]?.trim() || new Date().toISOString().split('T')[0];
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
              date, sku, description, vehicle, orderNumber, price, quantity: 1, status 
            });

            // Save the newly created DB item along with its spreadsheet link targets
            importedDocs.push({
                part: newDoc,
                replacedByStr,
                replacesStr,
                rmaForPrevStr
            });
        }

        // Combine existing database parts with the newly imported parts to search across everything
        const allParts = [...orders, ...importedDocs.map(d => d.part)];

        // Helper function: Finds the exact line item out of a multi-part order
        const findTargetPart = (targetOrderNum, currentPart) => {
             const candidates = allParts.filter(p => String(p.orderNumber).trim() === String(targetOrderNum).trim());
             if (candidates.length === 0) return null;
             if (candidates.length === 1) return candidates[0]; // Only 1 part in order, easy match
             
             // If multiple parts share the order number, match by SKU or Description
             const exactMatch = candidates.find(p => p.sku && p.sku === currentPart.sku);
             if (exactMatch) return exactMatch;
             
             const descMatch = candidates.find(p => p.description && p.description === currentPart.description);
             if (descMatch) return descMatch;
             
             return candidates[0]; // Fallback
        };

        setImportStatus(`Linking relationships...`);
        
        // PASS 2: Execute Bi-Directional Linking
        for (const item of importedDocs) {
            const currentPart = item.part;
            const updatesToApply = {};
            let needsUpdate = false;

            // 1. If this part is eventually replaced by a newer one
            if (item.replacedByStr) {
                const target = findTargetPart(item.replacedByStr, currentPart);
                if (target) {
                    updatesToApply.replacedByOrderId = target.id;
                    needsUpdate = true;
                    // BI-DIRECTIONAL FIX: Tell the newer part it replaces this one
                    await apiCall('PUT', `${API_URL}/${target.id}`, { replacesOrderId: currentPart.id });
                }
            }
            
            // 2. If this part replaces an older one
            if (item.replacesStr) {
                const target = findTargetPart(item.replacesStr, currentPart);
                if (target) {
                    updatesToApply.replacesOrderId = target.id;
                    needsUpdate = true;
                    // BI-DIRECTIONAL FIX: Tell the older part it was replaced by this one
                    await apiCall('PUT', `${API_URL}/${target.id}`, { replacedByOrderId: currentPart.id });
                    
                    // Handle carry-over RMA
                    if (item.rmaForPrevStr) {
                        await apiCall('PUT', `${API_URL}/${target.id}`, { rmaNumber: item.rmaForPrevStr });
                    }
                }
            }

            // Apply updates to the currently processing part
            if (needsUpdate) {
                await apiCall('PUT', `${API_URL}/${currentPart.id}`, updatesToApply);
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
        console.error("Import failed", err);
        setImportStatus('Error! Check console.');
    } finally {
        setIsImporting(false);
    }
  };

  const handleWarrantySubmit = async (e) => {
    e.preventDefault();
    if (!selectedPart) return;

    try {
      const warrantyQty = parseInt(formData.warrantyQuantity, 10) || 1;
      const currentQty = selectedPart.quantity || 1;

      if (warrantyQty > currentQty) {
          alert("You cannot warranty more items than are in the order!");
          return;
      }

      const newOrder = await apiCall('POST', API_URL, {
        date: formData.date,
        orderNumber: formData.orderNumber,
        price: parseFloat(formData.price) || 0,
        quantity: warrantyQty,
        sku: selectedPart.sku,
        description: selectedPart.description,
        vehicle: selectedPart.vehicle,
        status: 'Active'
      });

      if (warrantyQty < currentQty) {
          await apiCall('PUT', `${API_URL}/${selectedPart.id}`, { 
              quantity: currentQty - warrantyQty 
          });

          const splitRmaItem = await apiCall('POST', API_URL, {
              ...selectedPart,
              id: undefined,
              quantity: warrantyQty,
              status: 'RMA Ready',
              replacedByOrderId: newOrder.id
          });

          await apiCall('PUT', `${API_URL}/${newOrder.id}`, { replacesOrderId: splitRmaItem.id });

      } else {
          await apiCall('PUT', `${API_URL}/${selectedPart.id}`, { 
            status: 'RMA Ready', 
            replacedByOrderId: newOrder.id 
          });
          
          await apiCall('PUT', `${API_URL}/${newOrder.id}`, { replacesOrderId: selectedPart.id });
      }

      setShowWarrantyModal(false);
      setSelectedPart(null);
      resetForm();
      fetchOrders();
    } catch (err) {
      console.error("Error processing warranty", err);
    }
  };

  const handleUpdateStatus = async (orderId, newStatus) => {
    await apiCall('PUT', `${API_URL}/${orderId}`, { status: newStatus });
    fetchOrders();
  };

  const handleUpdateRMA = async (orderId, rmaNumber) => {
    await apiCall('PUT', `${API_URL}/${orderId}`, { rmaNumber });
    fetchOrders();
  };

  const handleDelete = async (id) => {
    if(confirm("Are you sure? This cannot be undone.")) {
        await apiCall('DELETE', `${API_URL}/${id}`);
        fetchOrders();
    }
  }

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      orderNumber: '',
      sku: '',
      description: '',
      vehicle: '',
      price: '',
      quantity: 1,
      status: 'Active',
      rmaNumber: '',
      replacesOrderId: '',
      replacedByOrderId: '',
      warrantyQuantity: 1 
    });
  };

  const openWarrantyModal = (part) => {
    setSelectedPart(part);
    setFormData({
        ...formData,
        date: new Date().toISOString().split('T')[0],
        orderNumber: '',
        price: '',
        sku: part.sku,
        description: part.description,
        vehicle: part.vehicle,
        warrantyQuantity: part.quantity || 1
    });
    setShowWarrantyModal(true);
  };

  const openEditModal = (order) => {
    setEditId(order.id);
    let safeDate = order.date || new Date().toISOString().split('T')[0];
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
        replacesOrderId: order.replacesOrderId || '',
        replacedByOrderId: order.replacedByOrderId || ''
    });
    setShowEditModal(true);
  };

  // --- Multi-Vehicle Grouping Logic ---
  const filteredAndGroupedOrders = useMemo(() => {
    const filtered = orders.filter(order => {
      const matchesSearch = 
        order.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.orderNumber?.toString().includes(searchTerm) ||
        order.vehicle?.toLowerCase().includes(searchTerm.toLowerCase());
      
      if (view === 'inventory') return matchesSearch && order.status === 'Active';
      if (view === 'returns') return matchesSearch && ['RMA Ready', 'RMA Sent'].includes(order.status);
      return matchesSearch;
    });

    const groups = {};
    filtered.forEach(item => {
        const key = item.orderNumber || 'Unknown Order';
        if (!groups[key]) {
            groups[key] = {
                orderNumber: key,
                date: item.date,
                vehicles: new Set(),
                items: []
            };
        }
        
        if (item.vehicle) {
            groups[key].vehicles.add(item.vehicle);
        }
        
        groups[key].items.push(item);
    });

    return Object.values(groups).map(g => ({
        ...g,
        vehicleStr: Array.from(g.vehicles).join(', ') || 'Unknown Vehicle',
    })).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [orders, searchTerm, view]);

  if (loading) return <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-400">Loading your garage...</div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20 md:pb-0">
      
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
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        
        {/* Controls */}
        <div className="flex flex-col md:flex-row justify-between gap-4 items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="flex bg-slate-100 p-1 rounded-lg w-full md:w-auto">
            <button 
              onClick={() => setView('dashboard')}
              className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all ${view === 'dashboard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              All Parts
            </button>
            <button 
              onClick={() => setView('inventory')}
              className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all ${view === 'inventory' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Active Parts
            </button>
            <button 
              onClick={() => setView('returns')}
              className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all ${view === 'returns' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Returns Queue
              {stats.pendingReturnsCount > 0 && <span className="ml-2 bg-amber-500 text-white text-[10px] px-1.5 rounded-full">{stats.pendingReturnsCount}</span>}
            </button>
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

        {/* Main List - Grouped by Order */}
        <div className="space-y-6">
          {filteredAndGroupedOrders.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
              <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-slate-600">No parts found</h3>
              <p className="text-slate-400 text-sm">Import your Google Sheet or add a purchase.</p>
            </div>
          ) : (
            filteredAndGroupedOrders.map(group => (
              <div key={group.orderNumber} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                
                {/* Order Header */}
                <div className="bg-slate-100/50 border-b border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                     <div>
                        <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Order</span>
                        <h2 className="text-lg font-bold text-slate-800 font-mono">#{group.orderNumber}</h2>
                     </div>
                     <div className="h-8 w-px bg-slate-300 hidden sm:block"></div>
                     <div className="text-sm text-slate-500 flex flex-col">
                        <span>{group.date}</span>
                        <div className="flex items-center gap-1">
                            <Car className="w-3 h-3 text-slate-400"/> 
                            <span className="truncate max-w-[200px]" title={group.vehicleStr}>{group.vehicleStr}</span>
                        </div>
                     </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Order Total</span>
                    <div className="text-lg font-bold text-slate-800">
                        ${group.items.reduce((sum, item) => sum + (parseFloat(item.price) * (item.quantity || 1)), 0).toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Items in this Order */}
                <div className="divide-y divide-slate-100">
                  {group.items.map(part => (
                    <div key={part.id} className="p-4 hover:bg-slate-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                      
                      {/* Part Details */}
                      <div className="flex-1">
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
                                <StatusBadge status={part.status} />
                              </div>
                           </div>
                        </div>

                        {/* Linking & RMA logic */}
                        {(part.replacesOrderId || part.replacedByOrderId || part.rmaNumber) && (
                          <div className="mt-3 ml-11 flex flex-wrap gap-2 text-xs">
                            {part.replacesOrderId && (
                                <div className="flex items-center gap-1 text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                                    <History className="w-3 h-3" /> Replaces an older part
                                </div>
                            )}
                            {part.replacedByOrderId && (
                                <div className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100">
                                    <ArrowRight className="w-3 h-3" /> Replaced by newer part
                                </div>
                            )}
                            {part.rmaNumber && (
                                <span className="bg-slate-800 text-white px-2 py-1 rounded border border-slate-900 font-mono">
                                    RMA: {part.rmaNumber}
                                </span>
                            )}
                          </div>
                        )}

                        {/* Editable RMA Box - NOW VISIBLE EVEN IF REFUNDED! */}
                        {['RMA Ready', 'RMA Sent', 'Refunded'].includes(part.status) && (
                          <div className="mt-3 ml-11 flex items-center gap-2">
                            <input 
                                type="text" 
                                placeholder="Enter RMA #" 
                                value={part.rmaNumber || ''}
                                onChange={(e) => handleUpdateRMA(part.id, e.target.value)}
                                className="text-xs border border-amber-300 bg-amber-50 rounded px-2 py-1.5 w-40 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 shadow-sm"
                            />
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 mt-2 md:mt-0 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 w-full md:w-auto">
                        {part.status === 'Active' && (
                            <button onClick={() => openWarrantyModal(part)} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-1.5 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 rounded-lg text-sm font-medium transition-colors shadow-sm">
                                <RefreshCcw className="w-4 h-4" /> Warranty
                            </button>
                        )}
                        {part.status === 'RMA Ready' && (
                            <button onClick={() => handleUpdateStatus(part.id, 'RMA Sent')} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-800 hover:bg-amber-200 rounded-lg text-sm font-medium transition-colors shadow-sm">
                                <Truck className="w-4 h-4" /> Shipped
                            </button>
                        )}
                        {part.status === 'RMA Sent' && (
                            <button onClick={() => handleUpdateStatus(part.id, 'Refunded')} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-1.5 bg-green-100 text-green-800 hover:bg-green-200 rounded-lg text-sm font-medium transition-colors shadow-sm">
                                <DollarSign className="w-4 h-4" /> Refunded
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
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
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
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">SKU</label>
                    <input type="text" name="sku" value={formData.sku} onChange={handleInputChange} className="w-full p-2 border border-slate-200 rounded-lg text-sm font-mono" />
                </div>

                <div className="border-t border-slate-100 pt-4 mt-4">
                    <h4 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                        <LinkIcon className="w-4 h-4 text-blue-500" /> Manual Linking
                    </h4>
                    
                    <div className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">This Replaces (Previous Part):</label>
                            <select name="replacesOrderId" value={formData.replacesOrderId || ''} onChange={handleInputChange} className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white">
                                <option value="">-- None --</option>
                                {orders.filter(o => o.id !== editId && new Date(o.date) <= new Date(formData.date)).map(o => (
                                    <option key={o.id} value={o.id}>{o.date} - {o.description} (#{o.orderNumber})</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">This Is Replaced By (Newer Part):</label>
                            <select name="replacedByOrderId" value={formData.replacedByOrderId || ''} onChange={handleInputChange} className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white">
                                <option value="">-- None --</option>
                                {orders.filter(o => o.id !== editId && new Date(o.date) >= new Date(formData.date)).map(o => (
                                    <option key={o.id} value={o.id}>{o.date} - {o.description} (#{o.orderNumber})</option>
                                ))}
                            </select>
                        </div>
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

      {/* Warranty Replace Modal - WITH PARTIAL SPLIT LOGIC */}
      {showWarrantyModal && selectedPart && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border-2 border-blue-100">
            <div className="p-4 border-b border-blue-100 flex justify-between items-center bg-blue-50">
              <div className="flex items-center gap-2 text-blue-800">
                <RefreshCcw className="w-5 h-5" />
                <h3 className="font-semibold">Warranty Replacement</h3>
              </div>
              <button onClick={() => setShowWarrantyModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm">
                <p className="text-slate-500 mb-1">You are replacing:</p>
                <div className="flex justify-between items-center">
                   <p className="font-medium text-slate-800">{selectedPart.description}</p>
                   <span className="bg-slate-200 px-2 py-0.5 rounded text-xs font-bold text-slate-600">Available: {selectedPart.quantity || 1}</span>
                </div>
                <p className="text-xs text-slate-400 font-mono mt-1">Orig Order: #{selectedPart.orderNumber}</p>
              </div>

              <div className="text-sm text-slate-600">
                 Enter the details of the <strong>NEW</strong> order you just placed. 
              </div>

              <form onSubmit={handleWarrantySubmit} className="space-y-4 pt-2">
                 
                 <div className="bg-blue-50/50 border border-blue-100 p-3 rounded-xl mb-4">
                    <label className="block text-sm font-bold text-blue-800 mb-2">How many are you returning?</label>
                    <input 
                        required 
                        type="number" 
                        min="1" 
                        max={selectedPart.quantity || 1} 
                        name="warrantyQuantity" 
                        value={formData.warrantyQuantity} 
                        onChange={handleInputChange} 
                        className="w-full p-2 border-2 border-blue-300 bg-white rounded-lg text-lg font-bold text-center text-blue-700" 
                    />
                    {(formData.warrantyQuantity < (selectedPart.quantity || 1)) && (
                        <p className="text-xs text-blue-600 mt-2 flex items-center gap-1">
                            <ArrowRight className="w-3 h-3"/> The original row will automatically split into two so you keep track of the remaining active parts!
                        </p>
                    )}
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">New Order Date</label>
                        <input required type="date" name="date" value={formData.date} onChange={handleInputChange} className="w-full p-2 border border-slate-200 rounded-lg text-sm" />
                     </div>
                     <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">New Order #</label>
                        <input required type="text" name="orderNumber" value={formData.orderNumber} onChange={handleInputChange} className="w-full p-2 border border-slate-200 rounded-lg text-sm" placeholder="e.g. 999999" />
                     </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">New Price per item ($)</label>
                    <input required type="number" step="0.01" name="price" value={formData.price} onChange={handleInputChange} className="w-full p-2 border border-slate-200 rounded-lg text-sm" placeholder="Price paid" />
                 </div>
                 <button type="submit" className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm">
                    Confirm Replacement
                 </button>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}