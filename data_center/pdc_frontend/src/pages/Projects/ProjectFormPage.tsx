/**
 * Project Form Page — Add / Edit مشروع
 * Two-step UX: save metadata first, then upload images.
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    Save, ArrowRight, Building2, Loader2, Languages, X,
    Search, Plus, Trash2, Star, StarOff, Upload, Image as ImageIcon,
} from 'lucide-react'
import { projectsAPI, translateAPI } from '@/api/client'
import { getApiErrorMessage } from '@/api/errors'
import { toast } from 'react-toastify'
import { useAuthStore } from '@/store/authStore'
import type { Project, ProjectProductRef } from '@/types'

type StringKey = {
    [K in keyof FormState]: FormState[K] extends string ? K : never
}[keyof FormState]

interface ProjectSavePayload {
    name_ar: string
    name_en: string
    description_ar: string
    description_en: string
    location_ar: string
    location_en: string
    project_year: number | null
    is_active: boolean
    sort_order: number
    product_ids: number[]
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 10 * 1024 * 1024

interface FormState {
    name_ar: string
    name_en: string
    description_ar: string
    description_en: string
    location_ar: string
    location_en: string
    project_year: string
    is_active: boolean
    sort_order: number
    product_ids: number[]
}

const EMPTY_FORM: FormState = {
    name_ar: '', name_en: '',
    description_ar: '', description_en: '',
    location_ar: '', location_en: '',
    project_year: '',
    is_active: true,
    sort_order: 0,
    product_ids: [],
}

export default function ProjectFormPage() {
    const { id } = useParams<{ id: string }>()
    const isEdit = !!id
    const projectId = id ? Number(id) : null
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const user = useAuthStore(s => s.user)
    const canEdit = user?.role === 'super_admin' || user?.role === 'مدير_قسم'

    const [form, setForm] = useState<FormState>(EMPTY_FORM)
    const [translatingName, setTranslatingName] = useState(false)
    const [translatingDesc, setTranslatingDesc] = useState(false)
    const [translatingLoc, setTranslatingLoc] = useState(false)

    // Product picker state
    const [productSearch, setProductSearch] = useState('')
    const [pickedProducts, setPickedProducts] = useState<ProjectProductRef[]>([])

    // Image upload state
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [uploading, setUploading] = useState(false)
    const [dropActive, setDropActive] = useState(false)
    const [uploadItems, setUploadItems] = useState<Array<{
        id: string; name: string; pct: number; status: 'pending' | 'uploading' | 'done' | 'error'; error?: string
    }>>([])

    // Drag-reorder state
    const [dragImageId, setDragImageId] = useState<number | null>(null)
    const [dragOverId, setDragOverId] = useState<number | null>(null)

    const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
        setForm(prev => ({ ...prev, [k]: v }))

    // ── Load existing project ───────────────────────────────────────
    const { data: project, isLoading } = useQuery<Project>({
        queryKey: ['project-detail', projectId],
        queryFn: () => projectsAPI.detail(projectId!).then(r => r.data),
        enabled: !!projectId,
    })

    useEffect(() => {
        if (!project) return
        setForm({
            name_ar: project.name_ar || '',
            name_en: project.name_en || '',
            description_ar: project.description_ar || '',
            description_en: project.description_en || '',
            location_ar: project.location_ar || '',
            location_en: project.location_en || '',
            project_year: project.project_year ? String(project.project_year) : '',
            is_active: project.is_active,
            sort_order: project.sort_order || 0,
            product_ids: (project.product_id_list || (project.products || []).map(p => p.id)).slice(),
        })
        setPickedProducts(project.products || [])
    }, [project])

    // ── Product search ──────────────────────────────────────────────
    const { data: searchData } = useQuery({
        queryKey: ['project-product-search', productSearch],
        queryFn: () =>
            projectsAPI.searchProducts(productSearch.trim()).then(r => r.data),
        enabled: productSearch.trim().length >= 2,
    })

    const searchResults: ProjectProductRef[] = useMemo(() => {
        const arr: ProjectProductRef[] = Array.isArray(searchData) ? searchData : []
        const pickedIds = new Set(pickedProducts.map(p => p.id))
        return arr.filter(p => !pickedIds.has(p.id))
    }, [searchData, pickedProducts])

    const addProduct = (p: ProjectProductRef) => {
        setPickedProducts(prev => [...prev, p])
        set('product_ids', [...form.product_ids, p.id])
        setProductSearch('')
    }

    const removeProduct = (productId: number) => {
        setPickedProducts(prev => prev.filter(p => p.id !== productId))
        set('product_ids', form.product_ids.filter(x => x !== productId))
    }

    // ── Translate helper ────────────────────────────────────────────
    const translateField = async (
        from: 'ar' | 'en', to: 'ar' | 'en',
        sourceKey: StringKey, targetKey: StringKey,
        setBusy: (b: boolean) => void,
    ) => {
        const src = String(form[sourceKey] || '').trim()
        if (!src) return
        if (String(form[targetKey] || '').trim()) {
            if (!window.confirm('الحقل فيه نص. استبدال؟')) return
        }
        try {
            setBusy(true)
            const { data } = await translateAPI.translate(src, from, to)
            const out = (data?.translated || '').trim()
            if (!out) { toast.error('فشلت الترجمة'); return }
            set(targetKey, out)
            toast.success('تمت الترجمة')
        } catch (e: unknown) {
            toast.error(getApiErrorMessage(e, 'فشلت الترجمة'))
        } finally {
            setBusy(false)
        }
    }

    // ── Save ────────────────────────────────────────────────────────
    const saveMut = useMutation({
        mutationFn: (payload: ProjectSavePayload) =>
            isEdit
                ? projectsAPI.update(projectId!, payload)
                : projectsAPI.create(payload),
        onSuccess: (resp) => {
            queryClient.invalidateQueries({ queryKey: ['projects-list'] })
            queryClient.invalidateQueries({ queryKey: ['project-detail', projectId] })
            toast.success('تم الحفظ')
            const created = resp.data as Project | undefined
            if (!isEdit && created?.id) {
                navigate(`/projects/${created.id}/edit`, { replace: true })
            }
        },
        onError: (e: unknown) => {
            toast.error(getApiErrorMessage(e, 'فشل الحفظ'))
        },
    })

    const handleSave = () => {
        if (!form.name_ar.trim()) {
            toast.error('اسم المشروع بالعربية مطلوب')
            return
        }
        if (form.product_ids.length === 0) {
            toast.error('اختر منتجاً واحداً على الأقل لربطه بالمشروع')
            return
        }
        saveMut.mutate({
            name_ar: form.name_ar.trim(),
            name_en: form.name_en.trim(),
            description_ar: form.description_ar.trim(),
            description_en: form.description_en.trim(),
            location_ar: form.location_ar.trim(),
            location_en: form.location_en.trim(),
            project_year: form.project_year ? Number(form.project_year) : null,
            is_active: form.is_active,
            sort_order: form.sort_order,
            product_ids: form.product_ids,
        })
    }

    // ── Image upload (one file at a time → real per-file progress) ──
    const handleFiles = async (filesIn: FileList | File[] | null) => {
        if (!filesIn || !projectId) return
        const all = Array.from(filesIn as ArrayLike<File>)
        if (all.length === 0) return

        const accepted: File[] = []
        let rejected = 0
        const localItems: typeof uploadItems = []
        for (const f of all) {
            const okType = ALLOWED_TYPES.includes(f.type)
            const okSize = f.size <= MAX_BYTES
            if (!okType || !okSize) {
                rejected++
                continue
            }
            const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
            accepted.push(f)
            localItems.push({ id, name: f.name, pct: 0, status: 'pending' })
        }
        if (rejected > 0) toast.warn(`تم تجاهل ${rejected} ملف (الحد: 10MB، JPG/PNG/WEBP)`)
        if (accepted.length === 0) return

        setUploadItems(prev => [...prev, ...localItems])
        setUploading(true)

        let okCount = 0
        let failCount = 0
        for (let i = 0; i < accepted.length; i++) {
            const f = accepted[i]
            const item = localItems[i]
            try {
                setUploadItems(prev => prev.map(p =>
                    p.id === item.id ? { ...p, status: 'uploading' as const } : p))
                const fd = new FormData()
                fd.append('files', f)
                const { data } = await projectsAPI.uploadImages(projectId, fd, pct => {
                    setUploadItems(prev => prev.map(p =>
                        p.id === item.id ? { ...p, pct } : p))
                })
                const errs = (data?.errors ?? []) as Array<{ name: string; error: string }>
                if ((data?.created?.length ?? 0) > 0) {
                    okCount++
                    setUploadItems(prev => prev.map(p =>
                        p.id === item.id ? { ...p, pct: 100, status: 'done' as const } : p))
                } else {
                    failCount++
                    setUploadItems(prev => prev.map(p =>
                        p.id === item.id
                            ? { ...p, status: 'error' as const, error: errs[0]?.error || 'فشل' }
                            : p))
                }
            } catch (e: unknown) {
                failCount++
                const msg = getApiErrorMessage(e, 'فشل الرفع')
                setUploadItems(prev => prev.map(p =>
                    p.id === item.id ? { ...p, status: 'error' as const, error: msg } : p))
            }
        }

        await queryClient.invalidateQueries({ queryKey: ['project-detail', projectId] })
        if (okCount > 0) toast.success(`تم رفع ${okCount} صورة`)
        if (failCount > 0) toast.error(`فشل رفع ${failCount} صورة`)
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''

        // Auto-clear completed items shortly after to keep the panel tidy.
        window.setTimeout(() => {
            setUploadItems(prev => prev.filter(p => p.status !== 'done'))
        }, 2200)
    }

    const deleteImageMut = useMutation({
        mutationFn: (imageId: number) => projectsAPI.deleteImage(projectId!, imageId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['project-detail', projectId] })
            toast.success('تم حذف الصورة')
        },
        onError: () => toast.error('فشل الحذف'),
    })

    const setCoverMut = useMutation({
        mutationFn: async (imageId: number) => {
            const others = (project?.images || [])
                .filter(im => im.id !== imageId)
                .map(im => im.id)
            return projectsAPI.reorderImages(projectId!, [imageId, ...others])
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['project-detail', projectId] })
            toast.success('تم تعيين الصورة كغلاف')
        },
        onError: () => toast.error('فشلت العملية'),
    })

    const reorderMut = useMutation({
        mutationFn: (orderedIds: number[]) =>
            projectsAPI.reorderImages(projectId!, orderedIds),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['project-detail', projectId] })
        },
        onError: () => toast.error('فشل تغيير الترتيب'),
    })

    const moveImage = (sourceId: number, targetId: number) => {
        if (sourceId === targetId) return
        const ids = (project?.images || []).map(im => im.id)
        const from = ids.indexOf(sourceId)
        const to = ids.indexOf(targetId)
        if (from < 0 || to < 0) return
        const next = ids.slice()
        next.splice(from, 1)
        next.splice(to, 0, sourceId)
        reorderMut.mutate(next)
    }

    // ── Render ─────────────────────────────────────────────────────
    if (isEdit && isLoading) {
        return (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--color-text-secondary)' }}>
                <Loader2 size={28} className="spin" style={{ margin: '0 auto 12px' }} />
                <div>جاري التحميل…</div>
            </div>
        )
    }

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 4px' }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 16, marginBottom: 24, flexWrap: 'wrap',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Link to="/projects" style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        color: 'var(--color-text-secondary)', textDecoration: 'none',
                        fontSize: 13, padding: '6px 10px',
                        border: '1px solid var(--color-border)', borderRadius: 6,
                    }}>
                        <ArrowRight size={14} strokeWidth={1.8} />
                        رجوع
                    </Link>
                    <h1 style={{
                        fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)',
                        margin: 0, display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                        <Building2 size={22} style={{ color: 'var(--color-gold)' }} strokeWidth={1.8} />
                        {isEdit ? 'تعديل مشروع' : 'إضافة مشروع جديد'}
                    </h1>
                </div>
                {canEdit && (
                    <button
                        onClick={handleSave}
                        disabled={saveMut.isPending}
                        className="btn-primary"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            padding: '10px 20px', fontSize: 14, fontWeight: 600,
                        }}
                    >
                        {saveMut.isPending
                            ? <Loader2 size={15} className="spin" />
                            : <Save size={15} strokeWidth={2} />}
                        حفظ
                    </button>
                )}
            </div>

            {!canEdit && (
                <div style={{
                    background: 'rgba(120,120,120,0.08)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8, padding: '10px 14px', marginBottom: 20,
                    fontSize: 13, color: 'var(--color-text-secondary)',
                }}>
                    عرض للقراءة فقط. التعديل متاح لمدير القسم أو مدير النظام.
                </div>
            )}

            {canEdit && !isEdit && (
                <div style={{
                    background: 'rgba(200,168,75,0.10)',
                    border: '1px solid rgba(200,168,75,0.35)',
                    borderRadius: 8, padding: '10px 14px', marginBottom: 20,
                    fontSize: 13, color: 'var(--color-text-primary)',
                }}>
                    احفظ بيانات المشروع أولاً، ثم سيظهر قسم رفع الصور.
                </div>
            )}

            {/* ── Section: Basic info ── */}
            <Section title="بيانات المشروع">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <Field label="اسم المشروع بالعربية *">
                        <input className="form-input" value={form.name_ar}
                            onChange={e => set('name_ar', e.target.value)}
                            placeholder="مثال: فيلا الواجهة الذهبية - الرياض" />
                    </Field>
                    <Field
                        label="Project Name (English)"
                        action={
                            <TranslateBtn
                                disabled={!form.name_ar.trim() || translatingName}
                                busy={translatingName}
                                onClick={() => translateField('ar', 'en', 'name_ar', 'name_en', setTranslatingName)}
                            />
                        }
                    >
                        <input className="form-input" value={form.name_en}
                            onChange={e => set('name_en', e.target.value)}
                            placeholder="Golden Facade Villa — Riyadh"
                            style={{ direction: 'ltr', textAlign: 'left' }} />
                    </Field>

                    <Field label="الموقع (عربي)">
                        <input className="form-input" value={form.location_ar}
                            onChange={e => set('location_ar', e.target.value)}
                            placeholder="حي النرجس، الرياض" />
                    </Field>
                    <Field
                        label="Location (English)"
                        action={
                            <TranslateBtn
                                disabled={!form.location_ar.trim() || translatingLoc}
                                busy={translatingLoc}
                                onClick={() => translateField('ar', 'en', 'location_ar', 'location_en', setTranslatingLoc)}
                            />
                        }
                    >
                        <input className="form-input" value={form.location_en}
                            onChange={e => set('location_en', e.target.value)}
                            placeholder="Al-Narjis District, Riyadh"
                            style={{ direction: 'ltr', textAlign: 'left' }} />
                    </Field>

                    <Field label="سنة المشروع">
                        <input className="form-input" type="number"
                            value={form.project_year}
                            onChange={e => set('project_year', e.target.value)}
                            placeholder="2025" min={1990} max={2100} />
                    </Field>
                    <Field label="ترتيب العرض (الأصغر أولاً)">
                        <input className="form-input" type="number"
                            value={form.sort_order}
                            onChange={e => set('sort_order', Number(e.target.value) || 0)} />
                    </Field>
                </div>

                <div style={{ marginTop: 14 }}>
                    <Field
                        label="وصف المشروع (عربي)"
                    >
                        <textarea className="form-input" rows={4} value={form.description_ar}
                            onChange={e => set('description_ar', e.target.value)}
                            placeholder="وصف مختصر للمشروع، نوع الاستخدام، الأقسام المنفذة…" />
                    </Field>
                </div>
                <div style={{ marginTop: 14 }}>
                    <Field
                        label="Description (English)"
                        action={
                            <TranslateBtn
                                disabled={!form.description_ar.trim() || translatingDesc}
                                busy={translatingDesc}
                                onClick={() => translateField('ar', 'en', 'description_ar', 'description_en', setTranslatingDesc)}
                            />
                        }
                    >
                        <textarea className="form-input" rows={4} value={form.description_en}
                            onChange={e => set('description_en', e.target.value)}
                            placeholder="Brief project description in English…"
                            style={{ direction: 'ltr', textAlign: 'left' }} />
                    </Field>
                </div>

                <label style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    marginTop: 14, cursor: 'pointer', fontSize: 13,
                    color: 'var(--color-text-primary)',
                }}>
                    <input type="checkbox" checked={form.is_active}
                        onChange={e => set('is_active', e.target.checked)} />
                    نشط (يظهر في الصفحات العامة)
                </label>
            </Section>

            {/* ── Section: Linked products ── */}
            <Section title="المنتجات المستخدمة في هذا المشروع">
                <div style={{ position: 'relative', marginBottom: 12 }}>
                    <Search size={15} strokeWidth={1.8} style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        color: 'var(--color-text-muted)',
                    }} />
                    <input
                        className="form-input"
                        placeholder="ابحث برمز SAP أو الاسم… (حرفان أو أكثر)"
                        value={productSearch}
                        onChange={e => setProductSearch(e.target.value)}
                        style={{ paddingRight: 36 }}
                    />
                    {searchResults.length > 0 && (
                        <div style={{
                            position: 'absolute', top: 'calc(100% + 4px)', right: 0, left: 0,
                            background: 'var(--color-surface-raised)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 8, zIndex: 10, maxHeight: 280, overflowY: 'auto',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                        }}>
                            {searchResults.map(p => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => addProduct(p)}
                                    style={{
                                        width: '100%', textAlign: 'right',
                                        padding: '8px 12px',
                                        background: 'transparent', border: 'none', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        borderBottom: '1px solid var(--color-border)',
                                        color: 'var(--color-text-primary)', fontSize: 13,
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                                    onMouseLeave={e => e.currentTarget.style.background = ''}
                                >
                                    {p.main_image_url
                                        ? <img src={p.main_image_url} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />
                                        : <div style={{ width: 36, height: 36, background: 'var(--color-surface)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                                            <ImageIcon size={14} />
                                          </div>}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.product_name_ar}</div>
                                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{p.sku}</div>
                                    </div>
                                    <Plus size={14} strokeWidth={1.8} style={{ color: 'var(--color-gold)' }} />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {pickedProducts.length === 0 ? (
                    <div style={{
                        padding: 16, textAlign: 'center', color: 'var(--color-text-muted)',
                        fontSize: 13, background: 'var(--color-surface)', borderRadius: 8,
                        border: '1px dashed var(--color-border)',
                    }}>
                        لم يتم إضافة منتجات بعد. ابحث أعلاه لإضافة المنتجات المستخدمة في المشروع.
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                        gap: 10,
                    }}>
                        {pickedProducts.map(p => (
                            <div key={p.id} style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: 8, background: 'var(--color-surface)',
                                border: '1px solid var(--color-border)', borderRadius: 8,
                            }}>
                                {p.main_image_url
                                    ? <img src={p.main_image_url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }} />
                                    : <div style={{ width: 44, height: 44, background: 'var(--color-surface-raised)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                                        <ImageIcon size={16} />
                                      </div>}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {p.product_name_ar}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{p.sku}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeProduct(p.id)}
                                    style={{
                                        background: 'transparent', border: 'none', cursor: 'pointer',
                                        color: '#EF4444', padding: 4, borderRadius: 4,
                                    }}
                                    title="إزالة"
                                >
                                    <X size={14} strokeWidth={2} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            {/* Read-only gallery for users without edit rights */}
            {isEdit && projectId && !canEdit && (project?.images?.length ?? 0) > 0 && (
                <Section title="صور المشروع">
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                        gap: 10,
                    }}>
                        {(project?.images || []).map(img => (
                            <div key={img.id} style={{
                                border: img.is_cover ? '2px solid var(--color-gold)' : '1px solid var(--color-border)',
                                borderRadius: 8, overflow: 'hidden',
                                background: 'var(--color-surface)',
                            }}>
                                <div style={{ aspectRatio: '4 / 3', overflow: 'hidden' }}>
                                    <img src={img.image_url} alt={img.alt_text}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* ── Section: Images (after first save) ── */}
            {isEdit && projectId && canEdit && (
                <Section title="صور المشروع">
                    {/* Drop zone */}
                    <div
                        onDragOver={e => { e.preventDefault(); setDropActive(true) }}
                        onDragEnter={e => { e.preventDefault(); setDropActive(true) }}
                        onDragLeave={() => setDropActive(false)}
                        onDrop={e => {
                            e.preventDefault()
                            setDropActive(false)
                            if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                                handleFiles(e.dataTransfer.files)
                            }
                        }}
                        onClick={() => !uploading && fileInputRef.current?.click()}
                        style={{
                            marginBottom: 14, padding: '24px 16px',
                            border: dropActive
                                ? '2px dashed var(--color-gold)'
                                : '2px dashed var(--color-border)',
                            borderRadius: 10,
                            background: dropActive ? 'rgba(200,168,75,0.08)' : 'var(--color-surface)',
                            textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer',
                            transition: 'background 0.15s, border-color 0.15s',
                        }}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            onChange={e => handleFiles(e.target.files)}
                            style={{ display: 'none' }}
                        />
                        <Upload size={28} strokeWidth={1.6}
                            style={{ color: 'var(--color-gold)', marginBottom: 8 }} />
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                            اسحب الصور هنا أو انقر للاختيار
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                            JPG / PNG / WEBP — الحد الأقصى 10MB لكل صورة
                        </div>
                        {uploading && (
                            <div style={{
                                marginTop: 10, fontSize: 12, color: 'var(--color-gold)',
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                            }}>
                                <Loader2 size={12} className="spin" />
                                جاري الرفع…
                            </div>
                        )}
                    </div>

                    {/* Per-file progress list */}
                    {uploadItems.length > 0 && (
                        <div style={{
                            display: 'flex', flexDirection: 'column', gap: 6,
                            marginBottom: 14,
                        }}>
                            {uploadItems.map(it => (
                                <div key={it.id} style={{
                                    background: 'var(--color-surface)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: 6, padding: '6px 10px',
                                }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center',
                                        justifyContent: 'space-between', gap: 10,
                                        marginBottom: 4,
                                    }}>
                                        <span style={{
                                            fontSize: 12, color: 'var(--color-text-primary)',
                                            overflow: 'hidden', textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap', maxWidth: '70%',
                                        }}>
                                            {it.name}
                                        </span>
                                        <span style={{
                                            fontSize: 11,
                                            color: it.status === 'error' ? '#EF4444'
                                                : it.status === 'done' ? 'var(--color-gold)'
                                                    : 'var(--color-text-secondary)',
                                            fontWeight: 600,
                                        }}>
                                            {it.status === 'error'
                                                ? (it.error || 'فشل')
                                                : it.status === 'done' ? 'تم'
                                                    : `${it.pct}%`}
                                        </span>
                                    </div>
                                    <div style={{
                                        height: 4, background: 'var(--color-border)',
                                        borderRadius: 2, overflow: 'hidden',
                                    }}>
                                        <div style={{
                                            height: '100%', width: `${it.pct}%`,
                                            background: it.status === 'error'
                                                ? '#EF4444' : 'var(--color-gold)',
                                            transition: 'width 0.2s ease',
                                        }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {(project?.images?.length ?? 0) === 0 ? (
                        <div style={{
                            padding: 24, textAlign: 'center',
                            color: 'var(--color-text-muted)', fontSize: 13,
                            background: 'var(--color-surface)',
                            borderRadius: 8, border: '1px dashed var(--color-border)',
                        }}>
                            لا توجد صور بعد.
                        </div>
                    ) : (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                            gap: 10,
                        }}>
                            {(project?.images || []).map(img => (
                                <div
                                    key={img.id}
                                    draggable
                                    onDragStart={() => setDragImageId(img.id)}
                                    onDragOver={e => {
                                        e.preventDefault()
                                        if (dragImageId !== null && dragImageId !== img.id) {
                                            setDragOverId(img.id)
                                        }
                                    }}
                                    onDragLeave={() => {
                                        if (dragOverId === img.id) setDragOverId(null)
                                    }}
                                    onDrop={e => {
                                        e.preventDefault()
                                        if (dragImageId !== null) {
                                            moveImage(dragImageId, img.id)
                                        }
                                        setDragImageId(null)
                                        setDragOverId(null)
                                    }}
                                    onDragEnd={() => {
                                        setDragImageId(null)
                                        setDragOverId(null)
                                    }}
                                    title="اسحب لإعادة الترتيب"
                                    style={{
                                        position: 'relative',
                                        border: img.is_cover
                                            ? '2px solid var(--color-gold)'
                                            : dragOverId === img.id
                                                ? '2px dashed var(--color-gold)'
                                                : '1px solid var(--color-border)',
                                        borderRadius: 8, overflow: 'hidden',
                                        background: 'var(--color-surface)',
                                        cursor: 'grab',
                                        opacity: dragImageId === img.id ? 0.45 : 1,
                                        transition: 'opacity 0.15s, border-color 0.15s',
                                    }}
                                >
                                    <div style={{ aspectRatio: '4 / 3', overflow: 'hidden' }}>
                                        <img src={img.image_url} alt={img.alt_text}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                    </div>
                                    {img.is_cover && (
                                        <div style={{
                                            position: 'absolute', top: 6, right: 6,
                                            background: 'var(--color-gold)', color: 'var(--color-charcoal)',
                                            padding: '2px 8px', borderRadius: 10,
                                            fontSize: 10, fontWeight: 700,
                                            display: 'inline-flex', alignItems: 'center', gap: 3,
                                        }}>
                                            <Star size={10} strokeWidth={2.5} />
                                            غلاف
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', borderTop: '1px solid var(--color-border)' }}>
                                        {!img.is_cover && (
                                            <button
                                                type="button"
                                                onClick={() => setCoverMut.mutate(img.id)}
                                                disabled={setCoverMut.isPending}
                                                style={{
                                                    flex: 1, padding: '6px 0', border: 'none',
                                                    background: 'transparent', cursor: 'pointer',
                                                    color: 'var(--color-text-secondary)', fontSize: 11,
                                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                                    borderLeft: '1px solid var(--color-border)',
                                                }}
                                                title="تعيين كغلاف"
                                            >
                                                <StarOff size={11} strokeWidth={1.8} />
                                                غلاف
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (window.confirm('حذف هذه الصورة؟')) deleteImageMut.mutate(img.id)
                                            }}
                                            disabled={deleteImageMut.isPending}
                                            style={{
                                                flex: 1, padding: '6px 0', border: 'none',
                                                background: 'transparent', cursor: 'pointer',
                                                color: '#EF4444', fontSize: 11,
                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                            }}
                                        >
                                            <Trash2 size={11} strokeWidth={1.8} />
                                            حذف
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Section>
            )}
        </div>
    )
}

// ── Small UI helpers ──────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: 12, padding: 18, marginBottom: 16,
        }}>
            <div style={{
                fontSize: 14, fontWeight: 700,
                color: 'var(--color-text-primary)',
                marginBottom: 14, paddingBottom: 10,
                borderBottom: '1px solid var(--color-border)',
            }}>
                {title}
            </div>
            {children}
        </div>
    )
}

function Field({
    label, action, children,
}: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="form-group">
            <label className="form-label" style={{
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', gap: 8,
            }}>
                <span>{label}</span>
                {action}
            </label>
            {children}
        </div>
    )
}

function TranslateBtn({
    disabled, busy, onClick,
}: { disabled: boolean; busy: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            title="ترجمة من العربية"
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', fontSize: 11, fontWeight: 600,
                background: !disabled ? 'rgba(200,168,75,0.10)' : 'transparent',
                color: !disabled ? 'var(--color-gold)' : 'var(--color-text-muted)',
                border: `1px solid ${!disabled ? 'rgba(200,168,75,0.35)' : 'var(--color-border)'}`,
                borderRadius: 6,
                cursor: !disabled ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                opacity: !disabled ? 1 : 0.55,
            }}
        >
            {busy ? <Loader2 size={12} className="spin" /> : <Languages size={12} />}
            <span>ترجمة</span>
        </button>
    )
}
