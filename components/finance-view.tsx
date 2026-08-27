'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Plus, DollarSign, TrendingUp, TrendingDown, Wallet, PiggyBank,
  X, Building2, RefreshCw, Trash2, Loader2, ArrowUpRight, ArrowDownRight, Pencil,
  BarChart3, PieChart as PieChartIcon, Upload, Settings2, Shield,
  CreditCard, Landmark, Bitcoin, ChevronRight, Search, Filter, Tag,
  FileText, Zap, Eye, EyeOff, AlertCircle, Check, ChevronDown, Mail, Inbox,
  ArrowUpDown, CheckSquare, Square, Clock, Link2, Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';

const SpendingChart = dynamic(() => import('@/components/spending-chart'), { ssr: false, loading: () => <div className="h-48 bg-secondary rounded-xl animate-pulse" /> });
const CashflowChart = dynamic(() => import('@/components/cashflow-chart'), { ssr: false, loading: () => <div className="h-48 bg-secondary rounded-xl animate-pulse" /> });
const AllocationChart = dynamic(() => import('@/components/allocation-chart'), { ssr: false, loading: () => <div className="h-48 bg-secondary rounded-xl animate-pulse" /> });

const CATEGORIES = ['Food & Dining', 'Transport', 'Housing', 'Utilities', 'Entertainment', 'Shopping', 'Health', 'Education', 'Groceries', 'Subscriptions', 'Income - Salary', 'Income - Business', 'Income - Freelance', 'Income - Other', 'Savings', 'Investment', 'Transfer', 'Refund', 'IOU', 'Other'];
const TXN_TYPES: string[] = ['expense', 'income', 'transfer', 'refund', 'investment', 'iou'];
const INVESTMENT_SUBTYPES = ['buy', 'sell', 'dividend', 'capital_gain'] as const;
const TYPE_COLORS: Record<string, { text: string; bg: string; icon: any }> = {
  expense: { text: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20', icon: TrendingDown },
  income: { text: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20', icon: TrendingUp },
  transfer: { text: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', icon: ArrowUpRight },
  refund: { text: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20', icon: RefreshCw },
  investment: { text: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20', icon: TrendingUp },
  iou: { text: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20', icon: Wallet },
};
const MARKET_TYPES = ['stock', 'crypto', 'etf'];
const ACCOUNT_ICONS: Record<string, any> = { investment: TrendingUp, bank: Landmark, crypto: Bitcoin, cash: Wallet, credit: CreditCard };
const PROVIDERS = [
  { id: 'manual', label: 'Manual', desc: 'Track manually' },
  { id: 'tiger', label: 'Tiger Brokers', desc: 'Sync via API', type: 'investment' },
  { id: 'crypto_com', label: 'Crypto.com', desc: 'Sync via API', type: 'crypto' },
  { id: 'coinhako', label: 'Coinhako', desc: 'Manual tracking', type: 'crypto' },
  { id: 'syfe', label: 'Syfe', desc: 'Manual tracking', type: 'investment' },
  { id: 'dbs', label: 'DBS Bank', desc: 'CSV import', type: 'bank' },
  { id: 'citibank', label: 'Citibank', desc: 'CSV import', type: 'credit' },
];

interface MarketPrice { price: number; change24h: number; }

export function FinanceView() {
  // Data
  const [accounts, setAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [investments, setInvestments] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [marketPrices, setMarketPrices] = useState<Record<string, MarketPrice>>({});
  const [summary, setSummary] = useState<any>(null);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [mounted, setMounted] = useState(false);
  const fetchedPricesRef = useRef(false);

  // UI State
  const [activeTab, setActiveTab] = useState<'accounts' | 'transactions' | 'budgets' | 'reports' | 'settings'>('accounts');
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddTxn, setShowAddTxn] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [showAddRule, setShowAddRule] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [hideBalances, setHideBalances] = useState(false);
  const [searchTxn, setSearchTxn] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [txnSort, setTxnSort] = useState<'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'>('date_desc');
  const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());
  const [bulkParsing, setBulkParsing] = useState(false);

  // Form state
  const [newAcct, setNewAcct] = useState({ name: '', type: 'bank', provider: 'manual', currency: 'SGD', balance: '', icon: '', apiCredentials: {} as any });
  const [newTxn, setNewTxn] = useState({ amount: '', type: 'expense', category: 'Other', note: '', date: '', accountId: '', investmentType: '', tags: [] as string[] });
  const [allTags, setAllTags] = useState<any[]>([]);
  const [newBudget, setNewBudget] = useState({ category: 'Food & Dining', amount: '' });
  const [ruleConditions, setRuleConditions] = useState<{field: string; op: string; value: string}[]>([{ field: 'note', op: 'contains', value: '' }]);
  const [ruleActions, setRuleActions] = useState<{type: string; value: string}[]>([{ type: 'tag', value: '' }]);
  const [ruleName, setRuleName] = useState('');
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkRulesText, setBulkRulesText] = useState('');
  const [importingRules, setImportingRules] = useState(false);
  const [applyToPast, setApplyToPast] = useState(false);
  const [importData, setImportData] = useState({ text: '', accountId: '', format: 'auto' });
  const [editingTxn, setEditingTxn] = useState<any>(null);
  const [importTab, setImportTab] = useState<'csv' | 'email'>('csv');
  const [emailScanning, setEmailScanning] = useState(false);
  const [statementEmails, setStatementEmails] = useState<any[]>([]);
  const [parsingEmailId, setParsingEmailId] = useState<string | null>(null);
  const [parsedFromEmail, setParsedFromEmail] = useState<{ transactions: any[]; bank: string; subject: string } | null>(null);
  const [importingParsed, setImportingParsed] = useState(false);
  const [pendingTxns, setPendingTxns] = useState<any[]>([]);
  const [autoIngesting, setAutoIngesting] = useState(false);
  const [showPendingQueue, setShowPendingQueue] = useState(false);
  const [linkingInvestmentId, setLinkingInvestmentId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setNewTxn(prev => ({ ...prev, date: new Date().toISOString().split('T')[0] }));
  }, []);

  // Fetchers
  const fetchAccounts = useCallback(async () => {
    try { const r = await fetch('/api/finance/accounts'); if (r.ok) setAccounts(await r.json()); } catch {}
  }, []);
  const fetchTransactions = useCallback(async () => {
    try { const r = await fetch('/api/transactions?limit=200'); if (r.ok) setTransactions(await r.json()); } catch {}
  }, []);
  const fetchInvestments = useCallback(async () => {
    try { const r = await fetch('/api/investments'); if (r.ok) { const d = await r.json(); setInvestments(d); return d; } } catch {} return [];
  }, []);
  const fetchSummary = useCallback(async () => {
    try { const r = await fetch('/api/finance-summary'); if (r.ok) setSummary(await r.json()); } catch {}
  }, []);
  const fetchBudgets = useCallback(async () => {
    try { const r = await fetch('/api/finance/budgets'); if (r.ok) setBudgets(await r.json()); } catch {}
  }, []);
  const fetchRules = useCallback(async () => {
    try { const r = await fetch('/api/finance/rules'); if (r.ok) setRules(await r.json()); } catch {}
  }, []);

  const fetchMarketPrices = useCallback(async (invList: any[]) => {
    const tickered = (invList ?? []).filter((i: any) => i?.ticker && MARKET_TYPES.includes(i?.type));
    if (!tickered.length) return;
    setLoadingPrices(true);
    try {
      const tickers = tickered.map((i: any) => ({ ticker: i.ticker, type: i.type }));
      const res = await fetch('/api/market', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tickers }) });
      if (res.ok) setMarketPrices(await res.json());
    } catch {} finally { setLoadingPrices(false); }
  }, []);

  const fetchTags = useCallback(async () => {
    try { const r = await fetch('/api/finance/tags'); if (r.ok) setAllTags(await r.json()); } catch {}
  }, []);

  const fetchPendingTxns = useCallback(async () => {
    try { const r = await fetch('/api/transactions?status=pending&limit=100'); if (r.ok) setPendingTxns(await r.json()); } catch {}
  }, []);

  const handleAutoIngest = async () => {
    setAutoIngesting(true);
    try {
      const r = await fetch('/api/finance/auto-ingest', { method: 'POST' });
      const d = await r.json();
      if (r.ok) {
        toast.success(d.summary || `Created ${d.created} transactions`);
        fetchTransactions(); fetchSummary(); fetchPendingTxns();
      } else {
        toast.error(d.error || 'Auto-ingest failed');
      }
    } catch { toast.error('Auto-ingest failed'); }
    finally { setAutoIngesting(false); }
  };

  const confirmPendingTxn = async (txnId: string, accountId: string) => {
    try {
      const r = await fetch(`/api/transactions/${txnId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, status: 'confirmed' }),
      });
      if (r.ok) {
        toast.success('Transaction confirmed');
        fetchPendingTxns(); fetchTransactions(); fetchSummary();
      }
    } catch { toast.error('Failed to confirm'); }
  };

  const linkInvestmentToAccount = async (investmentId: string, accountId: string) => {
    try {
      const r = await fetch(`/api/investments/${investmentId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      if (r.ok) {
        toast.success('Investment linked to account');
        setLinkingInvestmentId(null);
        fetchInvestments().then(fetchMarketPrices);
      }
    } catch { toast.error('Failed to link'); }
  };

  const autoLinkInvestments = async (silent = false) => {
    try {
      const r = await fetch('/api/finance/auto-link-investments', { method: 'POST' });
      if (r.ok) {
        const d = await r.json();
        if (!silent && d.linked > 0) toast.success(`Linked ${d.linked} holding${d.linked > 1 ? 's' : ''} to account${d.createdAccounts > 0 ? 's' : ''}`);
        if (d.linked > 0) { fetchAccounts(); fetchInvestments().then(fetchMarketPrices); fetchSummary(); }
      }
    } catch { if (!silent) toast.error('Failed to auto-link'); }
  };

  useEffect(() => {
    fetchAccounts(); fetchTransactions(); fetchSummary(); fetchBudgets(); fetchRules(); fetchTags(); fetchPendingTxns();
    fetchInvestments().then(inv => {
      if (inv?.length && !fetchedPricesRef.current) { fetchedPricesRef.current = true; fetchMarketPrices(inv); }
    });
  }, [fetchAccounts, fetchTransactions, fetchInvestments, fetchSummary, fetchBudgets, fetchRules, fetchTags, fetchMarketPrices, fetchPendingTxns]);

  // Actions
  const addAccount = async () => {
    if (!newAcct.name) return;
    try {
      const r = await fetch('/api/finance/accounts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAcct),
      });
      if (r.ok) { toast.success('Account added'); setShowAddAccount(false); setNewAcct({ name: '', type: 'bank', provider: 'manual', currency: 'SGD', balance: '', icon: '', apiCredentials: {} }); fetchAccounts(); }
    } catch { toast.error('Failed'); }
  };

  const deleteAccount = async (id: string) => {
    if (!confirm('Delete this account? Transactions will be unlinked.')) return;
    try {
      const r = await fetch(`/api/finance/accounts/${id}`, { method: 'DELETE' });
      if (r.ok) { toast.success('Deleted'); fetchAccounts(); if (selectedAccount?.id === id) setSelectedAccount(null); }
    } catch { toast.error('Failed'); }
  };

  const updateAccount = async () => {
    if (!editingAccount) return;
    try {
      const r = await fetch(`/api/finance/accounts/${editingAccount.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingAccount.name, type: editingAccount.type, currency: editingAccount.currency, balance: parseFloat(editingAccount.balance) || 0 }),
      });
      if (r.ok) {
        const updated = await r.json();
        toast.success('Account updated');
        setEditingAccount(null);
        setSelectedAccount(updated);
        fetchAccounts();
      } else toast.error('Update failed');
    } catch { toast.error('Failed'); }
  };

  const syncAccount = async (id: string) => {
    setSyncingId(id);
    try {
      const r = await fetch(`/api/finance/accounts/${id}/sync`, { method: 'POST' });
      const d = await r.json();
      if (r.ok) { toast.success(`Synced ${d.holdings} holdings`); fetchAccounts(); fetchInvestments().then(fetchMarketPrices); }
      else toast.error(d.error || 'Sync failed');
    } catch { toast.error('Sync failed'); } finally { setSyncingId(null); }
  };

  const addTransaction = async (forceCreate = false) => {
    if (!newTxn.amount) return;
    try {
      const r = await fetch('/api/transactions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newTxn, forceCreate }),
      });
      if (r.ok) { toast.success('Added'); setShowAddTxn(false); setNewTxn({ amount: '', type: 'expense', category: 'Other', note: '', date: new Date().toISOString().split('T')[0], accountId: '', investmentType: '', tags: [] }); fetchTransactions(); fetchSummary(); }
      else if (r.status === 409) {
        if (confirm('Duplicate transaction detected. A transaction with the same amount, date, and description already exists.\n\nAdd anyway?')) {
          addTransaction(true);
        }
      }
    } catch { toast.error('Failed'); }
  };

  const deleteTransaction = async (id: string) => {
    try {
      const r = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
      if (r.ok) { toast.success('Deleted'); fetchTransactions(); fetchSummary(); }
    } catch { toast.error('Failed'); }
  };

  const updateTransaction = async (id: string, data: any) => {
    try {
      const r = await fetch(`/api/transactions/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (r.ok) { toast.success('Updated'); fetchTransactions(); fetchSummary(); return true; }
    } catch { toast.error('Failed'); }
    return false;
  };

  const addBudget = async () => {
    if (!newBudget.amount) return;
    try {
      const r = await fetch('/api/finance/budgets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBudget),
      });
      if (r.ok) { toast.success('Budget set'); setShowAddBudget(false); setNewBudget({ category: 'Food & Dining', amount: '' }); fetchBudgets(); }
    } catch { toast.error('Failed'); }
  };

  const deleteBudget = async (id: string) => {
    try {
      const r = await fetch('/api/finance/budgets', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      if (r.ok) { toast.success('Removed'); fetchBudgets(); }
    } catch {}
  };

  const OPS_FOR_FIELD: Record<string, {value: string; label: string}[]> = {
    note: [
      { value: 'contains', label: 'contains' },
      { value: 'contains_phrase', label: 'contains phrase' },
      { value: 'equals', label: 'equals' },
      { value: 'starts_with', label: 'starts with' },
      { value: 'wildcard', label: 'matches wildcard' },
    ],
    amount: [
      { value: 'equals', label: '=' },
      { value: 'not_equals', label: '!=' },
      { value: 'gt', label: '>' },
      { value: 'gte', label: '>=' },
      { value: 'lt', label: '<' },
      { value: 'lte', label: '<=' },
    ],
    date: [
      { value: 'equals', label: '=' },
      { value: 'gt', label: '>' },
      { value: 'gte', label: '>=' },
      { value: 'lt', label: '<' },
      { value: 'lte', label: '<=' },
    ],
    account: [
      { value: 'equals', label: '=' },
      { value: 'not_equals', label: '!=' },
    ],
    type: [
      { value: 'equals', label: '=' },
      { value: 'not_equals', label: '!=' },
    ],
  };

  const ACTION_TYPES = [
    { value: 'tag', label: 'Add tags' },
    { value: 'category', label: 'Set category' },
    { value: 'set_description', label: 'Set description' },
    { value: 'remove_words', label: 'Remove words from description' },
    { value: 'set_type', label: 'Set type' },
    { value: 'set_transfer_source', label: 'Set transfer source account' },
    { value: 'set_transfer_destination', label: 'Set transfer destination account' },
  ];

  const resetRuleForm = () => {
    setRuleName('');
    setRuleConditions([{ field: 'note', op: 'contains', value: '' }]);
    setRuleActions([{ type: 'tag', value: '' }]);
    setApplyToPast(false);
  };

  const addRule = async () => {
    const validConditions = ruleConditions.filter(c => c.value.trim());
    const validActions = ruleActions.filter(a => a.value.trim());
    if (validConditions.length === 0 || validActions.length === 0) { toast.error('Need at least one filter and one action'); return; }
    const name = ruleName || validConditions[0].value.substring(0, 50);
    try {
      const r = await fetch('/api/finance/rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, conditions: validConditions, actions: validActions }),
      });
      if (r.ok) {
        toast.success('Rule added');
        setShowAddRule(false);
        resetRuleForm();
        fetchRules();
      } else toast.error('Failed to add rule');
    } catch { toast.error('Failed'); }
  };

  const importBulkRules = async () => {
    if (!bulkRulesText.trim()) return;
    setImportingRules(true);
    try {
      const r = await fetch('/api/finance/rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulkImport: true, bulkText: bulkRulesText }),
      });
      if (r.ok) {
        const d = await r.json();
        toast.success(`Imported ${d.imported} rules`);
        setBulkRulesText('');
        setShowBulkImport(false);
        fetchRules();
      } else {
        const err = await r.json().catch(() => null);
        toast.error(err?.error || 'Import failed');
      }
    } catch { toast.error('Import failed'); }
    setImportingRules(false);
  };

  const deleteRule = async (id: string) => {
    try {
      const r = await fetch('/api/finance/rules', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      if (r.ok) { toast.success('Rule removed'); fetchRules(); }
    } catch {}
  };

  const handleImport = async () => {
    if (!importData.text.trim()) return;
    try {
      const r = await fetch('/api/finance/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawCsv: importData.text, accountId: importData.accountId || null, useAi: true }),
      });
      if (r.ok) {
        const d = await r.json();
        const dupeMsg = d.skippedDupes > 0 ? ` (${d.skippedDupes} duplicates skipped)` : '';
        toast.success(`Imported ${d.imported} transactions${dupeMsg}`);
        setShowImport(false); setImportData({ text: '', accountId: '', format: 'auto' });
        fetchTransactions(); fetchSummary();
      } else {
        const err = await r.json().catch(() => null);
        toast.error(err?.error || 'Import failed');
      }
    } catch (e: any) { toast.error('Parse error: check CSV format'); }
  };

  const handleEmailScan = async () => {
    setEmailScanning(true);
    try {
      const r = await fetch('/api/finance/parse-statement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan' }),
      });
      if (r.ok) {
        const d = await r.json();
        setStatementEmails(d.emails || []);
        if (!d.emails?.length) toast.info('No statement emails found in inbox');
      } else toast.error('Failed to scan emails');
    } catch { toast.error('Email scan failed'); }
    setEmailScanning(false);
  };

  const handleParseEmail = async (emailId: string) => {
    setParsingEmailId(emailId);
    try {
      const r = await fetch('/api/finance/parse-statement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'parse', emailId }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.transactions?.length > 0) {
          setParsedFromEmail({ transactions: d.transactions, bank: d.bank, subject: d.emailSubject });
        } else toast.info('No transactions found in this email');
      } else {
        const err = await r.json().catch(() => null);
        toast.error(err?.error || 'Parse failed');
      }
    } catch { toast.error('Failed to parse email'); }
    setParsingEmailId(null);
  };

  const toggleEmailSelection = (id: string) => {
    setSelectedEmailIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllEmails = () => {
    if (selectedEmailIds.size === statementEmails.length) {
      setSelectedEmailIds(new Set());
    } else {
      setSelectedEmailIds(new Set(statementEmails.map(e => e.id)));
    }
  };

  const handleBulkEmailImport = async () => {
    if (selectedEmailIds.size === 0) return;
    setBulkParsing(true);
    let totalImported = 0;
    let failCount = 0;
    for (const emailId of Array.from(selectedEmailIds)) {
      try {
        // Parse
        const parseRes = await fetch('/api/finance/parse-statement', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'parse', emailId }),
        });
        if (!parseRes.ok) { failCount++; continue; }
        const parsed = await parseRes.json();
        if (!parsed.transactions?.length) continue;
        // Import
        const txns = parsed.transactions.map((t: any) => ({
          amount: t.amount, date: t.date, note: t.description, type: t.type, category: t.category,
        }));
        const importRes = await fetch('/api/finance/import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactions: txns, accountId: importData.accountId || null, useAi: false }),
        });
        if (importRes.ok) {
          const d = await importRes.json();
          totalImported += d.imported || 0;
        } else { failCount++; }
      } catch { failCount++; }
    }
    setBulkParsing(false);
    if (totalImported > 0) {
      toast.success(`Imported ${totalImported} transactions from ${selectedEmailIds.size} emails${failCount > 0 ? ` (${failCount} failed)` : ''}`);
      setSelectedEmailIds(new Set());
      setStatementEmails([]);
      setShowImport(false);
      fetchTransactions(); fetchSummary();
    } else {
      toast.error(failCount > 0 ? 'Failed to parse emails' : 'No transactions found in selected emails');
    }
  };

  const handleImportParsed = async () => {
    if (!parsedFromEmail?.transactions.length) return;
    setImportingParsed(true);
    try {
      const txns = parsedFromEmail.transactions.map(t => ({
        amount: t.amount, date: t.date, note: t.description, type: t.type, category: t.category,
      }));
      const r = await fetch('/api/finance/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: txns, accountId: importData.accountId || null, useAi: false }),
      });
      if (r.ok) {
        const d = await r.json();
        toast.success(`Imported ${d.imported} transactions from ${parsedFromEmail.bank}`);
        setParsedFromEmail(null); setStatementEmails([]);
        setShowImport(false); fetchTransactions(); fetchSummary();
      } else toast.error('Import failed');
    } catch { toast.error('Import failed'); }
    setImportingParsed(false);
  };

  // Computed
  const getInvestmentValue = useCallback((inv: any): number => {
    if (inv?.ticker && marketPrices[inv.ticker] && (inv?.quantity ?? 0) > 0) return marketPrices[inv.ticker].price * inv.quantity;
    return inv?.value ?? 0;
  }, [marketPrices]);

  // Compute account balances from transactions
  const computedBalances = useMemo(() => {
    const map: Record<string, number> = {};
    (accounts ?? []).forEach(a => { map[a.id] = a.balance || 0; });
    // Override bank/cash/credit with sum of transactions
    (transactions ?? []).forEach((t: any) => {
      if (!t.accountId || !map.hasOwnProperty(t.accountId)) return;
      const acct = (accounts ?? []).find(a => a.id === t.accountId);
      if (!acct || acct.type === 'investment' || acct.type === 'crypto') return;
      // Initialize from 0 if first txn
      if (map[t.accountId] === (acct.balance || 0)) map[t.accountId] = 0; // reset on first encounter — we'll recompute
    });
    // Full recompute for linked accounts
    const linkedAcctIds = new Set<string>();
    (transactions ?? []).forEach((t: any) => { if (t.accountId) linkedAcctIds.add(t.accountId); });
    linkedAcctIds.forEach(id => {
      const acct = (accounts ?? []).find(a => a.id === id);
      if (!acct || acct.type === 'investment' || acct.type === 'crypto') return;
      const acctTxns = (transactions ?? []).filter(t => t.accountId === id);
      const sum = acctTxns.reduce((s: number, t: any) => {
        if (t.type === 'income') return s + t.amount;
        if (t.type === 'expense') return s - t.amount;
        return s; // transfers don't affect balance
      }, 0);
      map[id] = sum;
    });
    return map;
  }, [accounts, transactions]);

  const getAccountBalance = useCallback((acct: any) => {
    return computedBalances[acct.id] ?? acct.balance ?? 0;
  }, [computedBalances]);

  const netWorth = useMemo(() => {
    const investmentTotal = (investments ?? []).reduce((s: number, i: any) => s + getInvestmentValue(i), 0);
    const accountBalances = (accounts ?? []).filter(a => a.type === 'bank' || a.type === 'cash').reduce((s: number, a: any) => s + getAccountBalance(a), 0);
    const creditDebt = (accounts ?? []).filter(a => a.type === 'credit').reduce((s: number, a: any) => s + Math.abs(getAccountBalance(a)), 0);
    return investmentTotal + accountBalances - creditDebt;
  }, [investments, accounts, getInvestmentValue, getAccountBalance]);

  const monthIncome = summary?.monthIncome ?? 0;
  const monthExpense = summary?.monthExpense ?? 0;
  const savingsRate = monthIncome > 0 ? ((monthIncome - monthExpense) / monthIncome) * 100 : 0;
  const totalGain = useMemo(() => (investments ?? []).reduce((s: number, i: any) => s + (getInvestmentValue(i) - (i?.costBasis ?? 0)), 0), [investments, getInvestmentValue]);

  const categoryData = useMemo(() => {
    const map = summary?.categoryBreakdown ?? {};
    return Object.entries(map).map(([name, value]: [string, any]) => ({ name, value: parseFloat(Number(value).toFixed(2)) })).sort((a: any, b: any) => b.value - a.value);
  }, [summary]);

  const platformData = useMemo(() => {
    const map: Record<string, number> = {};
    (investments ?? []).forEach((i: any) => { const val = getInvestmentValue(i); map[i.platform] = (map[i.platform] ?? 0) + val; });
    return Object.entries(map).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }));
  }, [investments, getInvestmentValue]);

  const monthlyTrend = summary?.monthlyTrend ?? [];

  const filteredTxns = useMemo(() => {
    let txns = transactions ?? [];
    if (searchTxn) txns = txns.filter(t => (t.note || '').toLowerCase().includes(searchTxn.toLowerCase()) || (t.category || '').toLowerCase().includes(searchTxn.toLowerCase()));
    if (filterCategory) txns = txns.filter(t => t.category === filterCategory);
    if (selectedAccount) txns = txns.filter(t => t.accountId === selectedAccount.id);
    // Sort
    txns = [...txns].sort((a, b) => {
      switch (txnSort) {
        case 'date_asc': return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'amount_desc': return b.amount - a.amount;
        case 'amount_asc': return a.amount - b.amount;
        default: return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
    });
    return txns;
  }, [transactions, searchTxn, filterCategory, selectedAccount, txnSort]);

  const accountInvestments = useMemo(() => {
    if (!selectedAccount) return investments ?? [];
    return (investments ?? []).filter(i => i.accountId === selectedAccount.id);
  }, [investments, selectedAccount]);

  const fmt = (n: number) => mounted ? (hideBalances ? '•••••' : n.toLocaleString('en-SG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })) : '0';
  const fmt2 = (n: number) => mounted ? (hideBalances ? '•••' : n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : '0.00';

  const TABS = [
    { key: 'accounts' as const, label: 'Accounts', icon: Wallet },
    { key: 'transactions' as const, label: 'Txns', icon: FileText },
    { key: 'budgets' as const, label: 'Budgets', icon: PiggyBank },
    { key: 'reports' as const, label: 'Reports', icon: BarChart3 },
    { key: 'settings' as const, label: 'Rules', icon: Settings2 },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold tracking-tight">Finance</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{mounted ? new Date().toLocaleDateString('en-SG', { month: 'long', year: 'numeric' }) : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setHideBalances(!hideBalances)} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground">
            {hideBalances ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <Button size="sm" onClick={() => setShowAddTxn(true)}><Plus className="w-4 h-4 mr-1" /> Add</Button>
        </div>
      </div>

      {/* Net Worth Hero */}
      <div className="game-card p-5 bg-gradient-to-br from-primary/5 to-primary/10">
        <p className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Net Worth</p>
        <p className="text-3xl font-display font-bold mt-1">${fmt(netWorth)}</p>
        <div className="flex gap-4 mt-3">
          <div>
            <p className="text-[10px] text-muted-foreground">This Month</p>
            <p className="text-sm font-mono"><span className="text-green-600">+${fmt(monthIncome)}</span> / <span className="text-red-500">-${fmt(monthExpense)}</span></p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Savings Rate</p>
            <p className={`text-sm font-mono font-semibold ${savingsRate >= 20 ? 'text-green-600' : 'text-amber-500'}`}>{mounted && !hideBalances ? `${savingsRate.toFixed(0)}%` : '•••'}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Portfolio P&L</p>
            <p className={`text-sm font-mono font-semibold ${totalGain >= 0 ? 'text-green-600' : 'text-red-500'}`}>{totalGain >= 0 ? '+' : ''}${fmt(totalGain)}</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-0.5 bg-secondary/50 rounded-xl p-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setActiveTab(t.key); setSelectedAccount(null); }}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-all
              ${activeTab === t.key ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <t.icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ==================== ACCOUNTS TAB ==================== */}
      {activeTab === 'accounts' && !selectedAccount && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{accounts.length} Accounts</span>
            <Button variant="outline" size="sm" onClick={() => setShowAddAccount(true)}><Plus className="w-3.5 h-3.5 mr-1" /> Account</Button>
          </div>

          {accounts.length === 0 && (
            <div className="game-card p-8 text-center">
              <Wallet className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">No accounts yet. Add your first account.</p>
              <Button size="sm" onClick={() => setShowAddAccount(true)}><Plus className="w-4 h-4 mr-1" /> Add Account</Button>
            </div>
          )}

          {accounts.map((acct: any) => {
            const Icon = ACCOUNT_ICONS[acct.type] || Wallet;
            const acctInvestments = (investments ?? []).filter(i => i.accountId === acct.id);
            const invTotal = acctInvestments.reduce((s: number, i: any) => s + getInvestmentValue(i), 0);
            const displayBalance = acct.type === 'investment' || acct.type === 'crypto' ? invTotal || acct.balance : getAccountBalance(acct);
            const holdingsCount = acctInvestments.length;
            const hasApi = acct.apiConfig === '***';

            return (
              <button key={acct.id} onClick={() => setSelectedAccount(acct)}
                className="game-card p-4 w-full text-left hover:ring-2 hover:ring-primary/20 transition-all">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${acct.type === 'credit' ? 'bg-red-50 dark:bg-red-900/20' : 'bg-primary/10'}`}>
                    <Icon className={`w-5 h-5 ${acct.type === 'credit' ? 'text-red-500' : 'text-primary'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate">{acct.name}</p>
                      {hasApi && <Shield className="w-3 h-3 text-primary flex-shrink-0" />}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {acct.type === 'credit' ? 'Credit Card' : acct.type.charAt(0).toUpperCase() + acct.type.slice(1)}
                      {holdingsCount > 0 && ` · ${holdingsCount} holdings`}
                      {acct.lastSynced && ` · Synced ${new Date(acct.lastSynced).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-mono font-bold text-base ${acct.type === 'credit' ? 'text-red-500' : ''}`}>
                      {acct.type === 'credit' ? '-' : ''}${fmt(displayBalance)}
                    </p>
                    <p className="text-[9px] text-muted-foreground">{acct.currency}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                </div>
              </button>
            );
          })}

          {/* Unlinked investments — link to account action */}
          {(() => {
            const unlinked = (investments ?? []).filter(i => !i.accountId);
            if (unlinked.length === 0) return null;
            const total = unlinked.reduce((s: number, i: any) => s + getInvestmentValue(i), 0);
            return (
              <div className="game-card p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0">
                    <Link2 className="w-5 h-5 text-amber-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">Unlinked Holdings</p>
                    <p className="text-[10px] text-muted-foreground">{unlinked.length} investment{unlinked.length > 1 ? 's' : ''} — link to an account</p>
                  </div>
                  <p className="font-mono font-bold">${fmt(total)}</p>
                </div>
                <Button variant="default" size="sm" onClick={() => autoLinkInvestments(false)} className="w-full text-xs h-8">
                  <Sparkles className="w-3 h-3 mr-1" /> Auto-link all to matching accounts
                </Button>
                {unlinked.map((inv: any) => (
                  <div key={inv.id} className="flex items-center gap-2 pl-13 ml-13">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{inv.assetName} {inv.ticker ? `(${inv.ticker})` : ''}</p>
                      <p className="text-[10px] text-muted-foreground">{inv.platform} · ${fmt(getInvestmentValue(inv))}</p>
                    </div>
                    {linkingInvestmentId === inv.id ? (
                      <select
                        autoFocus
                        onChange={e => { if (e.target.value) linkInvestmentToAccount(inv.id, e.target.value); else setLinkingInvestmentId(null); }}
                        onBlur={() => setLinkingInvestmentId(null)}
                        className="h-7 rounded-md border border-input bg-background px-2 text-[11px] max-w-[160px]"
                      >
                        <option value="">Select account...</option>
                        {accounts.filter(a => a.type === 'investment' || a.type === 'crypto').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        {accounts.filter(a => a.type !== 'investment' && a.type !== 'crypto').map(a => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                      </select>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setLinkingInvestmentId(inv.id)} className="text-xs h-7">
                        <Link2 className="w-3 h-3 mr-1" /> Link
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Account Detail View */}
      {activeTab === 'accounts' && selectedAccount && (
        <div className="space-y-3">
          <button onClick={() => setSelectedAccount(null)} className="text-xs text-primary hover:underline flex items-center gap-1">
            ← Back to Accounts
          </button>
          <div className="game-card p-4">
            {editingAccount ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Edit Account</h3>
                  <button onClick={() => setEditingAccount(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
                </div>
                <Input placeholder="Account name" value={editingAccount.name}
                  onChange={(e: any) => setEditingAccount((a: any) => ({ ...a, name: e.target.value }))} />
                <div className="grid grid-cols-2 gap-2">
                  <select value={editingAccount.type} onChange={(e: any) => setEditingAccount((a: any) => ({ ...a, type: e.target.value }))}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                    <option value="bank">Bank</option><option value="credit">Credit Card</option>
                    <option value="investment">Investment</option><option value="crypto">Crypto</option><option value="cash">Cash</option>
                  </select>
                  <Input type="number" placeholder="Balance" value={editingAccount.balance}
                    onChange={(e: any) => setEditingAccount((a: any) => ({ ...a, balance: e.target.value }))} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={updateAccount} className="flex-1">Save</Button>
                  <Button variant="outline" size="sm" onClick={() => setEditingAccount(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display font-bold">{selectedAccount.name}</h3>
                  <p className="text-xs text-muted-foreground capitalize">{selectedAccount.type} · {selectedAccount.currency}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditingAccount({ ...selectedAccount, balance: String(selectedAccount.balance ?? 0) })}><Pencil className="w-3.5 h-3.5" /></Button>
                  {selectedAccount.apiConfig === '***' && (
                    <Button variant="outline" size="sm" disabled={syncingId === selectedAccount.id} onClick={() => syncAccount(selectedAccount.id)}>
                      {syncingId === selectedAccount.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      <span className="ml-1">Sync</span>
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => deleteAccount(selectedAccount.id)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
                </div>
              </div>
            )}
          </div>

          {/* Holdings */}
          {accountInvestments.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Holdings</span>
              {accountInvestments.map((inv: any) => {
                const livePrice = inv?.ticker ? marketPrices[inv.ticker] : null;
                const currentVal = getInvestmentValue(inv);
                const gain = currentVal - (inv?.costBasis ?? 0);
                const gainPct = (inv?.costBasis ?? 0) > 0 ? (gain / inv.costBasis) * 100 : 0;
                return (
                  <div key={inv.id} className="game-card p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate">{inv.assetName}</p>
                          {inv.ticker && <span className="text-[10px] font-mono bg-secondary px-1.5 py-0.5 rounded">{inv.ticker}</span>}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {inv.quantity > 0 && livePrice ? `${inv.quantity} × $${fmt2(livePrice.price)}` : inv.type}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm font-semibold">${fmt2(currentVal)}</p>
                        <p className={`text-[10px] font-mono ${gain >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {gain >= 0 ? '+' : ''}{fmt2(gain)} ({mounted && !hideBalances ? gainPct.toFixed(1) : '0.0'}%)
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Transactions for this account */}
          {filteredTxns.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Transactions</span>
              {filteredTxns.slice(0, 20).map((t: any) => (
                <TxnRow key={t.id} t={t} mounted={mounted} hideBalances={hideBalances} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== TRANSACTIONS TAB ==================== */}
      {activeTab === 'transactions' && (
        <div className="space-y-3">
          {/* Auto-Ingest + Pending Banner */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleAutoIngest} disabled={autoIngesting} className="flex-shrink-0">
              {autoIngesting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
              {autoIngesting ? 'Scanning...' : 'Auto-Ingest Emails'}
            </Button>
            {pendingTxns.length > 0 && (
              <button
                onClick={() => setShowPendingQueue(!showPendingQueue)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
              >
                <Clock className="w-3.5 h-3.5" />
                {pendingTxns.length} Pending Review
                <ChevronDown className={`w-3 h-3 transition-transform ${showPendingQueue ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>

          {/* Pending Review Queue */}
          {showPendingQueue && pendingTxns.length > 0 && (
            <div className="game-card p-3 border-l-4 border-l-amber-400 space-y-2">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Pending Review — assign an account and confirm</p>
              {pendingTxns.map((t: any) => (
                <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.note || t.category}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {mounted ? new Date(t.date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }) : ''} · ${(t.amount ?? 0).toFixed(2)} · {t.category}
                      {t.matchConfidence != null && <span className="ml-1 text-amber-600">({Math.round(t.matchConfidence * 100)}% match)</span>}
                    </p>
                  </div>
                  <select
                    defaultValue={t.accountId || ''}
                    onChange={e => confirmPendingTxn(t.id, e.target.value)}
                    className="h-7 rounded-md border border-input bg-background px-2 text-[11px] max-w-[140px]"
                  >
                    <option value="">Assign account...</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <button onClick={() => { if (confirm('Delete this pending transaction?')) deleteTransaction(t.id).then(() => fetchPendingTxns()); }} className="p-1 text-muted-foreground hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Search + Sort + Import */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="Search transactions..." value={searchTxn} onChange={e => setSearchTxn(e.target.value)} className="pl-9 h-9 text-sm" />
            </div>
            <select
              value={txnSort}
              onChange={e => setTxnSort(e.target.value as any)}
              className="h-9 rounded-lg border border-input bg-background px-2 text-[11px] text-muted-foreground"
            >
              <option value="date_desc">Newest</option>
              <option value="date_asc">Oldest</option>
              <option value="amount_desc">Highest $</option>
              <option value="amount_asc">Lowest $</option>
            </select>
            <Button variant="outline" size="sm" onClick={() => setShowImport(true)}><Upload className="w-3.5 h-3.5 mr-1" /> Import</Button>
          </div>

          {/* Category filter chips */}
          {filterCategory && (
            <button onClick={() => setFilterCategory('')} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full flex items-center gap-1">
              {filterCategory} <X className="w-3 h-3" />
            </button>
          )}

          {filteredTxns.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No transactions found</p>}

          {/* Grouped by date */}
          {(() => {
            const groups: Record<string, any[]> = {};
            filteredTxns.forEach(t => {
              const key = mounted ? new Date(t.date).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
              if (!groups[key]) groups[key] = [];
              groups[key].push(t);
            });
            return Object.entries(groups).map(([date, txns]) => (
              <div key={date}>
                <p className="text-[10px] font-mono uppercase text-muted-foreground mb-1.5 mt-2">{date}</p>
                <div className="space-y-1.5">
                  {txns.map((t: any) => (
                    <TxnRow key={t.id} t={t} mounted={mounted} hideBalances={hideBalances} onCategoryClick={c => setFilterCategory(c)} onEdit={txn => setEditingTxn(txn)} onDelete={id => deleteTransaction(id)} />
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      {/* ==================== BUDGETS TAB ==================== */}
      {activeTab === 'budgets' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Monthly Budgets</span>
            <Button variant="outline" size="sm" onClick={() => setShowAddBudget(true)}><Plus className="w-3.5 h-3.5 mr-1" /> Budget</Button>
          </div>

          {budgets.length === 0 && (
            <div className="game-card p-8 text-center">
              <PiggyBank className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">No budgets set. Track your spending by category.</p>
              <Button size="sm" onClick={() => setShowAddBudget(true)}><Plus className="w-4 h-4 mr-1" /> Set Budget</Button>
            </div>
          )}

          {budgets.map((b: any) => {
            const pct = b.pct || 0;
            const over = pct > 100;
            return (
              <div key={b.id} className="game-card p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{b.category}</p>
                    {over && <span className="text-[9px] bg-red-100 dark:bg-red-900/30 text-red-600 px-1.5 py-0.5 rounded-full font-mono">Over budget!</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono">
                      <span className={over ? 'text-red-500' : ''}>${fmt(b.spent)}</span>
                      <span className="text-muted-foreground"> / ${fmt(b.amount)}</span>
                    </span>
                    <button onClick={() => deleteBudget(b.id)} className="text-muted-foreground hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${over ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-primary'}`}
                    style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                  {over ? `$${fmt(Math.abs(b.remaining))} over` : `$${fmt(b.remaining)} remaining`}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* ==================== REPORTS TAB ==================== */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="game-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-primary" />
              <span className="text-xs font-display font-semibold">Cashflow Trend (6 months)</span>
            </div>
            <div className="h-52"><CashflowChart data={monthlyTrend} /></div>
          </div>
          <div className="game-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <PieChartIcon className="w-4 h-4 text-primary" />
              <span className="text-xs font-display font-semibold">Spending by Category</span>
            </div>
            <div className="h-52"><SpendingChart data={categoryData} /></div>
          </div>
          {platformData.length > 0 && (
            <div className="game-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Wallet className="w-4 h-4 text-primary" />
                <span className="text-xs font-display font-semibold">Portfolio by Platform</span>
              </div>
              <div className="h-52"><AllocationChart data={platformData} /></div>
            </div>
          )}
          <div className="game-card p-4">
            <span className="text-xs font-display font-semibold block mb-3">Quick Stats</span>
            <div className="space-y-2.5">
              {[
                { l: 'Monthly Net', v: monthIncome - monthExpense, color: (monthIncome - monthExpense) >= 0 },
                { l: 'YTD Income', v: summary?.ytdIncome ?? 0, color: true },
                { l: 'YTD Expenses', v: summary?.ytdExpense ?? 0, color: false },
                { l: 'Total Cost Basis', v: summary?.totalCostBasis ?? 0, color: null },
                { l: 'Holdings Count', v: investments.length, color: null, raw: true },
              ].map(s => (
                <div key={s.l} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{s.l}</span>
                  <span className={`font-mono font-bold ${s.color === true ? 'text-green-600' : s.color === false ? 'text-red-500' : ''}`}>
                    {s.raw ? s.v : `$${fmt(s.v)}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================== RULES/SETTINGS TAB ==================== */}
      {activeTab === 'settings' && (
        <div className="space-y-4">
          {/* Transaction Rules */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Transaction Rules ({rules.length})</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowBulkImport(true)}><Upload className="w-3.5 h-3.5 mr-1" /> Import</Button>
              <Button variant="outline" size="sm" onClick={() => setShowAddRule(true)}><Plus className="w-3.5 h-3.5 mr-1" /> Rule</Button>
            </div>
          </div>
          {rules.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No rules yet. Rules auto-categorize imported transactions.</p>}
          {rules.map((r: any) => {
            const conditions = (r.conditions as any[]) || [];
            const actions = (r.actions as any[]) || [];
            const FIELD_LABELS: Record<string, string> = { note: 'Description', amount: 'Amount', date: 'Date', account: 'Account', type: 'Type', category: 'Category' };
            const OP_LABELS: Record<string, string> = { contains: 'contains', contains_phrase: 'contains phrase', equals: '=', not_equals: '!=', starts_with: 'starts with', wildcard: 'wildcard', gt: '>', gte: '>=', lt: '<', lte: '<=' };
            const ACT_LABELS: Record<string, string> = { tag: 'Add tags', category: 'Set category', set_description: 'Set description', remove_words: 'Remove words', set_type: 'Set type', set_transfer_source: 'Transfer from', set_transfer_destination: 'Transfer to', set_status: 'Set status' };
            return (
              <div key={r.id} className="game-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    <div className="space-y-0.5 mt-1">
                      {conditions.map((c: any, ci: number) => (
                        <p key={ci} className="text-[10px] text-muted-foreground">
                          <span className="font-medium text-foreground/70">{FIELD_LABELS[c.field] || c.field}</span>{' '}
                          <span className="italic">{OP_LABELS[c.op] || c.op}</span>{' '}
                          <span className="font-mono bg-secondary px-1 rounded">{c.value}</span>
                        </p>
                      ))}
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px] text-primary">→</span>
                        {actions.map((a: any, ai: number) => (
                          <span key={ai} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                            {ACT_LABELS[a.type] || a.type}: {a.value}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => deleteRule(r.id)} className="text-muted-foreground hover:text-red-500 flex-shrink-0 mt-1"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            );
          })}

          {/* Import section */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Import Transactions</span>
              <Button variant="outline" size="sm" onClick={() => setShowImport(true)}><Upload className="w-3.5 h-3.5 mr-1" /> CSV / Email</Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Smart CSV import + email statement scanning. Rules are auto-applied on import. Duplicate transactions are automatically detected and skipped.</p>
          </div>
        </div>
      )}

      {/* Bulk Import Rules Modal */}
      {showBulkImport && (
        <Modal onClose={() => setShowBulkImport(false)} title="Import Rules from Buxfer">
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Paste your rules from Buxfer. Each line should contain a filter and action separated by tabs. Supported formats:</p>
            <div className="bg-secondary/50 rounded-lg p-2.5 text-[10px] font-mono text-muted-foreground space-y-1">
              <p>Description contains phrase\tGrab\tAdd tags\tTransport</p>
              <p>Description contains\tMcdonalds\tAdd tags\tFood</p>
              <p>Description contains phrase\tCcc - 5425...\tSet type\tTransfer</p>
            </div>
            <textarea rows={12} placeholder="Paste Buxfer rules here…"
              value={bulkRulesText} onChange={e => setBulkRulesText(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-mono" />
            <p className="text-[10px] text-muted-foreground">💡 Supports: contains, contains phrase, equals, starts with, wildcard · Add tags, Set category, Set type, Set description, Remove words, Transfer accounts</p>
            <Button onClick={importBulkRules} className="w-full" disabled={!bulkRulesText.trim() || importingRules}>
              {importingRules ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Importing...</> : <><Upload className="w-4 h-4 mr-1" /> Import Rules</>}
            </Button>
          </div>
        </Modal>
      )}

      {/* ==================== MODALS ==================== */}

      {/* Add Account Modal */}
      {showAddAccount && (
        <Modal onClose={() => setShowAddAccount(false)} title="Add Account">
          <div className="space-y-3">
            {/* Provider quick-pick */}
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map(p => (
                <button key={p.id} onClick={() => setNewAcct(prev => ({ ...prev, provider: p.id, name: p.label !== 'Manual' ? p.label : prev.name, type: p.type || prev.type }))}
                  className={`p-2.5 rounded-xl border text-left transition-all text-xs
                    ${newAcct.provider === p.id ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30'}`}>
                  <p className="font-medium">{p.label}</p>
                  <p className="text-[10px] text-muted-foreground">{p.desc}</p>
                </button>
              ))}
            </div>

            <Input placeholder="Account name" value={newAcct.name} onChange={e => setNewAcct({ ...newAcct, name: e.target.value })} />
            <select value={newAcct.type} onChange={e => setNewAcct({ ...newAcct, type: e.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
              <option value="bank">Bank Account</option>
              <option value="credit">Credit Card</option>
              <option value="investment">Investment</option>
              <option value="crypto">Crypto</option>
              <option value="cash">Cash</option>
            </select>

            {(newAcct.type === 'bank' || newAcct.type === 'cash' || newAcct.type === 'credit') && (
              <Input type="number" placeholder="Current balance" value={newAcct.balance} onChange={e => setNewAcct({ ...newAcct, balance: e.target.value })} />
            )}

            {/* API credentials for supported providers */}
            {newAcct.provider === 'tiger' && (
              <div className="space-y-2 p-3 bg-secondary/50 rounded-xl">
                <p className="text-xs font-semibold">Tiger Brokers API</p>
                <p className="text-[10px] text-muted-foreground">Get from developer.tigerbrokers.com.sg</p>
                <Input placeholder="Client ID (tiger_id)" onChange={e => setNewAcct(prev => ({ ...prev, apiCredentials: { ...prev.apiCredentials, clientId: e.target.value } }))} />
                <textarea placeholder="RSA Private Key" rows={3} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-mono" onChange={e => setNewAcct(prev => ({ ...prev, apiCredentials: { ...prev.apiCredentials, privateKey: e.target.value } }))} />
                <Input placeholder="Account ID" onChange={e => setNewAcct(prev => ({ ...prev, apiCredentials: { ...prev.apiCredentials, account: e.target.value } }))} />
              </div>
            )}
            {newAcct.provider === 'crypto_com' && (
              <div className="space-y-2 p-3 bg-secondary/50 rounded-xl">
                <p className="text-xs font-semibold">Crypto.com Exchange API</p>
                <p className="text-[10px] text-muted-foreground">Generate read-only keys from Crypto.com Exchange → Settings → API</p>
                <Input placeholder="API Key" onChange={e => setNewAcct(prev => ({ ...prev, apiCredentials: { ...prev.apiCredentials, apiKey: e.target.value } }))} />
                <Input placeholder="API Secret" type="password" onChange={e => setNewAcct(prev => ({ ...prev, apiCredentials: { ...prev.apiCredentials, apiSecret: e.target.value } }))} />
              </div>
            )}

            <Button onClick={() => { addAccount(); }} className="w-full">Add Account</Button>
          </div>
        </Modal>
      )}

      {/* Add Transaction Modal */}
      {showAddTxn && (
        <Modal onClose={() => setShowAddTxn(false)} title="Add Transaction">
          <div className="space-y-3">
            <div className="flex gap-1 flex-wrap">
              {TXN_TYPES.map(t => (
                <button key={t} onClick={() => setNewTxn({ ...newTxn, type: t, investmentType: t === 'investment' ? 'buy' : '' })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${newTxn.type === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                  {t === 'iou' ? 'IOU' : t === 'capital_gain' ? 'Cap Gain' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            {newTxn.type === 'investment' && (
              <select value={newTxn.investmentType || 'buy'} onChange={e => setNewTxn({ ...newTxn, investmentType: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                {INVESTMENT_SUBTYPES.map(s => <option key={s} value={s}>{s === 'capital_gain' ? 'Capital Gain' : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            )}
            <Input type="number" placeholder="Amount" value={newTxn.amount} onChange={e => setNewTxn({ ...newTxn, amount: e.target.value })} />
            <select value={newTxn.category} onChange={e => setNewTxn({ ...newTxn, category: e.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {accounts.length > 0 && (
              <select value={newTxn.accountId} onChange={e => setNewTxn({ ...newTxn, accountId: e.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                <option value="">No account</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            <Input type="date" value={newTxn.date} onChange={e => setNewTxn({ ...newTxn, date: e.target.value })} />
            <Input placeholder="Note (optional)" value={newTxn.note} onChange={e => setNewTxn({ ...newTxn, note: e.target.value })} />
            {/* Tags */}
            <TagPicker tags={allTags} selected={newTxn.tags} onChange={tags => setNewTxn({ ...newTxn, tags })} />
            <Button onClick={() => addTransaction()} className="w-full">Add</Button>
          </div>
        </Modal>
      )}

      {/* Edit Transaction Modal */}
      {editingTxn && (
        <Modal onClose={() => setEditingTxn(null)} title="Edit Transaction">
          <div className="space-y-3">
            <div className="flex gap-1 flex-wrap">
              {TXN_TYPES.map(t => (
                <button key={t} onClick={() => setEditingTxn({ ...editingTxn, type: t, investmentType: t === 'investment' ? (editingTxn.investmentType || 'buy') : null })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${editingTxn.type === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                  {t === 'iou' ? 'IOU' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            {editingTxn.type === 'investment' && (
              <select value={editingTxn.investmentType || 'buy'} onChange={e => setEditingTxn({ ...editingTxn, investmentType: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                {INVESTMENT_SUBTYPES.map(s => <option key={s} value={s}>{s === 'capital_gain' ? 'Capital Gain' : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            )}
            <Input type="number" placeholder="Amount" value={editingTxn.amount || ''} onChange={e => setEditingTxn({ ...editingTxn, amount: e.target.value })} />
            <select value={editingTxn.category} onChange={e => setEditingTxn({ ...editingTxn, category: e.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {accounts.length > 0 && (
              <select value={editingTxn.accountId || ''} onChange={e => setEditingTxn({ ...editingTxn, accountId: e.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                <option value="">No account</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            <Input type="date" value={editingTxn.date ? new Date(editingTxn.date).toISOString().split('T')[0] : ''} onChange={e => setEditingTxn({ ...editingTxn, date: e.target.value })} />
            <Input placeholder="Note" value={editingTxn.note || ''} onChange={e => setEditingTxn({ ...editingTxn, note: e.target.value })} />
            {/* Tags */}
            <TagPicker tags={allTags} selected={Array.isArray(editingTxn.tags) ? editingTxn.tags : []} onChange={tags => setEditingTxn({ ...editingTxn, tags })} />
            <div className="flex gap-2">
              <Button onClick={async () => { const ok = await updateTransaction(editingTxn.id, { amount: editingTxn.amount, type: editingTxn.type, investmentType: editingTxn.investmentType || null, category: editingTxn.category, accountId: editingTxn.accountId || null, date: editingTxn.date, note: editingTxn.note, tags: editingTxn.tags }); if (ok) setEditingTxn(null); }} className="flex-1">Save</Button>
              <Button variant="outline" onClick={() => { if (confirm('Delete this transaction?')) { deleteTransaction(editingTxn.id); setEditingTxn(null); } }} className="text-red-500 border-red-200 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
            </div>
            {/* Create Rule shortcut */}
            <button onClick={() => {
              const note = editingTxn.note || '';
              setRuleConditions([{ field: 'note', op: 'contains', value: note }]);
              setRuleActions([
                ...(editingTxn.category ? [{ type: 'category', value: editingTxn.category }] : []),
                ...(Array.isArray(editingTxn.tags) && editingTxn.tags.length ? [{ type: 'tag', value: editingTxn.tags.join(', ') }] : []),
              ]);
              setRuleName(`Rule: ${note.substring(0, 30)}`);
              setApplyToPast(true);
              setEditingTxn(null);
              setShowAddRule(true);
            }} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-primary/30 text-xs text-primary font-medium hover:bg-primary/5 transition-colors">
              <Zap className="w-3.5 h-3.5" /> Create Rule from this Transaction
            </button>
          </div>
        </Modal>
      )}

      {/* Add Budget Modal */}
      {showAddBudget && (
        <Modal onClose={() => setShowAddBudget(false)} title="Set Budget">
          <div className="space-y-3">
            <select value={newBudget.category} onChange={e => setNewBudget({ ...newBudget, category: e.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
              {CATEGORIES.filter(c => !c.startsWith('Income')).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <Input type="number" placeholder="Monthly budget amount" value={newBudget.amount} onChange={e => setNewBudget({ ...newBudget, amount: e.target.value })} />
            <Button onClick={addBudget} className="w-full">Set Budget</Button>
          </div>
        </Modal>
      )}

      {/* Add Rule Modal */}
      {showAddRule && (
        <Modal onClose={() => { setShowAddRule(false); resetRuleForm(); }} title="Add Rule">
          <div className="space-y-3">
            <Input placeholder="Rule name (optional — auto-generated from first filter)" value={ruleName} onChange={e => setRuleName(e.target.value)} className="text-sm" />

            {/* FILTERS */}
            <div className="p-3 bg-secondary/50 rounded-xl space-y-2">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">If transaction matches these filters</p>
              {ruleConditions.map((cond, idx) => {
                const ops = OPS_FOR_FIELD[cond.field] || OPS_FOR_FIELD['note'];
                return (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex gap-1.5 items-center">
                      <select value={cond.field} onChange={e => {
                        const newConds = [...ruleConditions];
                        const newField = e.target.value;
                        const newOps = OPS_FOR_FIELD[newField] || OPS_FOR_FIELD['note'];
                        newConds[idx] = { field: newField, op: newOps[0].value, value: '' };
                        setRuleConditions(newConds);
                      }} className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs min-w-0">
                        <option value="note">Description</option>
                        <option value="amount">Amount</option>
                        <option value="date">Date</option>
                        <option value="account">Account</option>
                        <option value="type">Type</option>
                      </select>
                      <select value={cond.op} onChange={e => {
                        const newConds = [...ruleConditions];
                        newConds[idx] = { ...cond, op: e.target.value };
                        setRuleConditions(newConds);
                      }} className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs min-w-0">
                        {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {cond.field === 'account' ? (
                        <select value={cond.value} onChange={e => {
                          const newConds = [...ruleConditions];
                          newConds[idx] = { ...cond, value: e.target.value };
                          setRuleConditions(newConds);
                        }} className="flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-xs min-w-0">
                          <option value="">Select…</option>
                          {accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                        </select>
                      ) : cond.field === 'type' ? (
                        <select value={cond.value} onChange={e => {
                          const newConds = [...ruleConditions];
                          newConds[idx] = { ...cond, value: e.target.value };
                          setRuleConditions(newConds);
                        }} className="flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-xs min-w-0">
                          <option value="">Select…</option>
                          <option value="expense">Expense</option>
                          <option value="income">Income</option>
                          <option value="transfer">Transfer</option>
                        </select>
                      ) : (
                        <Input value={cond.value} onChange={e => {
                          const newConds = [...ruleConditions];
                          newConds[idx] = { ...cond, value: e.target.value };
                          setRuleConditions(newConds);
                        }} placeholder={cond.field === 'amount' ? '0.00' : cond.field === 'date' ? 'YYYY-MM-DD' : 'value'}
                          type={cond.field === 'amount' ? 'number' : cond.field === 'date' ? 'date' : 'text'}
                          className="flex-1 text-xs min-w-0" />
                      )}
                      {ruleConditions.length > 1 && (
                        <button onClick={() => setRuleConditions(ruleConditions.filter((_, j) => j !== idx))} className="text-muted-foreground hover:text-red-500 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  </div>
                );
              })}
              <button onClick={() => setRuleConditions([...ruleConditions, { field: 'note', op: 'contains', value: '' }])} className="text-[10px] text-primary hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Add filter</button>
            </div>

            {/* ACTIONS */}
            <div className="p-3 bg-secondary/50 rounded-xl space-y-2">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Then perform these actions</p>
              {ruleActions.map((act, idx) => (
                <div key={idx} className="flex gap-1.5 items-center">
                  <select value={act.type} onChange={e => {
                    const newActs = [...ruleActions];
                    newActs[idx] = { type: e.target.value, value: '' };
                    setRuleActions(newActs);
                  }} className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs min-w-0">
                    {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                  {act.type === 'category' ? (
                    <select value={act.value} onChange={e => {
                      const newActs = [...ruleActions];
                      newActs[idx] = { ...act, value: e.target.value };
                      setRuleActions(newActs);
                    }} className="flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-xs min-w-0">
                      <option value="">Select…</option>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : act.type === 'set_type' ? (
                    <select value={act.value} onChange={e => {
                      const newActs = [...ruleActions];
                      newActs[idx] = { ...act, value: e.target.value };
                      setRuleActions(newActs);
                    }} className="flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-xs min-w-0">
                      <option value="">Select…</option>
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                      <option value="transfer">Transfer</option>
                    </select>
                  ) : (act.type === 'set_transfer_source' || act.type === 'set_transfer_destination') ? (
                    <select value={act.value} onChange={e => {
                      const newActs = [...ruleActions];
                      newActs[idx] = { ...act, value: e.target.value };
                      setRuleActions(newActs);
                    }} className="flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-xs min-w-0">
                      <option value="">Select account…</option>
                      {accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                    </select>
                  ) : (
                    <Input value={act.value} onChange={e => {
                      const newActs = [...ruleActions];
                      newActs[idx] = { ...act, value: e.target.value };
                      setRuleActions(newActs);
                    }} placeholder={act.type === 'tag' ? 'Tag name' : act.type === 'remove_words' ? 'Words to remove' : 'Value'}
                      className="flex-1 text-xs min-w-0" />
                  )}
                  {ruleActions.length > 1 && (
                    <button onClick={() => setRuleActions(ruleActions.filter((_, j) => j !== idx))} className="text-muted-foreground hover:text-red-500 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              ))}
              <button onClick={() => setRuleActions([...ruleActions, { type: 'tag', value: '' }])} className="text-[10px] text-primary hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Add action</button>
            </div>

            <Button onClick={addRule} className="w-full">Add Rule</Button>
          </div>
        </Modal>
      )}

      {/* Import Modal */}
      {showImport && (
        <Modal onClose={() => { setShowImport(false); setParsedFromEmail(null); setStatementEmails([]); }} title="Import Transactions">
          <div className="space-y-3">
            {/* Tab switcher */}
            <div className="flex gap-1 p-1 bg-secondary rounded-lg">
              <button onClick={() => setImportTab('csv')} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${importTab === 'csv' ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                <FileText className="w-3.5 h-3.5" /> CSV Paste
              </button>
              <button onClick={() => setImportTab('email')} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${importTab === 'email' ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                <Mail className="w-3.5 h-3.5" /> From Email
              </button>
            </div>

            {/* Account selector — shared */}
            {accounts.length > 0 && (
              <select value={importData.accountId} onChange={e => setImportData({ ...importData, accountId: e.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                <option value="">Link to account (optional)</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}

            {/* CSV Tab */}
            {importTab === 'csv' && (
              <>
                <p className="text-xs text-muted-foreground">Paste CSV from DBS, Citibank SG, or generic format. AI auto-categorizes each transaction.</p>
                <textarea rows={8} placeholder={'Transaction Date,Reference,Debit Amount,Credit Amount,Ref1\n15/01/2025,,45.50,,"GRAB RIDE"'}
                  value={importData.text} onChange={e => setImportData({ ...importData, text: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-mono" />
                <p className="text-[10px] text-muted-foreground">💡 Auto-detects DBS / Citibank / generic formats. Rules + AI categorize transactions.</p>
                <Button onClick={handleImport} className="w-full" disabled={!importData.text.trim()}><Upload className="w-4 h-4 mr-1" /> Import & Categorize</Button>
              </>
            )}

            {/* Email Tab */}
            {importTab === 'email' && !parsedFromEmail && (
              <>
                <p className="text-xs text-muted-foreground">Scan your inbox for bank statement emails, then extract transactions with AI.</p>
                {statementEmails.length === 0 ? (
                  <Button onClick={handleEmailScan} className="w-full" variant="outline" disabled={emailScanning}>
                    {emailScanning ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Scanning inbox...</> : <><Inbox className="w-4 h-4 mr-1" /> Scan for Statement Emails</>}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium">{statementEmails.length} emails found</p>
                      <div className="flex items-center gap-2">
                        <button onClick={toggleAllEmails} className="text-[10px] text-primary hover:underline">
                          {selectedEmailIds.size === statementEmails.length ? 'Deselect all' : 'Select all'}
                        </button>
                        <button onClick={() => { setStatementEmails([]); setSelectedEmailIds(new Set()); handleEmailScan(); }} className="text-[10px] text-primary hover:underline">Re-scan</button>
                      </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-1.5 -mx-1 px-1">
                      {statementEmails.map(e => (
                        <div key={e.id} className="flex items-center gap-2">
                          <button onClick={() => toggleEmailSelection(e.id)} className="flex-shrink-0 p-0.5">
                            {selectedEmailIds.has(e.id)
                              ? <CheckSquare className="w-4 h-4 text-primary" />
                              : <Square className="w-4 h-4 text-muted-foreground/40" />}
                          </button>
                          <button onClick={() => handleParseEmail(e.id)} disabled={!!parsingEmailId || bulkParsing}
                            className="flex-1 text-left p-2.5 rounded-lg border border-input hover:bg-secondary/50 transition-colors disabled:opacity-50">
                            <div className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 text-xs font-bold ${e.bank === 'DBS' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : e.bank === 'Citibank' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                                {e.bank === 'DBS' ? 'D' : e.bank === 'Citibank' ? 'C' : '?'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{e.subject || 'No subject'}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{e.from} · {mounted ? new Date(e.date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</p>
                              </div>
                              {parsingEmailId === e.id ? <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                    {selectedEmailIds.size > 0 && (
                      <Button onClick={handleBulkEmailImport} className="w-full" disabled={bulkParsing}>
                        {bulkParsing
                          ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Parsing & importing...</>
                          : <><Upload className="w-4 h-4 mr-1" /> Import {selectedEmailIds.size} email{selectedEmailIds.size > 1 ? 's' : ''}</>}
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Parsed Email Review */}
            {importTab === 'email' && parsedFromEmail && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium">{parsedFromEmail.bank} Statement</p>
                    <p className="text-[10px] text-muted-foreground truncate">{parsedFromEmail.subject}</p>
                  </div>
                  <button onClick={() => setParsedFromEmail(null)} className="text-[10px] text-primary hover:underline">← Back</button>
                </div>
                <p className="text-xs text-muted-foreground">{parsedFromEmail.transactions.length} transactions extracted. Review and import:</p>
                <div className="max-h-56 overflow-y-auto space-y-1 -mx-1 px-1">
                  {parsedFromEmail.transactions.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50">
                      <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${t.type === 'income' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                        {t.type === 'income' ? <TrendingUp className="w-3 h-3 text-green-600" /> : <TrendingDown className="w-3 h-3 text-red-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium truncate">{t.description}</p>
                        <p className="text-[9px] text-muted-foreground">{t.category} · {t.date}</p>
                      </div>
                      <p className={`text-xs font-mono font-semibold flex-shrink-0 ${t.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                        {t.type === 'income' ? '+' : '-'}${t.amount.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
                <Button onClick={handleImportParsed} className="w-full" disabled={importingParsed}>
                  {importingParsed ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Importing...</> : <><Check className="w-4 h-4 mr-1" /> Import {parsedFromEmail.transactions.length} Transactions</>}
                </Button>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// Reusable Transaction Row
function TxnRow({ t, mounted, hideBalances, onCategoryClick, onEdit, onDelete }: { t: any; mounted: boolean; hideBalances: boolean; onCategoryClick?: (c: string) => void; onEdit?: (t: any) => void; onDelete?: (id: string) => void }) {
  const tc = TYPE_COLORS[t.type] || TYPE_COLORS.expense;
  const IconComp = tc.icon;
  const isPositive = ['income', 'refund', 'dividend'].includes(t.type) || (t.type === 'investment' && t.investmentType === 'sell');
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-card relative group" style={{ boxShadow: 'var(--shadow-sm)' }} onClick={() => onEdit?.(t)}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${tc.bg}`}>
        <IconComp className={`w-4 h-4 ${tc.text}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{t.note || t.category}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={e => { e.stopPropagation(); onCategoryClick?.(t.category); }} className="text-[10px] text-muted-foreground hover:text-primary">{t.category}</button>
          {t.type === 'investment' && t.investmentType && <span className="text-[9px] bg-purple-100 dark:bg-purple-900/30 text-purple-600 px-1.5 py-0.5 rounded-full">{t.investmentType === 'capital_gain' ? 'Cap Gain' : t.investmentType.charAt(0).toUpperCase() + t.investmentType.slice(1)}</span>}
          {t.type === 'iou' && <span className="text-[9px] bg-amber-100 dark:bg-amber-900/30 text-amber-600 px-1.5 py-0.5 rounded-full">IOU</span>}
          {t.status === 'pending' && <span className="text-[9px] bg-amber-100 dark:bg-amber-900/30 text-amber-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" /> Pending</span>}
          {t.source === 'email_ingest' && <span className="text-[9px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 px-1.5 py-0.5 rounded-full">Email</span>}
          {t.account && <span className="text-[10px] text-muted-foreground">· {t.account.name}</span>}
          {Array.isArray(t.tags) && t.tags.map((tag: string) => (
            <span key={tag} className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{tag}</span>
          ))}
        </div>
      </div>
      <div className="text-right flex-shrink-0 flex items-center gap-2">
        <div>
          <p className={`font-mono text-sm font-semibold ${isPositive ? 'text-green-600' : tc.text}`}>
            {isPositive ? '+' : '-'}${mounted ? (hideBalances ? '•••' : (t.amount ?? 0).toFixed(2)) : '0.00'}
          </p>
          <p className="text-[10px] text-muted-foreground">{mounted ? new Date(t.date ?? Date.now()).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }) : ''}</p>
        </div>
        <button onClick={e => { e.stopPropagation(); if (confirm('Delete this transaction?')) onDelete?.(t.id); }} className="opacity-0 group-hover:opacity-100 sm:opacity-0 active:opacity-100 p-1 text-muted-foreground hover:text-red-500 transition-opacity">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// Tag Picker component
function TagPicker({ tags, selected, onChange }: { tags: any[]; selected: string[]; onChange: (t: string[]) => void }) {
  const [search, setSearch] = useState('');
  const filtered = tags.filter(t => t.fullPath.toLowerCase().includes(search.toLowerCase()));
  const toggle = (fp: string) => {
    onChange(selected.includes(fp) ? selected.filter(s => s !== fp) : [...selected, fp]);
  };
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">Tags</label>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {selected.map(s => (
            <button key={s} onClick={() => toggle(s)} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
              {s} <X className="w-2.5 h-2.5" />
            </button>
          ))}
        </div>
      )}
      <Input placeholder="Search tags..." value={search} onChange={(e: any) => setSearch(e.target.value)} className="h-7 text-xs mb-1" />
      {(search || selected.length === 0) && filtered.length > 0 && (
        <div className="max-h-28 overflow-y-auto space-y-0.5">
          {filtered.map(t => (
            <button key={t.id} onClick={() => toggle(t.fullPath)}
              className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                selected.includes(t.fullPath) ? 'bg-primary/10 text-primary font-medium' : 'text-foreground/70 hover:bg-secondary/50'
              }`}>
              {t.parentId ? `└ ${t.fullPath}` : t.fullPath}
            </button>
          ))}
        </div>
      )}
      {tags.length === 0 && <p className="text-[10px] text-muted-foreground">No tags yet. Add tags in Settings → Finance.</p>}
    </div>
  );
}

// Modal component
function Modal({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-card rounded-t-2xl sm:rounded-xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()} style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold">{title}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
