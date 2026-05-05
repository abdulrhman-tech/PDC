/**
 * Categories Management Page — Super Admin only
 * Hierarchical tree view (up to 5 levels) + attribute schemas management
 */
import { useState, useRef, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    ChevronDown, ChevronLeft, Plus, Trash2, Edit3, Save, X,
    ToggleLeft, ToggleRight, FolderPlus, GitBranch, Tag, Layers,
    Hash, ChevronRight, Upload, Download, CheckCircle, AlertCircle, FileSpreadsheet,
    Languages, Search, ListTree, ChevronsDownUp,
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

    /* Parent picker (edit mode only): lets the user move a category under a
       different parent. Reuses the cached tree query — no extra fetch. */
    const [parentChoice, setParentChoice] = useState<number | null>(existing?.parent_id ?? null)
    const treeQuery = useQuery<CategoryTreeNode[]>({
        queryKey: ['categories-tree'],
        queryFn: () => categoriesAPI.tree().then(r => r.data),
        enabled: isEdit, // only fetch when editing — create/add-child don't need it
    })
    /* Build a flat option list (depth-prefixed) excluding the edited node + all its
       descendants. If the edited node is not found in the cached tree (stale cache),
       disable the picker entirely so the user can't pick an invalid target. */
    const { parentOptions, pickerReady } = (() => {
        const empty = { parentOptions: [] as { id: number; label: string; level: number }[], pickerReady: false }
        if (!isEdit || !treeQuery.data) return empty
        const findNode = (nodes: CategoryTreeNode[]): CategoryTreeNode | null => {
            for (const n of nodes) {
                if (n.id === existing!.id) return n
                const f = findNode(n.children)
                if (f) return f
            }
            return null
        }
        const self = findNode(treeQuery.data)
        if (!self) return empty // cache is stale — refuse to render options

        const excludeIds = new Set<number>([self.id])
        const collectDescendants = (n: CategoryTreeNode) => {
            for (const c of n.children) {
                excludeIds.add(c.id)
                collectDescendants(c)
            }
        }
        collectDescendants(self)

        // The deepest level the moved subtree will reach is (newParentLevel + 1 + selfSubtreeDepth).
        // Disallow new parents that would push it past 5.
        let subtreeDepth = 0
        const measure = (nodes: CategoryTreeNode[], d: number) => {
            if (nodes.length === 0) return
            subtreeDepth = Math.max(subtreeDepth, d)
            for (const c of nodes) measure(c.children, d + 1)
        }
        measure(self.children, 1)
        const maxParentLevel = 5 - 1 - subtreeDepth

        const out: { id: number; label: string; level: number }[] = []
        const walk = (nodes: CategoryTreeNode[], depth: number) => {
            for (const n of nodes) {
                if (!excludeIds.has(n.id) && n.level <= maxParentLevel) {
                    const indent = '— '.repeat(depth)
                    out.push({ id: n.id, label: `${indent}${n.name_ar && /[\u0600-\u06FF]/.test(n.name_ar) ? n.name_ar : (n.name_en || n.name_ar)}`, level: n.level })
                }
                walk(n.children, depth + 1)
            }
        }
        walk(treeQuery.data, 0)
        return { parentOptions: out, pickerReady: true }
    })()

    /* Auto-translate: scans BOTH name fields for actual Arabic/Latin characters
       (not just which field is non-empty), so that text typed in the wrong field
       is auto-corrected. Example: typing "الحجر الطبيعي" in the English field
       and "CR1100000" in the Arabic field → moves Arabic text to the Arabic field
       and produces a proper English translation in the English field. */
    const [translating, setTranslating] = useState(false)
    const arabicCharRegex = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/
    const latinLetterRegex = /[A-Za-z]/

    const handleAutoTranslate = async () => {
        const ar = form.name_ar.trim()
        const en = form.name_en.trim()
        if (!ar && !en) {
            toast.warning('اكتب الاسم بالعربية أو الإنجليزية أولاً')
            return
        }

        // Find the field that actually contains Arabic characters (regardless of which input it's in)
        const arabicSource =
            arabicCharRegex.test(ar) ? ar :
            arabicCharRegex.test(en) ? en : ''
        // Find the field that actually contains real English letters (excluding pure codes/numbers like "CR1100000")
        const latinSource =
            (!arabicCharRegex.test(en) && latinLetterRegex.test(en)) ? en :
            (!arabicCharRegex.test(ar) && latinLetterRegex.test(ar)) ? ar : ''

        let sourceText: string
        let direction: 'ar→en' | 'en→ar'
        if (arabicSource) {
            sourceText = arabicSource
            direction = 'ar→en'
        } else if (latinSource) {
            sourceText = latinSource
            direction = 'en→ar'
        } else {
            toast.warning('لم أتعرف على نص عربي أو إنجليزي قابل للترجمة')
            return
        }

        setTranslating(true)
        try {
            const res = await translateAPI.translate(
                sourceText,
                direction === 'ar→en' ? 'ar' : 'en',
                direction === 'ar→en' ? 'en' : 'ar',
            )
            const translated = res.data.translated?.trim()
            if (!translated) {
                toast.error('لم تنجح الترجمة')
                return
            }
            // Always place Arabic in name_ar and English in name_en, overwriting whatever was there
            if (direction === 'ar→en') {
                setForm(f => ({ ...f, name_ar: sourceText, name_en: translated }))
                toast.success('تم نقل العربي وترجمته إلى الإنجليزي')
            } else {
                setForm(f => ({ ...f, name_en: sourceText, name_ar: translated }))
                toast.success('تم نقل الإنجليزي وترجمته إلى العربي')
            }
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'فشلت الترجمة'
            toast.error(msg)
        } finally {
            setTranslating(false)
        }
    }

    const mutation = useMutation({
        mutationFn: () => {
            // On edit, send `parent` only if the user actually changed it via the picker.
            // (Sending it unchanged is harmless but sending null when unchanged would re-root.)
            if (isEdit) {
                const payload: Record<string, unknown> = { ...form }
                if (parentChoice !== (existing!.parent_id ?? null)) {
                    payload.parent = parentChoice
                }
                return categoriesAPI.update(existing!.id, payload)
            }
            const payload = { ...form, parent: parentNode?.id ?? null }
            return parentNode
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

                    {/* Parent picker — only when editing. Lets the user move a category
                         under a different parent. Excludes self + descendants automatically. */}
                    {isEdit && (
                        <div>
                            <label style={lStyle}>التصنيف الأب</label>
                            <select
                                style={iStyle}
                                value={parentChoice ?? ''}
                                onChange={e => setParentChoice(e.target.value === '' ? null : Number(e.target.value))}
                                disabled={treeQuery.isLoading || !pickerReady}
                            >
                                <option value="">— تصنيف رئيسي (بدون أب) —</option>
                                {parentOptions.map(o => (
                                    <option key={o.id} value={o.id}>{o.label}</option>
                                ))}
                            </select>
                            {!treeQuery.isLoading && !pickerReady && (
                                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4, display: 'block' }}>
                                    تعذّر تحميل شجرة التصنيفات الآن — لا يمكن تغيير الأب في هذه الجلسة.
                                </span>
                            )}
                            {pickerReady && parentChoice !== (existing!.parent_id ?? null) && (
                                <span style={{ fontSize: 11, color: '#C8A84B', marginTop: 4, display: 'block' }}>
                                    سيتم نقل التصنيف وجميع تصنيفاته الفرعية للأب الجديد عند الحفظ.
                                </span>
                            )}
                        </div>
                    )}

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
    const qc = useQueryClient()
    const { data, isLoading } = useQuery<AttrsResponse>({
        queryKey: ['cat-attrs', catId],
        queryFn: () => categoriesAPI.attributes(catId).then(r => r.data),
    })

    const attrs      = data?.schemas ?? []
    const isInherited = data?.is_inherited ?? false
    const rootId      = data?.root_id ?? catId
    const rootName    = data?.root_name_ar ?? ''

    // ── Bulk-translate attribute labels ─────────────────────────────
    // Counts how many schemas across the whole DB still need translation.
    // Refetches whenever this panel opens so the button stays accurate.
    const { data: untranslated } = useQuery<{ count: number }>({
        queryKey: ['attr-untranslated-count'],
        queryFn: () => categoriesAPI.attributesUntranslatedCount().then(r => r.data),
        staleTime: 30_000,
    })
    const untranslatedCount = untranslated?.count ?? 0

    const [translating, setTranslating] = useState<{
        running: boolean; done: number; total: number; failed: number;
        skipped: number; lastError?: string
    } | null>(null)

    const handleTranslateAttrs = async () => {
        if (untranslatedCount === 0) return
        const ok = window.confirm(
            `سيتم ترجمة ${untranslatedCount} حقل ديناميكي تلقائياً. قد يستغرق ذلك بضع دقائق. هل تريد المتابعة؟`,
        )
        if (!ok) return

        const total = untranslatedCount
        setTranslating({ running: true, done: 0, total, failed: 0, skipped: 0 })

        let done = 0
        let failed = 0
        let skipped = 0
        let lastError: string | undefined
        // Schemas to exclude from subsequent batches: anything that genuinely
        // failed AND anything we skipped (pure codes like DECORTAKM1) so the
        // loop terminates cleanly instead of re-processing them.
        const excludeIds = new Set<number>()
        const CHUNK = 15
        const MAX_ITERATIONS = Math.ceil(total / CHUNK) * 3 + 5

        try {
            for (let i = 0; i < MAX_ITERATIONS; i++) {
                let res
                try {
                    res = (await categoriesAPI.bulkTranslateAttributes(CHUNK, [...excludeIds])).data
                } catch (e: unknown) {
                    const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
                        ?? 'فشل الاتصال بخدمة الترجمة'
                    lastError = msg
                    setTranslating(p => p ? { ...p, lastError: msg, running: false } : p)
                    toast.error(msg)
                    return
                }
                done    += res.succeeded
                failed  += res.failed
                skipped += res.skipped ?? 0
                if (res.errors?.[0]?.error) lastError = res.errors[0].error
                for (const err of res.errors ?? []) excludeIds.add(err.id)
                for (const sid of res.skipped_ids ?? []) excludeIds.add(sid)
                setTranslating({
                    running: res.remaining > 0,
                    done, total, failed, skipped, lastError,
                })
                if (res.remaining === 0) break
                if (res.processed === 0) {
                    toast.warning(`توقّفت الترجمة — تبقّى ${res.remaining} حقل لم يُعالَج.`)
                    break
                }
            }
            // Refresh the panels and the global count
            qc.invalidateQueries({ queryKey: ['cat-attrs'] })
            qc.invalidateQueries({ queryKey: ['attr-untranslated-count'] })
            qc.invalidateQueries({ queryKey: ['categories-tree'] })

            const skipNote = skipped > 0 ? ` وتم تخطّي ${skipped} رمز/اختصار` : ''
            if (failed === 0 && done > 0) toast.success(`تمت ترجمة ${done} حقل بنجاح${skipNote}`)
            else if (done > 0)            toast.warning(`نُجحت ترجمة ${done}، وفشلت ${failed}${skipNote}`)
            else if (failed > 0)          toast.error(`فشلت الترجمة لجميع الحقول (${failed})`)
            else if (skipped > 0)         toast.info(`تم تخطّي ${skipped} حقل لأنها رموز/اختصارات فقط`)
        } finally {
            setTranslating(p => p ? { ...p, running: false } : p)
            setTimeout(() => setTranslating(null), 6000)
        }
    }

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
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {untranslatedCount > 0 && (
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={handleTranslateAttrs}
                            disabled={translating?.running}
                            title={`ترجمة ${untranslatedCount} حقل ديناميكي تلقائياً`}
                        >
                            {translating?.running
                                ? <><span className="spinner" style={{ width: 12, height: 12 }} /> جاري الترجمة...</>
                                : <><Languages size={12} /> ترجمة الحقول ({untranslatedCount})</>}
                        </button>
                    )}
                    {/* Only root (L1) can add attributes */}
                    {!isInherited && !adding && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setAdding(true)}>
                            <Plus size={12} /> إضافة حقل
                        </button>
                    )}
                </div>
            </div>

            {/* Translation progress banner */}
            {translating && (
                <div style={{
                    marginBottom: 10, padding: '8px 12px', borderRadius: 6,
                    background: translating.failed > 0 && !translating.running
                        ? 'rgba(224,112,112,0.08)' : 'rgba(74,144,217,0.08)',
                    border: `1px solid ${translating.failed > 0 && !translating.running
                        ? 'rgba(224,112,112,0.25)' : 'rgba(74,144,217,0.25)'}`,
                    fontSize: 12,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span>
                            {translating.running
                                ? `جاري الترجمة... ${translating.done} / ${translating.total}`
                                : `انتهى — تمت ترجمة ${translating.done} من ${translating.total}` +
                                  (translating.failed > 0 ? ` (فشل ${translating.failed})` : '') +
                                  (translating.skipped > 0 ? ` (تُخطّي ${translating.skipped})` : '')}
                        </span>
                        {!translating.running && (
                            <button onClick={() => setTranslating(null)}
                                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
                                <X size={12} />
                            </button>
                        )}
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <div style={{
                            height: '100%',
                            width: `${translating.total > 0 ? Math.min(100, (translating.done + translating.failed + translating.skipped) * 100 / translating.total) : 0}%`,
                            background: translating.failed > 0 ? '#e07070' : '#4A90D9',
                            transition: 'width 0.3s',
                        }} />
                    </div>
                    {translating.skipped > 0 && (
                        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--color-text-secondary)' }}>
                            تم تخطّي {translating.skipped} حقل لأنها رموز/اختصارات فقط (لا يمكن ترجمتها)
                        </div>
                    )}
                    {translating.lastError && (
                        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--color-text-secondary)' }}>
                            آخر خطأ: {translating.lastError}
                        </div>
                    )}
                </div>
            )}

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
    expandedIds, onToggle, highlight,
    onEdit, onAddChild,
}: {
    node: CategoryTreeNode
    depth?: number
    expandedIds: Set<number>
    onToggle: (id: number) => void
    highlight?: string
    onEdit: (node: CategoryTreeNode) => void
    onAddChild: (parent: { id: number; name_ar: string; level: number }) => void
}) {
    const qc = useQueryClient()
    const expanded = expandedIds.has(node.id)
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
                    onClick={() => onToggle(node.id)}
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
                        <TreeNode
                            key={child.id} node={child} depth={depth + 1}
                            expandedIds={expandedIds} onToggle={onToggle} highlight={highlight}
                            onEdit={onEdit} onAddChild={onAddChild}
                        />
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

    /* Search & expand state — needed when the tree gets large (1000+ nodes).
       `expandedIds` is the persisted user state; `searchCollapsed` is a temporary
       override used only while a search is active so the user can locally close
       an auto-expanded ancestor without polluting the persisted state. */
    const [searchInput, setSearchInput] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set())
    const [searchCollapsed, setSearchCollapsed] = useState<Set<number>>(() => new Set())

    /* Debounce search to keep typing smooth on big trees */
    useEffect(() => {
        const t = setTimeout(() => setSearchQuery(searchInput.trim().toLowerCase()), 180)
        return () => clearTimeout(t)
    }, [searchInput])

    /* Reset temporary search-only collapses whenever the query changes/clears
       so previous overrides don't bleed into a new search context. */
    useEffect(() => {
        setSearchCollapsed(new Set())
    }, [searchQuery])

    const { data: tree = [], isLoading, error } = useQuery<CategoryTreeNode[]>({
        queryKey: ['categories-tree'],
        queryFn: () => categoriesAPI.tree().then(r => r.data),
    })

    /* Memoized so a 1000-node walk doesn't re-run on every keystroke */
    const totalNodes = useMemo(() => {
        const count = (nodes: CategoryTreeNode[]): number =>
            nodes.reduce((acc, n) => acc + 1 + count(n.children), 0)
        return count(tree)
    }, [tree])

    /* Count categories that effectively need a translation — drives the
       "ترجمة الكل" button visibility and label. A row is "untranslated"
       when one of name_ar / name_en is empty OR doesn't actually contain
       letters of the expected script (e.g. an SAP code like "AG8200100"
       sitting in name_ar is NOT a real Arabic translation). To translate
       we also need a usable source on the other side, so each branch
       requires the *other* field to contain the right script. Must stay
       in sync with backend `_untranslated_qs()`. */
    const untranslatedCount = useMemo(() => {
        const ARABIC_RX = /[\u0600-\u06FF]/
        const LATIN_RX  = /[A-Za-z]/
        const count = (nodes: CategoryTreeNode[]): number => {
            let n = 0
            for (const node of nodes) {
                const ar = (node.name_ar ?? '').trim()
                const en = (node.name_en ?? '').trim()
                const arOk = ar !== '' && ARABIC_RX.test(ar)
                const enOk = en !== '' && LATIN_RX.test(en)
                if ((!arOk && enOk) || (!enOk && arOk)) n++
                n += count(node.children)
            }
            return n
        }
        return count(tree)
    }, [tree])

    /* Filter the tree by search query — keeps any node that matches OR has a
       matching descendant. Auto-collects ancestors of matches so they expand. */
    const { displayTree, ancestorIds, matchCount } = useMemo(() => {
        if (!searchQuery) {
            return { displayTree: tree, ancestorIds: new Set<number>(), matchCount: 0 }
        }
        const ancestors = new Set<number>()
        let matches = 0
        const walk = (nodes: CategoryTreeNode[]): CategoryTreeNode[] => {
            const out: CategoryTreeNode[] = []
            for (const n of nodes) {
                const kids = walk(n.children)
                const selfMatch =
                    n.name_ar.toLowerCase().includes(searchQuery) ||
                    (n.name_en?.toLowerCase().includes(searchQuery) ?? false) ||
                    n.code.toLowerCase().includes(searchQuery)
                if (selfMatch) matches++
                if (selfMatch || kids.length > 0) {
                    if (kids.length > 0) ancestors.add(n.id)
                    out.push({ ...n, children: kids })
                }
            }
            return out
        }
        return { displayTree: walk(tree), ancestorIds: ancestors, matchCount: matches }
    }, [tree, searchQuery])

    /* Effective expansion:
        no search → just user state
        search    → (user ∪ search-forced ancestors) − temporarily-collapsed */
    const effectiveExpanded = useMemo(() => {
        if (!searchQuery) return expandedIds
        const merged = new Set(expandedIds)
        ancestorIds.forEach(id => merged.add(id))
        searchCollapsed.forEach(id => merged.delete(id))
        return merged
    }, [expandedIds, ancestorIds, searchCollapsed, searchQuery])

    const toggleNode = (id: number) => {
        if (searchQuery) {
            const isExpanded = effectiveExpanded.has(id)
            if (isExpanded) {
                /* Closing while searching: just override locally, keep persisted state clean */
                setSearchCollapsed(prev => {
                    const next = new Set(prev)
                    next.add(id)
                    return next
                })
                /* Also un-track from user state if it was there, so closing is unambiguous */
                setExpandedIds(prev => {
                    if (!prev.has(id)) return prev
                    const next = new Set(prev)
                    next.delete(id)
                    return next
                })
            } else {
                /* Opening while searching: lift any local close override and persist the open */
                setSearchCollapsed(prev => {
                    if (!prev.has(id)) return prev
                    const next = new Set(prev)
                    next.delete(id)
                    return next
                })
                setExpandedIds(prev => {
                    const next = new Set(prev)
                    next.add(id)
                    return next
                })
            }
            return
        }
        setExpandedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    /* Iterative collect — avoids recursive flatMap allocation churn on large trees */
    const collectAllIds = (roots: CategoryTreeNode[]): number[] => {
        const ids: number[] = []
        const stack: CategoryTreeNode[] = [...roots]
        while (stack.length) {
            const n = stack.pop()!
            ids.push(n.id)
            for (const c of n.children) stack.push(c)
        }
        return ids
    }

    const expandAll = () => setExpandedIds(new Set(collectAllIds(tree)))
    const collapseAll = () => {
        setExpandedIds(new Set())
        setSearchCollapsed(new Set())
    }

    /* ── Bulk translate all untranslated categories ─────────────────
       Calls the backend in chunks until `remaining` (server-side, after
       excluding known-failed IDs) reaches 0. Items that fail in a chunk
       are added to a skip-list so they can never starve later items —
       the same persistently-failing IDs would otherwise be re-picked
       forever because the backend selects by ascending id. */
    const [bulkProgress, setBulkProgress] = useState<{
        running: boolean; done: number; total: number; failed: number
        lastError?: string
    } | null>(null)

    const handleBulkTranslate = async () => {
        if (untranslatedCount === 0) return
        const ok = window.confirm(
            `سيتم ترجمة ${untranslatedCount} تصنيف غير مترجم. قد يستغرق ذلك بضع دقائق. هل تريد المتابعة؟`,
        )
        if (!ok) return

        const total = untranslatedCount
        setBulkProgress({ running: true, done: 0, total, failed: 0 })

        let done = 0
        let failed = 0
        let lastError: string | undefined
        const failedIds = new Set<number>()
        const CHUNK = 20
        // Cap iterations generously vs an idealised perfect run, so we
        // can never spin forever even if the server keeps reporting
        // non-zero `remaining` due to a bug.
        const MAX_ITERATIONS = Math.ceil(total / CHUNK) * 3 + 5

        try {
            for (let i = 0; i < MAX_ITERATIONS; i++) {
                let res
                try {
                    res = (await categoriesAPI.bulkTranslate(CHUNK, [...failedIds])).data
                } catch (e: unknown) {
                    const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
                        ?? 'فشل الاتصال بخدمة الترجمة'
                    lastError = msg
                    setBulkProgress(p => p ? { ...p, lastError: msg, running: false } : p)
                    toast.error(msg)
                    return
                }

                done += res.succeeded
                failed += res.failed
                if (res.errors?.[0]?.error) lastError = res.errors[0].error
                // Remember items that just failed so the next chunk doesn't
                // re-select the same starving rows.
                for (const err of res.errors ?? []) failedIds.add(err.id)

                setBulkProgress({
                    running: res.remaining > 0, done, total, failed, lastError,
                })

                // Server `remaining` already excludes our failedIds, so when
                // it's 0 there is genuinely nothing left to attempt.
                if (res.remaining === 0) break
                // Belt-and-braces: if a chunk made literally zero forward
                // motion (no successes AND no new failures to grow the
                // skip-list), the loop would stall — bail out.
                if (res.processed === 0) {
                    toast.warning(
                        `توقّفت الترجمة — تبقّى ${res.remaining} تصنيف لم يُعالَج.`,
                    )
                    break
                }
            }

            queryClient.invalidateQueries({ queryKey: ['categories-tree'] })
            queryClient.invalidateQueries({ queryKey: ['categories-flat'] })

            if (failed === 0 && done > 0) {
                toast.success(`تم ترجمة ${done} تصنيف بنجاح`)
            } else if (done > 0) {
                toast.warning(`نُجحت ترجمة ${done}، وفشلت ${failed}`)
            } else if (failed > 0) {
                toast.error(`فشلت الترجمة لجميع التصنيفات (${failed})`)
            }
        } finally {
            setBulkProgress(p => p ? { ...p, running: false } : p)
            // Auto-clear the progress banner after a few seconds
            setTimeout(() => setBulkProgress(null), 5000)
        }
    }

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
                                هرمية حتى 5 مستويات — {totalNodes} تصنيف إجمالاً
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
                <>
                    {/* Toolbar: search + expand/collapse all */}
                    <div style={{
                        display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center',
                        flexWrap: 'wrap',
                    }}>
                        <div style={{ position: 'relative', flex: '1 1 280px', minWidth: 220 }}>
                            <Search size={14} style={{
                                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                                color: 'var(--color-text-secondary)', pointerEvents: 'none',
                            }} />
                            <input
                                type="text"
                                value={searchInput}
                                onChange={e => setSearchInput(e.target.value)}
                                placeholder="ابحث بالاسم أو الكود..."
                                style={{
                                    width: '100%', padding: '9px 36px 9px 36px',
                                    background: 'var(--color-surface-raised)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: 8, color: 'var(--color-text-primary)',
                                    fontSize: 13, outline: 'none',
                                }}
                            />
                            {searchInput && (
                                <button
                                    onClick={() => setSearchInput('')}
                                    style={{
                                        position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        color: 'var(--color-text-secondary)', padding: 4,
                                    }}
                                    title="مسح البحث"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        {untranslatedCount > 0 && (
                            <button
                                className="btn btn-secondary"
                                onClick={handleBulkTranslate}
                                disabled={bulkProgress?.running}
                                title={`ترجمة ${untranslatedCount} تصنيف غير مكتمل تلقائياً`}
                            >
                                {bulkProgress?.running
                                    ? <><span className="spinner" style={{ width: 14, height: 14 }} /> جاري الترجمة...</>
                                    : <><Languages size={14} /> ترجمة الكل ({untranslatedCount})</>}
                            </button>
                        )}
                        <button
                            className="btn btn-ghost"
                            onClick={expandAll}
                            disabled={!!searchQuery}
                            title={searchQuery ? 'متاح فقط بدون بحث' : 'فتح كل الفروع'}
                        >
                            <ListTree size={14} /> فتح الكل
                        </button>
                        <button
                            className="btn btn-ghost"
                            onClick={collapseAll}
                            title="طيّ كل الفروع"
                        >
                            <ChevronsDownUp size={14} /> طيّ الكل
                        </button>
                    </div>

                    {/* Bulk-translate progress banner */}
                    {bulkProgress && (
                        <div style={{
                            marginBottom: 12, padding: '10px 14px', borderRadius: 8,
                            background: bulkProgress.failed > 0 && !bulkProgress.running
                                ? 'rgba(224,112,112,0.08)' : 'rgba(74,144,217,0.08)',
                            border: `1px solid ${bulkProgress.failed > 0 && !bulkProgress.running
                                ? 'rgba(224,112,112,0.25)' : 'rgba(74,144,217,0.25)'}`,
                            fontSize: 12,
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 10 }}>
                                <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                    {bulkProgress.running
                                        ? `جاري الترجمة... ${bulkProgress.done} / ${bulkProgress.total}`
                                        : `انتهى — تمت ترجمة ${bulkProgress.done} من ${bulkProgress.total}` +
                                          (bulkProgress.failed > 0 ? ` (فشل ${bulkProgress.failed})` : '')}
                                </span>
                                {!bulkProgress.running && (
                                    <button
                                        onClick={() => setBulkProgress(null)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                            <div style={{
                                height: 4, background: 'var(--color-surface-hover)',
                                borderRadius: 2, overflow: 'hidden',
                            }}>
                                <div style={{
                                    height: '100%',
                                    width: `${bulkProgress.total > 0 ? Math.min(100, (bulkProgress.done + bulkProgress.failed) * 100 / bulkProgress.total) : 0}%`,
                                    background: bulkProgress.failed > 0 ? '#e07070' : '#4A90D9',
                                    transition: 'width 0.3s',
                                }} />
                            </div>
                            {bulkProgress.lastError && (
                                <div style={{ marginTop: 6, fontSize: 11, color: '#e07070' }}>
                                    آخر خطأ: {bulkProgress.lastError}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Search result summary */}
                    {searchQuery && (
                        <div style={{
                            marginBottom: 12, padding: '8px 12px', borderRadius: 8,
                            background: matchCount > 0 ? 'rgba(74,144,217,0.08)' : 'rgba(224,112,112,0.08)',
                            border: `1px solid ${matchCount > 0 ? 'rgba(74,144,217,0.2)' : 'rgba(224,112,112,0.2)'}`,
                            fontSize: 12, color: 'var(--color-text-secondary)',
                        }}>
                            {matchCount > 0
                                ? `وُجد ${matchCount} تصنيف مطابق لـ "${searchQuery}"`
                                : `لا توجد نتائج لـ "${searchQuery}"`}
                        </div>
                    )}

                    {displayTree.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-secondary)' }}>
                            <Search size={32} style={{ opacity: 0.3, marginBottom: 10 }} />
                            <p>لا توجد نتائج</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {displayTree.map(rootNode => (
                                <TreeNode
                                    key={rootNode.id}
                                    node={rootNode}
                                    depth={0}
                                    expandedIds={effectiveExpanded}
                                    onToggle={toggleNode}
                                    highlight={searchQuery || undefined}
                                    onEdit={node => setModal({ mode: 'edit', node })}
                                    onAddChild={parent => setModal({ mode: 'add-child', parent })}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Help text */}
            <div style={{ marginTop: 24, padding: '12px 16px', background: 'var(--color-surface-hover)', borderRadius: 10, border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Tag size={12} /> أيقونة الحقل: عرض/إخفاء حقول البيانات الديناميكية</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><FolderPlus size={12} color="#4A90D9" /> الأيقونة الزرقاء: إضافة تصنيف فرعي</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><ChevronDown size={12} /> السهم: طيّ/فتح الفروع</span>
                </div>
            </div>

            {/* Modal — `key` forces a fresh instance whenever the target category
                 changes, so internal form state never leaks between two edits. */}
            {modal && (
                <CategoryModal
                    key={
                        modal.mode === 'edit'
                            ? `edit-${modal.node!.id}`
                            : modal.mode === 'add-child'
                                ? `add-child-${modal.parent!.id}`
                                : 'create-root'
                    }
                    existing={modal.mode === 'edit' ? modal.node : undefined}
                    parentNode={modal.mode === 'add-child' ? modal.parent : undefined}
                    onClose={() => setModal(null)}
                />
            )}
        </div>
    )
}
