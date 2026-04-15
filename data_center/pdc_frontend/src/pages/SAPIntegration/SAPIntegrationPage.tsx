import { useState, useMemo, useCallback } from 'react'
import { sapAPI } from '@/api/client'
import {
    Link2, RefreshCw, ChevronLeft, Download, Search,
    X, Loader2, FolderTree, FileText, Database, Stethoscope,
} from 'lucide-react'
import './SAPIntegrationPage.css'

interface SapItem {
    parent_code: string
    code: string
    name_ar: string
    name_en: string
    level: number
    created_date: string | null
    attributes: { name: string; value: string }[]
}

interface ConnectionResult {
    connected: boolean
    status_code?: number
    response_time?: number
    sample_count?: number
    environment?: string
    base_url?: string
    error?: string
    detail?: string
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

export default function SAPIntegrationPage() {
    const [connectionStatus, setConnectionStatus] = useState<ConnectionResult | null>(null)
    const [testing, setTesting] = useState(false)

    const [items, setItems] = useState<SapItem[]>([])
    const [levelCounts, setLevelCounts] = useState<Record<number, number>>({})
    const [totalCount, setTotalCount] = useState(0)
    const [fetching, setFetching] = useState(false)
    const [fetchError, setFetchError] = useState('')
    const [hasFetched, setHasFetched] = useState(false)

    const [search, setSearch] = useState('')
    const [levelFilter, setLevelFilter] = useState<number | null>(null)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [selectedCode, setSelectedCode] = useState<string | null>(null)

    const [syncModal, setSyncModal] = useState(false)
    const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null)
    const [syncing, setSyncing] = useState(false)
    const [syncResult, setSyncResult] = useState<SyncSummary | null>(null)
    const [syncError, setSyncError] = useState('')

    const [diagnosing, setDiagnosing] = useState(false)
    const [diagnoseResult, setDiagnoseResult] = useState<any>(null)

    const handleTestConnection = useCallback(async () => {
        setTesting(true)
        try {
            const { data } = await sapAPI.testConnection()
            setConnectionStatus(data)
        } catch (e: any) {
            const d = e?.response?.data
            setConnectionStatus(d || { connected: false, error: 'فشل الاتصال' })
        } finally {
            setTesting(false)
        }
    }, [])

    const handleDiagnose = useCallback(async () => {
        setDiagnosing(true)
        setDiagnoseResult(null)
        try {
            const { data } = await sapAPI.diagnose()
            setDiagnoseResult(data)
        } catch (e: any) {
            setDiagnoseResult({ error: e?.response?.data?.error || 'فشل التشخيص' })
        } finally {
            setDiagnosing(false)
        }
    }, [])

    const handleFetchHierarchy = useCallback(async () => {
        setFetching(true)
        setFetchError('')
        try {
            const { data } = await sapAPI.hierarchy()
            setItems(data.items || [])
            setLevelCounts(data.level_counts || {})
            setTotalCount(data.total || 0)
            setHasFetched(true)

            const l1Codes = new Set<string>()
            for (const it of (data.items || [])) {
                if (it.level === 1) l1Codes.add(it.code)
            }
            setExpanded(l1Codes)
        } catch (e: any) {
            setFetchError(e?.response?.data?.error || e?.response?.data?.detail || 'فشل جلب البيانات')
        } finally {
            setFetching(false)
        }
    }, [])

    const handleSyncPreview = useCallback(async () => {
        setSyncing(true)
        setSyncError('')
        setSyncResult(null)
        try {
            const { data } = await sapAPI.syncHierarchy(true)
            setSyncSummary(data.summary)
            setSyncModal(true)
        } catch (e: any) {
            setSyncError(e?.response?.data?.error || 'فشل تحضير المزامنة')
        } finally {
            setSyncing(false)
        }
    }, [])

    const handleSyncConfirm = useCallback(async () => {
        setSyncing(true)
        setSyncError('')
        try {
            const { data } = await sapAPI.syncHierarchy(false)
            setSyncResult(data.summary)
        } catch (e: any) {
            setSyncError(e?.response?.data?.error || 'فشلت المزامنة')
        } finally {
            setSyncing(false)
        }
    }, [])

    const tree = useMemo(() => {
        const codeToChildren: Record<string, SapItem[]> = {}
        const codeToItem: Record<string, SapItem> = {}
        const roots: SapItem[] = []

        for (const it of items) {
            codeToItem[it.code] = it
            if (!it.parent_code || it.parent_code === it.code) {
                roots.push(it)
            } else {
                if (!codeToChildren[it.parent_code]) codeToChildren[it.parent_code] = []
                codeToChildren[it.parent_code].push(it)
            }
        }

        return { roots, codeToChildren, codeToItem }
    }, [items])

