import { useState, useEffect, useCallback, useRef } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { decorativeAPI, productsAPI } from '@/api/client'
import type { DecorativeGeneration, MultiProductSlot, MultiProductRole, Product, ProductImage } from '@/types'
import {
    Layers, Plus, Trash2, Upload, Loader2, Eye, Settings2,
    CheckCircle2, Sparkles, ArrowLeft, ArrowRight, Download,
    RefreshCw, XCircle, Image as ImageIcon, Wand2, Edit2, Save, X,
} from 'lucide-react'

type MultiStep = 'slots' | 'analysis' | 'settings' | 'confirm' | 'generating' | 'result'

const ROLE_OPTIONS: { value: MultiProductRole; labelAr: string; labelEn: string; emoji: string }[] = [
    { value: 'floor', labelAr: 'أرضية', labelEn: 'Floor', emoji: '🟫' },
    { value: 'wall', labelAr: 'جدار', labelEn: 'Wall', emoji: '🧱' },
    { value: 'focal', labelAr: 'منتج رئيسي', labelEn: 'Focal Product', emoji: '⭐' },
    { value: 'accent', labelAr: 'عنصر مكمل', labelEn: 'Accent', emoji: '✨' },
]

const SPACE_TYPES = [
    { value: 'living_room', label: 'غرفة معيشة', prompt: 'modern living room' },
    { value: 'bedroom', label: 'غرفة نوم', prompt: 'elegant bedroom' },
    { value: 'bathroom', label: 'حمام', prompt: 'modern bathroom' },
    { value: 'kitchen', label: 'مطبخ', prompt: 'contemporary kitchen' },
    { value: 'office', label: 'مكتب', prompt: 'home office' },
    { value: 'lobby', label: 'لوبي / استقبال', prompt: 'grand entrance lobby' },
    { value: 'restaurant', label: 'مطعم', prompt: 'upscale restaurant interior' },
    { value: 'outdoor', label: 'مساحة خارجية', prompt: 'outdoor patio area' },
]

const DESIGN_STYLES = [
    { value: 'modern', label: 'حديث', prompt: 'modern minimalist design' },
    { value: 'classic', label: 'كلاسيكي', prompt: 'classic European design' },
    { value: 'arabic', label: 'عربي / إسلامي', prompt: 'traditional Arabic Islamic design' },
    { value: 'luxury', label: 'فاخر', prompt: 'luxury high-end interior design' },
    { value: 'scandinavian', label: 'اسكندنافي', prompt: 'Scandinavian clean design' },
    { value: 'contemporary', label: 'معاصر', prompt: 'contemporary design' },
]

const LIGHTING_OPTIONS = [
    { value: 'natural', label: 'إضاءة طبيعية', prompt: 'natural daylight streaming through large windows' },
    { value: 'warm', label: 'إضاءة دافئة', prompt: 'warm golden ambient lighting' },
    { value: 'dramatic', label: 'إضاءة درامية', prompt: 'dramatic directional lighting with shadows' },
    { value: 'soft', label: 'إضاءة ناعمة', prompt: 'soft diffused lighting' },
]

const CAMERA_ANGLES = [
    { value: 'eye_level', label: 'مستوى العين', prompt: 'eye-level perspective shot' },
    { value: 'corner', label: 'زاوية ركنية', prompt: 'corner perspective showing two walls' },
    { value: 'low_angle', label: 'زاوية منخفضة', prompt: 'low angle shot looking up' },
]

const MOOD_OPTIONS = [
    { value: 'warm', label: 'دافئ ومرحب', prompt: 'warm and inviting atmosphere' },
    { value: 'elegant', label: 'أنيق وراقي', prompt: 'elegant and sophisticated atmosphere' },
    { value: 'calm', label: 'هادئ ومريح', prompt: 'serene and peaceful atmosphere' },
]

const ASPECT_RATIOS = [
    { value: '16:9', label: '16:9 عرضي' },
    { value: '1:1', label: '1:1 مربع' },
    { value: '9:16', label: '9:16 طولي' },
]

interface SlotState {
    role: MultiProductRole
    imageUrl: string
    imagePreview: string
    uploading: boolean
    productId?: number
    materialSubtypeHint: string
    generationModeHint: string
}

const emptySlot = (): SlotState => ({
    role: 'accent',
    imageUrl: '',
    imagePreview: '',
    uploading: false,
    materialSubtypeHint: '',
    generationModeHint: '',
})

interface Props {
    onBack: () => void
}

const MAX_POLLS = 120

