/**
 * Product Management — Screen 4
 * Full data table with filters, bulk actions, pagination
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Edit3, Eye, CheckSquare, Square, Search, X, ChevronRight, ChevronLeft, Trash2, AlertTriangle, ScrollText, Upload, Download, FileSpreadsheet, CheckCircle2, XCircle, Loader2, Images } from 'lucide-react'
import { productsAPI, categoriesAPI } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'react-toastify'
import type { Product } from '@/types'
import ProductLogsModal from '@/components/ProductLogsModal/ProductLogsModal'
import BulkImageUploadModal from '@/components/BulkImageUploadModal/BulkImageUploadModal'

const PAGE_SIZE = 24

const STATUS_BADGE: Record<string, string> = {
    'نشط': 'badge-active', 'مسودة': 'badge-draft',
    'قيد_المراجعة': 'badge-pending', 'موقوف': 'badge-inactive', 'منتهي': 'badge-discontinued',
}

const STATUS_OPTIONS = [
    { value: '', label: 'كل الحالات' },
    { value: 'نشط', label: 'نشط' },
    { value: 'مسودة', label: 'مسودة' },
    { value: 'قيد_المراجعة', label: 'قيد المراجعة' },
    { value: 'موقوف', label: 'موقوف' },
    { value: 'منتهي', label: 'منتهي' },
]

const STOCK_OPTIONS = [
    { value: '', label: 'كل المخزون' },
    { value: 'ستوك', label: 'ستوك' },
    { value: 'دوري', label: 'دوري' },
    { value: 'أمر_شراء', label: 'أمر شراء' },
]

interface Category { id: number; name_ar: string; slug: string }

/* ── Import Excel Modal ── */
interface ImportResult {
    created_count: number
    error_count: number
    updated_count?: number
    format?: string
    created: { row: number; sku: string; name: string }[]
    updated?: { row: number; sku: string; name: string }[]
    errors: { row: number; sku: string; errors: string[] }[]
}

function ImportExcelModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const [result, setResult] = useState<ImportResult | null>(null)
    const [importing, setImporting] = useState(false)
    const [downloading, setDownloading] = useState(false)
    const [selectedCatId, setSelectedCatId] = useState<string>('')
    const fileInputRef = useRef<HTMLInputElement>(null)

    const { data: catsData } = useQuery({
        queryKey: ['categories-list'],
        queryFn: () => categoriesAPI.list(),
    })
    const categories: { id: number; name_ar: string; slug: string }[] = catsData?.data?.results || catsData?.data || []

    const selectedCat = categories.find(c => String(c.id) === selectedCatId)

    // Auto-select if only one category (dept manager)
    useEffect(() => {
        if (categories.length === 1 && !selectedCatId) {
            setSelectedCatId(String(categories[0].id))
        }
    }, [categories, selectedCatId])

    const handleDownloadTemplate = async () => {
        if (!selectedCatId) { toast.warning('اختر القسم أولاً'); return }
        setDownloading(true)
        try {
            const res = await productsAPI.downloadImportTemplate(selectedCatId)
            const url = URL.createObjectURL(new Blob([res.data]))
            const a = document.createElement('a')
            a.href = url
            a.download = `template_${selectedCat?.slug || 'products'}.xlsx`
            a.click()
            URL.revokeObjectURL(url)
        } catch {
            toast.error('فشل تحميل القالب')
        } finally {
            setDownloading(false)
        }
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
            toast.error('يُرجى رفع ملف Excel (.xlsx أو .xls)')
            return
        }
        setImporting(true)
        setResult(null)
        const fd = new FormData()
        fd.append('file', file)
        if (selectedCatId) fd.append('category_id', selectedCatId)
        try {
            const res = await productsAPI.importExcel(fd)
            setResult(res.data)
            if ((res.data.created_count || 0) > 0 || (res.data.updated_count || 0) > 0) {
                onSuccess()
            }
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'فشل استيراد الملف'
            toast.error(msg)
        } finally {
            setImporting(false)
            e.target.value = ''
        }
    }

    useEffect(() => {
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = prev }
    }, [])

    const overlay: React.CSSProperties = {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.70)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }
    const box: React.CSSProperties = {
        background: 'var(--color-surface)', border: '1px solid rgba(200,168,75,0.25)', borderRadius: 16,
        padding: 28, width: '100%', maxWidth: 700, maxHeight: '90vh', overflowY: 'auto',
        fontFamily: 'inherit', direction: 'rtl',
    }

    const stepBox: React.CSSProperties = {
        background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)',
        borderRadius: 10, padding: '14px 16px', marginBottom: 14,
    }
    const stepTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--color-gold)', marginBottom: 8 }

    return createPortal(
        <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
            <div style={box}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(200,168,75,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <FileSpreadsheet size={20} color="#C8A84B" />
                        </div>
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>استيراد منتجات من Excel</div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>قالب ديناميكي حسب القسم — بيانات أساسية + سمات خاصة</div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}>
                        <X size={18} />
                    </button>
                </div>

                {/* SAP file note */}
                <div style={{
                    background: 'rgba(74, 222, 128, 0.06)',
                    border: '1px solid rgba(74, 222, 128, 0.25)',
                    borderRadius: 10, padding: '12px 16px', marginBottom: 14,
                    fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.7,
                }}>
                    <div style={{ color: '#4ADE80', fontWeight: 700, marginBottom: 4, fontSize: 13 }}>
                        ⚡ ملف SAP — لا يحتاج اختيار قسم
                    </div>
                    لو الملف فيه عمود <code style={{ color: '#C8A84B' }}>Material_No.Material Group No</code>،
                    ينربط كل منتج بقسمه تلقائياً. ارفع الملف مباشرة في الخطوة (③).
                </div>

                {/* Step 1: Choose Category */}
                <div style={stepBox}>
                    <div style={stepTitle}>① اختر القسم (اختياري لملفات SAP)</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
                        لقالب PDC كل قسم له قالب مختلف يشمل السمات الخاصة به.
                    </div>
                    {categories.length === 1 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(200,168,75,0.07)', border: '1px solid rgba(200,168,75,0.3)', borderRadius: 8 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#C8A84B', flexShrink: 0 }} />
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-gold)' }}>{categories[0].name_ar}</div>
                                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 1 }}>قسمك المعيّن — لا يمكن تغييره</div>
                            </div>
                        </div>
                    ) : (
                        <select
                            value={selectedCatId}
                            onChange={e => { setSelectedCatId(e.target.value); setResult(null) }}
                            style={{
                                width: '100%', padding: '9px 12px', background: 'var(--color-bg)',
                                border: selectedCatId ? '1px solid rgba(200,168,75,0.5)' : '1px solid var(--color-border-strong)',
                                borderRadius: 8, color: selectedCatId ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                                fontSize: 13, fontFamily: 'inherit', direction: 'rtl', outline: 'none', cursor: 'pointer',
                            }}
                        >
                            <option value="">— اختر القسم —</option>
                            {categories.map(c => (
                                <option key={c.id} value={c.id}>{c.name_ar}</option>
                            ))}
                        </select>
                    )}
                </div>

                {/* Step 2: Download template */}
                <div style={{ ...stepBox, opacity: selectedCatId ? 1 : 0.45 }}>
                    <div style={stepTitle}>② تحميل القالب الخاص بالقسم</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10, lineHeight: 1.7 }}>
                        يتضمن القالب الأعمدة الأساسية + السمات الديناميكية للقسم المحدد.
                        {selectedCat && <> <strong style={{ color: '#4ADE80' }}>الأعمدة الخضراء</strong> = سمات خاصة بـ {selectedCat.name_ar}.</>}
                    </div>
                    <button onClick={handleDownloadTemplate} disabled={downloading || !selectedCatId}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: 'rgba(200,168,75,0.12)', border: '1px solid rgba(200,168,75,0.3)', borderRadius: 8, color: 'var(--color-gold)', fontSize: 12, fontWeight: 600, cursor: (downloading || !selectedCatId) ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                        {downloading ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Download size={14} />}
                        {downloading ? 'جاري التحميل...' : 'تحميل القالب (.xlsx)'}
                    </button>
                </div>

                {/* Step 3: Upload */}
                <div style={stepBox}>
                    <div style={stepTitle}>③ رفع الملف المكتمل</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10, lineHeight: 1.6 }}>
                        ارفع الملف هنا. النظام يكتشف صيغة الملف تلقائياً (قالب PDC أو SAP) ويضيف/يحدّث المنتجات بسماتها.
                    </div>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileChange} />
                    <button onClick={() => fileInputRef.current?.click()} disabled={importing}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 18px', background: importing ? 'rgba(200,168,75,0.06)' : 'linear-gradient(135deg,#C8A84B,#a8832f)', border: 'none', borderRadius: 8, color: importing ? 'var(--color-text-muted)' : 'var(--color-bg)', fontSize: 12, fontWeight: 700, cursor: importing ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                        {importing ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Upload size={14} />}
                        {importing ? 'جاري الاستيراد...' : 'اختر ملف Excel للرفع'}
                    </button>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 8 }}>يدعم .xlsx و .xls</div>
                </div>

                {/* Results */}
                {result && (
                    <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ display: 'flex' }}>
                            <div style={{ flex: 1, padding: '14px 16px', background: result.created_count > 0 ? 'rgba(39,174,96,0.08)' : 'var(--color-surface-raised)', borderLeft: '1px solid var(--color-border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#27AE60', fontWeight: 700, fontSize: 14 }}>
                                    <CheckCircle2 size={16} /> {result.created_count} منتج أُضيف بنجاح
                                </div>
                            </div>
                            <div style={{ flex: 1, padding: '14px 16px', background: result.error_count > 0 ? 'rgba(231,76,60,0.08)' : 'var(--color-surface-raised)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: result.error_count > 0 ? '#E74C3C' : 'var(--color-text-muted)', fontWeight: 700, fontSize: 14 }}>
                                    <XCircle size={16} /> {result.error_count} صف به أخطاء
                                </div>
                            </div>
                        </div>
                        {result.errors.length > 0 && (
                            <div style={{ padding: '12px 16px', maxHeight: 200, overflowY: 'auto', borderTop: '1px solid var(--color-border)' }}>
                                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8, fontWeight: 600 }}>تفاصيل الأخطاء</div>
                                {result.errors.map((e, i) => (
                                    <div key={i} style={{ background: 'rgba(231,76,60,0.06)', border: '1px solid rgba(231,76,60,0.15)', borderRadius: 7, padding: '8px 12px', marginBottom: 6 }}>
                                        <div style={{ fontSize: 12, color: '#E74C3C', fontWeight: 600, marginBottom: 4 }}>الصف {e.row} — SKU: {e.sku}</div>
                                        {e.errors.map((msg, j) => <div key={j} style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginRight: 8 }}>• {msg}</div>)}
                                    </div>
                                ))}
                            </div>
                        )}
                        {result.created.length > 0 && (
                            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--color-border)', maxHeight: 150, overflowY: 'auto' }}>
                                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6, fontWeight: 600 }}>المنتجات المضافة</div>
                                {result.created.map((c, i) => (
                                    <div key={i} style={{ fontSize: 11, color: 'var(--color-text-secondary)', padding: '2px 0', borderBottom: '1px solid var(--color-border)' }}>
                                        <span style={{ color: '#27AE60', marginLeft: 6 }}>✓</span>{c.sku} — {c.name}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>,
        document.body
    )
}

/* ── Export Products Modal ── */
function ExportModal({ onClose, categories }: { onClose: () => void; categories: Category[] }) {
    const [exportCat, setExportCat] = useState('')
    const [exportStatus, setExportStatus] = useState('')
    const [exportStock, setExportStock] = useState('')
    const [exporting, setExporting] = useState(false)

    const selStyle: React.CSSProperties = {
        width: '100%', height: 40, padding: '0 12px',
        border: '1px solid var(--color-border-strong)', borderRadius: 8,
        fontSize: 13, color: 'var(--color-text-primary)', background: 'var(--color-surface-hover)',
        outline: 'none', cursor: 'pointer',
    }

    const handleExport = async () => {
        setExporting(true)
        try {
            const params: Record<string, string> = { page_size: '10000' }
            if (exportCat) params.category = exportCat
            if (exportStatus) params.status = exportStatus
            if (exportStock) params.inventory_type = exportStock
            const res = await productsAPI.list(params)
            const products: Product[] = res.data.results || res.data || []

            if (products.length === 0) {
                toast.warning('لا توجد منتجات تطابق الفلاتر المحددة')
                setExporting(false)
                return
            }

            const headers = ['SKU', 'اسم المنتج', 'التصنيف', 'الماركة', 'بلد المنشأ', 'الحالة', 'نوع المخزون', 'اللون', 'تاريخ الإضافة']
            const BOM = '\uFEFF'
            const csvRows = [headers.join(',')]
            for (const p of products) {
                const row = [
                    p.sku,
                    `"${(p.product_name_ar || '').replace(/"/g, '""')}"`,
                    `"${(p.category_name || '').replace(/"/g, '""')}"`,
                    `"${(p.brand_name || '').replace(/"/g, '""')}"`,
                    `"${(p.origin_country || '').replace(/"/g, '""')}"`,
                    p.status,
                    p.inventory_type || '',
                    `"${(p.color || '').replace(/"/g, '""')}"`,
                    p.created_at?.split('T')[0] || '',
                ]
                csvRows.push(row.join(','))
            }
            const blob = new Blob([BOM + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            const dateSuffix = new Date().toISOString().split('T')[0]
            a.download = `products_export_${dateSuffix}.csv`
            a.click()
            URL.revokeObjectURL(url)
            toast.success(`تم تصدير ${products.length} منتج بنجاح`)
            onClose()
        } catch {
            toast.error('فشل تصدير المنتجات')
        } finally {
            setExporting(false)
        }
    }

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose() }}>
            <div style={{ background: 'var(--color-surface-raised)', borderRadius: 14, width: '95%', maxWidth: 440, padding: 28, boxShadow: 'var(--shadow-lg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(46,125,90,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Download size={20} color="#2E7D5A" />
                        </div>
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>تصدير المنتجات</div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>تصدير ملف CSV مع إمكانية الفلترة</div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}>
                        <X size={18} />
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 22 }}>
                    <div>
                        <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6, display: 'block' }}>التصنيف</label>
                        <select style={selStyle} value={exportCat} onChange={e => setExportCat(e.target.value)}>
                            <option value="">كل التصنيفات</option>
                            {categories.map(c => <option key={c.id} value={c.slug}>{c.name_ar}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6, display: 'block' }}>الحالة</label>
                        <select style={selStyle} value={exportStatus} onChange={e => setExportStatus(e.target.value)}>
                            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6, display: 'block' }}>نوع المخزون</label>
                        <select style={selStyle} value={exportStock} onChange={e => setExportStock(e.target.value)}>
                            {STOCK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                </div>

                <button
                    onClick={handleExport}
                    disabled={exporting}
                    style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        padding: '11px 20px', background: exporting ? 'rgba(46,125,90,0.3)' : 'linear-gradient(135deg, #2E7D5A, #1a5c3a)',
                        border: 'none', borderRadius: 8, color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 700,
                        cursor: exporting ? 'not-allowed' : 'pointer', transition: 'all .15s',
                    }}
                >
                    {exporting ? <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Download size={16} />}
                    {exporting ? 'جاري التصدير...' : 'تصدير المنتجات'}
                </button>
            </div>
        </div>,
        document.body
    )
}