    const subtreeMatchCache = useMemo(() => {
        const cache: Record<string, boolean> = {}

        const itemMatchesSearch = (item: SapItem): boolean => {
            if (!search && levelFilter === null) return true
            if (levelFilter !== null && item.level !== levelFilter) return false
            if (!search) return true
            const q = search.toLowerCase()
            return (
                item.code.toLowerCase().includes(q) ||
                (item.name_ar || '').toLowerCase().includes(q) ||
                (item.name_en || '').toLowerCase().includes(q)
            )
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
    }, [tree, search, levelFilter])

    const matchesSearch = useCallback((item: SapItem): boolean => {
        if (!search && levelFilter === null) return true
        if (levelFilter !== null && item.level !== levelFilter) return false
        if (!search) return true
        const q = search.toLowerCase()
        return (
            item.code.toLowerCase().includes(q) ||
            (item.name_ar || '').toLowerCase().includes(q) ||
            (item.name_en || '').toLowerCase().includes(q)
        )
    }, [search, levelFilter])

    const hasMatchInSubtree = useCallback((code: string): boolean => {
        return subtreeMatchCache[code] ?? false
    }, [subtreeMatchCache])

    const toggleExpand = (code: string) => {
        setExpanded(prev => {
            const next = new Set(prev)
            if (next.has(code)) next.delete(code)
            else next.add(code)
            return next
        })
    }

    const selectedItem = selectedCode ? items.find(i => i.code === selectedCode) : null

    const env = connectionStatus?.environment || 'DEV'

    return (
        <div className="sap-page">
            <div className="sap-page-header">
                <Link2 size={22} strokeWidth={1.5} style={{ color: 'var(--color-gold)' }} />
                <h1>ربط SAP</h1>
                <span className={`env-badge ${env.toLowerCase()}`}>{env}</span>
            </div>

            {/* Connection bar */}
            <div className="sap-connection-bar">
                <div className="sap-connection-status">
                    <span className={`status-dot ${connectionStatus === null ? 'unknown' : connectionStatus.connected ? 'connected' : 'disconnected'}`} />
                    {connectionStatus === null
                        ? 'لم يتم الاختبار'
                        : connectionStatus.connected
                            ? 'متصل'
                            : connectionStatus.error || 'غير متصل'
                    }
                </div>

                <div className="sap-connection-meta">
                    {connectionStatus?.response_time != null && (
                        <span>⏱ {connectionStatus.response_time} ثانية</span>
                    )}
                    {connectionStatus?.base_url && (
                        <span style={{ direction: 'ltr', unicodeBidi: 'embed' }}>{connectionStatus.base_url}</span>
                    )}
                </div>

                <button
                    className="sap-test-btn"
                    onClick={handleTestConnection}
                    disabled={testing}
                >
                    {testing
                        ? <Loader2 size={14} className="spin-icon" style={{ animation: 'sapSpin 1s linear infinite' }} />
                        : <RefreshCw size={14} />
                    }
                    اختبار الاتصال
                </button>

                <button
                    className="sap-test-btn"
                    onClick={handleDiagnose}
                    disabled={diagnosing}
                >
                    {diagnosing
                        ? <Loader2 size={14} className="spin-icon" style={{ animation: 'sapSpin 1s linear infinite' }} />
                        : <Stethoscope size={14} />
                    }
                    تشخيص الاتصال
                </button>
            </div>

            {connectionStatus && !connectionStatus.connected && connectionStatus.detail && (
                <div className="sap-error-box">
                    {connectionStatus.detail}
                </div>
            )}

            {diagnoseResult && (
                <div className="sap-diagnose-results">
                    <div className="sap-diagnose-header">
                        <Stethoscope size={16} />
                        <span>نتائج التشخيص</span>
                        <button className="sap-detail-close" onClick={() => setDiagnoseResult(null)}>
                            <X size={14} />
                        </button>
                    </div>
                    {diagnoseResult.error && !diagnoseResult.dns && !diagnoseResult.proxy_tcp && (
                        <div className="sap-error-box" style={{ marginBottom: 0 }}>{diagnoseResult.error}</div>
                    )}
                    {diagnoseResult.host && (
                        <div className="sap-diagnose-grid">
                            <div className="sap-diagnose-item">
                                <span className="diag-label">الوضع</span>
                                <span className="diag-value">
                                    {diagnoseResult.mode === 'proxy' ? '🔀 عبر Proxy' : '🔗 اتصال مباشر'}
                                </span>
                            </div>
                            <div className="sap-diagnose-item">
                                <span className="diag-label">سيرفر SAP</span>
                                <span className="diag-value" style={{ direction: 'ltr' }}>
                                    {diagnoseResult.host}:{diagnoseResult.port}
                                </span>
                            </div>
                            <div className="sap-diagnose-item">
                                <span className="diag-label">بيانات الدخول</span>
                                <span className={`diag-status ${diagnoseResult.has_credentials ? 'ok' : 'fail'}`}>
                                    {diagnoseResult.has_credentials ? '✅ موجودة' : '❌ مفقودة'}
                                </span>
                            </div>

                            {diagnoseResult.mode === 'proxy' ? (
                                <>
                                    <div className="sap-diagnose-item">
                                        <span className="diag-label">Proxy URL</span>
                                        <span className="diag-value" style={{ direction: 'ltr', fontSize: 12 }}>
                                            {diagnoseResult.proxy_url}
                                        </span>
                                    </div>
                                    <div className="sap-diagnose-item">
                                        <span className="diag-label">Proxy TCP</span>
                                        <span className={`diag-status ${diagnoseResult.proxy_tcp?.status === 'ok' ? 'ok' : 'fail'}`}>
                                            {diagnoseResult.proxy_tcp?.status === 'ok'
                                                ? `✅ متصل (${diagnoseResult.proxy_tcp.time}s)`
                                                : `❌ ${diagnoseResult.proxy_tcp?.error || 'محجوب'}`
                                            }
                                        </span>
                                    </div>
                                    <div className="sap-diagnose-item">
                                        <span className="diag-label">Proxy → SAP</span>
                                        <span className={`diag-status ${diagnoseResult.proxy_sap?.status === 'ok' ? 'ok' : 'fail'}`}>
                                            {diagnoseResult.proxy_sap?.status === 'ok'
                                                ? `✅ HTTP ${diagnoseResult.proxy_sap.http_status} (${diagnoseResult.proxy_sap.time}s)`
                                                : `❌ ${diagnoseResult.proxy_sap?.error?.substring(0, 120) || 'فشل'}`
                                            }
                                        </span>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="sap-diagnose-item">
                                        <span className="diag-label">DNS</span>
                                        <span className={`diag-status ${diagnoseResult.dns?.status === 'ok' ? 'ok' : 'fail'}`}>
                                            {diagnoseResult.dns?.status === 'ok'
                                                ? `✅ ${diagnoseResult.dns.ip}`
                                                : `❌ ${diagnoseResult.dns?.error || 'فشل'}`
                                            }
                                        </span>
                                    </div>
                                    <div className="sap-diagnose-item">
                                        <span className="diag-label">TCP Port {diagnoseResult.port}</span>
                                        <span className={`diag-status ${diagnoseResult.tcp?.status === 'ok' ? 'ok' : 'fail'}`}>
                                            {diagnoseResult.tcp?.status === 'ok'
                                                ? `✅ مفتوح (${diagnoseResult.tcp.time}s)`
                                                : `❌ ${diagnoseResult.tcp?.error || 'محجوب'}`
                                            }
                                        </span>
                                    </div>
                                    <div className="sap-diagnose-item">
                                        <span className="diag-label">HTTPS</span>
                                        <span className={`diag-status ${diagnoseResult.https?.status === 'ok' ? 'ok' : 'fail'}`}>
                                            {diagnoseResult.https?.status === 'ok'
                                                ? `✅ HTTP ${diagnoseResult.https.http_status} (${diagnoseResult.https.time}s)`
                                                : `❌ ${diagnoseResult.https?.error?.substring(0, 120) || 'فشل'}`
                                            }
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Toolbar */}
            <div className="sap-toolbar">
                <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                    <Search size={16} style={{
                        position: 'absolute',
                        right: 12,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--color-text-secondary)',
                        pointerEvents: 'none',
                    }} />
                    <input
                        className="sap-search-input"
                        placeholder="بحث بالاسم أو الكود..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ paddingRight: 36 }}
                    />
                </div>

                <select
                    className="sap-level-filter"
                    value={levelFilter ?? ''}
                    onChange={e => setLevelFilter(e.target.value ? Number(e.target.value) : null)}
                >
                    <option value="">كل المستويات</option>
                    {[1, 2, 3, 4, 5].map(l => (
                        <option key={l} value={l}>المستوى {l}</option>
                    ))}
                </select>

                <button
                    className="sap-fetch-btn"
                    onClick={handleFetchHierarchy}
                    disabled={fetching}
                >
                    {fetching
                        ? <Loader2 size={14} className="spin-icon" style={{ animation: 'sapSpin 1s linear infinite' }} />
                        : <Download size={14} />
                    }
                    جلب من SAP
                </button>

                {hasFetched && items.length > 0 && (
                    <button
                        className="sap-sync-btn"
                        onClick={handleSyncPreview}
                        disabled={syncing}
                    >
                        {syncing
                            ? <Loader2 size={14} className="spin-icon" style={{ animation: 'sapSpin 1s linear infinite' }} />
                            : <Database size={14} />
                        }
                        مزامنة مع النظام
                    </button>
                )}
            </div>

            {fetchError && <div className="sap-error-box">{fetchError}</div>}

            {/* Stats */}
            {hasFetched && (
                <div className="sap-stats-bar">
                    <span className="sap-stat-chip">
                        إجمالي التصنيفات: <span className="stat-value">{totalCount}</span>
                    </span>
                    {Object.entries(levelCounts)
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .map(([lvl, cnt]) => (
                            <span key={lvl} className="sap-stat-chip">
                                المستوى {lvl}: <span className="stat-value">{cnt}</span>
                            </span>
                        ))
                    }
                </div>
            )}

            {/* Tree */}
            {fetching ? (
                <div className="sap-spinner">
                    <Loader2 size={20} className="spin-icon" />
                    جاري جلب شجرة التصنيفات...
                </div>
            ) : !hasFetched ? (
                <div className="sap-empty-state">
                    <div className="empty-icon">🔗</div>
                    <h3>لم يتم جلب البيانات بعد</h3>
                    <p>اضغط "جلب من SAP" لاستعراض شجرة التصنيفات</p>
                </div>
            ) : items.length === 0 ? (
                <div className="sap-empty-state">
                    <div className="empty-icon">📭</div>
                    <h3>لا توجد تصنيفات</h3>
                    <p>لم يتم العثور على بيانات من SAP</p>
                </div>
            ) : (
                <div className="sap-tree-container">
                    {tree.roots
                        .filter(r => hasMatchInSubtree(r.code))
                        .map(root => (
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
                            />
                        ))
                    }
                </div>
            )}

            {/* Detail panel */}
            {selectedItem && (
                <>
                    <div className="sap-detail-panel-overlay" onClick={() => setSelectedCode(null)} />
                    <div className="sap-detail-panel">
                        <div className="sap-detail-header">
                            <h3>تفاصيل التصنيف</h3>
                            <button className="sap-detail-close" onClick={() => setSelectedCode(null)}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="sap-detail-field">
                            <label>الكود</label>
                            <div className="value mono">{selectedItem.code}</div>
                        </div>
                        <div className="sap-detail-field">
                            <label>كود الأب</label>
                            <div className="value mono">{selectedItem.parent_code || '—'}</div>
                        </div>
                        <div className="sap-detail-field">
                            <label>الاسم بالعربية</label>
                            <div className="value">{selectedItem.name_ar || '—'}</div>
                        </div>
                        <div className="sap-detail-field">
                            <label>الاسم بالإنجليزية</label>
                            <div className="value">{selectedItem.name_en || '—'}</div>
                        </div>
                        <div className="sap-detail-field">
                            <label>المستوى</label>
                            <span className={`sap-level-badge level-${selectedItem.level}`}>
                                المستوى {selectedItem.level}
                            </span>
                        </div>
                        <div className="sap-detail-field">
                            <label>تاريخ الإنشاء</label>
                            <div className="value">
                                {selectedItem.created_date
                                    ? new Date(selectedItem.created_date).toLocaleDateString('ar-SA')
                                    : '—'
                                }
                            </div>
                        </div>

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

            {/* Sync modal */}
            {syncModal && (
                <div className="sap-sync-modal-overlay" onClick={() => { if (!syncing) setSyncModal(false) }}>
                    <div className="sap-sync-modal" onClick={e => e.stopPropagation()}>
                        <h3>مزامنة التصنيفات مع النظام</h3>

                        {syncSummary && !syncResult && (
                            <>
                                <div className="sap-sync-summary">
                                    <div className="sap-sync-summary-item">
                                        <div className="sync-label">إجمالي SAP</div>
                                        <div className="sync-value">{syncSummary.sap_total}</div>
                                    </div>
                                    <div className="sap-sync-summary-item">
                                        <div className="sync-label">الموجود محلياً</div>
                                        <div className="sync-value">{syncSummary.local_total}</div>
                                    </div>
                                    <div className="sap-sync-summary-item create">
                                        <div className="sync-label">سيتم إضافة</div>
                                        <div className="sync-value">{syncSummary.to_create}</div>
                                    </div>
                                    <div className="sap-sync-summary-item update">
                                        <div className="sync-label">سيتم تعديل</div>
                                        <div className="sync-value">{syncSummary.to_update}</div>
                                    </div>
                                </div>

                                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
                                    بدون تغيير: {syncSummary.unchanged} تصنيف
                                </div>
                            </>
                        )}

                        {syncError && <div className="sap-error-box">{syncError}</div>}

                        {syncResult && (
                            <div className="sap-sync-result">
                                تمت المزامنة بنجاح — تم إضافة {syncResult.created ?? 0} وتعديل {syncResult.updated ?? 0} تصنيف
                            </div>
                        )}

                        <div className="sap-sync-actions">
                            {!syncResult ? (
                                <>
                                    <button
                                        className="sap-sync-confirm-btn"
                                        onClick={handleSyncConfirm}
                                        disabled={syncing}
                                    >
                                        {syncing ? 'جاري المزامنة...' : 'تأكيد المزامنة'}
                                    </button>
                                    <button
                                        className="sap-sync-cancel-btn"
                                        onClick={() => setSyncModal(false)}
                                        disabled={syncing}
                                    >
                                        إلغاء
                                    </button>
                                </>
                            ) : (
                                <button
                                    className="sap-sync-cancel-btn"
                                    onClick={() => {
                                        setSyncModal(false)
                                        setSyncResult(null)
                                        setSyncSummary(null)
                                    }}
                                >
                                    إغلاق
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function TreeNode({
    item,
    codeToChildren,
    expanded,
    toggleExpand,
    selectedCode,
    setSelectedCode,
    matchesSearch,
    hasMatchInSubtree,
}: {
    item: SapItem
    codeToChildren: Record<string, SapItem[]>
    expanded: Set<string>
    toggleExpand: (code: string) => void
    selectedCode: string | null
    setSelectedCode: (code: string | null) => void
    matchesSearch: (item: SapItem) => boolean
    hasMatchInSubtree: (code: string) => boolean
}) {
    const children = codeToChildren[item.code] || []
    const hasChildren = children.length > 0
    const isExpanded = expanded.has(item.code)
    const isSelected = selectedCode === item.code
    const selfMatches = matchesSearch(item)

    if (!selfMatches && !hasMatchInSubtree(item.code)) return null

    return (
        <div>
            <div
                className={`sap-tree-node${isSelected ? ' selected' : ''}`}
                onClick={() => setSelectedCode(isSelected ? null : item.code)}
            >
                <button
                    className={`sap-tree-toggle${isExpanded ? ' expanded' : ''}${!hasChildren ? ' leaf' : ''}`}
                    onClick={e => {
                        e.stopPropagation()
                        if (hasChildren) toggleExpand(item.code)
                    }}
                >
                    <ChevronLeft size={14} />
                </button>

                <span className="sap-tree-icon">
                    {hasChildren ? <FolderTree size={16} /> : <FileText size={16} />}
                </span>

                <span className="sap-tree-code">{item.code}</span>

                <span className="sap-tree-name">
                    {item.name_ar || item.name_en || '—'}
                </span>

                <span className={`sap-level-badge level-${item.level}`}>
                    {item.level}
                </span>

                {item.attributes.length > 0 && (
                    <span className="sap-attr-count">{item.attributes.length} سمة</span>
                )}
            </div>

            {hasChildren && isExpanded && (
                <div className="sap-tree-children">
                    {children
                        .filter(c => hasMatchInSubtree(c.code))
                        .map(child => (
                            <TreeNode
                                key={child.code}
                                item={child}
                                codeToChildren={codeToChildren}
                                expanded={expanded}
                                toggleExpand={toggleExpand}
                                selectedCode={selectedCode}
                                setSelectedCode={setSelectedCode}
                                matchesSearch={matchesSearch}
                                hasMatchInSubtree={hasMatchInSubtree}
                            />
                        ))
                    }
                </div>
            )}
        </div>
    )
}