export default function MultiProductGenerator({ onBack }: Props) {
    const [step, setStep] = useState<MultiStep>('slots')
    const [slots, setSlots] = useState<SlotState[]>([
        { ...emptySlot(), role: 'floor' },
        { ...emptySlot(), role: 'focal' },
    ])
    const [generation, setGeneration] = useState<DecorativeGeneration | null>(null)
    const [pollCount, setPollCount] = useState(0)

    const [spaceType, setSpaceType] = useState(SPACE_TYPES[0])
    const [designStyle, setDesignStyle] = useState(DESIGN_STYLES[0])
    const [lighting, setLighting] = useState(LIGHTING_OPTIONS[0])
    const [cameraAngle, setCameraAngle] = useState(CAMERA_ANGLES[0])
    const [mood, setMood] = useState(MOOD_OPTIONS[0])
    const [aspectRatio, setAspectRatio] = useState('16:9')
    const [quality, setQuality] = useState('standard')
    const [customPrompt, setCustomPrompt] = useState('')
    const [attachProductIds, setAttachProductIds] = useState<number[]>([])
    const [attachStatus, setAttachStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
    const [attachMessage, setAttachMessage] = useState('')

    interface AnalysisOverride {
        product_type?: string
        color?: string
        surface?: string
        description_en?: string
        recommended_placement?: string
    }
    const [editingSlotIdx, setEditingSlotIdx] = useState<number | null>(null)
    const [editDraft, setEditDraft] = useState<AnalysisOverride>({})
    const [slotOverrides, setSlotOverrides] = useState<Record<number, AnalysisOverride>>({})
    const [suggestedSpaceType, setSuggestedSpaceType] = useState('')

    const fileInputRefs = useRef<(HTMLInputElement | null)[]>([])

    const [pickerSlotIdx, setPickerSlotIdx] = useState<number | null>(null)
    const [pickerSearch, setPickerSearch] = useState('')
    const [debouncedPickerSearch, setDebouncedPickerSearch] = useState('')
    const [pickerProductId, setPickerProductId] = useState<number | null>(null)

    useEffect(() => {
        const t = setTimeout(() => setDebouncedPickerSearch(pickerSearch.trim()), 300)
        return () => clearTimeout(t)
    }, [pickerSearch])

    const { data: productsResp, isFetching: productsFetching } = useQuery({
        queryKey: ['products-for-decorative', debouncedPickerSearch],
        queryFn: () => productsAPI.list({
            page_size: 60,
            status: 'نشط',
            ...(debouncedPickerSearch ? { search: debouncedPickerSearch } : {}),
        }),
    })
    const products: Product[] = productsResp?.data?.results ?? productsResp?.data ?? []

    const { data: pickerImagesResp, isFetching: pickerImagesFetching } = useQuery({
        queryKey: ['picker-product-images', pickerProductId],
        queryFn: () => productsAPI.listImages(pickerProductId!),
        enabled: !!pickerProductId,
    })
    const pickerImages: ProductImage[] = pickerImagesResp?.data ?? []

    const updateSlot = (idx: number, patch: Partial<SlotState>) => {
        setSlots(prev => prev.map((s, i) => {
            if (i === idx) return { ...s, ...patch }
            if (patch.role === 'focal' && s.role === 'focal') return { ...s, role: 'accent' as MultiProductRole }
            return s
        }))
    }

    const addSlot = () => {
        if (slots.length >= 4) return
        setSlots(prev => [...prev, emptySlot()])
    }

    const removeSlot = (idx: number) => {
        if (slots.length <= 2) return
        setSlots(prev => prev.filter((_, i) => i !== idx))
    }

    const handleFileUpload = async (idx: number, file: File) => {
        const preview = URL.createObjectURL(file)
        updateSlot(idx, { imagePreview: preview, uploading: true, imageUrl: '' })
        try {
            const formData = new FormData()
            formData.append('file', file)
            const resp = await decorativeAPI.uploadImage(formData)
            updateSlot(idx, { imageUrl: resp.data.image_url, uploading: false })
        } catch {
            updateSlot(idx, { uploading: false })
        }
    }

    const handleFileInput = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file && file.type.startsWith('image/')) {
            handleFileUpload(idx, file)
        }
    }

    const handleDrop = (idx: number, e: React.DragEvent) => {
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (file && file.type.startsWith('image/')) {
            handleFileUpload(idx, file)
        }
    }

    const handleSelectProductImage = (idx: number, imageUrl: string, productId: number) => {
        updateSlot(idx, { imageUrl, imagePreview: imageUrl, productId })
        setPickerSlotIdx(null)
        setPickerProductId(null)
        setPickerSearch('')
    }

    const allSlotsReady = slots.length >= 2 && slots.every(s => s.imageUrl && !s.uploading)

    const floorCount = slots.filter(s => s.role === 'floor').length
    const wallCount = slots.filter(s => s.role === 'wall').length
    const roleError = floorCount > 1
        ? 'لا يمكن تحديد أكثر من أرضية واحدة'
        : wallCount > 1
            ? 'لا يمكن تحديد أكثر من جدار واحد'
            : ''
    const canAnalyze = allSlotsReady && !roleError

    const analyzeMutation = useMutation({
        mutationFn: () => {
            const apiSlots = slots.map(s => ({
                role: s.role,
                image_url: s.imageUrl,
                product_id: s.productId,
                material_subtype_hint: s.materialSubtypeHint || undefined,
                generation_mode_hint: s.generationModeHint || undefined,
            }))
            return decorativeAPI.analyzeMulti({ slots: apiSlots })
        },
        onSuccess: (resp) => {
            setGeneration(resp.data)
            setSlotOverrides({})
            setEditingSlotIdx(null)
            const suggested = resp.data.suggested_space_type
            if (suggested) {
                setSuggestedSpaceType(suggested)
                const match = SPACE_TYPES.find(s => s.value === suggested)
                if (match) setSpaceType(match)
            } else {
                setSuggestedSpaceType('')
            }
            setStep('analysis')
        },
    })

    const generateMutation = useMutation({
        mutationFn: (data: object) => decorativeAPI.generateMulti(data),
        onSuccess: (resp) => {
            setGeneration(resp.data)
            setStep('generating')
        },
    })

    const pollStatus = useCallback(async () => {
        if (!generation?.id) return
        setPollCount(prev => {
            if (prev >= MAX_POLLS) {
                setGeneration(g => g ? { ...g, status: 'failed' as const, error_message: 'انتهت مهلة الانتظار.' } : g)
                setStep('result')
                return prev
            }
            return prev + 1
        })
        try {
            const resp = await decorativeAPI.checkStatus(generation.id)
            setGeneration(resp.data)
            if (resp.data.status === 'completed' || resp.data.status === 'failed') {
                setStep('result')
            }
        } catch {
            // retry
        }
    }, [generation?.id])

    useEffect(() => {
        if (step !== 'generating') return
        const interval = setInterval(pollStatus, 3000)
        return () => clearInterval(interval)
    }, [step, pollStatus])

    const handleGenerate = () => {
        if (!generation?.id) return
        setPollCount(0)
        const overridesArr = Object.entries(slotOverrides)
            .filter(([, v]) => Object.values(v).some(val => val))
            .map(([idx, fields]) => ({ index: Number(idx), ...fields }))
        generateMutation.mutate({
            generation_id: generation.id,
            space_type: spaceType.value,
            space_type_prompt: spaceType.prompt,
            design_style: designStyle.value,
            design_style_prompt: designStyle.prompt,
            lighting: lighting.value,
            lighting_prompt: lighting.prompt,
            camera_angle: cameraAngle.value,
            camera_angle_prompt: cameraAngle.prompt,
            mood: mood.value,
            mood_prompt: mood.prompt,
            aspect_ratio: aspectRatio,
            render_quality: quality,
            custom_notes: customPrompt,
            ...(overridesArr.length > 0 ? { slot_overrides: overridesArr } : {}),
        })
    }

    const handleAttachToProducts = async () => {
        if (!generation?.id || attachProductIds.length === 0) return
        setAttachStatus('loading')
        setAttachMessage('')
        try {
            const resp = await decorativeAPI.attachToProduct(generation.id, undefined, attachProductIds)
            const data = resp.data
            if (data.error_count && data.error_count > 0) {
                setAttachStatus('error')
                setAttachMessage(data.message || `فشل إضافة الصورة لـ ${data.error_count} منتج`)
            } else {
                setAttachStatus('success')
                setAttachMessage(data.message || 'تمت إضافة الصورة بنجاح')
            }
        } catch (err: unknown) {
            setAttachStatus('error')
            const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
            setAttachMessage(msg || 'فشل إضافة الصورة للمنتجات')
        }
    }

    const handleStartOver = () => {
        setStep('slots')
        setGeneration(null)
        setSlots([
            { ...emptySlot(), role: 'floor' },
            { ...emptySlot(), role: 'focal' },
        ])
        setPollCount(0)
        setCustomPrompt('')
        setPickerSlotIdx(null)
        setAttachProductIds([])
        setAttachStatus('idle')
        setAttachMessage('')
        setSlotOverrides({})
        setEditingSlotIdx(null)
        setSuggestedSpaceType('')
    }

    const filteredProducts = products

    const stepIndex = ['slots', 'analysis', 'settings', 'confirm', 'generating', 'result'].indexOf(step)

    return (
        <div className="decorative-page">
            <div className="decorative-header">
                <div className="decorative-title">
                    <Layers size={28} />
                    <h1>مشهد متعدد المنتجات</h1>
                </div>
                <p className="decorative-subtitle">
                    ادمج 2–4 منتجات في مشهد ديكوري واحد — أرضية + جدار + منتجات
                </p>
            </div>

            <div className="wizard-steps">
                {[
                    { key: 'slots', label: 'المنتجات', icon: Layers },
                    { key: 'analysis', label: 'التحليل', icon: Eye },
                    { key: 'settings', label: 'الإعدادات', icon: Settings2 },
                    { key: 'confirm', label: 'تأكيد', icon: CheckCircle2 },
                    { key: 'generating', label: 'توليد', icon: Sparkles },
                    { key: 'result', label: 'النتيجة', icon: CheckCircle2 },
                ].map((s, i) => (
                    <div
                        key={s.key}
                        className={`wizard-step ${i <= stepIndex ? 'active' : ''} ${i === stepIndex ? 'current' : ''}`}
                    >
                        <div className="wizard-step-icon"><s.icon size={18} /></div>
                        <span>{s.label}</span>
                    </div>
                ))}
            </div>

            <div className="decorative-content">
                {step === 'slots' && (
                    <div className="step-panel">
                        <h2><Layers size={22} /> اختر المنتجات وأدوارها</h2>
                        <p>أضف 2–4 منتجات وحدد دور كل منتج في المشهد — يمكنك تحديد منتج رئيسي واحد فقط كبطل المشهد</p>

                        <div className="multi-slots-list">
                            {slots.map((slot, idx) => (
                                <div key={idx} className="multi-slot-card">
                                    <div className="multi-slot-header">
                                        <span className="multi-slot-number">منتج {idx + 1}</span>
                                        {slots.length > 2 && (
                                            <button className="multi-slot-remove" onClick={() => removeSlot(idx)}>
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>

                                    <div className="multi-slot-role">
                                        <label>الدور في المشهد:</label>
                                        <div className="multi-role-options">
                                            {ROLE_OPTIONS.map(r => (
                                                <button
                                                    key={r.value}
                                                    className={`option-card ${slot.role === r.value ? 'selected' : ''}`}
                                                    onClick={() => updateSlot(idx, { role: r.value })}
                                                >
                                                    <span>{r.emoji}</span> {r.labelAr}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="multi-slot-image">
                                        {slot.imagePreview ? (
                                            <div className="multi-slot-preview">
                                                <img src={slot.imagePreview} alt={`منتج ${idx + 1}`} />
                                                {slot.uploading && (
                                                    <div className="upload-overlay">
                                                        <Loader2 size={24} className="spin" />
                                                        <span>جاري الرفع...</span>
                                                    </div>
                                                )}
                                                {!slot.uploading && slot.imageUrl && (
                                                    <button
                                                        className="change-image-btn"
                                                        onClick={() => {
                                                            updateSlot(idx, { imageUrl: '', imagePreview: '' })
                                                            fileInputRefs.current[idx]?.click()
                                                        }}
                                                    >
                                                        تغيير
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="multi-slot-upload-row">
                                                <div
                                                    className="multi-slot-dropzone"
                                                    onDrop={(e) => handleDrop(idx, e)}
                                                    onDragOver={(e) => e.preventDefault()}
                                                    onClick={() => fileInputRefs.current[idx]?.click()}
                                                >
                                                    <Upload size={20} />
                                                    <span>ارفع صورة</span>
                                                </div>
                                                <button
                                                    className="btn-secondary multi-slot-pick-btn"
                                                    onClick={() => {
                                                        setPickerSlotIdx(idx)
                                                        setPickerProductId(null)
                                                        setPickerSearch('')
                                                    }}
                                                >
                                                    <ImageIcon size={16} /> اختر من المنتجات
                                                </button>
                                            </div>
                                        )}
                                        <input
                                            ref={el => { fileInputRefs.current[idx] = el }}
                                            type="file"
                                            accept="image/*"
                                            style={{ display: 'none' }}
                                            onChange={(e) => handleFileInput(idx, e)}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {slots.length < 4 && (
                            <button className="btn-secondary multi-add-slot" onClick={addSlot}>
                                <Plus size={18} /> إضافة منتج
                            </button>
                        )}

                        {pickerSlotIdx !== null && (
                            <div className="multi-picker-overlay" onClick={() => setPickerSlotIdx(null)}>
                                <div className="multi-picker-modal" onClick={e => e.stopPropagation()}>
                                    <h3>اختر صورة من المنتجات</h3>
                                    <input
                                        className="form-input"
                                        placeholder="بحث بالاسم أو الكود..."
                                        value={pickerSearch}
                                        onChange={e => setPickerSearch(e.target.value)}
                                    />
                                    {!pickerProductId ? (
                                        <div className="multi-picker-products">
                                            {productsFetching && (
                                                <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                                                    <Loader2 size={24} className="spin" />
                                                </div>
                                            )}
                                            {!productsFetching && filteredProducts.map(p => (
                                                <div
                                                    key={p.id}
                                                    className="multi-picker-product-card"
                                                    onClick={() => setPickerProductId(p.id)}
                                                >
                                                    {p.main_image_url && <img src={p.main_image_url} alt="" />}
                                                    <div>
                                                        <strong>{p.product_name_ar}</strong>
                                                        <small>{p.sku}</small>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="multi-picker-images">
                                            <button className="btn-secondary" onClick={() => setPickerProductId(null)}>
                                                <ArrowRight size={14} /> رجوع للمنتجات
                                            </button>
                                            {pickerImagesFetching ? (
                                                <div className="multi-picker-loading">
                                                    <Loader2 size={20} className="spin" /> جاري التحميل...
                                                </div>
                                            ) : (
                                                <div className="multi-picker-image-grid">
                                                    {pickerImages.map(img => (
                                                        <img
                                                            key={img.id}
                                                            src={img.url}
                                                            alt=""
                                                            onClick={() => handleSelectProductImage(pickerSlotIdx, img.url, pickerProductId!)}
                                                        />
                                                    ))}
                                                    {pickerImages.length === 0 && (
                                                        <p className="no-images-msg">لا توجد صور لهذا المنتج</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="step-actions">
                            <button className="btn-secondary" onClick={onBack}>
                                <ArrowRight size={18} /> تغيير نوع المشهد
                            </button>
                            <button
                                className="btn-primary"
                                disabled={!canAnalyze || analyzeMutation.isPending}
                                onClick={() => analyzeMutation.mutate()}
                            >
                                {analyzeMutation.isPending ? (
                                    <><Loader2 size={18} className="spin" /> جاري التحليل...</>
                                ) : (
                                    <><Eye size={18} /> تحليل جميع المنتجات</>
                                )}
                            </button>
                        </div>

                        {roleError && (
                            <div className="error-msg">
                                <XCircle size={18} />
                                {roleError}
                            </div>
                        )}

                        {analyzeMutation.isError && (
                            <div className="error-msg">
                                <XCircle size={18} />
                                {(analyzeMutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'فشل تحليل المنتجات'}
                            </div>
                        )}
                    </div>
                )}

                {step === 'analysis' && generation && (
                    <div className="step-panel">
                        <h2><Eye size={22} /> نتائج تحليل المنتجات</h2>
                        <p>تم تحليل جميع المنتجات بنجاح — راجع النتائج وعدّلها إن لزم ثم تابع لإعدادات المشهد</p>

                        <div className="multi-analysis-grid">
                            {(generation.multi_product_data || []).map((slot: MultiProductSlot, idx: number) => {
                                const overridden = slotOverrides[idx]
                                const a = slot.analysis
                                const displayType = overridden?.product_type || a?.product_type || '—'
                                const displayColor = overridden?.color || a?.color || '—'
                                const displaySurface = overridden?.surface || a?.surface || '—'
                                const displayDesc = overridden?.description_en || a?.description_en || '—'
                                const displayPlacement = overridden?.recommended_placement || a?.recommended_placement || '—'
                                const isEditing = editingSlotIdx === idx
                                const hasOverride = !!overridden

                                return (
                                    <div key={idx} className="multi-analysis-card">
                                        <div className="multi-analysis-card-header">
                                            <span className="multi-slot-number">منتج {idx + 1}</span>
                                            <div className="analysis-card-header-actions">
                                                {hasOverride && <span className="analysis-edited-badge">معدّل</span>}
                                                <span className={`multi-role-badge role-${slot.role}`}>
                                                    {ROLE_OPTIONS.find(r => r.value === slot.role)?.emoji}{' '}
                                                    {ROLE_OPTIONS.find(r => r.value === slot.role)?.labelAr}
                                                </span>
                                            </div>
                                        </div>

                                        {isEditing ? (
                                            <div className="multi-analysis-card-body" style={{ display: 'block' }}>
                                                <div className="analysis-edit-grid">
                                                    <div className="analysis-edit-field">
                                                        <label>النوع</label>
                                                        <input
                                                            value={editDraft.product_type ?? ''}
                                                            onChange={e => setEditDraft(d => ({ ...d, product_type: e.target.value }))}
                                                            placeholder={a?.product_type || ''}
                                                        />
                                                    </div>
                                                    <div className="analysis-edit-field">
                                                        <label>اللون</label>
                                                        <input
                                                            value={editDraft.color ?? ''}
                                                            onChange={e => setEditDraft(d => ({ ...d, color: e.target.value }))}
                                                            placeholder={a?.color || ''}
                                                        />
                                                    </div>
                                                    <div className="analysis-edit-field">
                                                        <label>السطح</label>
                                                        <input
                                                            value={editDraft.surface ?? ''}
                                                            onChange={e => setEditDraft(d => ({ ...d, surface: e.target.value }))}
                                                            placeholder={a?.surface || ''}
                                                        />
                                                    </div>
                                                    <div className="analysis-edit-field">
                                                        <label>التوضع المقترح</label>
                                                        <select
                                                            value={editDraft.recommended_placement ?? ''}
                                                            onChange={e => setEditDraft(d => ({ ...d, recommended_placement: e.target.value }))}
                                                        >
                                                            <option value="">— الأصلي: {a?.recommended_placement || 'غير محدد'} —</option>
                                                            <option value="floor">أرضية</option>
                                                            <option value="wall">جدار</option>
                                                            <option value="bathroom">حمام</option>
                                                            <option value="kitchen">مطبخ</option>
                                                            <option value="bedroom">غرفة نوم</option>
                                                            <option value="living_room">غرفة معيشة</option>
                                                            <option value="outdoor">خارجي</option>
                                                            <option value="entrance">مدخل</option>
                                                        </select>
                                                    </div>
                                                    <div className="analysis-edit-field full-width">
                                                        <label>الوصف الإنجليزي (يُستخدم في التوليد)</label>
                                                        <textarea
                                                            value={editDraft.description_en ?? ''}
                                                            onChange={e => setEditDraft(d => ({ ...d, description_en: e.target.value }))}
                                                            placeholder={a?.description_en || ''}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="analysis-edit-actions">
                                                    <button className="cancel-btn" onClick={() => setEditingSlotIdx(null)}>
                                                        <X size={14} /> إلغاء
                                                    </button>
                                                    <button className="save-btn" onClick={() => {
                                                        const cleaned: AnalysisOverride = {}
                                                        if (editDraft.product_type) cleaned.product_type = editDraft.product_type
                                                        if (editDraft.color) cleaned.color = editDraft.color
                                                        if (editDraft.surface) cleaned.surface = editDraft.surface
                                                        if (editDraft.description_en) cleaned.description_en = editDraft.description_en
                                                        if (editDraft.recommended_placement) cleaned.recommended_placement = editDraft.recommended_placement
                                                        if (Object.keys(cleaned).length > 0) {
                                                            setSlotOverrides(prev => ({ ...prev, [idx]: { ...(prev[idx] || {}), ...cleaned } }))
                                                        }
                                                        setEditingSlotIdx(null)
                                                    }}>
                                                        <Save size={14} /> حفظ التعديل
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="multi-analysis-card-body">
                                                <img src={slot.image_url} alt={`منتج ${idx + 1}`} />
                                                <div className="multi-analysis-info">
                                                    <div className="analysis-field">
                                                        <span className="analysis-label">النوع</span>
                                                        <span className="analysis-value">{displayType}</span>
                                                    </div>
                                                    <div className="analysis-field">
                                                        <span className="analysis-label">اللون</span>
                                                        <span className="analysis-value">{displayColor}</span>
                                                    </div>
                                                    <div className="analysis-field">
                                                        <span className="analysis-label">السطح</span>
                                                        <span className="analysis-value">{displaySurface}</span>
                                                    </div>
                                                    <div className="analysis-field">
                                                        <span className="analysis-label">التوضع</span>
                                                        <span className="analysis-value">{displayPlacement}</span>
                                                    </div>
                                                    <div className="analysis-field full-width">
                                                        <span className="analysis-label">الوصف (EN)</span>
                                                        <span className="analysis-value ltr">{displayDesc}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {!isEditing && (
                                            <div style={{ padding: '0 0.75rem 0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
                                                <button className="analysis-edit-btn" onClick={() => {
                                                    setEditingSlotIdx(idx)
                                                    setEditDraft({
                                                        product_type: overridden?.product_type || '',
                                                        color: overridden?.color || '',
                                                        surface: overridden?.surface || '',
                                                        description_en: overridden?.description_en || '',
                                                        recommended_placement: overridden?.recommended_placement || '',
                                                    })
                                                }}>
                                                    <Edit2 size={14} /> تعديل التحليل
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>

                        <div className="step-actions">
                            <button className="btn-secondary" onClick={() => setStep('slots')}>
                                <ArrowRight size={18} /> رجوع
                            </button>
                            <button className="btn-primary" onClick={() => setStep('settings')}>
                                <ArrowLeft size={18} /> إعدادات المشهد
                            </button>
                        </div>
                    </div>
                )}

                {step === 'settings' && (
                    <div className="step-panel">
                        <h2><Settings2 size={22} /> إعدادات المشهد المشترك</h2>
                        <p>اختر نوع الغرفة والتصميم والإضاءة للمشهد الذي يجمع جميع المنتجات</p>

                        <div className="settings-grid">
                            <div className="setting-group">
                                <label>
                                    نوع المساحة
                                    {suggestedSpaceType && spaceType.value === suggestedSpaceType && (
                                        <span className="suggested-badge">مقترح من التحليل</span>
                                    )}
                                </label>
                                <div className="option-cards">
                                    {SPACE_TYPES.map(s => (
                                        <button
                                            key={s.value}
                                            className={`option-card ${spaceType.value === s.value ? 'selected' : ''}`}
                                            onClick={() => setSpaceType(s)}
                                        >{s.label}</button>
                                    ))}
                                </div>
                            </div>

                            <div className="setting-group">
                                <label>نمط التصميم</label>
                                <div className="option-cards">
                                    {DESIGN_STYLES.map(s => (
                                        <button
                                            key={s.value}
                                            className={`option-card ${designStyle.value === s.value ? 'selected' : ''}`}
                                            onClick={() => setDesignStyle(s)}
                                        >{s.label}</button>
                                    ))}
                                </div>
                            </div>

                            <div className="setting-group">
                                <label>الإضاءة</label>
                                <div className="option-cards">
                                    {LIGHTING_OPTIONS.map(s => (
                                        <button
                                            key={s.value}
                                            className={`option-card ${lighting.value === s.value ? 'selected' : ''}`}
                                            onClick={() => setLighting(s)}
                                        >{s.label}</button>
                                    ))}
                                </div>
                            </div>

                            <div className="setting-group">
                                <label>زاوية الكاميرا</label>
                                <div className="option-cards">
                                    {CAMERA_ANGLES.map(s => (
                                        <button
                                            key={s.value}
                                            className={`option-card ${cameraAngle.value === s.value ? 'selected' : ''}`}
                                            onClick={() => setCameraAngle(s)}
                                        >{s.label}</button>
                                    ))}
                                </div>
                            </div>

                            <div className="setting-group">
                                <label>الأجواء</label>
                                <div className="option-cards">
                                    {MOOD_OPTIONS.map(s => (
                                        <button
                                            key={s.value}
                                            className={`option-card ${mood.value === s.value ? 'selected' : ''}`}
                                            onClick={() => setMood(s)}
                                        >{s.label}</button>
                                    ))}
                                </div>
                            </div>

                            <div className="setting-group">
                                <label>نسبة العرض</label>
                                <div className="option-cards">
                                    {ASPECT_RATIOS.map(a => (
                                        <button
                                            key={a.value}
                                            className={`option-card ${aspectRatio === a.value ? 'selected' : ''}`}
                                            onClick={() => setAspectRatio(a.value)}
                                        >{a.label}</button>
                                    ))}
                                </div>
                            </div>

                            <div className="setting-group">
                                <label>جودة التوليد</label>
                                <div className="option-cards">
                                    {[
                                        { value: 'preview', label: 'معاينة (سريع)' },
                                        { value: 'standard', label: 'عادية (2K)' },
                                        { value: 'high', label: 'عالية (4K)' },
                                    ].map(q => (
                                        <button
                                            key={q.value}
                                            className={`option-card ${quality === q.value ? 'selected' : ''}`}
                                            onClick={() => setQuality(q.value)}
                                        >{q.label}</button>
                                    ))}
                                </div>
                            </div>

                            <div className="setting-group">
                                <label>ملاحظات إضافية (اختياري)</label>
                                <input
                                    className="form-input"
                                    value={customPrompt}
                                    onChange={e => setCustomPrompt(e.target.value)}
                                    placeholder="أي تعليمات إضافية للمشهد..."
                                />
                            </div>
                        </div>

                        <div className="step-actions">
                            <button className="btn-secondary" onClick={() => setStep('analysis')}>
                                <ArrowRight size={18} /> رجوع
                            </button>
                            <button
                                className="btn-primary"
                                onClick={() => setStep('confirm')}
                            >
                                <ArrowLeft size={18} /> مراجعة وتأكيد
                            </button>
                        </div>
                    </div>
                )}

                {step === 'confirm' && (
                    <div className="step-panel">
                        <h2><CheckCircle2 size={22} /> مراجعة وتأكيد قبل التوليد</h2>
                        <p>تأكد من جميع الخيارات قبل بدء توليد المشهد</p>

                        <div className="confirm-section">
                            <h3>المنتجات المختارة ({slots.length})</h3>
                            <div className="confirm-products">
                                {slots.map((slot, idx) => {
                                    const roleOpt = ROLE_OPTIONS.find(r => r.value === slot.role)
                                    const product = products.find(p => p.id === slot.productId)
                                    return (
                                        <div key={idx} className="confirm-product-card">
                                            {slot.imagePreview && (
                                                <img src={slot.imagePreview} alt={`منتج ${idx + 1}`} className="confirm-product-img" />
                                            )}
                                            <div className="confirm-product-info">
                                                <span className={`multi-role-badge role-${slot.role}`}>
                                                    {roleOpt?.emoji} {roleOpt?.labelAr}
                                                </span>
                                                {product && <span className="confirm-product-name">{product.product_name_ar}</span>}
                                                {product && <span className="confirm-product-sku">{product.sku}</span>}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="confirm-section">
                            <h3>إعدادات المشهد</h3>
                            <div className="confirm-settings-grid">
                                <div className="confirm-setting"><span>نوع المساحة:</span> <strong>{spaceType.label}</strong></div>
                                <div className="confirm-setting"><span>نمط التصميم:</span> <strong>{designStyle.label}</strong></div>
                                <div className="confirm-setting"><span>الإضاءة:</span> <strong>{lighting.label}</strong></div>
                                <div className="confirm-setting"><span>زاوية الكاميرا:</span> <strong>{cameraAngle.label}</strong></div>
                                <div className="confirm-setting"><span>الأجواء:</span> <strong>{mood.label}</strong></div>
                                <div className="confirm-setting"><span>نسبة العرض:</span> <strong>{aspectRatio}</strong></div>
                                <div className="confirm-setting"><span>الجودة:</span> <strong>{quality === 'standard' ? 'عادية' : 'عالية'}</strong></div>
                                {customPrompt && <div className="confirm-setting"><span>ملاحظات:</span> <strong>{customPrompt}</strong></div>}
                            </div>
                        </div>

                        <div className="step-actions">
                            <button className="btn-secondary" onClick={() => setStep('settings')}>
                                <ArrowRight size={18} /> تعديل الإعدادات
                            </button>
                            <button
                                className="btn-primary"
                                disabled={generateMutation.isPending}
                                onClick={handleGenerate}
                            >
                                {generateMutation.isPending ? (
                                    <><Loader2 size={18} className="spin" /> جاري الإرسال...</>
                                ) : (
                                    <><Wand2 size={18} /> توليد المشهد الآن</>
                                )}
                            </button>
                        </div>

                        {generateMutation.isError && (
                            <div className="error-msg">
                                <XCircle size={18} />
                                {(generateMutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'فشل إنشاء المهمة'}
                            </div>
                        )}
                    </div>
                )}

                {step === 'generating' && (
                    <div className="step-panel generating-panel">
                        <div className="generating-animation">
                            <div className="generating-spinner">
                                <Sparkles size={36} />
                            </div>
                            <h2>جاري توليد المشهد المتعدد...</h2>
                            <p>يقوم الذكاء الاصطناعي بدمج {generation?.multi_product_data?.length || 0} منتجات في مشهد واحد</p>
                            <div className="generating-progress">
                                <div className="progress-bar"><div className="progress-fill" /></div>
                            </div>
                            {generation?.kie_task_id && (
                                <span className="task-id">Task: {generation.kie_task_id}</span>
                            )}
                        </div>
                    </div>
                )}

                {step === 'result' && generation && (
                    <div className="step-panel">
                        {generation.status === 'completed' && generation.result_image_url ? (
                            <div className="result-layout">
                                <h2 className="text-success"><CheckCircle2 size={22} /> تم توليد المشهد بنجاح!</h2>

                                <div className="multi-result-sources">
                                    <h4>المنتجات المستخدمة:</h4>
                                    <div className="multi-result-source-row">
                                        {(generation.multi_product_data || []).map((slot: MultiProductSlot, idx: number) => (
                                            <div key={idx} className="multi-result-source-thumb">
                                                <img src={slot.image_url} alt={`منتج ${idx + 1}`} />
                                                <span className={`multi-role-badge-sm role-${slot.role}`}>
                                                    {ROLE_OPTIONS.find(r => r.value === slot.role)?.labelAr}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="result-card result-generated" style={{ marginTop: '1rem' }}>
                                    <h3>المشهد الناتج</h3>
                                    <img src={generation.result_image_url} alt="المشهد المولد" />
                                </div>

                                <div className="attach-section" style={{ marginTop: '1.5rem' }}>
                                    <h3><ImageIcon size={18} /> إضافة الصورة للمنتجات</h3>
                                    <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                                        اختر المنتجات التي تريد ربط صورة المشهد بها كصورة ديكورية
                                    </p>
                                    <div className="attach-product-list">
                                        {(generation.multi_product_data || []).map((slot: MultiProductSlot, idx: number) => {
                                            const product = slot.product_id ? products.find(p => p.id === slot.product_id) : null
                                            if (!product) return null
                                            const isChecked = attachProductIds.includes(product.id)
                                            return (
                                                <label key={idx} className={`attach-product-item ${isChecked ? 'checked' : ''}`}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        disabled={attachStatus === 'loading' || attachStatus === 'success'}
                                                        onChange={() => {
                                                            setAttachProductIds(prev =>
                                                                isChecked ? prev.filter(id => id !== product.id) : [...prev, product.id]
                                                            )
                                                        }}
                                                    />
                                                    {slot.image_url && <img src={slot.image_url} alt="" className="attach-product-thumb" />}
                                                    <div className="attach-product-details">
                                                        <span className="attach-product-name">{product.product_name_ar}</span>
                                                        <span className={`multi-role-badge-sm role-${slot.role}`}>
                                                            {ROLE_OPTIONS.find(r => r.value === slot.role)?.labelAr}
                                                        </span>
                                                    </div>
                                                </label>
                                            )
                                        })}
                                    </div>

                                    {attachStatus !== 'success' && (
                                        <button
                                            className="btn-primary"
                                            disabled={attachProductIds.length === 0 || attachStatus === 'loading'}
                                            onClick={handleAttachToProducts}
                                            style={{ marginTop: '0.75rem' }}
                                        >
                                            {attachStatus === 'loading' ? (
                                                <><Loader2 size={18} className="spin" /> جاري الإضافة...</>
                                            ) : (
                                                <><ImageIcon size={18} /> إضافة للمنتجات المحددة ({attachProductIds.length})</>
                                            )}
                                        </button>
                                    )}

                                    {attachMessage && (
                                        <div className={`attach-msg ${attachStatus === 'success' ? 'success' : 'error'}`}>
                                            {attachStatus === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                                            {attachMessage}
                                        </div>
                                    )}
                                </div>

                                <div className="result-actions" style={{ marginTop: '1rem' }}>
                                    <a
                                        href={generation.result_image_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn-primary"
                                    >
                                        <Download size={18} /> تحميل الصورة
                                    </a>
                                    <button className="btn-secondary" onClick={handleStartOver}>
                                        <RefreshCw size={18} /> مشهد جديد
                                    </button>
                                    <button className="btn-secondary" onClick={onBack}>
                                        <ArrowRight size={18} /> تغيير نوع المشهد
                                    </button>
                                </div>

                                {generation.prompt_used && (
                                    <div className="prompt-display">
                                        <h4>البرومبت المستخدم:</h4>
                                        <pre>{generation.prompt_used}</pre>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="error-result">
                                <h2 className="text-error"><XCircle size={22} /> فشل التوليد</h2>
                                <p>{generation.error_message || 'حدث خطأ غير متوقع'}</p>
                                <div className="result-actions">
                                    <button className="btn-primary" onClick={() => {
                                        setStep('settings')
                                    }}>
                                        <RefreshCw size={18} /> إعادة المحاولة
                                    </button>
                                    <button className="btn-secondary" onClick={handleStartOver}>
                                        مشهد جديد
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