/* ── Pagination ── */
function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
    const totalPages = Math.ceil(total / pageSize)
    if (totalPages <= 1) return null

    const getPages = () => {
        const pages: (number | '...')[] = []
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i)
        } else {
            pages.push(1)
            if (page > 3) pages.push('...')
            for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i)
            if (page < totalPages - 2) pages.push('...')
            pages.push(totalPages)
        }
        return pages
    }

    const btnBase: React.CSSProperties = {
        minWidth: 36, height: 36, border: '1px solid var(--color-border)',
        borderRadius: 8, cursor: 'pointer', fontSize: 13,
        fontFamily: 'inherit', display: 'flex',
        alignItems: 'center', justifyContent: 'center', transition: 'all .15s',
        background: 'var(--color-surface)', color: 'var(--color-text-secondary)',
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 28, flexWrap: 'wrap' }}>
            <button style={{ ...btnBase, opacity: page === 1 ? 0.4 : 1, padding: '0 10px' }}
                disabled={page === 1} onClick={() => onChange(page - 1)}>
                <ChevronRight size={15} />
                <span style={{ marginRight: 4, fontSize: 12 }}>السابق</span>
            </button>

            {getPages().map((p, i) =>
                p === '...' ? (
                    <span key={`dots-${i}`} style={{ ...btnBase, border: 'none', background: 'none', cursor: 'default', color: 'var(--color-text-muted)' }}>…</span>
                ) : (
                    <button key={p}
                        style={{ ...btnBase, background: p === page ? 'var(--color-gold)' : 'var(--color-surface)', color: p === page ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)', fontWeight: p === page ? 700 : 400, borderColor: p === page ? 'var(--color-gold)' : 'var(--color-border)' }}
                        onClick={() => onChange(p as number)}>
                        {p}
                    </button>
                )
            )}

            <button style={{ ...btnBase, opacity: page === totalPages ? 0.4 : 1, padding: '0 10px' }}
                disabled={page === totalPages} onClick={() => onChange(page + 1)}>
                <span style={{ marginLeft: 4, fontSize: 12 }}>التالي</span>
                <ChevronLeft size={15} />
            </button>
        </div>
    )
}

