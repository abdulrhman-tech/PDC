/**
 * Categories Management Page — Super Admin only
 * Hierarchical tree view (up to 5 levels) + attribute schemas management
 */
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    ChevronDown, ChevronLeft, Plus, Trash2, Edit3, Save, X,
    ToggleLeft, ToggleRight, FolderPlus, GitBranch, Tag, Layers,
    Hash, ChevronRight, Upload, Download, CheckCircle, AlertCircle, FileSpreadsheet,
    Languages,
} from 'lucide-react'
import { categoriesAPI, translateAPI } from '@/api/client'
import { toast } from 'react-toastify'
import type { CategoryTreeNode } from '@/types'

/* ── Local Types ── */
interface AttributeSchema {
    id: number; field_key: string; field_label_ar: string; field_label_en: string
    field_type: string; options: string[]; options_en: string[]
    is_required: boolean; unit: string; unit_en: string
    help_text_ar: string; order: number
}

/* ── Constants ── */
const FIELD_TYPES = [
    { value: 'text', label: 'نص حر' }, { value: 'number', label: 'رقم' },
    { value: 'select', label: 'قائمة اختيار' }, { value: 'multi_select', label: 'اختيار متعدد' },
    { value: 'boolean', label: 'نعم / لا' }, { value: 'dimensions', label: 'أبعاد' },
]

const LEVEL_COLORS: Record<number, { bg: string; text: string; border: string; label: string }> = {
    1: { bg: 'rgba(200,168,75,0.12)', text: '#C8A84B', border: 'rgba(200,168,75,0.3)', label: 'المستوى 1' },
    2: { bg: 'rgba(74,144,217,0.12)', text: '#4A90D9', border: 'rgba(74,144,217,0.3)', label: 'المستوى 2' },
    3: { bg: 'rgba(80,180,120,0.12)', text: '#50B478', border: 'rgba(80,180,120,0.3)', label: 'المستوى 3' },
    4: { bg: 'rgba(180,100,200,0.12)', text: '#B464C8', border: 'rgba(180,100,200,0.3)', label: 'المستوى 4' },
    5: { bg: 'rgba(220,100,80,0.12)', text: '#DC6450', border: 'rgba(220,100,80,0.3)', label: 'المستوى 5' },
}

/* ── Shared Styles ── */
const lStyle: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 4, fontWeight: 600 }
const iStyle: React.CSSProperties = { display: 'block', width: '100%', padding: '8px 10px', border: '1px solid var(--color-border-strong)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', color: 'var(--color-text-primary)', background: 'var(--color-surface-raised)' }
const iconBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: '4px 6px', borderRadius: 4, display: 'flex', alignItems: 'center' }

