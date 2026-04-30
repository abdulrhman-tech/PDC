import { useState, useCallback, useRef, useEffect } from 'react'
import { sapAPI } from '@/api/client'
import type { SapEnv } from '@/api/client'
import { useSapEnv } from './SapEnvContext'
import { useFetchedAtLabel } from './useFetchedAtLabel'
import { Search, Loader2, Plus, Check, Package, Layers } from 'lucide-react'

interface ProductData {
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

interface Props { onProductSaved?: () => void }

export default function ProductLookupTab({ onProductSaved }: Props) {
    const { env } = useSapEnv()
    const envRef = useRef(env)
    useEffect(() => { envRef.current = env }, [env])
    const [query, setQuery] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [product, setProduct] = useState<ProductData | null>(null)
    const [productEnv, setProductEnv] = useState<SapEnv | null>(null)
    const [fetchedAt, setFetchedAt] = useState<Date | null>(null)
    const fetchedAtLabel = useFetchedAtLabel(fetchedAt)
    const [saving, setSaving] = useState(false)
    const [saveMessage, setSaveMessage] = useState('')
    const [saveError, setSaveError] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    // Drop the previous lookup result when the env changes — its hierarchy/
    // attributes belong to the other server and would mislead the user.
    useEffect(() => {
        setProduct(null)
        setProductEnv(null)
        setFetchedAt(null)
        setError('')
        setSaveMessage('')
        setSaveError('')
    }, [env])

    const handleSearch = useCallback(async () => {
        const q = query.trim()
        if (!q) return
        const reqEnv = env
        setLoading(true); setError(''); setProduct(null); setProductEnv(null); setFetchedAt(null); setSaveMessage(''); setSaveError('')
        try {
            const { data } = await sapAPI.getProduct(q, reqEnv)
            // Discard if the user switched env mid-flight.
            if (envRef.current !== reqEnv) return
            setProduct(data)
            setProductEnv(reqEnv)
            setFetchedAt(new Date())
        } catch (e: any) {
            if (envRef.current !== reqEnv) return
            const status = e?.response?.status
            if (status === 404) {
                setError('الصنف غير موجود في SAP. تأكد من الرمز وحاول مرة ثانية.')
            } else {
                setError(e?.response?.data?.error || 'فشل البحث عن الصنف')
            }
        } finally {
            if (envRef.current === reqEnv) setLoading(false)
        }
    }, [env, query])

    const handleSave = useCallback(async () => {
        if (!product) return
        const reqEnv = env
        setSaving(true); setSaveMessage(''); setSaveError('')
        try {
            const { data } = await sapAPI.saveProduct(product.material_number, reqEnv)
            if (envRef.current !== reqEnv) return
            setSaveMessage(data.message || 'تم الحفظ بنجاح')
            setProduct(prev => prev ? { ...prev, exists_locally: true } : prev)
            onProductSaved?.()
        } catch (e: any) {
            if (envRef.current !== reqEnv) return
            setSaveError(e?.response?.data?.error || 'فشل حفظ الصنف')
        } finally {
            if (envRef.current === reqEnv) setSaving(false)
        }
    }, [env, product, onProductSaved])

    const filledAttrs = product?.attributes.filter(a => a.value) || []
    const emptyAttrs = product?.attributes.filter(a => !a.value) || []

    return (
        <div className="sap-product-tab">
            <div className="sap-search-row">
                <div className="sap-search-input-wrap">
                    <Search size={18} className="sap-search-icon" />
                    <input
                        ref={inputRef}
                        className="sap-product-search-input"
                        placeholder="أدخل رمز الصنف... مثال: C100.028"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
                        disabled={loading}
                    />
                </div>
                <button className="sap-fetch-btn" onClick={handleSearch} disabled={loading || !query.trim()}>
                    {loading
                        ? <Loader2 size={14} className="spin-icon" style={{ animation: 'sapSpin 1s linear infinite' }} />
                        : <Search size={14} />}
                    بحث
                </button>
            </div>

            {error && <div className="sap-error-box">{error}</div>}

            {loading && (
                <div className="sap-spinner"><Loader2 size={20} className="spin-icon" />جاري البحث في SAP...</div>
            )}

            {!loading && !product && !error && (
                <div className="sap-empty-state">
                    <div className="empty-icon">🔍</div>
                    <h3>ابحث عن صنف بالرمز</h3>
                    <p>أدخل رمز الصنف في الأعلى ثم اضغط بحث أو Enter</p>
                </div>
            )}

            {product && (
                <div className="sap-product-card">
                    <div className="sap-product-header">
                        <div className="sap-product-header-main">
                            <Package size={24} />
                            <div>
                                <div className="sap-product-sku">{product.material_number}</div>
                                <div className="sap-product-name">{product.description_ar || product.description_en || '—'}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {productEnv && (
                                <span className="sap-fetched-from">
                                    آخر جلب:
                                    <span className={`env-badge ${productEnv.toLowerCase()}`}>{productEnv}</span>
                                    {fetchedAt && (
                                        <span className="sap-fetched-at" title={fetchedAtLabel.tooltip}>
                                            · {fetchedAtLabel.relative}
                                            <span className="sap-fetched-at-time">({fetchedAtLabel.absolute})</span>
                                        </span>
                                    )}
                                </span>
                            )}
                            <span className={`sap-product-status ${product.is_active ? 'active' : 'inactive'}`}>
                                {product.is_active ? '✓ فعال' : '✕ غير فعال'}
                            </span>
                        </div>
                    </div>

                    <div className="sap-product-fields">
                        <Field label="رمز الصنف" value={product.material_number} mono />
                        <Field label="الوصف بالعربية" value={product.description_ar} />
                        <Field label="الوصف بالإنجليزية" value={product.description_en} />
                        <Field label="كود التصنيف" value={product.material_group_code} mono />
                        <Field label="بلد المنشأ" value={product.origin_country} />
                        <Field label="وحدة القياس" value={product.unit_of_measure} />
                        <Field label="تاريخ الإنشاء" value={fmtDate(product.created_date)} />
                        <Field label="تاريخ التعديل" value={fmtDate(product.changed_date)} />
                    </div>

                    {product.hierarchy.length > 0 && (
                        <div className="sap-product-section">
                            <h4><Layers size={16} /> مسار التصنيف الهرمي</h4>
                            <div className="sap-hierarchy-breadcrumbs">
                                {product.hierarchy.map((h, i) => (
                                    <div key={i} className="sap-hierarchy-crumb">
                                        {h.parent_code && <span className="crumb-parent mono">{h.parent_code}</span>}
                                        {h.parent_code && <span className="crumb-sep">‹</span>}
                                        <span className="crumb-code mono">{h.code}</span>
                                        {(h.name_ar || h.name_en) && <span className="crumb-name">({h.name_ar || h.name_en})</span>}
                                        <span className={`sap-level-badge level-${h.level}`}>المستوى {h.level}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {product.attributes.length > 0 && (
                        <div className="sap-product-section">
                            <h4>السمات ({product.attributes.length})</h4>
                            <div className="sap-attrs-table">
                                {filledAttrs.map((a, i) => (
                                    <div key={`f${i}`} className="sap-attr-row filled">
                                        <span className="attr-name">{a.name}</span>
                                        <span className="attr-value">{a.value}</span>
                                    </div>
                                ))}
                                {emptyAttrs.map((a, i) => (
                                    <div key={`e${i}`} className="sap-attr-row empty">
                                        <span className="attr-name">{a.name}</span>
                                        <span className="attr-value">—</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {saveMessage && (
                        <div className="sap-success-box"><Check size={16} /> {saveMessage}</div>
                    )}
                    {saveError && <div className="sap-error-box">{saveError}</div>}

                    <div className="sap-product-actions">
                        <button className="sap-sync-btn" onClick={handleSave} disabled={saving}>
                            {saving
                                ? <Loader2 size={14} className="spin-icon" style={{ animation: 'sapSpin 1s linear infinite' }} />
                                : <Plus size={14} />}
                            {product.exists_locally ? 'تحديث في النظام' : 'إضافة للنظام'}
                        </button>
                        {product.exists_locally && <span className="sap-info-pill">موجود مسبقاً في النظام</span>}
                    </div>
                </div>
            )}
        </div>
    )
}

function Field({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
    return (
        <div className="sap-product-field">
            <label>{label}</label>
            <div className={`value${mono ? ' mono' : ''}`}>{value || '—'}</div>
        </div>
    )
}
