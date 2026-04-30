/**
 * Product Submissions — Staff Management Page
 * Table layout — compact & readable
 */
import React, { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    Inbox, Check, X, Send, Clock, Eye, AlertCircle,
    CheckCircle2, XCircle, ImageIcon,
    ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react'
import { submissionsAPI, categoriesAPI, brandsAPI, settingsAPI } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'react-toastify'
import type { AttributeSchemaItem } from '@/types'
import { pickBilingual } from '@/i18n/bilingual'
import { useTranslation } from 'react-i18next'

interface SubmissionImage { id: number; r2_url: string }
interface ExtraData {
    product_name_en?: string
    description_ar?: string
    subcategory?: number | ''
    brand?: number | ''
    origin_country?: string
    inventory_type?: string
    color?: string
    ecommerce_url?: string
}
interface Submission {
    id: number
    sku: string
    category: number | null
    category_name: string
    category_name_en?: string
    product_name_ar: string
    submitter_name: string
    submitter_email: string
    status: 'pending' | 'in_review' | 'pending_approval' | 'approved' | 'rejected'
    status_display: string
    manager_notes: string
    admin_notes: string
    extra_data: ExtraData
    images: SubmissionImage[]
    product: number | null
    created_at: string
}

const STATUS_META: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
    pending:           { color: 'var(--color-gold)', bg: 'rgba(200,168,75,0.13)',  icon: <Clock size={11} /> },
    in_review:         { color: '#4A90D9', bg: 'rgba(74,144,217,0.13)', icon: <Eye size={11} /> },
    pending_approval:  { color: '#9B59B6', bg: 'rgba(155,89,182,0.13)', icon: <AlertCircle size={11} /> },
    approved:          { color: '#27AE60', bg: 'rgba(39,174,96,0.13)',  icon: <CheckCircle2 size={11} /> },
    rejected:          { color: '#E74C3C', bg: 'rgba(231,76,60,0.13)',  icon: <XCircle size={11} /> },
}

const STATUS_TABS = [
    { key: 'all',              label: 'الكل' },
    { key: 'pending',          label: 'في الانتظار' },
    { key: 'in_review',        label: 'قيد المراجعة' },
    { key: 'pending_approval', label: 'تحت الموافقة' },
    { key: 'approved',         label: 'معتمد' },
    { key: 'rejected',         label: 'مرفوض' },
]

function StatusBadge({ status, label }: { status: string; label: string }) {
    const m = STATUS_META[status] ?? { color: '#aaa', bg: 'rgba(170,170,170,0.1)', icon: null }
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: m.bg, color: m.color, border: `1px solid ${m.color}30`,
            whiteSpace: 'nowrap',
        }}>
            {m.icon}{label}
        </span>
    )
}

/* ── Shared field styles ── */
const fLabel: React.CSSProperties = { fontSize: 11, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4, fontWeight: 600 }
const fInput: React.CSSProperties = { width: '100%', padding: '7px 10px', background: 'var(--color-surface-raised)', border: '1px solid var(--color-border-strong)', borderRadius: 7, color: 'var(--color-text-primary)', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }

/* ── Expanded drawer shown below the clicked row ── */
function ExpandedDrawer({ item, onClose }: { item: Submission; onClose: () => void }) {
    const ed = item.extra_data || {}
    const [form, setForm] = useState({
        sku:              item.sku,
        product_name_ar:  item.product_name_ar,
        manager_notes:    item.manager_notes,
        admin_notes:      item.admin_notes,
        product_name_en:  ed.product_name_en  ?? '',
        description_ar:   ed.description_ar   ?? '',
        subcategory:      ed.subcategory       ?? '',
        brand:            ed.brand             ?? '',
        origin_country:   ed.origin_country    ?? '',
        inventory_type:   ed.inventory_type    ?? 'دوري',
        color:            ed.color             ?? '',
        ecommerce_url:    ed.ecommerce_url     ?? '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        attributes:       (ed as any).attributes ?? {} as Record<string, string>,
    })
    const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))
    const setAttr = (k: string, v: string) => setForm(f => ({ ...f, attributes: { ...f.attributes, [k]: v } }))

    const [attrSchema, setAttrSchema] = useState<AttributeSchemaItem[]>([])
    useEffect(() => {
        if (item.category) {
            categoriesAPI.attributes(item.category).then(r => {
                setAttrSchema(r.data.schemas ?? r.data.results ?? (Array.isArray(r.data) ? r.data : []))
            }).catch(() => {})
        }
    }, [item.category])

    const renderAttrField = (schema: AttributeSchemaItem) => {
        const val = form.attributes?.[schema.field_key] ?? ''
        if (schema.field_type === 'select' || schema.field_type === 'multi_select') {
            return (
                <select value={val} onChange={e => setAttr(schema.field_key, e.target.value)}
                    style={{ ...fInput, cursor: 'pointer' }}>
                    <option value="" style={{ background: 'var(--color-surface-raised)' }}>اختر {schema.field_label_ar}</option>
                    {schema.options.map(o => <option key={o} value={o} style={{ background: 'var(--color-surface-raised)' }}>{o}</option>)}
                </select>
            )
        }
        if (schema.field_type === 'boolean') {
            return (
                <select value={val} onChange={e => setAttr(schema.field_key, e.target.value)}
                    style={{ ...fInput, cursor: 'pointer' }}>
                    <option value="" style={{ background: 'var(--color-surface-raised)' }}>—</option>
                    <option value="نعم" style={{ background: 'var(--color-surface-raised)' }}>نعم ✓</option>
                    <option value="لا" style={{ background: 'var(--color-surface-raised)' }}>لا ✗</option>
                </select>
            )
        }
        return (
            <input type={schema.field_type === 'number' ? 'number' : 'text'} value={val}
                onChange={e => setAttr(schema.field_key, e.target.value)}
                placeholder={schema.help_text_ar || schema.field_label_ar}
                style={{ ...fInput, direction: schema.field_type === 'number' ? 'ltr' : 'rtl' }} />
        )
    }

    const [rejectReason, setRejectReason] = useState('')
    const [showReject, setShowReject]     = useState(false)
    const [lightbox, setLightbox]         = useState<string | null>(null)
    const qc   = useQueryClient()
    const user = useAuthStore(s => s.user)
    const isAdmin   = user?.role === 'super_admin'
    const isManager = user?.role === 'مدير_قسم'

    // ── Lookup data ──
    // Fetch the SPECIFIC category (with its legacy subcategories) by ID.
    // Avoids the paginated /categories/ endpoint, which only returned the first
    // 24 root categories and silently broke the subcategory dropdown for any
    // submission whose category lay outside that page.
    const { data: catObj } = useQuery({
        queryKey: ['category-detail', item.category],
        queryFn: () => item.category
            ? categoriesAPI.detail(item.category).then(r => r.data)
            : Promise.resolve(null),
        enabled: !!item.category,
    })
    const subcategories: { id: number; name_ar: string }[] = catObj?.subcategories ?? []

    const { data: brandsData } = useQuery({
        queryKey: ['brands'], queryFn: () => brandsAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : d.results ?? [] }),
    })
    const { data: colorsData } = useQuery({
        queryKey: ['lookups-color'], queryFn: () => settingsAPI.lookups('color').then(r => { const d = r.data; return (Array.isArray(d) ? d : d.results ?? []).filter((x: { is_active: boolean }) => x.is_active) }),
    })
    const { data: countriesData } = useQuery({
        queryKey: ['lookups-country'], queryFn: () => settingsAPI.lookups('country').then(r => { const d = r.data; return (Array.isArray(d) ? d : d.results ?? []).filter((x: { is_active: boolean }) => x.is_active) }),
    })

    // ── Mutations ──
    const updateMutation = useMutation({
        mutationFn: () => submissionsAPI.update(item.id, {
            sku: form.sku,
            product_name_ar: form.product_name_ar,
            manager_notes: form.manager_notes,
            extra_data: {
                product_name_en: form.product_name_en,
                description_ar:  form.description_ar,
                subcategory:     form.subcategory || null,
                brand:           form.brand       || null,
                origin_country:  form.origin_country,
                inventory_type:  form.inventory_type,
                color:           form.color,
                ecommerce_url:   form.ecommerce_url,
                attributes:      form.attributes,
            },
        }),
        onSuccess: () => { toast.success('تم حفظ البيانات'); qc.invalidateQueries({ queryKey: ['submissions'] }) },
        onError: () => toast.error('فشل الحفظ'),
    })
    const submitMutation = useMutation({
        mutationFn: async () => {
            // Always save form data first, then submit for approval
            await submissionsAPI.update(item.id, {
                sku: form.sku,
                product_name_ar: form.product_name_ar,
                manager_notes: form.manager_notes,
                extra_data: {
                    product_name_en: form.product_name_en,
                    description_ar:  form.description_ar,
                    subcategory:     form.subcategory || null,
                    brand:           form.brand       || null,
                    origin_country:  form.origin_country,
                    inventory_type:  form.inventory_type,
                    color:           form.color,
                    ecommerce_url:   form.ecommerce_url,
                    attributes:      form.attributes,
                },
            })
            return submissionsAPI.submitForApproval(item.id)
        },
        onSuccess: () => { toast.success('تم الحفظ والإرسال للموافقة'); qc.invalidateQueries({ queryKey: ['submissions'] }) },
        onError: () => toast.error('فشل الإرسال'),
    })
    const approveMutation = useMutation({
        mutationFn: () => submissionsAPI.approve(item.id),
        onSuccess: () => { toast.success('تم الاعتماد وإنشاء المنتج'); qc.invalidateQueries({ queryKey: ['submissions'] }) },
        onError: (e: unknown) => toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'فشل الاعتماد'),
    })
    const rejectMutation = useMutation({
        mutationFn: () => submissionsAPI.reject(item.id, rejectReason),
        onSuccess: () => { toast.success('تم الرفض'); qc.invalidateQueries({ queryKey: ['submissions'] }); setShowReject(false) },
        onError: () => toast.error('فشل الرفض'),
    })

    const canEdit   = (isManager || isAdmin) && ['pending', 'in_review'].includes(item.status)
    const canSend   = isManager && ['pending', 'in_review'].includes(item.status)
    const canAction = isAdmin   && item.status === 'pending_approval'

    return (
        <>
            <tr>
                <td colSpan={7} style={{ padding: 0 }}>
                    <div style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)', padding: '20px 22px' }}>

                        {/* ── Images row ── */}
                        {item.images.length > 0 && (
                            <div style={{ marginBottom: 18 }}>
                                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 8, fontWeight: 600, letterSpacing: 0.5 }}>الصور المُرفقة</div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {item.images.map(img => (
                                        <img key={img.id} src={img.r2_url} onClick={() => setLightbox(img.r2_url)}
                                            style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 9, border: '1px solid var(--color-border-strong)', cursor: 'zoom-in' }} alt="" />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Editable product fields ── */}
                        {canEdit && (
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 11, color: 'var(--color-gold)', marginBottom: 12, fontWeight: 700, letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    ✏️ إكمال بيانات المنتج
                                </div>

                                {/* Row 1: Names + SKU */}
                                <div className="resp-filters-bar" style={{ marginBottom: 10 }}>
                                    <div>
                                        <label style={fLabel}>اسم المنتج بالعربية *</label>
                                        <input value={form.product_name_ar} onChange={e => set('product_name_ar', e.target.value)} style={fInput} placeholder="سيراميك سادة رمادي" />
                                    </div>
                                    <div>
                                        <label style={fLabel}>اسم المنتج بالإنجليزية</label>
                                        <input value={form.product_name_en} onChange={e => set('product_name_en', e.target.value)} style={{ ...fInput, direction: 'ltr' }} placeholder="Grey Ceramic Tile" />
                                    </div>
                                    <div>
                                        <label style={fLabel}>رقم SKU *</label>
                                        <input value={form.sku} onChange={e => set('sku', e.target.value)} style={{ ...fInput, direction: 'ltr' }} placeholder="PDC-0001" />
                                    </div>
                                </div>

                                {/* Row 2: Subcategory + Brand + Country */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>
                                    <div>
                                        <label style={fLabel}>الفئة الفرعية</label>
                                        <select value={form.subcategory} onChange={e => set('subcategory', e.target.value ? Number(e.target.value) : '')}
                                            style={{ ...fInput, cursor: 'pointer' }}>
                                            <option value="" style={{ background: 'var(--color-surface-raised)' }}>— لا يوجد —</option>
                                            {subcategories.map((s: { id: number; name_ar: string }) => (
                                                <option key={s.id} value={s.id} style={{ background: 'var(--color-surface-raised)' }}>{s.name_ar}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={fLabel}>العلامة التجارية</label>
                                        <select value={form.brand} onChange={e => set('brand', e.target.value ? Number(e.target.value) : '')}
                                            style={{ ...fInput, cursor: 'pointer' }}>
                                            <option value="" style={{ background: 'var(--color-surface-raised)' }}>— لا يوجد —</option>
                                            {(brandsData ?? []).map((b: { id: number; name_ar?: string; name: string }) => (
                                                <option key={b.id} value={b.id} style={{ background: 'var(--color-surface-raised)' }}>{b.name_ar || b.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={fLabel}>بلد المنشأ</label>
                                        <select value={form.origin_country} onChange={e => set('origin_country', e.target.value)}
                                            style={{ ...fInput, cursor: 'pointer' }}>
                                            <option value="" style={{ background: 'var(--color-surface-raised)' }}>— لا يوجد —</option>
                                            {(countriesData ?? []).map((c: { id: number; name_ar: string }) => (
                                                <option key={c.id} value={c.name_ar} style={{ background: 'var(--color-surface-raised)' }}>{c.name_ar}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Row 3: Color + Inventory + Ecommerce */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>
                                    <div>
                                        <label style={fLabel}>اللون</label>
                                        <select value={form.color} onChange={e => set('color', e.target.value)}
                                            style={{ ...fInput, cursor: 'pointer' }}>
                                            <option value="" style={{ background: 'var(--color-surface-raised)' }}>— لا يوجد —</option>
                                            {(colorsData ?? []).map((c: { id: number; name_ar: string }) => (
                                                <option key={c.id} value={c.name_ar} style={{ background: 'var(--color-surface-raised)' }}>{c.name_ar}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={fLabel}>نوع المخزون</label>
                                        <select value={form.inventory_type} onChange={e => set('inventory_type', e.target.value)}
                                            style={{ ...fInput, cursor: 'pointer' }}>
                                            <option value="دوري" style={{ background: 'var(--color-surface-raised)' }}>دوري</option>
                                            <option value="ستوك" style={{ background: 'var(--color-surface-raised)' }}>ستوك</option>
                                            <option value="منتهي" style={{ background: 'var(--color-surface-raised)' }}>منتهي</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={fLabel}>رابط المتجر الإلكتروني</label>
                                        <input value={form.ecommerce_url} onChange={e => set('ecommerce_url', e.target.value)}
                                            style={{ ...fInput, direction: 'ltr' }} placeholder="https://..." />
                                    </div>
                                </div>

                                {/* Row 4: Description */}
                                <div style={{ marginBottom: 10 }}>
                                    <label style={fLabel}>الوصف بالعربية</label>
                                    <textarea value={form.description_ar} onChange={e => set('description_ar', e.target.value)} rows={3}
                                        placeholder="وصف تفصيلي للمنتج..."
                                        style={{ ...fInput, resize: 'vertical', lineHeight: 1.6 }} />
                                </div>

                                {/* Row 5: Dynamic Attributes */}
                                {attrSchema.length > 0 && (
                                    <div style={{ borderTop: '1px solid rgba(200,168,75,0.2)', paddingTop: 10, marginBottom: 10 }}>
                                        <div style={{ fontSize: 11, color: 'var(--color-gold)', fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>
                                            السمات الديناميكية
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                                            {[...attrSchema].sort((a, b) => {
                                                if (a.is_required && !b.is_required) return -1
                                                if (!a.is_required && b.is_required) return 1
                                                return a.order - b.order
                                            }).map(schema => (
                                                <div key={schema.field_key}>
                                                    <label style={{ ...fLabel, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        {schema.field_label_ar}
                                                        {schema.is_required && <span style={{ color: '#e07070' }}>*</span>}
                                                        {schema.unit && <span style={{ fontSize: 10, color: 'var(--color-text-muted)', background: 'var(--color-surface-hover)', padding: '0 4px', borderRadius: 3 }}>{schema.unit}</span>}
                                                    </label>
                                                    {renderAttrField(schema)}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Row 6: Manager notes */}
                                <div>
                                    <label style={fLabel}>ملاحظات المدير</label>
                                    <input value={form.manager_notes} onChange={e => set('manager_notes', e.target.value)}
                                        placeholder="ملاحظاتك الداخلية..."
                                        style={fInput} />
                                </div>
                            </div>
                        )}

                        {/* Read-only full fields for admin pending_approval review */}
                        {!canEdit && canAction && (
                            <div style={{ marginBottom: 14, background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '12px 14px' }}>
                                <div style={{ fontSize: 11, color: 'var(--color-gold)', fontWeight: 700, marginBottom: 10, letterSpacing: 0.5 }}>بيانات المنتج المقدّمة</div>

                                {/* Row 1: Names + SKU */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>
                                    {[
                                        { label: 'اسم المنتج (عربي)', val: form.product_name_ar },
                                        { label: 'اسم المنتج (إنجليزي)', val: form.product_name_en },
                                        { label: 'رمز المنتج SKU', val: form.sku },
                                    ].map(({ label, val }) => (
                                        <div key={label}>
                                            <div style={{ ...fLabel, marginBottom: 4 }}>{label}</div>
                                            <div style={{ fontSize: 12, color: val ? 'var(--color-text-primary)' : 'var(--color-text-muted)', background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '6px 10px', minHeight: 30 }}>
                                                {val || '—'}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Row 2: Subcategory + Brand + Country */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>
                                    {[
                                        { label: 'القسم الفرعي', val: subcategories.find(s => s.id === Number(form.subcategory))?.name_ar || (form.subcategory ? `#${form.subcategory}` : '') },
                                        { label: 'العلامة التجارية', val: (brandsData ?? []).find((b: { id: number }) => b.id === Number(form.brand)) ? ((brandsData ?? []).find((b: { id: number }) => b.id === Number(form.brand)) as { name_ar?: string; name: string })?.name_ar || (brandsData ?? []).find((b: { id: number }) => b.id === Number(form.brand))?.name : form.brand },
                                        { label: 'بلد المنشأ', val: form.origin_country },
                                    ].map(({ label, val }) => (
                                        <div key={label}>
                                            <div style={{ ...fLabel, marginBottom: 4 }}>{label}</div>
                                            <div style={{ fontSize: 12, color: val ? 'var(--color-text-primary)' : 'var(--color-text-muted)', background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '6px 10px', minHeight: 30 }}>
                                                {val || '—'}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Row 3: Color + Inventory + Ecommerce */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>
                                    {[
                                        { label: 'اللون', val: form.color },
                                        { label: 'نوع المخزون', val: form.inventory_type },
                                        { label: 'رابط المتجر الإلكتروني', val: form.ecommerce_url },
                                    ].map(({ label, val }) => (
                                        <div key={label}>
                                            <div style={{ ...fLabel, marginBottom: 4 }}>{label}</div>
                                            <div style={{ fontSize: 12, color: val ? 'var(--color-text-primary)' : 'var(--color-text-muted)', background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '6px 10px', minHeight: 30, direction: label.includes('رابط') ? 'ltr' : 'rtl' }}>
                                                {val || '—'}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Row 4: Description */}
                                {form.description_ar && (
                                    <div style={{ marginBottom: 10 }}>
                                        <div style={{ ...fLabel, marginBottom: 4 }}>الوصف</div>
                                        <div style={{ fontSize: 12, color: 'var(--color-text-primary)', background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '8px 10px', lineHeight: 1.7 }}>
                                            {form.description_ar}
                                        </div>
                                    </div>
                                )}

                                {/* Row 5: Dynamic Attributes (read-only) */}
                                {attrSchema.length > 0 && (
                                    <div style={{ borderTop: '1px solid rgba(200,168,75,0.15)', paddingTop: 10 }}>
                                        <div style={{ fontSize: 11, color: 'var(--color-gold)', fontWeight: 700, marginBottom: 8 }}>السمات الديناميكية</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                                            {[...attrSchema].sort((a, b) => a.order - b.order).map(schema => (
                                                <div key={schema.field_key}>
                                                    <div style={{ ...fLabel, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        {schema.field_label_ar}
                                                        {schema.unit && <span style={{ fontSize: 10, color: 'var(--color-text-muted)', background: 'var(--color-surface-hover)', padding: '0 4px', borderRadius: 3 }}>{schema.unit}</span>}
                                                    </div>
                                                    <div style={{ fontSize: 12, color: form.attributes?.[schema.field_key] ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.25)', background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '6px 10px', minHeight: 30 }}>
                                                        {form.attributes?.[schema.field_key] || '—'}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Manager notes */}
                                {item.manager_notes && (
                                    <div style={{ marginTop: 10, borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
                                        <div style={{ fontSize: 11, color: '#4A90D9', marginBottom: 4, fontWeight: 600 }}>ملاحظات المدير</div>
                                        <div style={{ fontSize: 12, color: 'var(--color-text-primary)', background: 'rgba(74,144,217,0.07)', border: '1px solid rgba(74,144,217,0.18)', borderRadius: 6, padding: '8px 10px' }}>{item.manager_notes}</div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Read-only minimal for other non-editable states (submitted, rejected, etc.) */}
                        {!canEdit && !canAction && (item.manager_notes || Object.keys(ed).length > 0) && (
                            <div style={{ marginBottom: 14, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                {item.manager_notes && (
                                    <div style={{ flex: 1, minWidth: 200 }}>
                                        <div style={{ fontSize: 11, color: '#4A90D9', marginBottom: 6, fontWeight: 600 }}>ملاحظات المدير</div>
                                        <div style={{ fontSize: 12, color: 'var(--color-text-primary)', background: 'rgba(74,144,217,0.07)', border: '1px solid rgba(74,144,217,0.18)', borderRadius: 7, padding: '8px 12px' }}>{item.manager_notes}</div>
                                    </div>
                                )}
                                {ed.description_ar && (
                                    <div style={{ flex: 2, minWidth: 200 }}>
                                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 6, fontWeight: 600 }}>الوصف</div>
                                        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 7, padding: '8px 12px' }}>{ed.description_ar}</div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Admin notes for approval */}
                        {canAction && (
                            <div style={{ marginBottom: 12 }}>
                                <label style={fLabel}>ملاحظات الاعتماد (اختياري)</label>
                                <input value={form.admin_notes} onChange={e => set('admin_notes', e.target.value)}
                                    placeholder="ملاحظات..."
                                    style={{ ...fInput, maxWidth: 420 }} />
                            </div>
                        )}

                        {/* Approved product link */}
                        {item.status === 'approved' && item.product && (
                            <div style={{ marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#27AE60', background: 'rgba(39,174,96,0.08)', border: '1px solid rgba(39,174,96,0.2)', borderRadius: 7, padding: '6px 12px' }}>
                                <CheckCircle2 size={13} />
                                المنتج أُنشئ بنجاح —
                                <a href={`/products/${item.product}`} style={{ color: 'var(--color-gold)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                    عرض المنتج <ExternalLink size={11} />
                                </a>
                            </div>
                        )}

                        {/* ── Action bar ── */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            {canEdit && (
                                <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}
                                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 16px', background: 'var(--color-surface-hover)', border: '1px solid var(--color-border-strong)', borderRadius: 7, color: 'var(--color-text-primary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                                    <Check size={13} /> {updateMutation.isPending ? 'جاري الحفظ...' : 'حفظ البيانات'}
                                </button>
                            )}
                            {canSend && (
                                <button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}
                                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 16px', background: 'linear-gradient(135deg,#C8A84B,#a8832f)', border: 'none', borderRadius: 7, color: '#1a1a1a', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                    <Send size={13} /> {submitMutation.isPending ? 'جاري الإرسال...' : 'إرسال للموافقة'}
                                </button>
                            )}
                            {canAction && (
                                <>
                                    <button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}
                                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 16px', background: '#27AE60', border: 'none', borderRadius: 7, color: 'var(--color-text-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                        <CheckCircle2 size={13} /> {approveMutation.isPending ? 'جاري الاعتماد...' : 'اعتماد ونشر'}
                                    </button>
                                    <button onClick={() => setShowReject(r => !r)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 7, color: '#E74C3C', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                                        <XCircle size={13} /> رفض
                                    </button>
                                </>
                            )}
                            <button onClick={onClose}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 7, color: 'var(--color-text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', marginRight: 'auto' }}>
                                <ChevronUp size={13} /> طيّ
                            </button>
                        </div>

                        {/* Reject form */}
                        {showReject && (
                            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                                <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                                    placeholder="سبب الرفض..."
                                    style={{ flex: 1, padding: '7px 10px', background: 'rgba(231,76,60,0.07)', border: '1px solid rgba(231,76,60,0.25)', borderRadius: 7, color: 'var(--color-text-primary)', fontSize: 12, fontFamily: 'inherit' }} />
                                <button onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}
                                    style={{ padding: '7px 16px', background: '#E74C3C', border: 'none', borderRadius: 7, color: 'var(--color-text-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                    تأكيد الرفض
                                </button>
                            </div>
                        )}
                    </div>
                </td>
            </tr>

            {/* Lightbox */}
            {lightbox && (
                <tr><td colSpan={7}>
                    <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
                        <img src={lightbox} style={{ maxWidth: '88vw', maxHeight: '88vh', borderRadius: 10 }} alt="" />
                        <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 20, left: 20, background: 'var(--color-border-strong)', border: 'none', color: 'var(--color-text-primary)', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
                    </div>
                </td></tr>
            )}
        </>
    )
}

/* ─────────────────────── Main Page ─────────────────────── */
export default function ProductSubmissionsPage() {
    const [filterStatus, setFilterStatus] = useState('all')
    const [expandedId, setExpandedId]     = useState<number | null>(null)
    const user = useAuthStore(s => s.user)
    const { i18n } = useTranslation()
    const isAr = i18n.language === 'ar'

    const { data, isLoading } = useQuery<Submission[]>({
        queryKey: ['submissions'],
        queryFn:  () => submissionsAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : d.results ?? [] }),
        enabled:  !!user,
    })

    const submissions: Submission[] = data ?? []
    const filtered = filterStatus === 'all' ? submissions : submissions.filter(s => s.status === filterStatus)

    const counts = STATUS_TABS.reduce((acc, t) => {
        acc[t.key] = t.key === 'all' ? submissions.length : submissions.filter(s => s.status === t.key).length
        return acc
    }, {} as Record<string, number>)

    const pendingApproval = counts['pending_approval'] ?? 0

    const thStyle: React.CSSProperties = {
        padding: '10px 14px', fontSize: 11, fontWeight: 600,
        color: 'var(--color-text-muted)', textAlign: 'right',
        borderBottom: '1px solid var(--color-border)',
        whiteSpace: 'nowrap', letterSpacing: 0.4,
        background: '#111c29',
    }

    return (
        <div className="page-enter">
            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(200,168,75,0.12)', border: '1px solid rgba(200,168,75,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Inbox size={19} color="#C8A84B" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 1 }}>اقتراحات المنتجات</h1>
                        <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                            {user?.role === 'super_admin' ? 'جميع طلبات الزوار لإضافة منتجات جديدة' : 'طلبات التصنيف الخاص بك'}
                        </p>
                    </div>
                </div>
                {pendingApproval > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(155,89,182,0.12)', border: '1px solid rgba(155,89,182,0.28)', borderRadius: 20, padding: '5px 13px', fontSize: 12, color: '#9B59B6', fontWeight: 700 }}>
                        <AlertCircle size={12} />
                        {pendingApproval} بانتظار الاعتماد
                    </div>
                )}
            </div>

            {/* ── Status Tabs ── */}
            <div style={{ display: 'flex', gap: 5, marginBottom: 16, flexWrap: 'wrap' }}>
                {STATUS_TABS.map(tab => {
                    const active = filterStatus === tab.key
                    const m = STATUS_META[tab.key]
                    const accent = m?.color ?? '#C8A84B'
                    return (
                        <button key={tab.key} onClick={() => { setFilterStatus(tab.key); setExpandedId(null) }} style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                            border: active ? `1px solid ${accent}45` : '1px solid var(--color-border)',
                            background: active ? (m?.bg ?? 'rgba(200,168,75,0.1)') : 'var(--color-surface-raised)',
                            color: active ? accent : 'var(--color-text-secondary)',
                            cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                        }}>
                            {tab.key !== 'all' && m?.icon}
                            {tab.label}
                            {counts[tab.key] > 0 && (
                                <span style={{ background: active ? accent + '25' : 'var(--color-surface-hover)', color: active ? accent : 'var(--color-text-muted)', borderRadius: 10, fontSize: 10, padding: '1px 6px', fontWeight: 700 }}>
                                    {counts[tab.key]}
                                </span>
                            )}
                        </button>
                    )
                })}
            </div>

            {/* ── Table ── */}
            {isLoading ? (
                [...Array(4)].map((_, i) => (
                    <div key={i} className="skeleton" style={{ height: 44, borderRadius: 6, marginBottom: 4 }} />
                ))
            ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-muted)' }}>
                    <Inbox size={32} style={{ marginBottom: 10, opacity: 0.3 }} />
                    <p style={{ fontSize: 13, fontWeight: 600 }}>لا توجد طلبات</p>
                </div>
            ) : (
                <div style={{ background: 'var(--color-surface)', borderRadius: 12, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', direction: 'rtl' }}>
                        <thead>
                            <tr>
                                <th style={{ ...thStyle, width: 44 }}></th>
                                <th style={thStyle}>المنتج</th>
                                <th style={thStyle}>مقدِّم الطلب</th>
                                <th style={thStyle}>التصنيف</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>الصور</th>
                                <th style={thStyle}>التاريخ</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>الحالة</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((item, idx) => {
                                const isOpen     = expandedId === item.id
                                const statusColor = STATUS_META[item.status]?.color ?? '#aaa'
                                const isLast     = idx === filtered.length - 1

                                return (
                                    <React.Fragment key={item.id}>
                                        <tr
                                            onClick={() => setExpandedId(isOpen ? null : item.id)}
                                            style={{
                                                cursor: 'pointer',
                                                background: isOpen ? 'var(--color-surface-raised)' : 'transparent',
                                                borderBottom: isLast && !isOpen ? 'none' : '1px solid var(--color-border)',
                                                transition: 'background .15s',
                                            }}
                                            onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = 'var(--color-surface-raised)' }}
                                            onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'transparent' }}
                                        >
                                            {/* Expand toggle */}
                                            <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                                                <div style={{ width: 3, height: 32, background: isOpen ? statusColor : statusColor + '50', borderRadius: 2, margin: '0 auto', transition: 'background .2s' }} />
                                            </td>

                                            {/* Product name + SKU */}
                                            <td style={{ padding: '11px 14px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    {/* Thumbnail */}
                                                    <div style={{ width: 36, height: 36, borderRadius: 7, overflow: 'hidden', flexShrink: 0, background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        {item.images[0]
                                                            ? <img src={item.images[0].r2_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                                                            : <ImageIcon size={14} color="var(--color-text-muted)" />
                                                        }
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.3 }}>{item.product_name_ar}</div>
                                                        {item.sku && <div style={{ fontSize: 10, color: 'var(--color-gold)', marginTop: 2, fontWeight: 600 }}>{item.sku}</div>}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Submitter */}
                                            <td style={{ padding: '11px 14px' }}>
                                                <div style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{item.submitter_name}</div>
                                                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2, direction: 'ltr', textAlign: 'right' }}>{item.submitter_email}</div>
                                            </td>

                                            {/* Category */}
                                            <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                                                {pickBilingual(item.category_name, item.category_name_en, isAr) || '—'}
                                            </td>

                                            {/* Image count */}
                                            <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                                                {item.images.length > 0
                                                    ? <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><ImageIcon size={12} />{item.images.length}</span>
                                                    : <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>—</span>
                                                }
                                            </td>

                                            {/* Date */}
                                            <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                                                {new Date(item.created_at).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </td>

                                            {/* Status */}
                                            <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                                    <StatusBadge status={item.status} label={item.status_display} />
                                                    {isOpen ? <ChevronUp size={13} color="var(--color-text-muted)" /> : <ChevronDown size={13} color="var(--color-text-muted)" />}
                                                </div>
                                            </td>
                                        </tr>

                                        {/* Expanded drawer */}
                                        {isOpen && (
                                            <ExpandedDrawer
                                                item={item}
                                                onClose={() => setExpandedId(null)}
                                            />
                                        )}
                                    </React.Fragment>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