/* ══════════════════════════════════════════════════════════
   Bilingual Options Editor
══════════════════════════════════════════════════════════ */
function OptionsEditor({ options, optionsEn, onChange, onChangeEn }: {
    options: string[]; optionsEn: string[]
    onChange: (o: string[]) => void; onChangeEn: (o: string[]) => void
}) {
    const [arInput, setArInput] = useState('')
    const [enInput, setEnInput] = useState('')
    const add = () => {
        const ar = arInput.trim()
        if (!ar) return
        onChange([...options, ar])
        onChangeEn([...optionsEn, enInput.trim()])
        setArInput(''); setEnInput('')
    }
    const remove = (i: number) => {
        onChange(options.filter((_, j) => j !== i))
        onChangeEn(optionsEn.filter((_, j) => j !== i))
    }
    return (
        <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ ...lStyle, display: 'block', marginBottom: 6 }}>خيارات القائمة</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 8 }}>
                <input style={iStyle} placeholder="خيار بالعربي..." value={arInput}
                    onChange={e => setArInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())} />
                <input style={{ ...iStyle, direction: 'ltr', textAlign: 'left', fontFamily: 'var(--font-latin)' }}
                    placeholder="Option in English..." value={enInput}
                    onChange={e => setEnInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())} />
                <button type="button" onClick={add}
                    style={{ padding: '0 14px', background: 'var(--color-gold)', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'var(--color-text-inverse)', fontWeight: 700, fontSize: 18 }}>+</button>
            </div>
            {options.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {options.map((opt, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(200,168,75,0.07)', border: '1px solid rgba(200,168,75,0.2)', borderRadius: 6, padding: '4px 10px' }}>
                            <span style={{ fontSize: 12, color: 'var(--color-text-primary)', flex: 1 }}>{opt}</span>
                            {optionsEn[i] && <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', flex: 1, fontFamily: 'var(--font-latin)', direction: 'ltr' }}>{optionsEn[i]}</span>}
                            <button type="button" onClick={() => remove(i)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e07070', padding: 0, fontSize: 16, lineHeight: 1 }}>×</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

/* ══════════════════════════════════════════════════════════
   Category Modal (Add / Edit)
══════════════════════════════════════════════════════════ */
interface CatForm { name_ar: string; name_en: string; code: string; description_ar: string; icon: string; is_active: boolean; sort_order: number }
const emptyCatForm = (): CatForm => ({ name_ar: '', name_en: '', code: '', description_ar: '', icon: '', is_active: true, sort_order: 0 })

function CategoryModal({
    existing, parentNode, onClose,
}: {
    existing?: CategoryTreeNode
    parentNode?: { id: number; name_ar: string; level: number }
    onClose: () => void
}) {
    const qc = useQueryClient()
    const isEdit = !!existing
    const [form, setForm] = useState<CatForm>(
        existing
            ? { name_ar: existing.name_ar, name_en: existing.name_en, code: existing.code, description_ar: existing.description_ar, icon: existing.icon, is_active: existing.is_active, sort_order: existing.sort_order }
            : emptyCatForm()
    )
    const set = (k: keyof CatForm, v: unknown) => setForm(f => ({ ...f, [k]: v }))
    const childLevel = parentNode ? parentNode.level + 1 : 1
    const levelInfo = LEVEL_COLORS[isEdit ? existing!.level : childLevel] ?? LEVEL_COLORS[1]

    /* Auto-translate: detects which name field is filled and translates into the other.
       If both are filled, prefers Ar→En (Arabic is the required source field). */
    const [translating, setTranslating] = useState(false)
    const handleAutoTranslate = async () => {
        const ar = form.name_ar.trim()
        const en = form.name_en.trim()
        if (!ar && !en) {
            toast.warning('اكتب الاسم بالعربية أو الإنجليزية أولاً')
            return
        }
        const direction: 'ar→en' | 'en→ar' = ar ? 'ar→en' : 'en→ar'
        setTranslating(true)
        try {
            const text = direction === 'ar→en' ? ar : en
            const res = await translateAPI.translate(text, direction === 'ar→en' ? 'ar' : 'en', direction === 'ar→en' ? 'en' : 'ar')
            const translated = res.data.translated?.trim()
            if (!translated) {
                toast.error('لم تنجح الترجمة')
                return
            }
            if (direction === 'ar→en') set('name_en', translated)
            else                       set('name_ar', translated)
            toast.success(direction === 'ar→en' ? 'تمت الترجمة إلى الإنجليزية' : 'تمت الترجمة إلى العربية')
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'فشلت الترجمة'
            toast.error(msg)
        } finally {
            setTranslating(false)
        }
    }

    const mutation = useMutation({
        mutationFn: () => {
            const payload = { ...form, parent: parentNode?.id ?? null }
            return isEdit
                ? categoriesAPI.update(existing!.id, payload)
                : parentNode
                    ? categoriesAPI.addChild(parentNode.id, payload)
                    : categoriesAPI.create(payload)
        },
        onSuccess: () => {
            toast.success(isEdit ? 'تم تحديث التصنيف' : 'تمت إضافة التصنيف')
            qc.invalidateQueries({ queryKey: ['categories-tree'] })
            onClose()
        },
        onError: (e: unknown) => {
            const data = (e as { response?: { data?: Record<string, string[]> } })?.response?.data
            const msg = data ? Object.values(data).flat().join('، ') : 'فشلت العملية'
            toast.error(msg)
        },
    })

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}>
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: levelInfo.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <FolderPlus size={18} color={levelInfo.text} />
                        </div>
                        <div>
                            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                                {isEdit ? 'تعديل التصنيف' : `إضافة تصنيف — ${levelInfo.label}`}
                            </h3>
                            {parentNode && !isEdit && (
                                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                                    داخل: {parentNode.name_ar}
                                </span>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} style={{ ...iconBtnStyle, padding: 8 }}><X size={18} /></button>
                </div>

                {/* Body */}
                <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                        <div>
                            <label style={lStyle}>الاسم بالعربية *</label>
                            <input style={iStyle} value={form.name_ar} onChange={e => set('name_ar', e.target.value)} placeholder="مثال: سيراميك الأرضيات" />
                        </div>
                        <div>
                            <label style={lStyle}>الاسم بالإنجليزية</label>
                            <input style={{ ...iStyle, direction: 'ltr', textAlign: 'left' }} value={form.name_en} onChange={e => set('name_en', e.target.value)} placeholder="Floor Ceramics" />
                        </div>
                    </div>

                    {/* Auto-translate button */}
                    <button
                        type="button"
                        onClick={handleAutoTranslate}
                        disabled={translating || (!form.name_ar.trim() && !form.name_en.trim())}
                        title="يكتشف اللغة الموجودة ويترجم تلقائياً إلى اللغة الأخرى"
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            padding: '8px 14px', background: 'rgba(74,144,217,0.08)',
                            border: '1px dashed rgba(74,144,217,0.4)', borderRadius: 8,
                            color: '#4A90D9', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                            cursor: translating || (!form.name_ar.trim() && !form.name_en.trim()) ? 'not-allowed' : 'pointer',
                            opacity: translating || (!form.name_ar.trim() && !form.name_en.trim()) ? 0.5 : 1,
                            transition: 'all 0.15s',
                        }}
                    >
                        {translating
                            ? <><span className="spinner" style={{ width: 13, height: 13 }} /> جاري الترجمة...</>
                            : <><Languages size={14} /> ترجمة تلقائية (عربي ↔ إنجليزي)</>}
                    </button>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                        <div>
                            <label style={lStyle}>كود التصنيف (اختياري — يُولَّد تلقائياً)</label>
                            <input style={{ ...iStyle, direction: 'ltr', textAlign: 'left', fontFamily: 'monospace' }} value={form.code} onChange={e => set('code', e.target.value)} placeholder="CERAMICS-FLOOR" />
                        </div>
                        <div>
                            <label style={lStyle}>الأيقونة (Emoji)</label>
                            <input style={{ ...iStyle, fontSize: 20 }} value={form.icon} onChange={e => set('icon', e.target.value)} placeholder="🏷️" />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                        <div>
                            <label style={lStyle}>الوصف (اختياري)</label>
                            <input style={iStyle} value={form.description_ar} onChange={e => set('description_ar', e.target.value)} placeholder="وصف مختصر للتصنيف" />
                        </div>
                        <div>
                            <label style={lStyle}>الترتيب</label>
                            <input style={iStyle} type="number" min={0} value={form.sort_order} onChange={e => set('sort_order', Number(e.target.value))} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--color-surface-hover)', borderRadius: 8 }}>
                        <span style={{ fontSize: 13, flex: 1 }}>التصنيف مفعّل وظاهر في النظام</span>
                        <button type="button" onClick={() => set('is_active', !form.is_active)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: form.is_active ? '#C8A84B' : 'var(--color-text-secondary)', padding: 0, display: 'flex' }}>
                            {form.is_active ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={onClose}><X size={14} /> إلغاء</button>
                    <button className="btn btn-primary" onClick={() => mutation.mutate()}
                        disabled={mutation.isPending || !form.name_ar}>
                        {mutation.isPending ? 'جاري الحفظ...' : <><Save size={14} /> {isEdit ? 'حفظ التعديلات' : 'إضافة التصنيف'}</>}
                    </button>
                </div>
            </div>
        </div>
    )
}

/* ══════════════════════════════════════════════════════════
   Attribute Row (inline edit)
══════════════════════════════════════════════════════════ */
function AttributeRow({ attr, catId, readOnly = false }: { attr: AttributeSchema; catId: number; readOnly?: boolean }) {
    const qc = useQueryClient()
    const [editing, setEditing] = useState(false)
    const [form, setForm] = useState<Partial<AttributeSchema>>({ ...attr, options_en: attr.options_en ?? [], unit_en: attr.unit_en ?? '' })

    const updateMutation = useMutation({
        mutationFn: () => categoriesAPI.updateAttribute(attr.id, form),
        onSuccess: () => { toast.success('تم التحديث'); qc.invalidateQueries({ queryKey: ['cat-attrs'] }); setEditing(false) },
        onError: () => toast.error('فشل التحديث'),
    })
    const deleteMutation = useMutation({
        mutationFn: () => categoriesAPI.deleteAttribute(attr.id),
        onSuccess: () => { toast.success('تم الحذف'); qc.invalidateQueries({ queryKey: ['cat-attrs'] }); qc.invalidateQueries({ queryKey: ['categories-tree'] }) },
        onError: () => toast.error('فشل الحذف'),
    })

    if (editing) return (
        <div style={{ background: 'rgba(200,168,75,0.05)', border: '1px solid rgba(200,168,75,0.2)', borderRadius: 8, padding: 14, marginBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 10 }}>
                <div><label style={lStyle}>مفتاح الحقل</label>
                    <input style={{ ...iStyle, fontFamily: 'monospace' }} value={form.field_key} onChange={e => setForm(f => ({ ...f, field_key: e.target.value }))} /></div>
                <div><label style={lStyle}>الاسم بالعربية</label>
                    <input style={iStyle} value={form.field_label_ar} onChange={e => setForm(f => ({ ...f, field_label_ar: e.target.value }))} /></div>
                <div><label style={lStyle}>Field Name (English)</label>
                    <input style={{ ...iStyle, direction: 'ltr', textAlign: 'left', fontFamily: 'var(--font-latin)' }} value={form.field_label_en ?? ''} placeholder="e.g. Surface Finish" onChange={e => setForm(f => ({ ...f, field_label_en: e.target.value }))} /></div>
                <div><label style={lStyle}>نوع الحقل</label>
                    <select style={iStyle} value={form.field_type} onChange={e => setForm(f => ({ ...f, field_type: e.target.value }))}>
                        {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                <div><label style={lStyle}>الوحدة (عربي)</label>
                    <input style={iStyle} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="سم، م²..." /></div>
                <div><label style={lStyle}>Unit (English)</label>
                    <input style={{ ...iStyle, direction: 'ltr', textAlign: 'left', fontFamily: 'var(--font-latin)' }} value={form.unit_en ?? ''} onChange={e => setForm(f => ({ ...f, unit_en: e.target.value }))} placeholder="cm, m²..." /></div>
                <div><label style={lStyle}>الترتيب</label>
                    <input style={iStyle} type="number" value={form.order} onChange={e => setForm(f => ({ ...f, order: Number(e.target.value) }))} /></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 18 }}>
                    <span style={lStyle}>مطلوب</span>
                    <button type="button" onClick={() => setForm(f => ({ ...f, is_required: !f.is_required }))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: form.is_required ? '#C8A84B' : 'var(--color-text-secondary)', padding: 0, display: 'flex' }}>
                        {form.is_required ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                    </button>
                </div>
                {(form.field_type === 'select' || form.field_type === 'multi_select') && (
                    <OptionsEditor
                        options={form.options ?? []} optionsEn={form.options_en ?? []}
                        onChange={opts => setForm(f => ({ ...f, options: opts }))}
                        onChangeEn={opts => setForm(f => ({ ...f, options_en: opts }))} />
                )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}><Save size={13} /> حفظ</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}><X size={13} /> إلغاء</button>
            </div>
        </div>
    )

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', marginBottom: 5 }}>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--color-gold)', background: 'rgba(200,168,75,0.1)', padding: '2px 7px', borderRadius: 4, flexShrink: 0 }}>{attr.field_key}</span>
            <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{attr.field_label_ar}</span>
                {attr.field_label_en && <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginRight: 8, fontFamily: 'var(--font-latin)', direction: 'ltr', display: 'inline-block' }}>{attr.field_label_en}</span>}
                {attr.unit && <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginRight: 6 }}>({attr.unit})</span>}
            </div>
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', background: 'var(--color-surface-hover)', padding: '2px 7px', borderRadius: 4 }}>
                {FIELD_TYPES.find(t => t.value === attr.field_type)?.label}
            </span>
            {attr.is_required && <span style={{ fontSize: 10, color: '#e07070', border: '1px solid rgba(224,112,112,0.3)', padding: '1px 6px', borderRadius: 4 }}>مطلوب</span>}
            {!readOnly && (
                <div style={{ display: 'flex', gap: 2 }}>
                    <button onClick={() => setEditing(true)} style={iconBtnStyle} title="تعديل"><Edit3 size={13} /></button>
                    <button onClick={() => { if (confirm('حذف هذا الحقل؟')) deleteMutation.mutate() }}
                        style={{ ...iconBtnStyle, color: '#e07070' }} disabled={deleteMutation.isPending}><Trash2 size={13} /></button>
                </div>
            )}
        </div>
    )
}

