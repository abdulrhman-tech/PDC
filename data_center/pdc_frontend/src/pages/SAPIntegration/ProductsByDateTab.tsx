import { useState, useCallback, useMemo } from 'react'
import { sapAPI } from '@/api/client'
import { Calendar, Loader2, Download, Search, Database, X, Package } from 'lucide-react'

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
    const [selected, setSelected] = useState<ProductRow | null>(null)

    const [syncOpen, setSyncOpen] = useState(false)
    const [syncing, setSyncing] = useState(false)
    const [syncError, setSyncError] = useState('')
    const [syncResult, setSyncResult] = useState<{ created: number; updated: number; failed: number; errors: any[] } | null>(null)

    const handleFetch = useCallback(async () => {
        if (!dateFrom || !dateTo) { setError('يرجى تحديد التاريخين'); return }
        setLoading(true); setError(''); setSyncResult(null)
        try {
            const { data } = await sapAPI.getProductsByDate(dateFrom, dateTo)
            setItems(data.items || [])
            setHasFetched(true)
        } catch (e: any) {
            setError(e?.response?.data?.error || 'فشل جلب الأصناف')
        } finally { setLoading(false) }
    }, [dateFrom, dateTo])

    const filtered = useMemo(() => {
        if (!search) return items
        const q = search.toLowerCase()
        return items.filter(it =>
            it.material_number.toLowerCase().includes(q) ||
            (it.description_ar || '').toLowerCase().includes(q) ||
            (it.description_en || '').toLowerCase().includes(q)
        )
    }, [items, search])

    const newCount = items.filter(i => !i.exists_locally).length
    const existingCount = items.length - newCount

    const handleSyncAll = useCallback(async () => {
        setSyncing(true); setSyncError(''); setSyncResult(null)
        try {
            const { data } = await sapAPI.syncProducts(items)
            setSyncResult({
                created: data.created || 0,
                updated: data.updated || 0,
                failed: data.failed || 0,
                errors: data.errors || [],
            })
            onSyncComplete?.()
            const refetch = await sapAPI.getProductsByDate(dateFrom, dateTo)
            setItems(refetch.data.items || [])
        } catch (e: any) {
            setSyncError(e?.response?.data?.error || 'فشلت المزامنة')
        } finally { setSyncing(false) }
    }, [items, dateFrom, dateTo, onSyncComplete])

    const exportExcel = useCallback(() => {
        if (!filtered.length) return
        const headers = ['#', 'رمز الصنف', 'الوصف عربي', 'الوصف إنجليزي', 'التصنيف', 'بلد المنشأ', 'الوحدة', 'تاريخ الإنشاء', 'تاريخ التعديل', 'الحالة']
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
                        <span className="sap-stat-chip">جديد: <span className="stat-value" style={{ color: 'var(--color-gold)' }}>{newCount}</span></span>
                        <span className="sap-stat-chip">موجود: <span className="stat-value">{existingCount}</span></span>
                    </div>

                    {items.length > 0 && (
                        <div className="sap-toolbar">
                            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                                <Search size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)', pointerEvents: 'none' }} />
                                <input className="sap-search-input" placeholder="بحث في النتائج..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingRight: 36 }} />
                            </div>
                            <button className="sap-test-btn" onClick={exportExcel} disabled={!filtered.length}>
                                <Download size={14} /> تصدير Excel
                            </button>
                            <button className="sap-sync-btn" onClick={() => setSyncOpen(true)} disabled={syncing}>
                                <Database size={14} /> مزامنة الكل ({items.length})
                            </button>
                        </div>
                    )}

                    {items.length === 0 ? (
                        <div className="sap-empty-state">
                            <div className="empty-icon">📭</div>
                            <h3>لا توجد أصناف في هذه الفترة</h3>
                            <p>جرّب تغيير نطاق التاريخ</p>
                        </div>
                    ) : (
                        <div className="sap-products-table-wrap">
                            <table className="sap-products-table">
                                <thead>
                                    <tr>
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
                                    {filtered.map((it, i) => (
                                        <tr key={it.material_number} onClick={() => setSelected(it)}>
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
                                                    ? <span className="sap-info-pill small">موجود</span>
                                                    : <span className="sap-info-pill small new">جديد</span>}
                                            </td>
                                        </tr>
                                    ))}
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
                    <div className="sap-sync-modal" onClick={e => e.stopPropagation()}>
                        <h3>مزامنة الأصناف مع النظام</h3>
                        {!syncResult && (
                            <>
                                <div className="sap-sync-summary">
                                    <div className="sap-sync-summary-item"><div className="sync-label">الإجمالي</div><div className="sync-value">{items.length}</div></div>
                                    <div className="sap-sync-summary-item create"><div className="sync-label">جديد</div><div className="sync-value">{newCount}</div></div>
                                    <div className="sap-sync-summary-item update"><div className="sync-label">تحديث</div><div className="sync-value">{existingCount}</div></div>
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
                                    سيتم جلب وحفظ {items.length} صنف. قد تستغرق العملية بضع دقائق.
                                </div>
                            </>
                        )}
                        {syncError && <div className="sap-error-box">{syncError}</div>}
                        {syncResult && (
                            <div className="sap-sync-result">
                                نجحت المزامنة — تمت إضافة {syncResult.created}، تحديث {syncResult.updated}
                                {syncResult.failed > 0 && `، فشل ${syncResult.failed}`}
                                {syncResult.errors.length > 0 && (
                                    <details style={{ marginTop: 8 }}>
                                        <summary style={{ cursor: 'pointer' }}>تفاصيل الأخطاء ({syncResult.errors.length})</summary>
                                        <div style={{ maxHeight: 150, overflowY: 'auto', marginTop: 8, fontSize: 12 }}>
                                            {syncResult.errors.map((e, i) => (
                                                <div key={i}><strong>{e.sku}:</strong> {e.error}</div>
                                            ))}
                                        </div>
                                    </details>
                                )}
                            </div>
                        )}
                        <div className="sap-sync-actions">
                            {!syncResult ? (
                                <>
                                    <button className="sap-sync-confirm-btn" onClick={handleSyncAll} disabled={syncing}>
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
