"use client";

import { useState, useEffect, useMemo } from 'react';
import { 
  Settings, X, FileText, DollarSign, TrendingDown, Building2, PieChart, 
  Hexagon, Plus, Search, Download, Image as ImageIcon, Eye, Edit2, Trash2
} from 'lucide-react';
import { 
  fetchPurchasesFromSupabase, 
  savePurchaseToSupabase, 
  deletePurchaseFromSupabase, 
  fetchBudgetFromSupabase, 
  saveBudgetToSupabase, 
  uploadReceiptImage, 
  getReceiptImage, 
  deleteReceiptImage 
} from '../lib/db';

type Purchase = {
  id: string;
  item: string;
  details: string;
  amount: number;
  date: string;
  category: string;
  description?: string;
  hasReceipt?: boolean;
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export default function LabBudgetTracker() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [totalBudget, setTotalBudget] = useState<number>(10000);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  
  // Modals & States
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewedPurchase, setViewedPurchase] = useState<Purchase | null>(null);
  const [viewReceiptDataUrl, setViewReceiptDataUrl] = useState<string | null>(null);
  const [budgetAction, setBudgetAction] = useState<'add' | 'set'>('add');
  
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);
  
  // Form State
  const [item, setItem] = useState('');
  const [details, setDetails] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Hardware');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [newBudget, setNewBudget] = useState('');

  useEffect(() => {
    async function loadData() {
      const [fetchedPurchases, fetchedBudget] = await Promise.all([
        fetchPurchasesFromSupabase(),
        fetchBudgetFromSupabase(),
      ]);
      setPurchases(fetchedPurchases);
      setTotalBudget(fetchedBudget);
      setIsLoaded(true);
    }
    loadData();
  }, []);


  const totalSpent = useMemo(() => purchases.reduce((sum, p) => sum + p.amount, 0), [purchases]);
  const amountLeft = totalBudget - totalSpent;

  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    purchases.forEach(p => {
      const cat = (p.category && p.category !== 'undefined' && p.category !== 'null' && String(p.category).trim() !== '') ? p.category : 'Hardware';
      totals[cat] = (totals[cat] || 0) + p.amount;
    });
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [purchases]);

  const monthlyTotals = useMemo(() => {
    const rawTotals: Record<string, number> = {};
    purchases.forEach(p => {
      const ym = p.date.substring(0, 7); // "YYYY-MM"
      rawTotals[ym] = (rawTotals[ym] || 0) + p.amount;
    });
    
    const sorted = Object.entries(rawTotals).sort((a, b) => a[0].localeCompare(b[0]));
    const recent = sorted.slice(-6); // Last 6 active months
    const maxVal = Math.max(...recent.map(r => r[1]), 1); 
    
    return {
      data: recent.map(([ym, amt]) => {
        const d = new Date(ym + "-01");
        return {
          label: d.toLocaleDateString('en-US', { month: 'short' }),
          amount: amt,
          pct: (amt / maxVal) * 100
        };
      })
    };
  }, [purchases]);

  const spentPct = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0;

  const filteredPurchases = useMemo(() => {
    return purchases.filter(p => 
      p.item.toLowerCase().includes(debouncedSearch.toLowerCase()) || 
      p.details.toLowerCase().includes(debouncedSearch.toLowerCase())
    );
  }, [purchases, debouncedSearch]);

  const handleReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormError(null);
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setFormError('Only image files are allowed for receipts.');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setFormError('Image size must be less than 5MB.');
        return;
      }
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const parsedAmount = parseFloat(amount);
    
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setFormError('Amount must be greater than zero.');
      return;
    }
    const selectedDate = new Date(date);
    const today = new Date();
    if (selectedDate > today) {
      setFormError('Date cannot be in the future.');
      return;
    }

    if (item.trim()) {
      const costDifference = editId ? parsedAmount - (purchases.find(p => p.id === editId)?.amount || 0) : parsedAmount;
      if (costDifference > amountLeft) {
        if (!confirm(`WARNING: This transaction exceeds your available reserves by ${formatCurrency(costDifference - amountLeft)}. Proceed anyway?`)) {
          return;
        }
      }

      let hasReceipt = false;
      const targetId = editId || Date.now().toString();

      try {
        if (receiptPreview) {
          await uploadReceiptImage(targetId, receiptPreview);
          hasReceipt = true;
        } else if (editId) {
          hasReceipt = purchases.find(p => p.id === editId)?.hasReceipt || false;
        }
      } catch (err) {
        console.error("Failed to save receipt", err);
      }

      const updatedPurchase: Purchase = {
        id: targetId,
        item: item.trim(),
        details: details.trim() || 'N/A',
        amount: parsedAmount,
        date: date || new Date().toISOString().split('T')[0],
        description: description.trim(),
        category,
        hasReceipt
      };

      if (editId) {
        setPurchases(prev => prev.map(p => p.id === editId ? updatedPurchase : p));
      } else {
        setPurchases(prev => [updatedPurchase, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      }

      // Sync to Supabase in background
      await savePurchaseToSupabase(updatedPurchase);

      closeAddModal();
    }
  };

  const handleUpdateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(newBudget);
    if (!isNaN(parsed) && parsed >= 0) {
      const nextBudget = budgetAction === 'add' ? totalBudget + parsed : parsed;
      setTotalBudget(nextBudget);
      await saveBudgetToSupabase(nextBudget);
      setIsSettingsOpen(false);
      setNewBudget('');
    }
  };

  const exportToCSV = () => {
    // Sort chronologically (newest first) for export
    const sorted = [...purchases].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    let csv = 'Date,Category,Item,Description,Reference ID,Amount (PKR),Receipt Attached\n';
    sorted.forEach(p => {
      // Escape commas in strings to prevent CSV breaking
      const item = `"${p.item.replace(/"/g, '""')}"`;
      const desc = `"${(p.description || '').replace(/"/g, '""')}"`;
      const details = `"${p.details.replace(/"/g, '""')}"`;
      const cat = (p.category && p.category !== 'undefined' && p.category !== 'null' && String(p.category).trim() !== '') ? p.category : 'Hardware';
      csv += `${p.date},${cat},${item},${desc},${details},${p.amount},${p.hasReceipt ? 'Yes' : 'No'}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Smart_Agri_Tech_Lab_Ledger_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleEdit = (p: Purchase) => {
    setEditId(p.id);
    setItem(p.item);
    setDetails(p.details);
    setDescription(p.description || '');
    setCategory(p.category && p.category !== 'undefined' && p.category !== 'null' ? p.category : 'Hardware');
    setAmount(p.amount.toString());
    setDate(p.date);
    setReceiptFile(null);
    setReceiptPreview(null);
    setIsAddOpen(true);
  };

  const closeAddModal = () => {
    setItem(''); setDetails(''); setDescription(''); setCategory('Hardware'); setAmount(''); setEditId(null); 
    setReceiptFile(null); setReceiptPreview(null); setFormError(null); setIsAddOpen(false);
  };

  const deletePurchase = async (id: string, hasReceipt?: boolean) => {
    if(confirm("Erase this record from the ledger?")) {
      setPurchases(prev => prev.filter(p => p.id !== id));
      await deletePurchaseFromSupabase(id);
      if (hasReceipt) {
        await deleteReceiptImage(id).catch(console.error);
      }
    }
  };

  const handleViewLog = async (p: Purchase) => {
    setViewedPurchase(p);
    setViewReceiptDataUrl(null);
    if (p.hasReceipt) {
      const dataUrl = await getReceiptImage(p.id);
      if (dataUrl) setViewReceiptDataUrl(dataUrl);
    }
  };

  const generatePDF = async () => {
    setIsGeneratingPDF(true);
    // Short delay to allow React to apply the `.is-exporting` CSS classes before capturing
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      // @ts-ignore - html2pdf doesn't have reliable types without @types/html2pdf.js
      const html2pdf = (await import('html2pdf.js')).default;
      const element = document.getElementById('report-wrapper');
      if (!element) return;
      
      const opt = {
        margin: 0,
        filename: `Smart_Agri_Tech_Lab_Ledger_${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true, 
          backgroundColor: '#09090b',
          windowWidth: 1200 // Force desktop width for PDF rendering
        },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' as const }
      };

        // @ts-ignore
        await html2pdf().set(opt as any).from(element).save();
    } catch (error) {
      console.error("Failed to generate PDF", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  if (!isLoaded) return null;

  return (
    <div id="report-wrapper" className={isGeneratingPDF ? 'is-exporting' : ''}>
      {/* The Glow Type Thingy - Sunset Colors */}
      <div className="aurora-bg">
        <div className="aurora-blob blob-1"></div>
        <div className="aurora-blob blob-2"></div>
        <div className="aurora-blob blob-3"></div>
      </div>

      <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Hexagon size={22} />
          </div>
          <div>
            <div className="brand-text">Smart Agri Tech Lab</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px', fontWeight: 600 }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 8px var(--success)' }} />
              Financial Portal
            </div>
          </div>
        </div>
        
        <nav className="nav">
          <div className="nav-item active">
            <PieChart size={18} />
            <span>Overview</span>
          </div>
          <div className="nav-item" onClick={() => { setIsSettingsOpen(true); setNewBudget(''); setBudgetAction('add'); }}>
            <Settings size={18} />
            <span>Settings</span>
          </div>
          <div className="nav-item" onClick={generatePDF} style={{ opacity: isGeneratingPDF ? 0.5 : 1, pointerEvents: isGeneratingPDF ? 'none' : 'auto' }}>
            <FileText size={18} />
            <span>{isGeneratingPDF ? "Generating PDF..." : "Executive Report"}</span>
          </div>
        </nav>
      </aside>

      {/* Main Interface */}
      <main className="main-content">
        <header className="header">
          <div>
            <h1 className="header-title">Financial Matrix</h1>
            <p className="header-subtitle">Real-time expenditure visualization</p>
          </div>
          <button className="btn btn-primary" onClick={() => setIsAddOpen(true)}>
            <Plus size={18} /> Add Record
          </button>
        </header>

        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-title">Total Budget</span>
              <DollarSign size={20} color="var(--primary)" />
            </div>
            <div className="stat-value">{formatCurrency(totalBudget)}</div>
          </div>
          
          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-title">Total Spent</span>
              <TrendingDown size={20} color="var(--danger)" />
            </div>
            <div className="stat-value" style={{ color: 'var(--danger)' }}>
              {formatCurrency(totalSpent)}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-title">Remaining Funds</span>
              <Building2 size={20} color={amountLeft < 0 ? 'var(--danger)' : 'var(--success)'} />
            </div>
            <div className="stat-value" style={{ color: amountLeft < 0 ? 'var(--danger)' : 'var(--success)' }}>
              {formatCurrency(amountLeft)}
            </div>
            </div>
          </section>

          <section className="analytics-section">
            <div className="analytics-card">
              <h3 className="analytics-title">Budget Utilization</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '32px', marginTop: '16px' }}>
                <svg viewBox="0 0 36 36" style={{ width: '110px', height: '110px', filter: 'drop-shadow(0 0 15px rgba(239,68,68,0.3))' }}>
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                  <path strokeDasharray={`${spentPct} 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="url(#gradient)" strokeWidth="3" strokeLinecap="round" />
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="var(--accent-1)" />
                      <stop offset="100%" stopColor="var(--accent-2)" />
                    </linearGradient>
                  </defs>
                  <text x="18" y="21" textAnchor="middle" fill="#fff" fontSize="8px" fontWeight="700">{Math.round(spentPct)}%</text>
                </svg>
                <div>
                  <div style={{ marginBottom: '8px' }}><span style={{ color: 'var(--danger)', fontWeight: 600 }}>{formatCurrency(totalSpent)}</span> Used</div>
                  <div><span style={{ color: 'var(--success)', fontWeight: 600 }}>{formatCurrency(amountLeft)}</span> Remaining</div>
                </div>
              </div>
            </div>
            
            <div className="analytics-card" style={{ flex: 1 }}>
              <h3 className="analytics-title">Top Categories</h3>
              <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {categoryTotals.length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No expenditures logged yet.</div>
                ) : (
                  categoryTotals.slice(0, 3).map(([cat, amt]) => {
                    const safeCat = (cat && cat !== 'undefined' && cat !== 'null' && String(cat).trim() !== '') ? cat : 'Hardware';
                    return (
                      <div key={safeCat} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className={`cat-badge cat-${safeCat.toLowerCase()}`} style={{ minWidth: '90px', textAlign: 'center' }}>{safeCat}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, marginLeft: '24px' }}>
                          <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', flex: 1, overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--accent-1), var(--accent-3))', width: `${(amt / totalSpent) * 100}%`, borderRadius: '3px' }} />
                          </div>
                          <span style={{ fontWeight: 700, fontSize: '0.95rem', minWidth: '100px', textAlign: 'right' }}>{formatCurrency(amt)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="analytics-card" style={{ flex: 1 }}>
              <h3 className="analytics-title">Monthly Trend</h3>
              <div style={{ marginTop: '20px', display: 'flex', alignItems: 'flex-end', gap: '8px', height: '120px' }}>
                {monthlyTotals.data.length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No expenditures logged yet.</div>
                ) : (
                  monthlyTotals.data.map((m, i) => (
                    <div key={i} className="bar-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%', justifyContent: 'flex-end', position: 'relative', cursor: 'pointer' }}>
                      <div className="bar-tooltip">{formatCurrency(m.amount)}</div>
                      <div style={{ 
                        width: '100%', maxWidth: '24px', 
                        height: `${Math.max(m.pct, 5)}%`, 
                        background: 'linear-gradient(180deg, var(--accent-1), rgba(249, 115, 22, 0.1))', 
                        borderRadius: '4px 4px 0 0',
                        transition: 'height 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
                      }} />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{m.label}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <div className="data-panel">
          <div className="data-panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <h2 className="data-panel-title">Expenditure Ledger</h2>
              <span className="badge">{filteredPurchases.length} Records</span>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input 
                  type="text" 
                  placeholder="Search records..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="input-field"
                  style={{ paddingLeft: '36px', width: '240px' }}
                />
              </div>
              <button className="btn btn-secondary" onClick={exportToCSV} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Download size={16} /> Export CSV
              </button>
            </div>
          </div>
          
          {filteredPurchases.length === 0 ? (
            <div style={{ padding: '64px 32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <div style={{ marginBottom: '16px', opacity: 0.5 }}>
                <FileText size={48} style={{ margin: '0 auto' }} />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>No records found</h3>
              <p>There are no expenditures matching your search criteria.</p>
            </div>
          ) : (
            <div className="grid-table" style={{ marginTop: '24px' }}>
              <div className="grid-header">
                <div>Date</div>
                <div>Asset / Material</div>
                <div>Reference ID</div>
                <div style={{ textAlign: 'right' }}>Amount</div>
                <div style={{ textAlign: 'center' }}>Actions</div>
              </div>
              <div className="grid-body">
                {filteredPurchases.map(p => (
                  <div className="grid-row" key={p.id}>
                    <div className="cell-date">{new Date(p.date).toLocaleDateString()}</div>
                    <div className="cell-item">
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                        {p.item}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span className={`cat-badge cat-${((p.category && p.category !== 'undefined' && p.category !== 'null' && String(p.category).trim() !== '') ? p.category : 'Hardware').toLowerCase()}`}>
                          {(p.category && p.category !== 'undefined' && p.category !== 'null' && String(p.category).trim() !== '') ? p.category : 'Hardware'}
                        </span>
                        {p.hasReceipt && <span className="receipt-badge">📎 Receipt</span>}
                      </div>
                      {p.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: '1.35' }}>{p.description}</div>}
                    </div>
                    <div className="cell-details">
                      <FileText size={14} /> {p.details}
                    </div>
                  <div className="cell-amount">{formatCurrency(p.amount)}</div>
                  <div style={{display: 'flex', justifyContent: 'center', gap: '4px'}}>
                    <button className="action-btn" onClick={() => handleViewLog(p)} title="View Details">
                      <Eye size={16} />
                    </button>
                    <button className="action-btn" onClick={() => handleEdit(p)} title="Edit">
                      <Edit2 size={16} />
                    </button>
                    <button className="action-btn" onClick={() => deletePurchase(p.id, p.hasReceipt)} title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderTop: '2px solid var(--border)', background: 'rgba(255, 255, 255, 0.02)', fontSize: '0.95rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Total Expenditures ({filteredPurchases.length} Items):</span>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                  {formatCurrency(filteredPurchases.reduce((sum, item) => sum + item.amount, 0))}
                </span>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      {isAddOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2 className="modal-title">{editId ? "Edit Record" : "Add Record"}</h2>
              <button className="action-btn" onClick={closeAddModal}><X size={20} /></button>
            </div>
            
            <form onSubmit={handleAddPurchase}>
              {formError && (
                <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: 'var(--danger)', marginBottom: '16px', fontSize: '0.9rem', fontWeight: 500 }}>
                  {formError}
                </div>
              )}
              <div className="input-group">
                <label className="input-label">Asset / Material</label>
                <input 
                  type="text" className="input-field" 
                  placeholder="e.g. Quantum Processor Unit"
                  value={item} onChange={(e) => setItem(e.target.value)} required autoFocus
                />
              </div>

              <div className="input-group">
                <label className="input-label">Category</label>
                <select className="input-field" value={category} onChange={(e) => setCategory(e.target.value)} style={{ cursor: 'pointer' }}>
                  <option value="Hardware">Hardware</option>
                  <option value="Consumables">Consumables</option>
                  <option value="Software">Software</option>
                  <option value="Services">Services</option>
                  <option value="Travel">Travel</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              
              <div className="input-group">
                <label className="input-label">Amount (PKR)</label>
                <input type="number" step="0.01" className="input-field" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </div>

              <div className="input-group">
                <label className="input-label">Reference ID</label>
                <input type="text" className="input-field" value={details} onChange={(e) => setDetails(e.target.value)} />
              </div>

              <div className="input-group">
                <label className="input-label">Description</label>
                <textarea className="input-field" value={description} onChange={(e) => setDescription(e.target.value)} style={{ minHeight: '80px', resize: 'vertical' }} />
              </div>

              <div className="input-group">
                <label className="input-label">Date</label>
                <input type="date" className="input-field" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>

              <div className="input-group">
                <label className="input-label">Receipt</label>
                <input type="file" accept="image/*" className="input-field" onChange={handleReceiptChange} style={{ padding: '8px' }} />
                {receiptPreview && (
                  <div style={{ marginTop: '12px', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', height: '100px', width: 'fit-content' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={receiptPreview} alt="Preview" style={{ height: '100%', objectFit: 'contain' }} />
                  </div>
                )}
              </div>
              
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeAddModal}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editId ? "Save Changes" : "Add Record"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">Settings</h2>
              <button className="action-btn" onClick={() => setIsSettingsOpen(false)}><X size={20} /></button>
            </div>
            
            <form onSubmit={handleUpdateBudget}>
              <div className="input-group">
                <label className="input-label">Current Total Budget</label>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>{formatCurrency(totalBudget)}</div>
              </div>

              <div className="input-group">
                <label className="input-label">Action</label>
                <select className="input-field" value={budgetAction} onChange={(e) => setBudgetAction(e.target.value as 'add' | 'set')} style={{ cursor: 'pointer' }}>
                  <option value="add">Add New Allotment (+)</option>
                  <option value="set">Override Total Budget (=)</option>
                </select>
              </div>

              <div className="input-group">
                <label className="input-label">Amount (PKR)</label>
                <input type="number" step="0.01" className="input-field" placeholder="Enter amount..." value={newBudget} onChange={(e) => setNewBudget(e.target.value)} required autoFocus />
              </div>
              
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsSettingsOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{budgetAction === 'add' ? 'Add Funds' : 'Save Settings'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewedPurchase && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '800px', width: '90vw' }}>
            <div className="modal-header">
              <h2 className="modal-title">Log Details</h2>
              <button className="action-btn" onClick={() => { setViewedPurchase(null); setViewReceiptDataUrl(null); }}><X size={20} /></button>
            </div>
            
            <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1', minWidth: '250px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>{viewedPurchase.item}</h3>
                  {viewedPurchase.category && <span className={`cat-badge cat-${viewedPurchase.category.toLowerCase()}`}>{viewedPurchase.category}</span>}
                </div>
                
                <div style={{ marginBottom: '16px' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>Amount</span>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{formatCurrency(viewedPurchase.amount)}</div>
                </div>
                
                <div style={{ marginBottom: '16px' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>Date</span>
                  <div>{new Date(viewedPurchase.date).toLocaleDateString()}</div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>Reference</span>
                  <div>{viewedPurchase.details}</div>
                </div>

                {viewedPurchase.description && (
                  <div style={{ marginBottom: '16px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>Description</span>
                    <p style={{ marginTop: '4px' }}>{viewedPurchase.description}</p>
                  </div>
                )}
              </div>

              {viewedPurchase.hasReceipt && (
                <div style={{ flex: '1.5', minWidth: '300px', background: '#f8fafc', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '1px solid var(--border)' }}>
                  {viewReceiptDataUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={viewReceiptDataUrl} alt="Receipt" style={{ maxWidth: '100%', maxHeight: '50vh', objectFit: 'contain', borderRadius: '8px' }} />
                  ) : (
                    <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