/* ══════════════════════════════════════════════════════════
   Add Attribute Form
══════════════════════════════════════════════════════════ */
const emptyAttr = () => ({ field_key: '', field_label_ar: '', field_label_en: '', field_type: 'text', options: [] as string[], options_en: [] as string[], is_required: false, unit: '', unit_en: '', help_text_ar: '', order: 0 })

function AddAttributeForm({ catId, onDone }: { catId: number; onDone: () => void }) {
    const qc = useQueryClient()
    const [form, setForm] = useState(emptyAttr())
    const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

    const mutation = useMutation({
        mutationFn: () => categoriesAPI.addAttribute(catId, form),
        onSuccess: () => {
            toast.success('تمت إضافة الحقل')
            qc.invalidateQueries({ queryKey: ['cat-attrs'] })
            qc.invalidateQueries({ queryKey: ['categories-tree'] })
            setForm(emptyAttr())
            onDone()
        },
        onError: () => toast.error('فشلت الإضافة'),
    })

    return (
        <div style={{ background: 'rgba(74,144,217,0.05)', border: '1px solid rgba(74,144,217,0.2)', borderRadius: 10, padding: 14, marginTop: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 10 }}>
                <div><label style={lStyle}>مفتاح الحقل *</label>
                    <input style={{ ...iStyle, fontFamily: 'monospace' }} value={form.field_key} onChange={e => set('field_key', e.target.value)} placeholder="surface_finish" /></div>
                <div><label style={lStyle}>الاسم بالعربية *</label>
                    <input style={iStyle} value={form.field_label_ar} onChange={e => set('field_label_ar', e.target.value)} placeholder="تشطيب السطح" /></div>
                <div><label style={lStyle}>Field Name (English)</label>
                    <input style={{ ...iStyle, direction: 'ltr', textAlign: 'left', fontFamily: 'var(--font-latin)' }} value={form.field_label_en} onChange={e => set('field_label_en', e.target.value)} placeholder="Surface Finish" /></div>
                <div><label style={lStyle}>نوع الحقل</label>
                    <select style={iStyle} value={form.field_type} onChange={e => set('field_type', e.target.value)}>
                        {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                <div><label style={lStyle}>الوحدة (عربي)</label>
                    <input style={iStyle} value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="سم..." /></div>
                <div><label style={lStyle}>Unit (English)</label>
                    <input style={{ ...iStyle, direction: 'ltr', textAlign: 'left', fontFamily: 'var(--font-latin)' }} value={form.unit_en} onChange={e => set('unit_en', e.target.value)} placeholder="cm..." /></div>
                <div><label style={lStyle}>الترتيب</label>
                    <input style={iStyle} type="number" value={form.order} onChange={e => set('order', Number(e.target.value))} /></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 18 }}>
                    <span style={lStyle}>مطلوب</span>
                    <button type="button" onClick={() => set('is_required', !form.is_required)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: form.is_required ? '#C8A84B' : 'var(--color-text-secondary)', padding: 0, display: 'flex' }}>
                        {form.is_required ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                    </button>
                </div>
                {(form.field_type === 'select' || form.field_type === 'multi_select') && (
                    <OptionsEditor
                        options={form.options} optionsEn={form.options_en}
                        onChange={opts => set('options', opts)}
                        onChangeEn={opts => set('options_en', opts)} />
                )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.field_key || !form.field_label_ar}>
                    {mutation.isPending ? 'جاري...' : <><Plus size={13} /> إضافة الحقل</>}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={onDone}><X size={13} /> إلغاء</button>
            </div>
        </div>
    )
}

