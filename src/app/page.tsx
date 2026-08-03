"use client";

import { useState, useEffect, useMemo } from 'react';
import { 
  Settings, X, FileText, DollarSign, TrendingDown, Building2, PieChart, 
  Hexagon, Plus, Search, Download, Image as ImageIcon, Eye, Edit2, Trash2,
  Copy, Check, CreditCard, Smartphone, ShieldCheck, Calendar, ChevronLeft, ChevronRight, Filter
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
  purchaser?: string;
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
  
  // Modals & States
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewedPurchase, setViewedPurchase] = useState<Purchase | null>(null);
  const [viewReceiptDataUrl, setViewReceiptDataUrl] = useState<string | null>(null);
  const [budgetAction, setBudgetAction] = useState<'add' | 'set'>('add');
  const [copied, setCopied] = useState(false);

  // Monthly Filter State
  const [selectedMonth, setSelectedMonth] = useState<string>('current');

  const handleCopyAccount = () => {
    navigator.clipboard.writeText('03364448776');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
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
  const [purchaser, setPurchaser] = useState('');
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

  // Monthly Filter Logic
  const currentMonthKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    monthsSet.add(currentMonthKey);
    purchases.forEach(p => {
      if (p.date && p.date.length >= 7) {
        monthsSet.add(p.date.substring(0, 7));
      }
    });
    return Array.from(monthsSet).sort().reverse();
  }, [purchases, currentMonthKey]);

  const activeMonthKey = selectedMonth === 'current' ? currentMonthKey : selectedMonth;

  const formatMonthLabel = (ym: string) => {
    if (ym === 'all') return 'All-Time Records';
    const key = ym === 'current' ? currentMonthKey : ym;
    const [year, month] = key.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    const monthName = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    return (ym === 'current' || key === currentMonthKey) ? `${monthName} (Present Month)` : monthName;
  };

  const filteredPurchases = useMemo(() => {
    return purchases.filter(p => {
      const matchesSearch = 
        p.item.toLowerCase().includes(debouncedSearch.toLowerCase()) || 
        p.details.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (p.purchaser || '').toLowerCase().includes(debouncedSearch.toLowerCase());

      if (!matchesSearch) return false;
      if (selectedMonth === 'all') return true;
      
      const pMonth = p.date ? p.date.substring(0, 7) : '';
      return pMonth === activeMonthKey;
    });
  }, [purchases, debouncedSearch, selectedMonth, activeMonthKey]);

  const activeMonthMetrics = useMemo(() => {
    const isAllTime = selectedMonth === 'all';
    const monthPurchases = isAllTime
      ? purchases
      : purchases.filter(p => p.date && p.date.substring(0, 7) === activeMonthKey);
      
    const spentInView = monthPurchases.reduce((sum, p) => {
      const amt = Number(p.amount);
      return sum + (isNaN(amt) ? 0 : amt);
    }, 0);

    const safeBudget = Number(totalBudget);
    const validBudget = (!isNaN(safeBudget) && safeBudget > 0) ? safeBudget : 0;

    const rawPct = validBudget > 0 ? (spentInView / validBudget) * 100 : 0;
    const percentage = Math.round(rawPct * 10) / 10; // e.g. 76.5%

    return {
      totalSpent: spentInView,
      count: monthPurchases.length,
      percentage: Math.max(0, percentage),
      isExceeded: validBudget > 0 && spentInView > validBudget,
      isAllTime,
      isCurrentMonth: activeMonthKey === currentMonthKey || selectedMonth === 'current'
    };
  }, [purchases, selectedMonth, activeMonthKey, currentMonthKey, totalBudget]);

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
        purchaser: purchaser.trim() || 'N/A',
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
    // Sort chronologically (newest first) for active view
    const sorted = [...filteredPurchases].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    let csv = 'Date,Category,Item,Purchaser,Description,Reference ID,Amount (PKR),Receipt Attached\n';
    sorted.forEach(p => {
      // Escape commas in strings to prevent CSV breaking
      const itemStr = `"${p.item.replace(/"/g, '""')}"`;
      const purchaserStr = `"${(p.purchaser || 'N/A').replace(/"/g, '""')}"`;
      const desc = `"${(p.description || '').replace(/"/g, '""')}"`;
      const detailsStr = `"${p.details.replace(/"/g, '""')}"`;
      const cat = (p.category && p.category !== 'undefined' && p.category !== 'null' && String(p.category).trim() !== '') ? p.category : 'Hardware';
      csv += `${p.date},${cat},${itemStr},${purchaserStr},${desc},${detailsStr},${p.amount},${p.hasReceipt ? 'Yes' : 'No'}\n`;
    });

    const monthTag = selectedMonth === 'all' 
      ? 'All_Time' 
      : formatMonthLabel(selectedMonth).replace(/[^a-zA-Z0-9]/g, '_');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Smart_Agri_Tech_Lab_Ledger_${monthTag}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleEdit = (p: Purchase) => {
    setEditId(p.id);
    setItem(p.item);
    setDetails(p.details);
    setPurchaser(p.purchaser || '');
    setDescription(p.description || '');
    setCategory(p.category && p.category !== 'undefined' && p.category !== 'null' ? p.category : 'Hardware');
    setAmount(p.amount.toString());
    setDate(p.date);
    setReceiptFile(null);
    setReceiptPreview(null);
    setIsAddOpen(true);
  };

  const closeAddModal = () => {
    setItem(''); setDetails(''); setPurchaser(''); setDescription(''); setCategory('Hardware'); setAmount(''); setEditId(null); 
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

  const exportToExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      
      const sorted = [...filteredPurchases].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const viewSpent = sorted.reduce((sum, p) => sum + p.amount, 0);

      // Category breakdown for exported view
      const viewCatTotals: Record<string, number> = {};
      sorted.forEach(p => {
        const cat = (p.category && p.category !== 'undefined' && p.category !== 'null' && String(p.category).trim() !== '') ? p.category : 'Hardware';
        viewCatTotals[cat] = (viewCatTotals[cat] || 0) + p.amount;
      });

      const monthLabel = formatMonthLabel(selectedMonth);

      // 1. Executive Summary Data
      const summaryData = [
        ['SMART AGRI TECH LAB - FINANCIAL SUMMARY REPORT'],
        ['Report View Scope', monthLabel],
        ['Generated On', new Date().toLocaleString()],
        [],
        ['FINANCIAL OVERVIEW', 'AMOUNT (PKR)'],
        ['Total Allocated Budget', totalBudget],
        ['View Total Expenditure', viewSpent],
        ['Remaining Reserves', amountLeft],
        ['Budget Utilization (View)', `${totalBudget > 0 ? Math.round((viewSpent / totalBudget) * 100) : 0}%`],
        ['Transactions in View', sorted.length],
        [],
        ['CATEGORY BREAKDOWN (VIEW)', 'SPENT AMOUNT (PKR)'],
        ...Object.entries(viewCatTotals).map(([cat, amt]) => [cat, amt]),
        [],
        ['EXPENDITURE LEDGER'],
        ['Date', 'Category', 'Item / Asset', 'Purchaser Name', 'Description', 'Reference ID', 'Amount (PKR)', 'Receipt Attached']
      ];

      // Append ledger rows
      sorted.forEach(p => {
        const cat = (p.category && p.category !== 'undefined' && p.category !== 'null' && String(p.category).trim() !== '') ? p.category : 'Hardware';
        summaryData.push([
          p.date,
          cat,
          p.item,
          p.purchaser || 'N/A',
          p.description || '',
          p.details || 'N/A',
          p.amount,
          p.hasReceipt ? 'Yes' : 'No'
        ]);
      });

      const worksheet = XLSX.utils.aoa_to_sheet(summaryData);

      // Auto-fit column widths
      worksheet['!cols'] = [
        { wch: 18 }, // Date / Metric
        { wch: 22 }, // Category / Amount
        { wch: 30 }, // Item
        { wch: 24 }, // Purchaser
        { wch: 35 }, // Description
        { wch: 20 }, // Reference ID
        { wch: 16 }, // Amount
        { wch: 16 }  // Receipt
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Lab Budget Summary');

      const monthTag = selectedMonth === 'all' 
        ? 'All_Time' 
        : monthLabel.replace(/[^a-zA-Z0-9]/g, '_');

      XLSX.writeFile(workbook, `Smart_Agri_Tech_Lab_Ledger_${monthTag}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error('Failed to export Excel report:', err);
      alert('Failed to generate Excel file. Please try again.');
    }
  };

  if (!isLoaded) return null;

  return (
    <div>
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
          <div className="brand-logo-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="EMEDAIOT Logo" className="brand-logo-img" />
          </div>
          <div>
            <div className="brand-text">EMEDAIOT</div>
            <div className="file-text" style={{ fontSize: '0.75rem' }}>Smart Agri Tech</div>
          </div>
        </div>
        
        <nav className="nav">
          <div className="nav-item active">
            <PieChart size={18} />
            <span>Overview</span>
          </div>
          <div className="nav-item" onClick={() => { setIsSettingsOpen(true); setNewBudget(''); setBudgetAction('add'); }}>
            <DollarSign size={18} />
            <span>Manage Budget</span>
          </div>
        </nav>

        {/* Sidebar Receiver Info */}
        <div className="sidebar-receiver-box">
          <div className="sidebar-receiver-header">
            <span>Receiver Account</span>
            <span className="easypaisa-badge" style={{ padding: '2px 8px', fontSize: '0.65rem' }}>Easypaisa</span>
          </div>
          <div className="sidebar-receiver-name">Faheem Ali</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '4px', flexWrap: 'nowrap' }}>
            <div className="sidebar-receiver-num">03364448776</div>
            <button 
              type="button" 
              className={`copy-btn ${copied ? 'copied' : ''}`} 
              onClick={handleCopyAccount} 
              style={{ padding: '3px 8px', fontSize: '0.7rem', height: '24px', flexShrink: 0, whiteSpace: 'nowrap' }}
              title="Copy account number"
            >
              {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Interface */}
      <main className="main-content">
        <header className="header">
          <div>
            <h1 className="header-title">Financial Matrix</h1>
            <p className="header-subtitle">Real-time expenditure visualization • EMEDAIOT Smarter Solutions</p>
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
              <button className="btn btn-primary" onClick={exportToExcel} style={{ display: 'flex', alignItems: 'center', gap: '8px' }} title={`Export ${formatMonthLabel(selectedMonth)} report to Excel`}>
                <Download size={16} /> Export Excel
              </button>
              <button className="btn btn-secondary" onClick={exportToCSV} style={{ display: 'flex', alignItems: 'center', gap: '8px' }} title={`Export ${formatMonthLabel(selectedMonth)} report to CSV`}>
                <Download size={16} /> Export CSV
              </button>
            </div>
          </div>

          {/* Monthly Records Container */}
          <div className="monthly-container">
            <div className="monthly-container-header">
              <div className="monthly-title-group">
                <Calendar size={20} color="var(--accent-3)" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, fontFamily: 'var(--font-space-grotesk)' }}>
                  {formatMonthLabel(selectedMonth)}
                </h3>
                <span className={activeMonthMetrics.isCurrentMonth ? 'monthly-badge-present' : 'monthly-badge-past'}>
                  {activeMonthMetrics.isCurrentMonth ? 'Present Month' : 'Past Month'}
                </span>
              </div>

              <div className="monthly-controls">
                <button 
                  type="button"
                  className={`month-tab-btn ${selectedMonth === 'current' ? 'active' : ''}`}
                  onClick={() => setSelectedMonth('current')}
                >
                  <Calendar size={14} /> Present Month
                </button>

                <button 
                  type="button"
                  className={`month-tab-btn ${selectedMonth === 'all' ? 'active' : ''}`}
                  onClick={() => setSelectedMonth('all')}
                >
                  All-Time
                </button>

                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  <Filter size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none', zIndex: 2 }} />
                  <select 
                    className="input-field" 
                    value={selectedMonth} 
                    onChange={e => setSelectedMonth(e.target.value)}
                    style={{ padding: '6px 36px 6px 38px', height: '38px', fontSize: '0.85rem', width: 'auto', cursor: 'pointer', lineHeight: '1.2' }}
                  >
                    <option value="current">Current Month (Present)</option>
                    <option value="all">All-Time Records</option>
                    {availableMonths.map(ym => {
                      const [yr, mo] = ym.split('-');
                      const d = new Date(parseInt(yr), parseInt(mo) - 1, 1);
                      const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
                      return (
                        <option key={ym} value={ym}>
                          {ym === currentMonthKey ? `${label} (Present)` : label}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            </div>

            <div className="monthly-stats-strip">
              <div className="monthly-stat-item">
                <span className="monthly-stat-label">
                  {activeMonthMetrics.isAllTime ? 'Total Expenditure' : 'Monthly Expenditure'}
                </span>
                <span className="monthly-stat-val" style={{ color: 'var(--accent-3)' }}>
                  {formatCurrency(activeMonthMetrics.totalSpent)}
                </span>
              </div>
              <div className="monthly-stat-item">
                <span className="monthly-stat-label">Logged Transactions</span>
                <span className="monthly-stat-val">
                  {activeMonthMetrics.count} {activeMonthMetrics.count === 1 ? 'Item' : 'Items'}
                </span>
              </div>
              <div className="monthly-stat-item">
                <span className="monthly-stat-label">
                  {activeMonthMetrics.isAllTime ? 'Overall Budget Used' : 'Monthly Budget Used'}
                </span>
                <span className="monthly-stat-val" style={{ color: activeMonthMetrics.isExceeded ? 'var(--danger)' : 'var(--text-primary)' }}>
                  {activeMonthMetrics.percentage.toFixed(1)}%
                </span>
              </div>
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
                        {p.purchaser && p.purchaser !== 'N/A' && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                            By: {p.purchaser}
                          </span>
                        )}
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

          {/* App Footer */}
          <footer className="app-footer">
            <div className="footer-content">
              <div className="footer-logo-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="EMEDAIOT Logo" className="footer-logo-img" />
              </div>
              <span>© {new Date().getFullYear()} EMEDAIOT — Smarter Solutions • Smart Agri Tech Lab Ledger</span>
            </div>
          </footer>
        </div>
      </main>

      {/* Modals */}
      {isAddOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <div className="modal-title-group">
                <div className="modal-logo-badge">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.png" alt="EMEDAIOT Logo" className="modal-logo-img" />
                </div>
                <h2 className="modal-title">{editId ? "Edit Record" : "Add Record"}</h2>
              </div>
              <button className="action-btn" onClick={closeAddModal}><X size={20} /></button>
            </div>
            
            <form onSubmit={handleAddPurchase}>
              {/* Receiver Account Helper Banner */}
              <div style={{ padding: '12px 16px', background: 'linear-gradient(145deg, rgba(87, 112, 122, 0.14) 0%, rgba(87, 112, 122, 0.04) 100%)', border: '1px solid rgba(126, 145, 159, 0.25)', borderRadius: '12px', marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lab Receiver Account (Easypaisa)</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>Faheem Ali — <span style={{ color: 'var(--accent-3)', fontFamily: 'var(--font-space-grotesk)' }}>03364448776</span></div>
                </div>
                <button type="button" className={`copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopyAccount} style={{ padding: '5px 12px', fontSize: '0.78rem' }}>
                  {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
                </button>
              </div>

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
                <label className="input-label">Purchaser Name</label>
                <input 
                  type="text" className="input-field" 
                  placeholder="e.g. Faheem Ali"
                  value={purchaser} onChange={(e) => setPurchaser(e.target.value)}
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
                <input type="number" step="0.01" className="input-field" placeholder="e.g. 5000" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </div>

              <div className="input-group">
                <label className="input-label">Reference ID</label>
                <input type="text" className="input-field" placeholder="e.g. PO-8921 / INV-402" value={details} onChange={(e) => setDetails(e.target.value)} />
              </div>

              <div className="input-group">
                <label className="input-label">Description</label>
                <textarea className="input-field" placeholder="e.g. Purchased for AGRI-BOT V2 sensor calibration module" value={description} onChange={(e) => setDescription(e.target.value)} style={{ minHeight: '80px', resize: 'vertical' }} />
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
              <div className="modal-title-group">
                <div className="modal-logo-badge">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.png" alt="EMEDAIOT Logo" className="modal-logo-img" />
                </div>
                <h2 className="modal-title">Manage Budget Allocation</h2>
              </div>
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
              <div className="modal-title-group">
                <div className="modal-logo-badge">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.png" alt="EMEDAIOT Logo" className="modal-logo-img" />
                </div>
                <h2 className="modal-title">Log Details</h2>
              </div>
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

                {viewedPurchase.purchaser && (
                  <div style={{ marginBottom: '16px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>Purchaser Name</span>
                    <div style={{ fontWeight: 600 }}>{viewedPurchase.purchaser}</div>
                  </div>
                )}

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
