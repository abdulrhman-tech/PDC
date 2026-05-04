import { useState, useEffect, useCallback, useRef } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { decorativeAPI, productsAPI } from '@/api/client'
import type { DecorativeGeneration, MultiProductSlot, Product, ProductImage } from '@/types'
import {
    Layers, Trash2, Upload, Loader2, Eye, Settings2,
    CheckCircle2, Sparkles, ArrowLeft, ArrowRight, Download,
    RefreshCw, XCircle, Image as ImageIcon, Wand2, AlertTriangle,
    LayoutGrid, Columns, Rows, Square,
} from 'lucide-react'

type DualStep = 'slots' | 'analysis' | 'pattern' | 'settings' | 'confirm' | 'generating' | 'result'
type DualSurface = 'floor' | 'wall'
type DualPattern = 'checkerboard' | 'half_split' | 'stripes' | 'border_center'

const SURFACE_OPTIONS: { value: DualSurface; label: string; emoji: string }[] = [
    { value: 'floor', label: 'أرضية', emoji: '🟫' },
    { value: 'wall', label: 'جدار', emoji: '🧱' },
]

const PATTERN_OPTIONS: {
    value: DualPattern
    label: string
    desc: string
    icon: typeof LayoutGrid
}[] = [
    {
        value: 'checkerboard',
        label: 'شطرنج',
        desc: 'مربعات متبادلة بين الخامتين على كامل السطح',
        icon: LayoutGrid,
    },
    {
        value: 'half_split',
        label: 'نصف ونصف',
        desc: 'تقسيم السطح إلى نصفين متساويين بخامتين مختلفتين',
        icon: Columns,
    },
    {
        value: 'stripes',
        label: 'خطوط متعاقبة',
        desc: 'أشرطة متوازية متبادلة بين الخامتين',
        icon: Rows,
    },
    {
        value: 'border_center',
        label: 'إطار ووسط',
        desc: 'الخامة الأولى كإطار محيطي والثانية في الوسط',
        icon: Square,
    },
]