/* ── Delete Confirm Modal ── */
function DeleteModal({ count, onConfirm, onCancel, loading }: {
    count: number; onConfirm: () => void; onCancel: () => void; loading: boolean
}) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 16, padding: 32, maxWidth: 400, width: '90%', textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <AlertTriangle size={28} color="var(--color-red)" />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8 }}>
                    تأكيد الحذف
                </h3>
                <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
                    سيتم حذف <strong style={{ color: 'var(--color-red)' }}>{count === 1 ? 'هذا المنتج' : `${count} منتجات`}</strong> نهائياً.
                    <br />هذا الإجراء لا يمكن التراجع عنه.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <button onClick={onCancel} disabled={loading}
                        style={{ padding: '10px 24px', border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-surface-raised)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
                        إلغاء
                    </button>
                    <button onClick={onConfirm} disabled={loading}
                        style={{ padding: '10px 24px', border: 'none', borderRadius: 8, background: 'rgba(239,68,68,0.2)', color: 'var(--color-red)', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 14, fontFamily: 'inherit', opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Trash2 size={14} />
                        {loading ? 'جاري الحذف...' : 'حذف نهائياً'}
                    </button>
                </div>
            </div>
        </div>
    )
}

/* ── Filter Bar ── */
interface Filters { search: string; category: string; status: string; inventory_type: string }
const emptyFilters = (): Filters => ({ search: '', category: '', status: '', inventory_type: '' })

function FilterBar({ filters, categories, onChange, onReset }: {
    filters: Filters
    categories: Category[]
    onChange: (f: Filters) => void
    onReset: () => void
}) {
    const hasActive = filters.search || filters.category || filters.status || filters.inventory_type

    const selStyle: React.CSSProperties = {
        height: 38, padding: '0 12px', border: '1px solid var(--color-border-strong)',
        borderRadius: 8, fontSize: 13, fontFamily: 'inherit',
        color: 'var(--color-text-primary)', background: 'var(--color-surface-raised)', outline: 'none', cursor: 'pointer',
    }

    return (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '14px 16px', marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search */}
            <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
                <Search size={14} style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
                <input
                    style={{ width: '100%', height: 38, paddingRight: 34, paddingLeft: 12, border: '1px solid var(--color-border-strong)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: 'var(--color-text-primary)', background: 'var(--color-surface-raised)', outline: 'none', boxSizing: 'border-box' }}
                    placeholder="بحث بالاسم أو SKU..."
                    value={filters.search}
                    onChange={e => onChange({ ...filters, search: e.target.value })}
                />
            </div>

            {/* Category */}
            <select style={selStyle} value={filters.category} onChange={e => onChange({ ...filters, category: e.target.value })}>
                <option value="">كل التصنيفات</option>
                {categories.map(c => <option key={c.id} value={c.slug}>{c.name_ar}</option>)}
            </select>

            {/* Status */}
            <select style={selStyle} value={filters.status} onChange={e => onChange({ ...filters, status: e.target.value })}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            {/* Inventory type */}
            <select style={selStyle} value={filters.inventory_type} onChange={e => onChange({ ...filters, inventory_type: e.target.value })}>
                {STOCK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            {/* Reset */}
            {hasActive && (
                <button onClick={onReset}
                    style={{ height: 38, padding: '0 14px', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: 'var(--color-red)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontFamily: 'inherit' }}>
                    <X size={13} />
                    مسح الفلاتر
                </button>
            )}
        </div>
    )
}

/* ══════════════════════════════════════════
   Main Page
══════════════════════════════════════════ */
export default function ProductManagementPage() {
    const navigate = useNavigate()
    const user = useAuthStore((s) => s.user)
    const qc = useQueryClient()
    const [selected, setSelected] = useState<number[]>([])
    const [page, setPage] = useState(1)
    const [filters, setFilters] = useState<Filters>(emptyFilters())
    // deleteTarget: null = no modal, number = single id, 'bulk' = selected ids
    const [deleteTarget, setDeleteTarget] = useState<null | number | 'bulk'>(null)
    // logTarget: المنتج الذي نعرض سجله
    const [logTarget, setLogTarget] = useState<Product | null>(null)
    const [showImport, setShowImport] = useState(false)
    const [showExport, setShowExport] = useState(false)
    const [showBulkImages, setShowBulkImages] = useState(false)

    const canDelete = user?.role === 'super_admin'
    const canPublish = !!user?.permissions?.can_publish_product

    const invalidate = useCallback(() => {
        qc.invalidateQueries({ queryKey: ['products-mgmt'] })
    }, [qc])

    const deleteMutation = useMutation({
        mutationFn: async (ids: number[]) => {
            await Promise.all(ids.map(id => productsAPI.delete(id)))
        },
        onSuccess: (_data, ids) => {
            toast.success(ids.length === 1 ? 'تم حذف المنتج' : `تم حذف ${ids.length} منتجات`)
            setSelected([])
            setDeleteTarget(null)
            invalidate()
        },
        onError: () => {
            toast.error('فشل الحذف، حاول مرة أخرى')
        },
    })

    const handleDeleteConfirm = useCallback(() => {
        if (deleteTarget === null) return
        const ids = deleteTarget === 'bulk' ? selected : [deleteTarget]
        deleteMutation.mutate(ids)
    }, [deleteTarget, selected, deleteMutation])

    /* ── Bulk activate (publish) selected products ─────────────────────
     *  Uses the existing per-product publish endpoint in parallel via
     *  allSettled so a failure on one product (e.g. missing approved main
     *  image, status not eligible) doesn't abort the whole batch. We then
     *  surface a per-bucket summary toast. */
    const activateMutation = useMutation({
        mutationFn: async (ids: number[]) => {
            const results = await Promise.allSettled(ids.map(id => productsAPI.publish(id)))
            const succeeded: number[] = []
            const failed: { id: number; reason: string }[] = []
            results.forEach((r, i) => {
                const id = ids[i]
                if (r.status === 'fulfilled') {
                    succeeded.push(id)
                } else {
                    const detail =
                        (r.reason as any)?.response?.data?.detail ||
                        (r.reason as any)?.message ||
                        'خطأ غير معروف'
                    failed.push({ id, reason: String(detail) })
                }
            })
            return { succeeded, failed }
        },
        onSuccess: ({ succeeded, failed }) => {
            if (succeeded.length > 0) {
                toast.success(
                    succeeded.length === 1
                        ? 'تم تنشيط المنتج'
                        : `تم تنشيط ${succeeded.length} منتجات`,
                )
            }
            if (failed.length > 0) {
                // Show first failure reason as a hint; common cause is "missing main image"
                const sample = failed[0].reason
                toast.error(
                    failed.length === 1
                        ? `تعذّر التنشيط: ${sample}`
                        : `تعذّر تنشيط ${failed.length} منتج (${sample})`,
                )
            }
            // Drop only the ones we actually activated, keep failures selected
            // so the user can fix them and retry without re-selecting.
            setSelected(prev => prev.filter(id => !succeeded.includes(id)))
            invalidate()
        },
        onError: () => {
            toast.error('فشل التنشيط، حاول مرة أخرى')
        },
    })

    const handleFiltersChange = useCallback((f: Filters) => {
        setFilters(f)
        setPage(1)
        setSelected([])
    }, [])

    const handleReset = useCallback(() => {
        setFilters(emptyFilters())
        setPage(1)
        setSelected([])
    }, [])

    const handlePageChange = useCallback((p: number) => {
        setPage(p)
        setSelected([])
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }, [])

    // Build params
    const params: Record<string, string | number> = { page, page_size: PAGE_SIZE }
    if (filters.search) params.search = filters.search
    if (filters.category) params.category = filters.category
    if (filters.status) params.status = filters.status
    if (filters.inventory_type) params.inventory_type = filters.inventory_type

    const { data, isLoading } = useQuery({
        queryKey: ['products-mgmt', params],
        queryFn: () => productsAPI.list(params).then(r => r.data),
        placeholderData: (prev) => prev,
    })
    const products: Product[] = data?.results ?? []
    const totalCount = data?.count ?? 0

    const { data: catsData } = useQuery({
        queryKey: ['categories'],
        queryFn: () => categoriesAPI.list().then(r => r.data),
        staleTime: 5 * 60 * 1000,
    })
    const categories: Category[] = Array.isArray(catsData) ? catsData : (catsData?.results ?? [])

    const toggleSelect = (id: number) =>
        setSelected(s => s.includes(id) ? s.filter(i => i !== id) : [...s, id])

    const toggleAll = () =>
        setSelected(s => s.length === products.length ? [] : products.map(p => p.id))

    return (
        <div className="page-enter">
            <div className="page-header">
                <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ flex: '1 1 auto' }}>
                        <h1 className="page-header-title">إدارة المنتجات</h1>
                        <p className="page-header-sub">
                            {totalCount.toLocaleString('ar')} منتج
                            {(filters.search || filters.category || filters.status || filters.inventory_type) &&
                                <span style={{ color: 'var(--color-gold)', marginRight: 6 }}>— نتائج مفلترة</span>
                            }
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                        <button
                            onClick={() => setShowExport(true)}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'rgba(46,125,90,0.1)', border: '1px solid rgba(46,125,90,0.35)', borderRadius: 8, color: '#2E7D5A', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                            <Download size={15} />
                            تصدير المنتجات
                        </button>
                        {user?.permissions.can_add_product && (
                            <button
                                onClick={() => setShowBulkImages(true)}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'rgba(200,168,75,0.1)', border: '1px solid rgba(200,168,75,0.35)', borderRadius: 8, color: 'var(--color-gold)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                <Images size={15} />
                                رفع صور
                            </button>
                        )}
                        {user?.permissions.can_add_product && (
                            <button
                                onClick={() => setShowImport(true)}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'rgba(200,168,75,0.1)', border: '1px solid rgba(200,168,75,0.35)', borderRadius: 8, color: 'var(--color-gold)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                <FileSpreadsheet size={15} />
                                رفع Excel
                            </button>
                        )}
                        {user?.permissions.can_add_product && (
                            <button className="btn btn-primary btn-sm" onClick={() => navigate('/products/new')}>
                                <Plus size={15} />
                                إضافة منتج
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Filters */}
            <FilterBar
                filters={filters}
                categories={categories}
                onChange={handleFiltersChange}
                onReset={handleReset}
            />

            {/* Bulk selection bar */}
            {selected.length > 0 && (
                <div style={{
                    background: 'rgba(200,168,75,0.1)', border: '1px solid rgba(200,168,75,0.35)',
                    borderRadius: 8, padding: '10px 16px',
                    display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
                }}>
                    <CheckSquare size={16} color="var(--color-gold)" />
                    <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', flex: 1 }}>
                        {selected.length} منتج محدد
                    </span>
                    {canPublish && (
                        <button
                            onClick={() => activateMutation.mutate(selected)}
                            disabled={activateMutation.isPending}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '6px 14px',
                                border: '1px solid rgba(34,197,94,0.35)',
                                borderRadius: 7,
                                background: 'rgba(34,197,94,0.12)',
                                color: '#22C55E',
                                cursor: activateMutation.isPending ? 'wait' : 'pointer',
                                opacity: activateMutation.isPending ? 0.6 : 1,
                                fontSize: 13, fontFamily: 'inherit',
                            }}
                        >
                            {activateMutation.isPending
                                ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
                                : <CheckCircle2 size={13} />}
                            تنشيط المحددين
                        </button>
                    )}
                    {canDelete && (
                        <button
                            onClick={() => setDeleteTarget('bulk')}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7, background: 'rgba(239,68,68,0.1)', color: 'var(--color-red)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                            <Trash2 size={13} />
                            حذف المحددين
                        </button>
                    )}
                    <button onClick={() => setSelected([])}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-warm-gray)', padding: 4 }}>
                        <X size={15} />
                    </button>
                </div>
            )}

            <div className="data-table-wrapper">
                {isLoading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-warm-gray)' }}>
                        جاري تحميل المنتجات...
                    </div>
                ) : products.length === 0 ? (
                    <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-warm-gray)' }}>
                        <Search size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
                        <div style={{ fontSize: 15, marginBottom: 6 }}>لا توجد نتائج</div>
                        <div style={{ fontSize: 13 }}>جرّب تغيير الفلاتر أو مصطلح البحث</div>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: 40 }}>
                                    <button onClick={toggleAll} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                        {selected.length === products.length && products.length > 0
                                            ? <CheckSquare size={16} color="var(--color-gold)" />
                                            : <Square size={16} color="var(--color-warm-gray)" />}
                                    </button>
                                </th>
                                <th>الصورة</th>
                                <th>SKU</th>
                                <th>اسم المنتج</th>
                                <th>التصنيف</th>
                                <th>الحالة</th>
                                <th>المخزون</th>
                                <th>الاكتمال</th>
                                <th>السعر</th>
                                <th>إجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.map((product) => (
                                <tr key={product.id} style={{ background: selected.includes(product.id) ? 'rgba(200,168,75,0.05)' : undefined }}>
                                    <td>
                                        <button onClick={() => toggleSelect(product.id)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                            {selected.includes(product.id)
                                                ? <CheckSquare size={16} color="var(--color-gold)" />
                                                : <Square size={16} color="var(--color-warm-gray)" />}
                                        </button>
                                    </td>
                                    <td>
                                        {product.main_image_url ? (
                                            <img src={product.main_image_url} alt="" style={{ width: 36, height: 36, borderRadius: 4, objectFit: 'cover' }} />
                                        ) : (
                                            <div style={{ width: 36, height: 36, borderRadius: 4, background: 'var(--color-cream)' }} />
                                        )}
                                    </td>
                                    <td><code className="text-mono" style={{ fontSize: 11 }}>{product.sku}</code></td>
                                    <td style={{ fontWeight: 500, maxWidth: 200 }}>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {product.product_name_ar}
                                        </div>
                                    </td>
                                    <td style={{ color: 'var(--color-warm-gray)', fontSize: 13 }}>{product.category_name}</td>
                                    <td><span className={`badge ${STATUS_BADGE[product.status] ?? 'badge-draft'}`}>{product.status.replace('_', ' ')}</span></td>
                                    <td><span className={`badge badge-${product.inventory_type === 'دوري' ? 'periodic' : product.inventory_type === 'ستوك' ? 'stock' : 'discontinued'}`}>{product.inventory_type}</span></td>
                                    <td>
                                        <div className="completeness-bar">
                                            <div className="completeness-track" style={{ width: 50 }}>
                                                <div className={`completeness-fill ${product.completeness >= 80 ? 'high' : product.completeness >= 50 ? 'medium' : 'low'}`}
                                                    style={{ width: `${product.completeness}%` }} />
                                            </div>
                                            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}>{product.completeness}%</span>
                                        </div>
                                    </td>
                                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                                        {product.price_sar ? `${Number(product.price_sar).toLocaleString('ar')} ر.س` : '—'}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button onClick={() => navigate(`/products/${product.id}`)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-slate-blue)', padding: 4, borderRadius: 4 }} title="عرض">
                                                <Eye size={15} />
                                            </button>
                                            {user?.permissions.can_add_product && (
                                                <button onClick={() => navigate(`/products/${product.id}/edit`)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-gold)', padding: 4, borderRadius: 4 }} title="تعديل">
                                                    <Edit3 size={15} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => setLogTarget(product)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-warm-gray)', padding: 4, borderRadius: 4 }}
                                                title="سجل العمليات"
                                            >
                                                <ScrollText size={15} />
                                            </button>
                                            {canDelete && (
                                                <button onClick={() => setDeleteTarget(product.id)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e07070', padding: 4, borderRadius: 4 }} title="حذف">
                                                    <Trash2 size={15} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination info + buttons */}
            {totalCount > 0 && (
                <div style={{ marginTop: 8 }}>
                    <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-warm-gray)', marginBottom: 4 }}>
                        عرض {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCount)} من {totalCount.toLocaleString('ar')} منتج
                    </div>
                    <Pagination page={page} total={totalCount} pageSize={PAGE_SIZE} onChange={handlePageChange} />
                </div>
            )}

            {/* Delete confirmation modal */}
            {deleteTarget !== null && (
                <DeleteModal
                    count={deleteTarget === 'bulk' ? selected.length : 1}
                    onConfirm={handleDeleteConfirm}
                    onCancel={() => setDeleteTarget(null)}
                    loading={deleteMutation.isPending}
                />
            )}

            {/* Product logs modal */}
            {logTarget !== null && (
                <ProductLogsModal
                    productId={logTarget.id}
                    productName={logTarget.product_name_ar}
                    productSku={logTarget.sku}
                    onClose={() => setLogTarget(null)}
                />
            )}

            {/* Import Excel modal */}
            {showImport && (
                <ImportExcelModal
                    onClose={() => setShowImport(false)}
                    onSuccess={() => { invalidate(); toast.success('تم استيراد المنتجات بنجاح') }}
                />
            )}

            {/* Export modal */}
            {showExport && (
                <ExportModal
                    onClose={() => setShowExport(false)}
                    categories={categories}
                />
            )}

            {/* Bulk image upload modal */}
            {showBulkImages && (
                <BulkImageUploadModal
                    onClose={() => setShowBulkImages(false)}
                />
            )}
        </div>
    )
}
