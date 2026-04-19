import { useState, useCallback, useMemo, useEffect } from 'react'
import { sapAPI } from '@/api/client'
import { Calendar, Loader2, Download, Search, Database, X, Package, CheckCircle2, SkipForward, AlertCircle, RefreshCw } from 'lucide-react'

interface ProductRow {
    material_number: string
    description_ar: string
    description_en: string
    material_group_code: string
    origin_country: string
    unit_of_measure: string
    is_active: boolean
    created_date: string | null
    changed_date: string | null
    attributes: { name: string; value: string }[]
    hierarchy: { code: string; parent_code: string; name_ar: string; name_en: string; level: number }[]
    exists_locally?: boolean
}

const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

function defaultDates() {
    const now = new Date()
    const past = new Date(now)
    past.setDate(past.getDate() - 30)
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    return { from: iso(past), to: iso(now) }
}

type ExistFilter = 'all' | 'existing' | 'missing'

interface SyncOutcome {
    updated: ProductRow[]
    skipped: ProductRow[]
    failed: { sku: string; error: string }[]
}

interface Props { onSyncComplete?: () => void }

export default function ProductsByDateTab({ onSyncComplete }: Props) {
    const dd = defaultDates()
    const [dateFrom, setDateFrom] = useState(dd.from)
    const [dateTo, setDateTo] = useState(dd.to)
    const [items, setItems] = useState<ProductRow[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [hasFetched, setHasFetched] = useState(false)
    const [search, setSearch] = useState('')
    const [existFilter, setExistFilter] = useState<ExistFilter>('all')
    const [selected, setSelected] = useState<ProductRow | null>(null)
    const [checked, setChecked] = useState<Set<string>>(new Set())

    const [syncOpen, setSyncOpen] = useState(false)
    const [syncMode, setSyncMode] = useState<'all' | 'selected'>('all')
    const [syncing, setSyncing] = useState(false)
    const [syncError, setSyncError] = useState('')
    const [syncResult, setSyncResult] = useState<SyncOutcome | null>(null)
    const [showUpdated, setShowUpdated] = useState(false)
    const [showSkipped, setShowSkipped] = useState(false)
    const [showFailed, setShowFailed] = useState(false)

    const handleFetch = useCallback(async () => {
        if (!dateFrom || !dateTo) { setError('يرجى تحديد التاريخين'); return }
        setLoading(true); setError(''); setSyncResult(null); setChecked(new Set())
        try {
            const { data } = await sapAPI.getProductsByDate(dateFrom, dateTo)
            setItems(data.items || [])
            setHasFetched(true)
        } catch (e: any) {
            setError(e?.response?.data?.error || 'فشل جلب الأصناف')
        } finally { setLoading(false) }
    }, [dateFrom, dateTo])

    const filtered = useMemo(() => {
        let list = items
        if (existFilter === 'existing') list = list.filter(i => i.exists_locally)
        else if (existFilter === 'missing') list = list.filter(i => !i.exists_locally)
        if (search) {
            const q = search.toLowerCase()
            list = list.filter(it =>
                it.material_number.toLowerCase().includes(q) ||
                (it.description_ar || '').toLowerCase().includes(q) ||
                (it.description_en || '').toLowerCase().includes(q)
            )
        }
        return list
    }, [items, search, existFilter])

    const missingCount = items.filter(i => !i.exists_locally).length
    const existingCount = items.length - missingCount

    const visibleSkus = useMemo(() => filtered.map(i => i.material_number), [filtered])
    const allVisibleChecked = visibleSkus.length > 0 && visibleSkus.every(s => checked.has(s))
    const someVisibleChecked = visibleSkus.some(s => checked.has(s))

    const toggleOne = (sku: string) => {
        setChecked(prev => {
            const next = new Set(prev)
            if (next.has(sku)) next.delete(sku)
            else next.add(sku)
            return next
        })
    }
    const toggleAllVisible = () => {
        setChecked(prev => {
            const next = new Set(prev)
            if (allVisibleChecked) {
                visibleSkus.forEach(s => next.delete(s))
            } else {
                visibleSkus.forEach(s => next.add(s))
            }
            return next
        })
    }
    const clearSelection = () => setChecked(new Set())

    const runSync = useCallback(async (mode: 'all' | 'selected') => {
        setSyncing(true); setSyncError(''); setSyncResult(null)
        setShowUpdated(false); setShowSkipped(false); setShowFailed(false)

        const candidatePool = mode === 'selected'
            ? items.filter(i => checked.has(i.material_number))
            : items

        const toUpdate = candidatePool.filter(i => i.exists_locally)
        const skipped = candidatePool.filter(i => !i.exists_locally)

        if (toUpdate.length === 0) {
            setSyncResult({ updated: [], skipped, failed: [] })
            setSyncing(false)
            return
        }

        try {
            const { data } = await sapAPI.syncProducts(toUpdate)
            const failed: { sku: string; error: string }[] = (data.errors || []).map((e: any) => ({
                sku: e.sku || '—', error: e.error || 'فشل',
            }))
            const failedSkus = new Set(failed.map(f => f.sku))
            const updatedRows = toUpdate.filter(i => !failedSkus.has(i.material_number))
            setSyncResult({ updated: updatedRows, skipped, failed })
            onSyncComplete?.()
            const refetch = await sapAPI.getProductsByDate(dateFrom, dateTo)
            setItems(refetch.data.items || [])
        } catch (e: any) {
            setSyncError(e?.response?.data?.error || 'فشلت المزامنة')
        } finally { setSyncing(false) }
    }, [items, checked, dateFrom, dateTo, onSyncComplete])

    useEffect(() => {
        if (!syncOpen) {
            setShowUpdated(false); setShowSkipped(false); setShowFailed(false)
        }
    }, [syncOpen])

    const exportExcel = useCallback(() => {
        if (!filtered.length) return
        const headers = ['#', 'رمز الصنف', 'الوصف عربي', 'الوصف إنجليزي', 'التصنيف', 'بلد المنشأ', 'الوحدة', 'تاريخ الإنشاء', 'تاريخ التعديل', 'الحالة', 'في النظام']
        const rows = filtered.map((it, i) => [
            i + 1,
            it.material_number,
            it.description_ar,
            it.description_en,
            it.material_group_code,
            it.origin_country,
            it.unit_of_measure,
            it.created_date || '',
            it.changed_date || '',
            it.is_active ? 'فعال' : 'غير فعال',
            it.exists_locally ? 'موجود' : 'غير موجود',
        ])
        const csv = [headers, ...rows].map(r =>
            r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')
        ).join('\n')
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `sap_products_${dateFrom}_${dateTo}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }, [filtered, dateFrom, dateTo])

    const checkedCount = checked.size
    const checkedExistingCount = items.filter(i => checked.has(i.material_number) && i.exists_locally).length

    const pillBtn = (active: boolean): React.CSSProperties => ({
        padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 999,
        border: `1px solid ${active ? 'rgba(200,168,75,0.55)' : 'var(--color-border)'}`,
        background: active ? 'rgba(200,168,75,0.15)' : 'transparent',
        color: active ? 'var(--color-gold, #C8A84B)' : 'var(--color-text-secondary)',
        cursor: 'pointer', fontFamily: 'inherit',
    })

    return (
        <div className="sap-date-tab">
            <div className="sap-date-toolbar">
                <div className="sap-date-input-group">
                    <label><Calendar size={14} /> من تاريخ</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="sap-date-input" />
                </div>
                <div className="sap-date-input-group">
                    <label><Calendar size={14} /> إلى تاريخ</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="sap-date-input" />
                </div>
                <button className="sap-fetch-btn" onClick={handleFetch} disabled={loading}>
                    {loading ? <Loader2 size={14} className="spin-icon" style={{ animation: 'sapSpin 1s linear infinite' }} /> : <Download size={14} />}
                    جلب الأصناف
                </button>
            </div>

            {error && <div className="sap-error-box">{error}</div>}

            {loading && (
                <div className="sap-spinner">
                    <Loader2 size={20} className="spin-icon" />
                    جاري جلب الأصناف من SAP... قد يستغرق حتى دقيقتين
                </div>
            )}

            {!loading && hasFetched && (
                <>
                    <div className="sap-stats-bar">
                        <span className="sap-stat-chip">إجمالي: <span className="stat-value">{items.length}</span></span>
                        <span className="sap-stat-chip">موجود: <span className="stat-value" style={{ color: '#5cb85c' }}>{existingCount}</span></span>
                        <span className="sap-stat-chip">غير موجود: <span className="stat-value" style={{ color: 'var(--color-text-muted)' }}>{missingCount}</span></span>
                        {checkedCount > 0 && (
                            <span className="sap-stat-chip" style={{ background: 'rgba(200,168,75,0.12)', color: 'var(--color-gold, #C8A84B)' }}>
                                محدد: <span className="stat-value">{checkedCount}</span>
                            </span>
                        )}
                    </div>

                    {items.length > 0 && (
                        <div className="sap-toolbar" style={{ flexWrap: 'wrap' }}>
                            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                                <Search size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)', pointerEvents: 'none' }} />
                                <input className="sap-search-input" placeholder="بحث في النتائج..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingRight: 36 }} />
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button style={pillBtn(existFilter === 'all')} onClick={() => setExistFilter('all')}>الكل</button>
                                <button style={pillBtn(existFilter === 'existing')} onClick={() => setExistFilter('existing')}>موجود ({existingCount})</button>
                                <button style={pillBtn(existFilter === 'missing')} onClick={() => setExistFilter('missing')}>غير موجود ({missingCount})</button>
                            </div>
                            {checkedCount > 0 && (
                                <button className="sap-test-btn" onClick={clearSelection}>
                                    <X size={14} /> إلغاء التحديد
                                </button>
                            )}
                            <button className="sap-test-btn" onClick={exportExcel} disabled={!filtered.length}>
                                <Download size={14} /> تصدير Excel
                            </button>
                            {checkedCount > 0 && (
                                <button
                                    className="sap-sync-btn"
                                    onClick={() => { setSyncMode('selected'); setSyncOpen(true) }}
                                    disabled={syncing}
                                    style={{ background: 'rgba(200,168,75,0.18)', borderColor: 'rgba(200,168,75,0.6)' }}
                                >
                                    <RefreshCw size={14} /> مزامنة المحدد ({checkedCount})
                                </button>
                            )}
                            <button className="sap-sync-btn" onClick={() => { setSyncMode('all'); setSyncOpen(true) }} disabled={syncing}>
                                <Database size={14} /> مزامنة الكل ({existingCount})
                            </button>
                        </div>
                    )}

                    {items.length === 0 ? (
                        <div className="sap-empty-state">
                            <div className="empty-icon">📭</div>
                            <h3>لا توجد أصناف في هذه الفترة</h3>
                            <p>جرّب تغيير نطاق التاريخ</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="sap-empty-state">
                            <div className="empty-icon">🔍</div>
                            <h3>لا توجد أصناف مطابقة</h3>
                            <p>غيّر الفلتر أو نص البحث</p>
                        </div>
                    ) : (
                        <div className="sap-products-table-wrap">
                            <table className="sap-products-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: 36 }}>
                                            <input
                                                type="checkbox"
                                                checked={allVisibleChecked}
                                                ref={el => { if (el) el.indeterminate = !allVisibleChecked && someVisibleChecked }}
                                                onChange={toggleAllVisible}
                                                style={{ cursor: 'pointer', accentColor: 'var(--color-gold, #C8A84B)' }}
                                            />
                                        </th>
                                        <th>#</th>
                                        <th>رمز الصنف</th>
                                        <th>الوصف</th>
                                        <th>التصنيف</th>
                                        <th>المنشأ</th>
                                        <th>الوحدة</th>
                                        <th>الإنشاء</th>
                                        <th>التعديل</th>
                                        <th>الحالة</th>
                                        <th>في النظام</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((it, i) => {
                                        const isChecked = checked.has(it.material_number)
                                        return (
                                            <tr
                                                key={it.material_number}
                                                onClick={() => setSelected(it)}
                                                style={isChecked ? { background: 'rgba(200,168,75,0.06)' } : undefined}
                                            >
                                                <td onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => toggleOne(it.material_number)}
                                                        style={{ cursor: 'pointer', accentColor: 'var(--color-gold, #C8A84B)' }}
                                                    />
                                                </td>
                                                <td>{i + 1}</td>
                                                <td className="mono">{it.material_number}</td>
                                                <td>{it.description_ar || it.description_en || '—'}</td>
                                                <td className="mono">{it.material_group_code}</td>
                                                <td>{it.origin_country || '—'}</td>
                                                <td>{it.unit_of_measure || '—'}</td>
                                                <td>{fmtDate(it.created_date)}</td>
                                                <td>{fmtDate(it.changed_date)}</td>
                                                <td>
                                                    <span className={`sap-product-status small ${it.is_active ? 'active' : 'inactive'}`}>
                                                        {it.is_active ? 'فعال' : 'غير فعال'}
                                                    </span>
                                                </td>
                                                <td>
                                                    {it.exists_locally
                                                        ? <span className="sap-info-pill small" style={{ background: 'rgba(92,184,92,0.15)', color: '#5cb85c', borderColor: 'rgba(92,184,92,0.4)' }}>موجود</span>
                                                        : <span className="sap-info-pill small" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)' }}>غير موجود</span>}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {!loading && !hasFetched && (
                <div className="sap-empty-state">
                    <div className="empty-icon">📅</div>
                    <h3>اختر فترة زمنية</h3>
                    <p>حدد "من" و "إلى" واضغط جلب الأصناف</p>
                </div>
            )}

            {selected && (
                <>
                    <div className="sap-detail-panel-overlay" onClick={() => setSelected(null)} />
                    <div className="sap-detail-panel">
                        <div className="sap-detail-header">
                            <h3><Package size={16} style={{ verticalAlign: 'middle', marginLeft: 6 }} />تفاصيل الصنف</h3>
                            <button className="sap-detail-close" onClick={() => setSelected(null)}><X size={18} /></button>
                        </div>

                        {selected.exists_locally ? (
                            <div style={{
                                margin: '0 0 14px', padding: '10px 12px',
                                background: 'rgba(92,184,92,0.10)', borderRadius: 8,
                                border: '1px solid rgba(92,184,92,0.35)',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                            }}>
                                <span style={{ fontSize: 12, color: '#5cb85c', fontWeight: 600 }}>
                                    ✓ هذا الصنف موجود في النظام
                                </span>
                                <button
                                    className="sap-sync-btn"
                                    style={{ padding: '6px 12px', fontSize: 12 }}
                                    disabled={syncing}
                                    onClick={async () => {
                                        setSyncing(true); setSyncError('')
                                        try {
                                            await sapAPI.syncProducts([selected])
                                            onSyncComplete?.()
                                            const refetch = await sapAPI.getProductsByDate(dateFrom, dateTo)
                                            setItems(refetch.data.items || [])
                                            setSelected(null)
                                        } catch (e: any) {
                                            setSyncError(e?.response?.data?.error || 'فشل التحديث')
                                        } finally { setSyncing(false) }
                                    }}
                                >
                                    {syncing ? <Loader2 size={12} className="spin-icon" /> : <RefreshCw size={12} />} تحديث هذا الصنف
                                </button>
                            </div>
                        ) : (
                            <div style={{
                                margin: '0 0 14px', padding: '10px 12px',
                                background: 'rgba(255,255,255,0.04)', borderRadius: 8,
                                border: '1px solid var(--color-border)', fontSize: 12,
                                color: 'var(--color-text-secondary)', lineHeight: 1.6,
                            }}>
                                هذا الصنف <b>غير موجود</b> في النظام.
                                <br />لإضافته استخدم تاب <b>"بحث صنف"</b> أو صفحة إضافة منتج.
                            </div>
                        )}

                        <div className="sap-detail-field"><label>رمز الصنف</label><div className="value mono">{selected.material_number}</div></div>
                        <div className="sap-detail-field"><label>الوصف بالعربية</label><div className="value">{selected.description_ar || '—'}</div></div>
                        <div className="sap-detail-field"><label>الوصف بالإنجليزية</label><div className="value">{selected.description_en || '—'}</div></div>
                        <div className="sap-detail-field"><label>كود التصنيف</label><div className="value mono">{selected.material_group_code}</div></div>
                        <div className="sap-detail-field"><label>بلد المنشأ</label><div className="value">{selected.origin_country || '—'}</div></div>
                        <div className="sap-detail-field"><label>وحدة القياس</label><div className="value">{selected.unit_of_measure || '—'}</div></div>
                        <div className="sap-detail-field"><label>تاريخ الإنشاء</label><div className="value">{fmtDate(selected.created_date)}</div></div>
                        <div className="sap-detail-field"><label>تاريخ التعديل</label><div className="value">{fmtDate(selected.changed_date)}</div></div>
                        <div className="sap-detail-field"><label>الحالة</label>
                            <span className={`sap-product-status ${selected.is_active ? 'active' : 'inactive'}`}>{selected.is_active ? '✓ فعال' : '✕ غير فعال'}</span>
                        </div>
                        {selected.attributes.filter(a => a.value).length > 0 && (
                            <div className="sap-detail-attrs">
                                <h4>السمات</h4>
                                {selected.attributes.filter(a => a.value).map((attr, i) => (
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

            {syncOpen && (
                <div className="sap-sync-modal-overlay" onClick={() => { if (!syncing) setSyncOpen(false) }}>
                    <div className="sap-sync-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
                        <h3>{syncMode === 'selected' ? 'مزامنة الأصناف المحددة' : 'مزامنة كل الأصناف'}</h3>

                        {!syncResult && !syncError && (() => {
                            const pool = syncMode === 'selected'
                                ? items.filter(i => checked.has(i.material_number))
                                : items
                            const willUpdate = pool.filter(i => i.exists_locally).length
                            const willSkip = pool.filter(i => !i.exists_locally).length
                            return (
                                <>
                                    <div className="sap-sync-summary">
                                        <div className="sap-sync-summary-item"><div className="sync-label">المجموع</div><div className="sync-value">{pool.length}</div></div>
                                        <div className="sap-sync-summary-item update"><div className="sync-label">سيتم تحديث</div><div className="sync-value">{willUpdate}</div></div>
                                        <div className="sap-sync-summary-item"><div className="sync-label">سيتم تجاهل</div><div className="sync-value">{willSkip}</div></div>
                                    </div>
                                    <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16, lineHeight: 1.7 }}>
                                        هذا التاب يُستخدم <b>لتحديث الأصناف الموجودة فقط</b>.
                                        <br />الأصناف غير الموجودة في النظام سيتم تجاهلها — لإضافة أصناف جديدة استخدم تاب "بحث صنف".
                                        {syncMode === 'selected' && checkedCount > 0 && checkedExistingCount === 0 && (
                                            <div style={{ marginTop: 8, color: '#e3a008' }}>
                                                ⚠️ كل الأصناف المحددة غير موجودة في النظام — لن يتم تحديث أي شيء.
                                            </div>
                                        )}
                                    </div>
                                </>
                            )
                        })()}

                        {syncError && <div className="sap-error-box">{syncError}</div>}

                        {syncResult && (
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>نتيجة المزامنة:</div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {/* Updated */}
                                    <div style={{ border: '1px solid rgba(92,184,92,0.35)', borderRadius: 8, background: 'rgba(92,184,92,0.08)' }}>
                                        <button
                                            type="button"
                                            onClick={() => setShowUpdated(s => !s)}
                                            disabled={syncResult.updated.length === 0}
                                            style={{
                                                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '10px 12px', background: 'transparent', border: 'none',
                                                cursor: syncResult.updated.length ? 'pointer' : 'default', color: 'inherit', fontFamily: 'inherit',
                                            }}
                                        >
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#5cb85c' }}>
                                                <CheckCircle2 size={15} /> تم تحديث: {syncResult.updated.length} صنف
                                            </span>
                                            {syncResult.updated.length > 0 && <span style={{ fontSize: 11, opacity: 0.7 }}>{showUpdated ? '▲' : '▼'}</span>}
                                        </button>
                                        {showUpdated && (
                                            <div style={{ maxHeight: 160, overflowY: 'auto', padding: '4px 12px 10px', fontSize: 12 }}>
                                                {syncResult.updated.map(it => (
                                                    <div key={it.material_number} style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                        <span className="mono" style={{ color: '#5cb85c' }}>{it.material_number}</span>
                                                        <span style={{ marginRight: 8, opacity: 0.8 }}>— {it.description_ar || it.description_en || '—'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Skipped */}
                                    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
                                        <button
                                            type="button"
                                            onClick={() => setShowSkipped(s => !s)}
                                            disabled={syncResult.skipped.length === 0}
                                            style={{
                                                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '10px 12px', background: 'transparent', border: 'none',
                                                cursor: syncResult.skipped.length ? 'pointer' : 'default', color: 'inherit', fontFamily: 'inherit',
                                            }}
                                        >
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                                                <SkipForward size={15} /> تم تجاهل (غير موجود): {syncResult.skipped.length}
                                            </span>
                                            {syncResult.skipped.length > 0 && <span style={{ fontSize: 11, opacity: 0.7 }}>{showSkipped ? '▲' : '▼'}</span>}
                                        </button>
                                        {showSkipped && (
                                            <div style={{ padding: '4px 12px 10px' }}>
                                                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                                                    لإضافتها استخدم تاب "بحث صنف"
                                                </div>
                                                <div style={{ maxHeight: 160, overflowY: 'auto', fontSize: 12 }}>
                                                    {syncResult.skipped.map(it => (
                                                        <div key={it.material_number} style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                            <span className="mono">{it.material_number}</span>
                                                            <span style={{ marginRight: 8, opacity: 0.8 }}>— {it.description_ar || it.description_en || '—'}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Failed */}
                                    {syncResult.failed.length > 0 && (
                                        <div style={{ border: '1px solid rgba(217,83,79,0.4)', borderRadius: 8, background: 'rgba(217,83,79,0.08)' }}>
                                            <button
                                                type="button"
                                                onClick={() => setShowFailed(s => !s)}
                                                style={{
                                                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '10px 12px', background: 'transparent', border: 'none',
                                                    cursor: 'pointer', color: 'inherit', fontFamily: 'inherit',
                                                }}
                                            >
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#d9534f' }}>
                                                    <AlertCircle size={15} /> فشل: {syncResult.failed.length}
                                                </span>
                                                <span style={{ fontSize: 11, opacity: 0.7 }}>{showFailed ? '▲' : '▼'}</span>
                                            </button>
                                            {showFailed && (
                                                <div style={{ maxHeight: 160, overflowY: 'auto', padding: '4px 12px 10px', fontSize: 12 }}>
                                                    {syncResult.failed.map((f, i) => (
                                                        <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                            <span className="mono" style={{ color: '#d9534f' }}>{f.sku}</span>
                                                            <span style={{ marginRight: 8, opacity: 0.8 }}>— {f.error}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="sap-sync-actions">
                            {!syncResult ? (
                                <>
                                    <button
                                        className="sap-sync-confirm-btn"
                                        onClick={() => runSync(syncMode)}
                                        disabled={syncing}
                                    >
                                        {syncing ? 'جاري المزامنة...' : 'تأكيد المزامنة'}
                                    </button>
                                    <button className="sap-sync-cancel-btn" onClick={() => setSyncOpen(false)} disabled={syncing}>إلغاء</button>
                                </>
                            ) : (
                                <button className="sap-sync-cancel-btn" onClick={() => { setSyncOpen(false); setSyncResult(null) }}>إغلاق</button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