const SPACE_TYPES = [
    { value: 'living_room', label: 'غرفة معيشة', prompt: 'modern living room' },
    { value: 'bedroom', label: 'غرفة نوم', prompt: 'elegant bedroom' },
    { value: 'bathroom', label: 'حمام', prompt: 'modern bathroom' },
    { value: 'kitchen', label: 'مطبخ', prompt: 'contemporary kitchen' },
    { value: 'office', label: 'مكتب', prompt: 'home office' },
    { value: 'lobby', label: 'لوبي / استقبال', prompt: 'grand entrance lobby' },
    { value: 'restaurant', label: 'مطعم', prompt: 'upscale restaurant interior' },
    { value: 'sports_court', label: 'ملعب / صالة رياضية', prompt: 'indoor sports court / club court' },
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

interface DualSlotState {
    imageUrl: string
    imagePreview: string
    uploading: boolean
    productId?: number
    materialSubtypeHint: string
    generationModeHint: string
}

const emptySlot = (): DualSlotState => ({
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

// SVG previews for the four mixing patterns
function PatternPreview({ pattern }: { pattern: DualPattern }) {
    const A = '#ec4899'
    const B = '#8b5cf6'
    if (pattern === 'checkerboard') {
        return (
            <svg viewBox="0 0 80 80" width="100%" height="100%">
                {[0, 1, 2, 3].map(r =>
                    [0, 1, 2, 3].map(c => (
                        <rect
                            key={`${r}-${c}`}
                            x={c * 20}
                            y={r * 20}
                            width={20}
                            height={20}
                            fill={(r + c) % 2 === 0 ? A : B}
                        />
                    ))
                )}
            </svg>
        )
    }
    if (pattern === 'half_split') {
        return (
            <svg viewBox="0 0 80 80" width="100%" height="100%">
                <rect x={0} y={0} width={40} height={80} fill={A} />
                <rect x={40} y={0} width={40} height={80} fill={B} />
            </svg>
        )
    }
    if (pattern === 'stripes') {
        return (
            <svg viewBox="0 0 80 80" width="100%" height="100%">
                {[0, 1, 2, 3, 4].map(i => (
                    <rect
                        key={i}
                        x={0}
                        y={i * 16}
                        width={80}
                        height={16}
                        fill={i % 2 === 0 ? A : B}
                    />
                ))}
            </svg>
        )
    }
    // border_center
    return (
        <svg viewBox="0 0 80 80" width="100%" height="100%">
            <rect x={0} y={0} width={80} height={80} fill={A} />
            <rect x={16} y={16} width={48} height={48} fill={B} />
        </svg>
    )
}

export default function DualSameCategoryGenerator({ onBack }: Props) {
    const [step, setStep] = useState<DualStep>('slots')
    const [surface, setSurface] = useState<DualSurface>('floor')
    const [slots, setSlots] = useState<DualSlotState[]>([emptySlot(), emptySlot()])
    const [pattern, setPattern] = useState<DualPattern>('checkerboard')
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

    const updateSlot = (idx: number, patch: Partial<DualSlotState>) => {
        setSlots(prev => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
    }

    const handleFileUpload = async (idx: number, file: File) => {
        const preview = URL.createObjectURL(file)
        updateSlot(idx, { imagePreview: preview, uploading: true, imageUrl: '', productId: undefined })
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
        if (file && file.type.startsWith('image/')) handleFileUpload(idx, file)
    }

    const handleDrop = (idx: number, e: React.DragEvent) => {
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (file && file.type.startsWith('image/')) handleFileUpload(idx, file)
    }

    const handleSelectProductImage = (idx: number, imageUrl: string, productId: number) => {
        updateSlot(idx, { imageUrl, imagePreview: imageUrl, productId })
        setPickerSlotIdx(null)
        setPickerProductId(null)
        setPickerSearch('')
    }

    const allSlotsReady = slots.length === 2 && slots.every(s => s.imageUrl && !s.uploading)

    // Soft category warning — compare picked products' categories (uploads bypass)
    const productA = slots[0]?.productId ? products.find(p => p.id === slots[0].productId) : null
    const productB = slots[1]?.productId ? products.find(p => p.id === slots[1].productId) : null
    const categoriesDiffer =
        !!productA && !!productB && productA.category !== productB.category
    const categoryAName = productA?.category_name || ''
    const categoryBName = productB?.category_name || ''

    const analyzeMutation = useMutation({
        mutationFn: () => {
            const apiSlots = slots.map(s => ({
                image_url: s.imageUrl,
                product_id: s.productId,
                material_subtype_hint: s.materialSubtypeHint || undefined,
                generation_mode_hint: s.generationModeHint || undefined,
            }))
            return decorativeAPI.analyzeDual({ surface, slots: apiSlots })
        },
        onSuccess: (resp) => {
            setGeneration(resp.data)
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
        mutationFn: (data: object) => decorativeAPI.generateDual(data),
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
        generateMutation.mutate({
            generation_id: generation.id,
            pattern,
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
        setSlots([emptySlot(), emptySlot()])
        setPattern('checkerboard')
        setSurface('floor')
        setPollCount(0)
        setCustomPrompt('')
        setPickerSlotIdx(null)
        setAttachProductIds([])
        setAttachStatus('idle')
        setAttachMessage('')
        setSuggestedSpaceType('')
    }

    const filteredProducts = products

    const stepIndex = ['slots', 'analysis', 'pattern', 'settings', 'confirm', 'generating', 'result'].indexOf(step)
    const surfaceLabel = SURFACE_OPTIONS.find(s => s.value === surface)?.label || 'أرضية'

    return (
        <div className="decorative-page">
            <div className="decorative-header">
                <div className="decorative-title">
                    <LayoutGrid size={28} />
                    <h1>دمج خامتين من نفس الفئة</h1>
                </div>
                <p className="decorative-subtitle">
                    ادمج منتجين من نفس الفئة (مثلاً نوعين من البلاط أو الباركيه أو الأرضيات المطاطية) في سطح واحد بنمط مختار
                </p>
            </div>

            <div className="wizard-steps">
                {[
                    { key: 'slots', label: 'المنتجات', icon: Layers },
                    { key: 'analysis', label: 'التحليل', icon: Eye },
                    { key: 'pattern', label: 'النمط', icon: LayoutGrid },
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
                        <h2><Layers size={22} /> اختر المنتجين والسطح</h2>
                        <p>الخامتان ستظهران معاً على سطح واحد ({surfaceLabel}) — يُفضَّل أن يكونا من نفس الفئة</p>

                        <div className="setting-group" style={{ marginBottom: '1rem' }}>
                            <label>السطح المراد دمج الخامتين عليه</label>
                            <div className="dual-surface-toggle">
                                {SURFACE_OPTIONS.map(opt => (
                                    <button
                                        key={opt.value}
                                        className={`option-card ${surface === opt.value ? 'selected' : ''}`}
                                        onClick={() => setSurface(opt.value)}
                                    >
                                        <span>{opt.emoji}</span> {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="dual-slots-row">
                            {slots.map((slot, idx) => (
                                <div key={idx} className="dual-slot-card">
                                    <div className="dual-slot-letter">
                                        الخامة {idx === 0 ? 'A' : 'B'}
                                    </div>

                                    <div className="multi-slot-image">
                                        {slot.imagePreview ? (
                                            <div className="multi-slot-preview">
                                                <img src={slot.imagePreview} alt={`خامة ${idx + 1}`} />
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
                                                            updateSlot(idx, {
                                                                imageUrl: '',
                                                                imagePreview: '',
                                                                productId: undefined,
                                                            })
                                                        }}
                                                    >
                                                        <Trash2 size={14} /> إزالة
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

                                    {(() => {
                                        const product = slot.productId ? products.find(p => p.id === slot.productId) : null
                                        if (!product) return null
                                        return (
                                            <div className="confirm-product-info">
                                                <span className="confirm-product-name">{product.product_name_ar}</span>
                                                <span className="confirm-product-sku">
                                                    {product.category_name || '—'}
                                                </span>
                                            </div>
                                        )
                                    })()}
                                </div>
                            ))}
                        </div>

                        {categoriesDiffer && (
                            <div className="category-warning">
                                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                                <div>
                                    <strong>تنبيه:</strong> الخامتان من فئتين مختلفتين
                                    (<strong>{categoryAName}</strong> و <strong>{categoryBName}</strong>).
                                    هذا الوضع مصمَّم للخامتين من نفس الفئة — يمكنك المتابعة لكن النتيجة قد لا تكون مثالية.
                                </div>
                            </div>
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
                                                        <small>{p.category_name || p.sku}</small>
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
                                disabled={!allSlotsReady || analyzeMutation.isPending}
                                onClick={() => analyzeMutation.mutate()}
                            >
                                {analyzeMutation.isPending ? (
                                    <><Loader2 size={18} className="spin" /> جاري التحليل...</>
                                ) : (
                                    <><Eye size={18} /> تحليل الخامتين</>
                                )}
                            </button>
                        </div>

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
                        <h2><Eye size={22} /> نتائج تحليل الخامتين</h2>
                        <p>تم تحليل الخامتين — راجع النتائج ثم تابع لاختيار نمط الدمج</p>

                        <div className="multi-analysis-grid">
                            {(generation.multi_product_data || []).map((slot: MultiProductSlot, idx: number) => {
                                const a = slot.analysis
                                return (
                                    <div key={idx} className="multi-analysis-card">
                                        <div className="multi-analysis-card-header">
                                            <span className="dual-slot-letter">
                                                الخامة {idx === 0 ? 'A' : 'B'}
                                            </span>
                                        </div>
                                        <div className="multi-analysis-card-body">
                                            <img src={slot.image_url} alt={`خامة ${idx + 1}`} />
                                            <div className="multi-analysis-info">
                                                <div className="analysis-field">
                                                    <span className="analysis-label">النوع</span>
                                                    <span className="analysis-value">{a?.product_type || '—'}</span>
                                                </div>
                                                <div className="analysis-field">
                                                    <span className="analysis-label">اللون</span>
                                                    <span className="analysis-value">{a?.color || '—'}</span>
                                                </div>
                                                <div className="analysis-field">
                                                    <span className="analysis-label">السطح</span>
                                                    <span className="analysis-value">{a?.surface || '—'}</span>
                                                </div>
                                                <div className="analysis-field full-width">
                                                    <span className="analysis-label">الوصف (EN)</span>
                                                    <span className="analysis-value ltr">{a?.description_en || '—'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="step-actions">
                            <button className="btn-secondary" onClick={() => setStep('slots')}>
                                <ArrowRight size={18} /> رجوع
                            </button>
                            <button className="btn-primary" onClick={() => setStep('pattern')}>
                                <ArrowLeft size={18} /> اختيار نمط الدمج
                            </button>
                        </div>
                    </div>
                )}

                {step === 'pattern' && (
                    <div className="step-panel">
                        <h2><LayoutGrid size={22} /> اختر نمط دمج الخامتين</h2>
                        <p>كيف تريد توزيع الخامتين على {surfaceLabel} الواحدة؟</p>

                        <div className="pattern-picker-grid">
                            {PATTERN_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    className={`pattern-card ${pattern === opt.value ? 'selected' : ''}`}
                                    onClick={() => setPattern(opt.value)}
                                >
                                    <div className="pattern-card-preview">
                                        <PatternPreview pattern={opt.value} />
                                    </div>
                                    <div className="pattern-card-label">{opt.label}</div>
                                    <div className="pattern-card-desc">{opt.desc}</div>
                                </button>
                            ))}
                        </div>

                        <div className="step-actions">
                            <button className="btn-secondary" onClick={() => setStep('analysis')}>
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
                        <h2><Settings2 size={22} /> إعدادات المشهد</h2>
                        <p>اختر نوع المساحة والتصميم والإضاءة</p>

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
                            <button className="btn-secondary" onClick={() => setStep('pattern')}>
                                <ArrowRight size={18} /> رجوع
                            </button>
                            <button className="btn-primary" onClick={() => setStep('confirm')}>
                                <ArrowLeft size={18} /> مراجعة وتأكيد
                            </button>
                        </div>
                    </div>
                )}

                {step === 'confirm' && (
                    <div className="step-panel">
                        <h2><CheckCircle2 size={22} /> مراجعة وتأكيد قبل التوليد</h2>
                        <p>تأكد من الخيارات قبل بدء التوليد</p>

                        <div className="confirm-section">
                            <h3>الخامتان</h3>
                            <div className="confirm-products">
                                {slots.map((slot, idx) => {
                                    const product = slot.productId ? products.find(p => p.id === slot.productId) : null
                                    return (
                                        <div key={idx} className="confirm-product-card">
                                            {slot.imagePreview && (
                                                <img src={slot.imagePreview} alt={`خامة ${idx + 1}`} className="confirm-product-img" />
                                            )}
                                            <div className="confirm-product-info">
                                                <span className="dual-slot-letter">
                                                    الخامة {idx === 0 ? 'A' : 'B'}
                                                </span>
                                                {product && <span className="confirm-product-name">{product.product_name_ar}</span>}
                                                {product?.category_name && <span className="confirm-product-sku">{product.category_name}</span>}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="confirm-section">
                            <h3>إعدادات الدمج</h3>
                            <div className="confirm-settings-grid">
                                <div className="confirm-setting"><span>السطح:</span> <strong>{surfaceLabel}</strong></div>
                                <div className="confirm-setting"><span>نمط الدمج:</span> <strong>{PATTERN_OPTIONS.find(p => p.value === pattern)?.label}</strong></div>
                                <div className="confirm-setting"><span>نوع المساحة:</span> <strong>{spaceType.label}</strong></div>
                                <div className="confirm-setting"><span>نمط التصميم:</span> <strong>{designStyle.label}</strong></div>
                                <div className="confirm-setting"><span>الإضاءة:</span> <strong>{lighting.label}</strong></div>
                                <div className="confirm-setting"><span>زاوية الكاميرا:</span> <strong>{cameraAngle.label}</strong></div>
                                <div className="confirm-setting"><span>الأجواء:</span> <strong>{mood.label}</strong></div>
                                <div className="confirm-setting"><span>نسبة العرض:</span> <strong>{aspectRatio}</strong></div>
                                <div className="confirm-setting"><span>الجودة:</span> <strong>{quality === 'standard' ? 'عادية' : quality === 'high' ? 'عالية' : 'معاينة'}</strong></div>
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
                            <h2>جاري دمج الخامتين على {surfaceLabel} واحدة...</h2>
                            <p>نمط الدمج: {PATTERN_OPTIONS.find(p => p.value === pattern)?.label}</p>
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
                                    <h4>الخامتان المستخدمتان:</h4>
                                    <div className="multi-result-source-row">
                                        {(generation.multi_product_data || []).map((slot: MultiProductSlot, idx: number) => (
                                            <div key={idx} className="multi-result-source-thumb">
                                                <img src={slot.image_url} alt={`خامة ${idx + 1}`} />
                                                <span className="dual-slot-letter">
                                                    {idx === 0 ? 'A' : 'B'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="result-card result-generated" style={{ marginTop: '1rem' }}>
                                    <h3>المشهد الناتج ({surfaceLabel} مدمجة بنمط {PATTERN_OPTIONS.find(p => p.value === pattern)?.label})</h3>
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
                                                        <span className="dual-slot-letter">
                                                            {idx === 0 ? 'A' : 'B'}
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
                                    <button className="btn-primary" onClick={() => setStep('settings')}>
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