/* ══════════════════════════════════════════════════════════
   Attributes Panel
   - root (L1): full CRUD
   - children (L2+): read-only, inherited from root
══════════════════════════════════════════════════════════ */
interface AttrsResponse {
    root_id: number
    root_name_ar: string
    is_inherited: boolean
    schemas: AttributeSchema[]
}

function AttributesPanel({ catId }: { catId: number }) {
    const [adding, setAdding] = useState(false)
    const { data, isLoading } = useQuery<AttrsResponse>({
        queryKey: ['cat-attrs', catId],
        queryFn: () => categoriesAPI.attributes(catId).then(r => r.data),
    })

    const attrs      = data?.schemas ?? []
    const isInherited = data?.is_inherited ?? false
    const rootId      = data?.root_id ?? catId
    const rootName    = data?.root_name_ar ?? ''

    return (
        <div style={{ padding: '14px 16px', borderTop: '1px solid var(--color-border)', background: 'var(--color-surface-hover)', borderRadius: '0 0 10px 10px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Tag size={12} /> حقول البيانات الديناميكية ({attrs.length})
                    </span>
                    {isInherited && (
                        <span style={{
                            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                            background: 'rgba(74,144,217,0.1)', color: '#4A90D9',
                            border: '1px solid rgba(74,144,217,0.25)',
                            display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                            <ChevronRight size={10} />
                            موروثة من: {rootName}
                        </span>
                    )}
                </div>
                {/* Only root (L1) can add attributes */}
                {!isInherited && !adding && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setAdding(true)}>
                        <Plus size={12} /> إضافة حقل
                    </button>
                )}
            </div>

            {/* Content */}
            {isLoading ? (
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', padding: '8px 0' }}>جاري التحميل...</div>
            ) : (
                <>
                    {attrs.map(a => (
                        <AttributeRow
                            key={a.id} attr={a} catId={rootId}
                            readOnly={isInherited}
                        />
                    ))}
                    {!isInherited && adding && (
                        <AddAttributeForm catId={rootId} onDone={() => setAdding(false)} />
                    )}
                    {attrs.length === 0 && !adding && (
                        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', padding: '4px 0', textAlign: 'center', fontStyle: 'italic' }}>
                            {isInherited
                                ? `لا توجد سمات معرَّفة على التصنيف الأب "${rootName}" بعد`
                                : 'لا توجد حقول بيانات لهذا التصنيف بعد'}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

/* ══════════════════════════════════════════════════════════
   Tree Node (recursive)
══════════════════════════════════════════════════════════ */
function TreeNode({
    node, depth = 0,
    onEdit, onAddChild,
}: {
    node: CategoryTreeNode
    depth?: number
    onEdit: (node: CategoryTreeNode) => void
    onAddChild: (parent: { id: number; name_ar: string; level: number }) => void
}) {
    const qc = useQueryClient()
    const [expanded, setExpanded] = useState(depth < 1)
    const [showAttrs, setShowAttrs] = useState(false)

    const lc = LEVEL_COLORS[node.level] ?? LEVEL_COLORS[1]
    const hasChildren = node.children.length > 0

    const deleteMutation = useMutation({
        mutationFn: () => categoriesAPI.delete(node.id),
        onSuccess: () => {
            toast.success('تم الحذف')
            qc.invalidateQueries({ queryKey: ['categories-tree'] })
        },
        onError: () => toast.error('تعذّر الحذف — تأكد أنه لا توجد منتجات أو تصنيفات فرعية مرتبطة'),
    })

    return (
        <div style={{ marginBottom: 4 }}>
            {/* Node Row */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 12px',
                background: showAttrs ? 'rgba(200,168,75,0.04)' : 'var(--color-surface-raised)',
                border: `1px solid ${showAttrs ? 'rgba(200,168,75,0.2)' : 'var(--color-border)'}`,
                borderRadius: showAttrs ? '10px 10px 0 0' : 10,
                marginRight: depth * 22,
                transition: 'all 0.15s',
            }}>
                {/* Expand toggle */}
                <button
                    onClick={() => setExpanded(e => !e)}
                    style={{ ...iconBtnStyle, visibility: hasChildren ? 'visible' : 'hidden', padding: 2 }}>
                    {expanded ? <ChevronDown size={14} /> : <ChevronLeft size={14} />}
                </button>

                {/* Level badge */}
                <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4, flexShrink: 0,
                    background: lc.bg, color: lc.text, border: `1px solid ${lc.border}`,
                }}>
                    M{node.level}
                </span>

                {/* Icon */}
                {node.icon && <span style={{ fontSize: 16, flexShrink: 0 }}>{node.icon}</span>}

                {/* Names */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: node.is_active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
                        {node.name_ar}
                    </span>
                    {node.name_en && (
                        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginRight: 8, fontFamily: 'var(--font-latin)', direction: 'ltr', display: 'inline' }}>
                            {node.name_en}
                        </span>
                    )}
                </div>

                {/* Code badge */}
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--color-text-secondary)', background: 'var(--color-surface-hover)', padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
                    {node.code}
                </span>

                {/* Counters */}
                {node.children_count > 0 && (
                    <span style={{ fontSize: 11, color: '#4A90D9', background: 'rgba(74,144,217,0.1)', padding: '1px 7px', borderRadius: 4, flexShrink: 0 }}>
                        {node.children_count} فرع
                    </span>
                )}
                {node.attribute_count > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--color-gold)', background: 'rgba(200,168,75,0.1)', padding: '1px 7px', borderRadius: 4, flexShrink: 0 }}>
                        {node.attribute_count} حقل
                    </span>
                )}

                {/* Active badge */}
                {!node.is_active && (
                    <span style={{ fontSize: 10, color: '#e07070', border: '1px solid rgba(224,112,112,0.3)', padding: '1px 6px', borderRadius: 4, flexShrink: 0 }}>موقوف</span>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    {/* Attributes toggle */}
                    <button onClick={() => setShowAttrs(s => !s)}
                        style={{ ...iconBtnStyle, color: showAttrs ? 'var(--color-gold)' : 'var(--color-text-secondary)' }} title="حقول البيانات">
                        <Tag size={13} />
                    </button>
                    {/* Add child */}
                    {node.level < 5 && (
                        <button onClick={() => onAddChild({ id: node.id, name_ar: node.name_ar, level: node.level })}
                            style={{ ...iconBtnStyle, color: '#4A90D9' }} title="إضافة تصنيف فرعي">
                            <FolderPlus size={13} />
                        </button>
                    )}
                    {/* Edit */}
                    <button onClick={() => onEdit(node)} style={iconBtnStyle} title="تعديل">
                        <Edit3 size={13} />
                    </button>
                    {/* Delete */}
                    <button onClick={() => { if (confirm(`حذف "${node.name_ar}"؟`)) deleteMutation.mutate() }}
                        style={{ ...iconBtnStyle, color: '#e07070' }} disabled={deleteMutation.isPending} title="حذف">
                        <Trash2 size={13} />
                    </button>
                </div>
            </div>

            {/* Attributes Panel */}
            {showAttrs && (
                <div style={{ marginRight: depth * 22 }}>
                    <AttributesPanel catId={node.id} />
                </div>
            )}

            {/* Children */}
            {expanded && hasChildren && (
                <div style={{ marginTop: 4 }}>
                    {node.children.map(child => (
                        <TreeNode key={child.id} node={child} depth={depth + 1} onEdit={onEdit} onAddChild={onAddChild} />
                    ))}
                </div>
            )}
        </div>
    )
}

/* ══════════════════════════════════════════════════════════
   Main Page
══════════════════════════════════════════════════════════ */
interface ImportResult {
    created: number; updated: number; skipped: number
    errors: { row: number; code?: string; error: string }[]
    detail: string
}

export default function CategoriesPage() {
    const [modal, setModal] = useState<{
        mode: 'add-root' | 'add-child' | 'edit'
        node?: CategoryTreeNode
        parent?: { id: number; name_ar: string; level: number }
    } | null>(null)

    const [importResult, setImportResult] = useState<ImportResult | null>(null)
    const [importing, setImporting]     = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const queryClient = useQueryClient()

    const { data: tree = [], isLoading, error } = useQuery<CategoryTreeNode[]>({
        queryKey: ['categories-tree'],
        queryFn: () => categoriesAPI.tree().then(r => r.data),
    })

    const totalNodes = (nodes: CategoryTreeNode[]): number =>
        nodes.reduce((acc, n) => acc + 1 + totalNodes(n.children), 0)

    /* Template download */
    const handleDownloadTemplate = async () => {
        try {
            const res = await categoriesAPI.downloadImportTemplate()
            const url = URL.createObjectURL(new Blob([res.data]))
            const a = document.createElement('a')
            a.href = url; a.download = 'categories_import_template.xlsx'; a.click()
            URL.revokeObjectURL(url)
        } catch {
            toast.error('تعذّر تنزيل القالب')
        }
    }

    /* Excel import */
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        e.target.value = ''
        setImporting(true)
        setImportResult(null)
        try {
            const fd = new FormData()
            fd.append('file', file)
            const res = await categoriesAPI.importExcel(fd)
            setImportResult(res.data)
            queryClient.invalidateQueries({ queryKey: ['categories-tree'] })
            queryClient.invalidateQueries({ queryKey: ['categories-flat'] })
            if (res.data.skipped === 0 && res.data.errors.length === 0) {
                toast.success(res.data.detail)
            } else {
                toast.warning(res.data.detail)
            }
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'فشل استيراد الملف'
            toast.error(msg)
        } finally {
            setImporting(false)
        }
    }

    return (
        <div style={{ padding: '28px 24px', maxWidth: 900, margin: '0 auto', direction: 'rtl' }}>
            {/* Page Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, gap: 16, flexWrap: 'wrap' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(200,168,75,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <GitBranch size={20} color="#C8A84B" />
                        </div>
                        <div>
                            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>شجرة التصنيفات</h1>
                            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>
                                هرمية حتى 5 مستويات — {totalNodes(tree)} تصنيف إجمالاً
                            </p>
                        </div>
                    </div>

                    {/* Level Legend */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                        {[1, 2, 3, 4, 5].map(l => (
                            <span key={l} style={{
                                fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 4,
                                background: LEVEL_COLORS[l].bg, color: LEVEL_COLORS[l].text, border: `1px solid ${LEVEL_COLORS[l].border}`,
                            }}>
                                M{l} — {LEVEL_COLORS[l].label}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Download template */}
                    <button className="btn btn-ghost" onClick={handleDownloadTemplate} title="تنزيل قالب Excel للاستيراد">
                        <Download size={14} /> قالب Excel
                    </button>
                    {/* Import Excel */}
                    <input
                        type="file" accept=".xlsx,.xls"
                        ref={fileInputRef} style={{ display: 'none' }}
                        onChange={handleFileChange}
                    />
                    <button
                        className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}
                        disabled={importing} title="استيراد تصنيفات من ملف Excel"
                    >
                        {importing ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Upload size={14} />}
                        {importing ? 'جاري الاستيراد...' : 'استيراد Excel'}
                    </button>
                    <button className="btn btn-primary" onClick={() => setModal({ mode: 'add-root' })}>
                        <Plus size={15} /> تصنيف رئيسي جديد
                    </button>
                </div>
            </div>

            {/* Import Result Panel */}
            {importResult && (
                <div style={{
                    marginBottom: 20, padding: '14px 18px', borderRadius: 10,
                    background: importResult.errors.length > 0 ? 'rgba(224,112,112,0.08)' : 'rgba(56,178,110,0.08)',
                    border: `1px solid ${importResult.errors.length > 0 ? 'rgba(224,112,112,0.25)' : 'rgba(56,178,110,0.25)'}`,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {importResult.skipped === 0 && importResult.errors.length === 0
                                ? <CheckCircle size={16} color="#38b26e" />
                                : <AlertCircle size={16} color="#e07070" />}
                            <span style={{ fontWeight: 600, fontSize: 14 }}>{importResult.detail}</span>
                        </div>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }} onClick={() => setImportResult(null)}>
                            <X size={14} />
                        </button>
                    </div>
                    {/* Stats */}
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: importResult.errors.length > 0 ? 10 : 0 }}>
                        {importResult.created > 0 && <span style={{ color: '#38b26e' }}>✓ {importResult.created} تصنيف جديد</span>}
                        {importResult.updated > 0 && <span style={{ color: '#C8A84B' }}>↻ {importResult.updated} محدَّث</span>}
                        {importResult.skipped > 0 && <span style={{ color: '#e07070' }}>✗ {importResult.skipped} متخطَّى</span>}
                    </div>
                    {/* Errors */}
                    {importResult.errors.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
                            {importResult.errors.map((e, i) => (
                                <div key={i} style={{ fontSize: 12, padding: '4px 8px', background: 'rgba(224,112,112,0.07)', borderRadius: 4, borderRight: '3px solid #e07070', color: '#c55' }}>
                                    <span style={{ fontWeight: 600 }}>سطر {e.row}{e.code ? ` [${e.code}]` : ''}: </span>{e.error}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}


            {/* Tree */}
            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-secondary)' }}>
                    <Layers size={32} style={{ opacity: 0.3, marginBottom: 10 }} />
                    <p>جاري تحميل شجرة التصنيفات...</p>
                </div>
            ) : error ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#e07070' }}>
                    <p>تعذّر تحميل التصنيفات. يرجى إعادة المحاولة.</p>
                </div>
            ) : tree.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--color-text-secondary)' }}>
                    <GitBranch size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>لا توجد تصنيفات بعد</h3>
                    <p style={{ fontSize: 13, marginBottom: 20 }}>ابدأ بإضافة أول تصنيف رئيسي</p>
                    <button className="btn btn-primary" onClick={() => setModal({ mode: 'add-root' })}>
                        <Plus size={14} /> إضافة أول تصنيف
                    </button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {tree.map(rootNode => (
                        <TreeNode
                            key={rootNode.id}
                            node={rootNode}
                            depth={0}
                            onEdit={node => setModal({ mode: 'edit', node })}
                            onAddChild={parent => setModal({ mode: 'add-child', parent })}
                        />
                    ))}
                </div>
            )}

            {/* Help text */}
            <div style={{ marginTop: 24, padding: '12px 16px', background: 'var(--color-surface-hover)', borderRadius: 10, border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Tag size={12} /> أيقونة الحقل: عرض/إخفاء حقول البيانات الديناميكية</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><FolderPlus size={12} color="#4A90D9" /> الأيقونة الزرقاء: إضافة تصنيف فرعي</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><ChevronDown size={12} /> السهم: طيّ/فتح الفروع</span>
                </div>
            </div>

            {/* Modal */}
            {modal && (
                <CategoryModal
                    existing={modal.mode === 'edit' ? modal.node : undefined}
                    parentNode={modal.mode === 'add-child' ? modal.parent : undefined}
                    onClose={() => setModal(null)}
                />
            )}
        </div>
    )
}
