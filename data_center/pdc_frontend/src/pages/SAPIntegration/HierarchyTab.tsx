import { useState, useMemo, useCallback } from 'react'
import { sapAPI } from '@/api/client'
import {
    RefreshCw, ChevronLeft, Download, Search,
    X, Loader2, FolderTree, FileText, Database, CheckSquare, Square,
} from 'lucide-react'

interface SapItem {
    parent_code: string
    code: string
    name_ar: string
    name_en: string
    level: number
    created_date: string | null
    attributes: { name: string; value: string }[]
}

interface SyncSummary {
    sap_total: number
    local_total: number
    to_create: number
    to_update: number
    unchanged: number
    created?: number
    updated?: number
}

interface SelectedSyncResult {
    selected_count: number
    total_synced: number
    ancestors_added: number
    created: number
    updated: number
    attributes_saved: number
}

type LanguageFilter = 'all' | 'ar_only' | 'en_only' | 'missing_ar'

interface Props {
    onSyncComplete?: () => void
}

export default function HierarchyTab({ onSyncComplete }: Props) {
    const [items, setItems] = useState<SapItem[]>([])
    const [levelCounts, setLevelCounts] = useState<Record<number, number>>({})
    const [totalCount, setTotalCount] = useState(0)
    const [fetching, setFetching] = useState(false)
    const [fetchError, setFetchError] = useState('')
    const [hasFetched, setHasFetched] = useState(false)

    const [search, setSearch] = useState('')
    const [levelFilter, setLevelFilter] = useState<number | null>(null)
    const [langFilter, setLangFilter] = useState<LanguageFilter>('all')
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [selectedCode, setSelectedCode] = useState<string | null>(null)
    const [selectedForSync, setSelectedForSync] = useState<Set<string>>(new Set())

    const [syncModal, setSyncModal] = useState(false)
    const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null)
    const [syncing, setSyncing] = useState(false)
    const [syncResult, setSyncResult] = useState<SyncSummary | null>(null)
    const [syncError, setSyncError] = useState('')

    const [selectedSyncModal, setSelectedSyncModal] = useState(false)
    const [selectedSyncResult, setSelectedSyncResult] = useState<SelectedSyncResult | null>(null)

    const handleFetch = useCallback(async () => {
        setFetching(true)
        setFetchError('')
        try {
            const { data } = await sapAPI.hierarchy()
            setItems(data.items || [])
            setLevelCounts(data.level_counts || {})
            setTotalCount(data.total || 0)
            setHasFetched(true)
            const l1 = new Set<string>()
            for (const it of (data.items || [])) if (it.level === 1) l1.add(it.code)
            setExpanded(l1)
        } catch (e: any) {
            setFetchError(e?.response?.data?.error || e?.response?.data?.detail || 'فشل جلب البيانات')
        } finally { setFetching(false) }
    }, [])

    const handleSyncPreview = useCallback(async () => {
        setSyncing(true); setSyncError(''); setSyncResult(null)
        try {
            const { data } = await sapAPI.syncHierarchy(true)
            setSyncSummary(data.summary); setSyncModal(true)
        } catch (e: any) {
            setSyncError(e?.response?.data?.error || 'فشل تحضير المزامنة')
        } finally { setSyncing(false) }
    }, [])

    const handleSyncConfirm = useCallback(async () => {
        setSyncing(true); setSyncError('')
        try {
            const { data } = await sapAPI.syncHierarchy(false)
            setSyncResult(data.summary)
            onSyncComplete?.()
        } catch (e: any) {
            setSyncError(e?.response?.data?.error || 'فشلت المزامنة')
        } finally { setSyncing(false) }
    }, [onSyncComplete])

    const handleSyncSelected = useCallback(async () => {
        setSyncing(true); setSyncError(''); setSelectedSyncResult(null)
        try {
            const { data } = await sapAPI.syncHierarchySelected(Array.from(selectedForSync))
            setSelectedSyncResult(data.summary)
            onSyncComplete?.()
        } catch (e: any) {
            setSyncError(e?.response?.data?.error || 'فشلت المزامنة')
        } finally { setSyncing(false) }
    }, [selectedForSync, onSyncComplete])

    const tree = useMemo(() => {
        const codeToChildren: Record<string, SapItem[]> = {}
        const codeToItem: Record<string, SapItem> = {}
        const roots: SapItem[] = []
        for (const it of items) {
            codeToItem[it.code] = it
            if (!it.parent_code || it.parent_code === it.code) roots.push(it)
            else {
                if (!codeToChildren[it.parent_code]) codeToChildren[it.parent_code] = []
                codeToChildren[it.parent_code].push(it)
            }
        }
        return { roots, codeToChildren, codeToItem }
    }, [items])

    const matchesLang = useCallback((it: SapItem): boolean => {
        switch (langFilter) {
            case 'ar_only': return !!(it.name_ar || '').trim()
            case 'en_only': return !!(it.name_en || '').trim()
            case 'missing_ar': return !(it.name_ar || '').trim()
            default: return true
        }
    }, [langFilter])

    const subtreeMatchCache = useMemo(() => {
        const cache: Record<string, boolean> = {}
        const itemMatchesSearch = (item: SapItem): boolean => {
            if (!matchesLang(item)) return false
            if (!search && levelFilter === null) return true
            if (levelFilter !== null && item.level !== levelFilter) return false
            if (!search) return true
            const q = search.toLowerCase()
            return item.code.toLowerCase().includes(q) ||
                (item.name_ar || '').toLowerCase().includes(q) ||
                (item.name_en || '').toLowerCase().includes(q)
        }
        const check = (code: string): boolean => {
            if (code in cache) return cache[code]
            const item = tree.codeToItem[code]
            if (!item) { cache[code] = false; return false }
            if (itemMatchesSearch(item)) { cache[code] = true; return true }
            const children = tree.codeToChildren[code] || []
            const result = children.some(c => check(c.code))
            cache[code] = result
            return result
        }
        for (const code of Object.keys(tree.codeToItem)) check(code)
        return cache
    }, [tree, search, levelFilter, matchesLang])

    const matchesSearch = useCallback((item: SapItem): boolean => {
        if (!matchesLang(item)) return false
        if (!search && levelFilter === null) return true
        if (levelFilter !== null && item.level !== levelFilter) return false
        if (!search) return true
        const q = search.toLowerCase()
        return item.code.toLowerCase().includes(q) ||
            (item.name_ar || '').toLowerCase().includes(q) ||
            (item.name_en || '').toLowerCase().includes(q)
    }, [search, levelFilter, matchesLang])

    const hasMatchInSubtree = useCallback((code: string) => subtreeMatchCache[code] ?? false, [subtreeMatchCache])

    const toggleExpand = useCallback((code: string) => {
        setExpanded(prev => {
            const next = new Set(prev)
            if (next.has(code)) next.delete(code); else next.add(code)
            return next
        })
    }, [])

    const collectDescendants = useCallback((code: string): string[] => {
        const result: string[] = []
        const visited = new Set<string>()
        const stack = [code]
        while (stack.length) {
            const c = stack.pop()!
            if (visited.has(c)) continue
            visited.add(c)
            result.push(c)
            const children = tree.codeToChildren[c] || []
            for (const ch of children) if (!visited.has(ch.code)) stack.push(ch.code)
        }
        return result
    }, [tree])

    const toggleSelect = useCallback((code: string) => {
        setSelectedForSync(prev => {
            const next = new Set(prev)
            const descendants = collectDescendants(code)
            if (next.has(code)) {
                for (const d of descendants) next.delete(d)
            } else {
                for (const d of descendants) next.add(d)
            }
            return next
        })
    }, [collectDescendants])

    const visibleCodes = useMemo(() => {
        const result: string[] = []
        for (const code of Object.keys(tree.codeToItem)) {
            if (subtreeMatchCache[code] || matchesSearch(tree.codeToItem[code])) result.push(code)
        }
        return result
    }, [tree, subtreeMatchCache, matchesSearch])

    const allVisibleSelected = visibleCodes.length > 0 && visibleCodes.every(c => selectedForSync.has(c))

    const toggleSelectAll = useCallback(() => {
        setSelectedForSync(prev => {
            if (allVisibleSelected) {
                const next = new Set(prev)
                for (const c of visibleCodes) next.delete(c)
                return next
            }
            const next = new Set(prev)
            for (const c of visibleCodes) next.add(c)
            return next
        })
    }, [allVisibleSelected, visibleCodes])

    const clearSelection = useCallback(() => setSelectedForSync(new Set()), [])

    const selectedItem = selectedCode ? items.find(i => i.code === selectedCode) : null

    return (
        <>
            <div className="sap-toolbar">
                <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                    <Search size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)', pointerEvents: 'none' }} />
                    <input className="sap-search-input" placeholder="بحث بالاسم أو الكود..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingRight: 36 }} />
                </div>
                <select className="sap-level-filter" value={levelFilter ?? ''} onChange={e => setLevelFilter(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">كل المستويات</option>
                    {[1, 2, 3, 4, 5].map(l => <option key={l} value={l}>المستوى {l}</option>)}
                </select>
                <select className="sap-level-filter" value={langFilter} onChange={e => setLangFilter(e.target.value as LanguageFilter)}>
                    <option value="all">كل اللغات</option>
                    <option value="ar_only">عربي فقط</option>
                    <option value="en_only">إنجليزي فقط</option>
                    <option value="missing_ar">بدون اسم عربي</option>
                </select>
                <button className="sap-fetch-btn" onClick={handleFetch} disabled={fetching}>
                    {fetching ? <Loader2 size={14} className="spin-icon" style={{ animation: 'sapSpin 1s linear infinite' }} /> : <Download size={14} />}
                    جلب من SAP
                </button>
                {hasFetched && items.length > 0 && (
                    <>
                        {selectedForSync.size > 0 && (
                            <button className="sap-sync-btn selected-sync" onClick={() => { setSelectedSyncResult(null); setSelectedSyncModal(true) }} disabled={syncing}>
                                <CheckSquare size={14} />
                                مزامنة المحدد ({selectedForSync.size})
                            </button>
                        )}
                        <button className="sap-sync-btn" onClick={handleSyncPreview} disabled={syncing}>
                            {syncing ? <Loader2 size={14} className="spin-icon" style={{ animation: 'sapSpin 1s linear infinite' }} /> : <Database size={14} />}
                            مزامنة الكل
                        </button>
                    </>
                )}
            </div>

            {fetchError && <div className="sap-error-box">{fetchError}</div>}

            {hasFetched && (
                <div className="sap-stats-bar">
                    <span className="sap-stat-chip">إجمالي التصنيفات: <span className="stat-value">{totalCount}</span></span>
                    {Object.entries(levelCounts).sort(([a], [b]) => Number(a) - Number(b)).map(([lvl, cnt]) => (
                        <span key={lvl} className="sap-stat-chip">المستوى {lvl}: <span className="stat-value">{cnt}</span></span>
                    ))}
                    {selectedForSync.size > 0 && (
                        <>
                            <span className="sap-stat-chip" style={{ background: 'rgba(218, 165, 32, 0.15)', borderColor: 'rgba(218, 165, 32, 0.4)' }}>
                                محدد: <span className="stat-value" style={{ color: 'var(--color-gold)' }}>{selectedForSync.size}</span>
                            </span>
                            <button className="sap-stat-chip" onClick={clearSelection} style={{ cursor: 'pointer', border: 'none' }}>
                                <X size={12} style={{ verticalAlign: 'middle' }} /> إلغاء التحديد
                            </button>
                        </>
                    )}
                </div>
            )}

            {fetching ? (
                <div className="sap-spinner"><Loader2 size={20} className="spin-icon" />جاري جلب شجرة التصنيفات...</div>
            ) : !hasFetched ? (
                <div className="sap-empty-state"><div className="empty-icon">🔗</div><h3>لم يتم جلب البيانات بعد</h3><p>اضغط "جلب من SAP" لاستعراض شجرة التصنيفات</p></div>
            ) : items.length === 0 ? (
                <div className="sap-empty-state"><div className="empty-icon">📭</div><h3>لا توجد تصنيفات</h3><p>لم يتم العثور على بيانات من SAP</p></div>
            ) : (
                <>
                    <div className="sap-tree-select-all" onClick={toggleSelectAll}>
                        <span className={`sap-checkbox ${allVisibleSelected ? 'checked' : ''}`}>
                            {allVisibleSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                        </span>
                        <span>{allVisibleSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'} ({visibleCodes.length} ظاهر)</span>
                    </div>
                    <div className="sap-tree-container">
                        {tree.roots.filter(r => hasMatchInSubtree(r.code)).map(root => (
                            <TreeNode
                                key={root.code}
                                item={root}
                                codeToChildren={tree.codeToChildren}
                                expanded={expanded}
                                toggleExpand={toggleExpand}
                                selectedCode={selectedCode}
                                setSelectedCode={setSelectedCode}
                                matchesSearch={matchesSearch}
                                hasMatchInSubtree={hasMatchInSubtree}
                                selectedForSync={selectedForSync}
                                toggleSelect={toggleSelect}
                            />
                        ))}
                    </div>
                </>
            )}

            {selectedItem && (
                <>
                    <div className="sap-detail-panel-overlay" onClick={() => setSelectedCode(null)} />
                    <div className="sap-detail-panel">
                        <div className="sap-detail-header">
                            <h3>تفاصيل التصنيف</h3>
                            <button className="sap-detail-close" onClick={() => setSelectedCode(null)}><X size={18} /></button>
                        </div>
                        <div className="sap-detail-field"><label>الكود</label><div className="value mono">{selectedItem.code}</div></div>
                        <div className="sap-detail-field"><label>كود الأب</label><div className="value mono">{selectedItem.parent_code || '—'}</div></div>
                        <div className="sap-detail-field"><label>الاسم بالعربية</label><div className="value">{selectedItem.name_ar || '—'}</div></div>
                        <div className="sap-detail-field"><label>الاسم بالإنجليزية</label><div className="value">{selectedItem.name_en || '—'}</div></div>
                        <div className="sap-detail-field"><label>المستوى</label><span className={`sap-level-badge level-${selectedItem.level}`}>المستوى {selectedItem.level}</span></div>
                        <div className="sap-detail-field"><label>تاريخ الإنشاء</label><div className="value">{selectedItem.created_date ? new Date(selectedItem.created_date).toLocaleDateString('ar-SA') : '—'}</div></div>
                        {selectedItem.attributes.length > 0 && (
                            <div className="sap-detail-attrs">
                                <h4>السمات ({selectedItem.attributes.length})</h4>
                                {selectedItem.attributes.map((attr, i) => (
                                    <div key={i} className="sap-detail-attr-item">
                                        <span className="attr-name">{attr.name}</span>
                                        <span className="attr-value">{attr.value}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}

            {syncModal && (
                <div className="sap-sync-modal-overlay" onClick={() => { if (!syncing) setSyncModal(false) }}>
                    <div className="sap-sync-modal" onClick={e => e.stopPropagation()}>
                        <h3>مزامنة كل التصنيفات مع النظام</h3>
                        {syncSummary && !syncResult && (
                            <>
                                <div className="sap-sync-summary">
                                    <div className="sap-sync-summary-item"><div className="sync-label">إجمالي SAP</div><div className="sync-value">{syncSummary.sap_total}</div></div>
                                    <div className="sap-sync-summary-item"><div className="sync-label">الموجود محلياً</div><div className="sync-value">{syncSummary.local_total}</div></div>
                                    <div className="sap-sync-summary-item create"><div className="sync-label">سيتم إضافة</div><div className="sync-value">{syncSummary.to_create}</div></div>
                                    <div className="sap-sync-summary-item update"><div className="sync-label">سيتم تعديل</div><div className="sync-value">{syncSummary.to_update}</div></div>
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>بدون تغيير: {syncSummary.unchanged} تصنيف</div>
                            </>
                        )}
                        {syncError && <div className="sap-error-box">{syncError}</div>}
                        {syncResult && (
                            <div className="sap-sync-result">تمت المزامنة بنجاح — تم إضافة {syncResult.created ?? 0} وتعديل {syncResult.updated ?? 0} تصنيف</div>
                        )}
                        <div className="sap-sync-actions">
                            {!syncResult ? (
                                <>
                                    <button className="sap-sync-confirm-btn" onClick={handleSyncConfirm} disabled={syncing}>{syncing ? 'جاري المزامنة...' : 'تأكيد المزامنة'}</button>
                                    <button className="sap-sync-cancel-btn" onClick={() => setSyncModal(false)} disabled={syncing}>إلغاء</button>
                                </>
                            ) : (
                                <button className="sap-sync-cancel-btn" onClick={() => { setSyncModal(false); setSyncResult(null); setSyncSummary(null) }}>إغلاق</button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {selectedSyncModal && (
                <div className="sap-sync-modal-overlay" onClick={() => { if (!syncing) setSelectedSyncModal(false) }}>
                    <div className="sap-sync-modal" onClick={e => e.stopPropagation()}>
                        <h3>مزامنة التصنيفات المحددة</h3>
                        {!selectedSyncResult && (
                            <>
                                <div className="sap-sync-summary">
                                    <div className="sap-sync-summary-item create"><div className="sync-label">المحدد</div><div className="sync-value">{selectedForSync.size}</div></div>
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
                                    سيتم حفظ التصنيفات المحددة + كل أجدادها (المسار الهرمي الكامل) + سماتها في النظام.
                                </div>
                            </>
                        )}
                        {syncError && <div className="sap-error-box">{syncError}</div>}
                        {selectedSyncResult && (
                            <div className="sap-sync-result">
                                تم مزامنة {selectedSyncResult.total_synced} تصنيف
                                {selectedSyncResult.ancestors_added > 0 && ` (شامل ${selectedSyncResult.ancestors_added} من الأجداد)`}
                                مع {selectedSyncResult.attributes_saved} سمة جديدة.
                                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                                    إضافة: {selectedSyncResult.created} • تحديث: {selectedSyncResult.updated}
                                </div>
                            </div>
                        )}
                        <div className="sap-sync-actions">
                            {!selectedSyncResult ? (
                                <>
                                    <button className="sap-sync-confirm-btn" onClick={handleSyncSelected} disabled={syncing}>{syncing ? 'جاري المزامنة...' : 'تأكيد المزامنة'}</button>
                                    <button className="sap-sync-cancel-btn" onClick={() => setSelectedSyncModal(false)} disabled={syncing}>إلغاء</button>
                                </>
                            ) : (
                                <button className="sap-sync-cancel-btn" onClick={() => { setSelectedSyncModal(false); setSelectedSyncResult(null) }}>إغلاق</button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

function TreeNode({ item, codeToChildren, expanded, toggleExpand, selectedCode, setSelectedCode, matchesSearch, hasMatchInSubtree, selectedForSync, toggleSelect }: {
    item: SapItem
    codeToChildren: Record<string, SapItem[]>
    expanded: Set<string>
    toggleExpand: (code: string) => void
    selectedCode: string | null
    setSelectedCode: (code: string | null) => void
    matchesSearch: (item: SapItem) => boolean
    hasMatchInSubtree: (code: string) => boolean
    selectedForSync: Set<string>
    toggleSelect: (code: string) => void
}) {
    const children = codeToChildren[item.code] || []
    const hasChildren = children.length > 0
    const isExpanded = expanded.has(item.code)
    const isSelected = selectedCode === item.code
    const selfMatches = matchesSearch(item)
    const isChecked = selectedForSync.has(item.code)
    if (!selfMatches && !hasMatchInSubtree(item.code)) return null
    return (
        <div>
            <div className={`sap-tree-node${isSelected ? ' selected' : ''}`} onClick={() => setSelectedCode(isSelected ? null : item.code)}>
                <button className={`sap-tree-toggle${isExpanded ? ' expanded' : ''}${!hasChildren ? ' leaf' : ''}`} onClick={e => { e.stopPropagation(); if (hasChildren) toggleExpand(item.code) }}>
                    <ChevronLeft size={14} />
                </button>
                <span
                    className={`sap-checkbox ${isChecked ? 'checked' : ''}`}
                    onClick={e => { e.stopPropagation(); toggleSelect(item.code) }}
                    role="checkbox"
                    aria-checked={isChecked}
                >
                    {isChecked ? <CheckSquare size={16} /> : <Square size={16} />}
                </span>
                <span className="sap-tree-icon">{hasChildren ? <FolderTree size={16} /> : <FileText size={16} />}</span>
                <span className="sap-tree-code">{item.code}</span>
                <span className="sap-tree-name">{item.name_ar || item.name_en || '—'}</span>
                <span className={`sap-level-badge level-${item.level}`}>{item.level}</span>
                {item.attributes.length > 0 && <span className="sap-attr-count">{item.attributes.length} سمة</span>}
            </div>
            {hasChildren && isExpanded && (
                <div className="sap-tree-children">
                    {children.filter(c => hasMatchInSubtree(c.code)).map(child => (
                        <TreeNode key={child.code} item={child} codeToChildren={codeToChildren} expanded={expanded} toggleExpand={toggleExpand} selectedCode={selectedCode} setSelectedCode={setSelectedCode} matchesSearch={matchesSearch} hasMatchInSubtree={hasMatchInSubtree} selectedForSync={selectedForSync} toggleSelect={toggleSelect} />
                    ))}
                </div>
            )}
        </div>
    )
}

// keep RefreshCw import resolution stable
void RefreshCw
