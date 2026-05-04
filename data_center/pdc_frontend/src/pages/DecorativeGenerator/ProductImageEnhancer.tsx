import { useState, useEffect, useCallback, useRef } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { decorativeAPI, productsAPI } from '@/api/client'
import type { DecorativeGeneration, Product, ProductImage } from '@/types'
import {
    ImagePlus, Eye, Settings2, Loader2, CheckCircle2, XCircle,
    ArrowRight, ArrowLeft, Download, RefreshCw, Upload, Package,
    Camera, Image as ImageIcon, Sparkles,
} from 'lucide-react'

type EnhanceStep = 'source' | 'analysis' | 'settings' | 'generating' | 'result'

const BACKGROUNDS: Array<{ value: string; labelAr: string; descAr: string }> = [
    { value: 'pure_white', labelAr: 'أبيض نقي', descAr: 'خلفية بيضاء استوديو نظيفة' },
    { value: 'soft_white', labelAr: 'أبيض ناعم', descAr: 'تدرج خفيف نحو الرمادي الفاتح' },
    { value: 'light_gray', labelAr: 'رمادي فاتح', descAr: 'خلفية محايدة أنيقة' },
    { value: 'cream', labelAr: 'كريمي / عاجي', descAr: 'خلفية دافئة فاخرة' },
]

const LIGHTING: Array<{ value: string; labelAr: string; descAr: string }> = [
    { value: 'studio', labelAr: 'استوديو احترافي', descAr: 'إضاءة متوازنة من جميع الجهات' },
    { value: 'soft', labelAr: 'ناعمة', descAr: 'إضاءة منتشرة بظلال خفيفة' },
    { value: 'dramatic', labelAr: 'درامية', descAr: 'إضاءة جانبية بتباين أعلى' },
    { value: 'top_down', labelAr: 'علوية', descAr: 'إضاءة من الأعلى مع ظل سفلي خفيف' },
]

const FRAMING: Array<{ value: string; labelAr: string; descAr: string }> = [
    { value: 'tight', labelAr: 'مقرّب', descAr: 'المنتج يملأ الصورة' },
    { value: 'normal', labelAr: 'متوازن', descAr: 'هوامش معتدلة حول المنتج' },
    { value: 'loose', labelAr: 'فسيح', descAr: 'هوامش بيضاء واسعة' },
]

const SHADOWS: Array<{ value: string; labelAr: string; descAr: string }> = [
    { value: 'natural', labelAr: 'طبيعي', descAr: 'ظل واقعي خفيف تحت المنتج' },
    { value: 'subtle', labelAr: 'خفيف جداً', descAr: 'ظل بالكاد ملحوظ' },
    { value: 'none', labelAr: 'بدون ظل', descAr: 'المنتج عائم على الخلفية' },
]

const ASPECT_RATIOS = [
    { value: '1:1', labelAr: 'مربع 1:1' },
    { value: '4:3', labelAr: 'أفقي 4:3' },
    { value: '3:4', labelAr: 'عمودي 3:4' },
    { value: '16:9', labelAr: 'عريض 16:9' },
]

const QUALITIES = [
    { value: 'preview', labelAr: 'معاينة', descAr: 'سريع، جودة أقل' },
    { value: 'standard', labelAr: 'قياسي', descAr: 'متوازن (موصى به)' },
    { value: 'high', labelAr: 'عالي', descAr: 'أعلى جودة، أبطأ' },
]

const MAX_POLLS = 60

interface Props {
    onBackToChoose: () => void
}

export default function ProductImageEnhancer({ onBackToChoose }: Props) {
    const [step, setStep] = useState<EnhanceStep>('source')
    const [sourceMode, setSourceMode] = useState<'choose' | 'upload' | 'product'>('choose')
    const [isDragging, setIsDragging] = useState(false)
    const [imageUrl, setImageUrl] = useState('')
    const [imagePreview, setImagePreview] = useState('')
    const [selectedProductId, setSelectedProductId] = useState<number | undefined>()
    const [showProductPicker, setShowProductPicker] = useState(false)
    const [pickerProductId, setPickerProductId] = useState<number | null>(null)
    const [pickerSearch, setPickerSearch] = useState('')

    const [generation, setGeneration] = useState<DecorativeGeneration | null>(null)
    const [editDescEn, setEditDescEn] = useState('')

    const [background, setBackground] = useState('pure_white')
    const [lighting, setLighting] = useState('studio')
    const [framing, setFraming] = useState('normal')
    const [shadow, setShadow] = useState('natural')
    const [aspectRatio, setAspectRatio] = useState('1:1')
    const [renderQuality, setRenderQuality] = useState('standard')
    const [customNotes, setCustomNotes] = useState('')

    const [pollCount, setPollCount] = useState(0)
    const [attachStatus, setAttachStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
    const [attachMessage, setAttachMessage] = useState('')

    const fileInputRef = useRef<HTMLInputElement>(null)

    const [debouncedPickerSearch, setDebouncedPickerSearch] = useState('')
    const [linkSearch, setLinkSearch] = useState('')
    const [debouncedLinkSearch, setDebouncedLinkSearch] = useState('')

    useEffect(() => {
        const t = setTimeout(() => setDebouncedPickerSearch(pickerSearch.trim()), 300)
        return () => clearTimeout(t)
    }, [pickerSearch])

    useEffect(() => {
        const t = setTimeout(() => setDebouncedLinkSearch(linkSearch.trim()), 300)
        return () => clearTimeout(t)
    }, [linkSearch])

    const { data: productsResp, isFetching: productsFetching } = useQuery({
        queryKey: ['products', 'enhance', 'list', debouncedPickerSearch],
        queryFn: () => productsAPI.list({
            page_size: 60,
            status: 'نشط',
            ...(debouncedPickerSearch ? { search: debouncedPickerSearch } : {}),
        }),
    })
    const products: Product[] = productsResp?.data?.results || productsResp?.data || []

    const { data: linkProductsResp } = useQuery({
        queryKey: ['products', 'enhance', 'link', debouncedLinkSearch],
        queryFn: () => productsAPI.list({
            page_size: 60,
            status: 'نشط',
            ...(debouncedLinkSearch ? { search: debouncedLinkSearch } : {}),
        }),
    })
    const linkProducts: Product[] = linkProductsResp?.data?.results || linkProductsResp?.data || []

    const { data: pickerImagesResp, isFetching: pickerImagesFetching } = useQuery({
        queryKey: ['products', 'enhance', 'images', pickerProductId],
        enabled: !!pickerProductId,
        queryFn: () => productsAPI.listImages(pickerProductId!),
    })
    const pickerImages: ProductImage[] = pickerImagesResp?.data?.results || pickerImagesResp?.data || []

    const filteredProducts = products
    const pickerProduct = pickerProductId ? products.find(p => p.id === pickerProductId) : null

    const uploadMutation = useMutation({
        mutationFn: (file: File) => {
            const formData = new FormData()
            formData.append('file', file)
            return decorativeAPI.uploadImage(formData)
        },
        onSuccess: (resp) => {
            setImageUrl(resp.data.image_url)
        },
    })

    const analyzeMutation = useMutation({
        mutationFn: (data: { image_url: string; product_id?: number }) =>
            decorativeAPI.analyze(data),
        onSuccess: (resp) => {
            setGeneration(resp.data)
            const a = resp.data.vision_analysis || {}
            setEditDescEn(a.description_en || '')
            setStep('analysis')
        },
    })

    const enhanceMutation = useMutation({
        mutationFn: (data: Parameters<typeof decorativeAPI.enhance>[0]) => decorativeAPI.enhance(data),
        onSuccess: (resp) => {
            setGeneration(resp.data)
            setAttachStatus('idle')
            setAttachMessage('')
            setPollCount(0)
            setStep('generating')
        },
    })

    const attachMutation = useMutation({
        mutationFn: () => decorativeAPI.attachToProduct(generation!.id, selectedProductId),
        onMutate: () => {
            setAttachStatus('pending')
            setAttachMessage('')
        },
        onSuccess: () => {
            setAttachStatus('success')
            setAttachMessage('تمت إضافة الصورة إلى المنتج بنجاح')
        },
        onError: (err: any) => {
            setAttachStatus('error')
            setAttachMessage(err?.response?.data?.error || 'فشل ربط الصورة بالمنتج')
        },
    })

    const pollStatus = useCallback(async () => {
        if (!generation?.id) return
        setPollCount(prev => {
            if (prev >= MAX_POLLS) {
                setGeneration(g => g ? { ...g, status: 'failed' as const, error_message: 'انتهت مهلة الانتظار. حاول مرة أخرى.' } : g)
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
            // retry next tick
        }
    }, [generation?.id])

    useEffect(() => {
        if (step !== 'generating') return
        const interval = setInterval(pollStatus, 3000)
        return () => clearInterval(interval)
    }, [step, pollStatus])

    const handleFileSelect = (file: File) => {
        const previewUrl = URL.createObjectURL(file)
        setImagePreview(previewUrl)
        setImageUrl('')
        uploadMutation.mutate(file)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files[0]
        if (file && file.type.startsWith('image/')) handleFileSelect(file)
    }

    const handleAnalyze = () => {
        if (!imageUrl.trim()) return
        analyzeMutation.mutate({
            image_url: imageUrl,
            product_id: selectedProductId,
        })
    }

    const handleGenerate = () => {
        if (!generation?.id) return
        enhanceMutation.mutate({
            generation_id: generation.id,
            background,
            lighting,
            framing,
            shadow,
            aspect_ratio: aspectRatio,
            render_quality: renderQuality,
            override_description_en: editDescEn,
            custom_notes: customNotes,
        })
    }

    const resetAll = () => {
        setStep('source')
        setSourceMode('choose')
        setImageUrl('')
        setImagePreview('')
        setSelectedProductId(undefined)
        setPickerProductId(null)
        setPickerSearch('')
        setGeneration(null)
        setEditDescEn('')
        setBackground('pure_white')
        setLighting('studio')
        setFraming('normal')
        setShadow('natural')
        setAspectRatio('1:1')
        setRenderQuality('standard')
        setCustomNotes('')
        setPollCount(0)
        setAttachStatus('idle')
        setAttachMessage('')
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const analysis = generation?.vision_analysis
    const productTypeLabel = analysis?.product_type || ''
    const colorLabel = analysis?.color || ''
    const surfaceLabel = analysis?.surface || ''
    const patternLabel = analysis?.pattern || ''
    const verifyProduct = selectedProductId ? products.find(p => p.id === selectedProductId) : null

    return (
        <div className="decorative-page">
            <div className="decorative-header">
                <div className="decorative-title">
                    <ImagePlus size={28} />
                    <h1>تحسين صورة منتج</h1>
                </div>
                <p className="decorative-subtitle">
                    صورة كتالوج نظيفة على خلفية بيضاء — حافظ على هوية المنتج، حسّن الجودة
                </p>
                <button className="back-to-mode-btn" onClick={onBackToChoose}>
                    <ArrowRight size={16} /> تغيير نوع المهمة
                </button>
            </div>

            <div className="decorative-content">
                <div className="wizard-steps">
                    <div className={`wizard-step ${step === 'source' ? 'active' : ''} ${['analysis', 'settings', 'generating', 'result'].includes(step) ? 'done' : ''}`}>
                        <span className="wizard-step-num">1</span>
                        <span className="wizard-step-label">الصورة المصدر</span>
                    </div>
                    <div className={`wizard-step ${step === 'analysis' ? 'active' : ''} ${['settings', 'generating', 'result'].includes(step) ? 'done' : ''}`}>
                        <span className="wizard-step-num">2</span>
                        <span className="wizard-step-label">التحقق</span>
                    </div>
                    <div className={`wizard-step ${step === 'settings' ? 'active' : ''} ${['generating', 'result'].includes(step) ? 'done' : ''}`}>
                        <span className="wizard-step-num">3</span>
                        <span className="wizard-step-label">الإعدادات</span>
                    </div>
                    <div className={`wizard-step ${['generating', 'result'].includes(step) ? 'active' : ''} ${step === 'result' && generation?.status === 'completed' ? 'done' : ''}`}>
                        <span className="wizard-step-num">4</span>
                        <span className="wizard-step-label">النتيجة</span>
                    </div>
                </div>

                {/* ─── STEP 1: SOURCE ─────────────────────────────── */}
                {step === 'source' && (
                    <div className="wizard-panel">
                        <h2 className="panel-title"><ImagePlus size={20} /> اختر صورة المنتج</h2>
                        <p className="panel-help">
                            ارفع صورة من جهازك أو اختر منتجاً من الكتالوج. يمكنك ربط الصورة بمنتج لاحقاً للتحقق من المطابقة.
                        </p>

                        {sourceMode === 'choose' && (
                            <div className="source-mode-cards">
                                <button className="source-mode-card" onClick={() => setSourceMode('upload')}>
                                    <Upload size={32} />
                                    <span className="source-mode-title">رفع صورة جديدة</span>
                                    <span className="source-mode-desc">JPG, PNG, WebP من جهازك</span>
                                </button>
                                {products.length > 0 && (
                                    <button
                                        className="source-mode-card"
                                        onClick={() => {
                                            setSourceMode('product')
                                            setShowProductPicker(true)
                                        }}
                                    >
                                        <Package size={32} />
                                        <span className="source-mode-title">اختر من منتج موجود</span>
                                        <span className="source-mode-desc">تصفح صور منتجات الكتالوج</span>
                                    </button>
                                )}
                            </div>
                        )}

                        {sourceMode === 'upload' && (
                            <div className="source-subview">
                                <button
                                    className="source-back-link"
                                    onClick={() => { setSourceMode('choose'); setImageUrl(''); setImagePreview('') }}
                                >
                                    <ArrowRight size={14} /> تغيير طريقة الاختيار
                                </button>

                                <div
                                    className={`upload-dropzone ${isDragging ? 'dragging' : ''} ${imagePreview || imageUrl ? 'has-image' : ''}`}
                                    onDrop={handleDrop}
                                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0]
                                            if (file) handleFileSelect(file)
                                        }}
                                        hidden
                                    />

                                    {(imagePreview || imageUrl) ? (
                                        <div className="upload-preview">
                                            <img src={imagePreview || imageUrl} alt="معاينة الصورة" />
                                            {uploadMutation.isPending && (
                                                <div className="upload-overlay">
                                                    <Loader2 size={32} className="spin" />
                                                    <span>جاري الرفع...</span>
                                                </div>
                                            )}
                                            <button
                                                className="change-image-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setImageUrl('')
                                                    setImagePreview('')
                                                    if (fileInputRef.current) fileInputRef.current.value = ''
                                                }}
                                            >
                                                تغيير الصورة
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="upload-placeholder">
                                            <Upload size={40} />
                                            <span className="upload-text">اسحب الصورة هنا أو اضغط للاختيار</span>
                                            <span className="upload-hint">JPG, PNG, WebP — حد أقصى 10 ميجابايت</span>
                                        </div>
                                    )}
                                </div>

                                {uploadMutation.isError && (
                                    <div className="error-msg">
                                        <XCircle size={16} />
                                        فشل رفع الصورة. تأكد من نوع وحجم الملف.
                                    </div>
                                )}

                                {imageUrl && (
                                    <div className="enhance-link-product">
                                        <label className="form-label">
                                            <Package size={14} /> ربط بمنتج (اختياري — للتحقق من المطابقة وللحفظ في الكتالوج لاحقاً)
                                        </label>
                                        <input
                                            className="form-input"
                                            placeholder="ابحث بالاسم أو SKU..."
                                            value={linkSearch}
                                            onChange={e => setLinkSearch(e.target.value)}
                                            style={{ marginBottom: 6 }}
                                        />
                                        <select
                                            className="form-input"
                                            value={selectedProductId || ''}
                                            onChange={(e) => setSelectedProductId(e.target.value ? Number(e.target.value) : undefined)}
                                        >
                                            <option value="">— بدون ربط —</option>
                                            {linkProducts.map(p => (
                                                <option key={p.id} value={p.id}>
                                                    {p.product_name_ar} ({p.sku})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        )}

                        {sourceMode === 'product' && (
                            <div className="source-subview">
                                <button
                                    className="source-back-link"
                                    onClick={() => {
                                        setSourceMode('choose')
                                        setPickerProductId(null)
                                        setPickerSearch('')
                                        if (!imageUrl) setSelectedProductId(undefined)
                                    }}
                                >
                                    <ArrowRight size={14} /> تغيير طريقة الاختيار
                                </button>

                                {imageUrl && pickerProduct ? (
                                    <div className="picker-confirmed-selection">
                                        <img src={imageUrl} alt="الصورة المختارة" className="picker-confirmed-thumb" />
                                        <div className="picker-confirmed-info">
                                            <span className="picker-confirmed-name">{pickerProduct.product_name_ar}</span>
                                            <span className="picker-confirmed-sku">{pickerProduct.sku}</span>
                                            <button
                                                className="btn-secondary picker-change-btn"
                                                onClick={() => setShowProductPicker(true)}
                                            >
                                                <Camera size={14} /> تغيير الصورة
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        className="picker-open-btn"
                                        onClick={() => setShowProductPicker(true)}
                                    >
                                        <Package size={20} />
                                        تصفح منتجات الكتالوج واختر صورة
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="source-step-actions">
                            <button className="btn-secondary" onClick={onBackToChoose}>
                                <ArrowRight size={18} /> إلغاء
                            </button>
                            <button
                                className="btn-primary"
                                onClick={handleAnalyze}
                                disabled={!imageUrl.trim() || analyzeMutation.isPending || uploadMutation.isPending}
                            >
                                {analyzeMutation.isPending ? (
                                    <><Loader2 size={18} className="spin" /> جاري التحليل...</>
                                ) : (
                                    <><Eye size={18} /> تحليل الصورة</>
                                )}
                            </button>
                        </div>

                        {analyzeMutation.isError && (
                            <div className="error-msg">
                                <XCircle size={16} />
                                فشل تحليل الصورة. حاول مرة أخرى.
                            </div>
                        )}
                    </div>
                )}

                {/* ─── STEP 2: ANALYSIS / VERIFY ──────────────────── */}
                {step === 'analysis' && generation && (
                    <div className="wizard-panel">
                        <h2 className="panel-title"><Eye size={20} /> التحقق من المنتج</h2>
                        <p className="panel-help">
                            راجع تفاصيل المنتج المكتشفة من الصورة وتأكد من صحتها قبل التحسين.
                        </p>

                        <div className="analysis-grid">
                            <div className="analysis-image-col">
                                <div className="analysis-img-card">
                                    <img src={generation.source_image_url} alt="الصورة المصدر" />
                                </div>
                                {verifyProduct && (
                                    <div className="enhance-verify-product">
                                        <Package size={14} />
                                        <div>
                                            <div className="enhance-verify-label">المنتج المرتبط:</div>
                                            <div className="enhance-verify-name">{verifyProduct.product_name_ar}</div>
                                            <div className="enhance-verify-sku">{verifyProduct.sku}</div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="analysis-info-col">
                                <div className="analysis-detected">
                                    <h3><Sparkles size={16} /> الخصائص المكتشفة</h3>
                                    <dl className="analysis-dl">
                                        {productTypeLabel && (
                                            <>
                                                <dt>نوع المنتج:</dt>
                                                <dd>{productTypeLabel}</dd>
                                            </>
                                        )}
                                        {colorLabel && (
                                            <>
                                                <dt>اللون:</dt>
                                                <dd>{colorLabel}</dd>
                                            </>
                                        )}
                                        {surfaceLabel && (
                                            <>
                                                <dt>السطح / اللمسة:</dt>
                                                <dd>{surfaceLabel}</dd>
                                            </>
                                        )}
                                        {patternLabel && (
                                            <>
                                                <dt>النمط:</dt>
                                                <dd>{patternLabel}</dd>
                                            </>
                                        )}
                                    </dl>
                                </div>

                                <div className="form-field">
                                    <label className="form-label">
                                        وصف المنتج (يستخدم في توجيه الذكاء الاصطناعي)
                                    </label>
                                    <textarea
                                        className="form-input"
                                        value={editDescEn}
                                        onChange={(e) => setEditDescEn(e.target.value)}
                                        rows={3}
                                        placeholder="وصف المنتج بالإنجليزية"
                                    />
                                    <span className="field-hint">
                                        عدّل الوصف إذا رأيت أن النظام أخطأ في التعرف على المنتج.
                                    </span>
                                </div>

                                {verifyProduct && (
                                    <div className="enhance-verify-hint">
                                        <CheckCircle2 size={14} />
                                        تأكد أن الخصائص المكتشفة تطابق المنتج المرتبط ({verifyProduct.product_name_ar}).
                                        إذا لم تتطابق، فربما رفعت صورة منتج آخر — ارجع وغيّرها.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="source-step-actions">
                            <button
                                className="btn-secondary"
                                onClick={() => { setStep('source') }}
                            >
                                <ArrowRight size={18} /> رجوع
                            </button>
                            <button
                                className="btn-primary"
                                onClick={() => setStep('settings')}
                            >
                                التالي: إعدادات التحسين <ArrowLeft size={18} />
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── STEP 3: SETTINGS ───────────────────────────── */}
                {step === 'settings' && generation && (
                    <div className="wizard-panel">
                        <h2 className="panel-title"><Settings2 size={20} /> إعدادات التحسين</h2>
                        <p className="panel-help">
                            اختر شكل الصورة النهائية. الإعدادات الافتراضية مناسبة لمعظم منتجات الكتالوج.
                        </p>

                        <div className="settings-section">
                            <h3 className="settings-section-title">الخلفية</h3>
                            <div className="enhance-options-grid">
                                {BACKGROUNDS.map(opt => (
                                    <button
                                        key={opt.value}
                                        className={`enhance-option-card ${background === opt.value ? 'selected' : ''}`}
                                        onClick={() => setBackground(opt.value)}
                                    >
                                        <span className="enhance-option-title">{opt.labelAr}</span>
                                        <span className="enhance-option-desc">{opt.descAr}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="settings-section">
                            <h3 className="settings-section-title">الإضاءة</h3>
                            <div className="enhance-options-grid">
                                {LIGHTING.map(opt => (
                                    <button
                                        key={opt.value}
                                        className={`enhance-option-card ${lighting === opt.value ? 'selected' : ''}`}
                                        onClick={() => setLighting(opt.value)}
                                    >
                                        <span className="enhance-option-title">{opt.labelAr}</span>
                                        <span className="enhance-option-desc">{opt.descAr}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="settings-section">
                            <h3 className="settings-section-title">التأطير / الهوامش</h3>
                            <div className="enhance-options-grid">
                                {FRAMING.map(opt => (
                                    <button
                                        key={opt.value}
                                        className={`enhance-option-card ${framing === opt.value ? 'selected' : ''}`}
                                        onClick={() => setFraming(opt.value)}
                                    >
                                        <span className="enhance-option-title">{opt.labelAr}</span>
                                        <span className="enhance-option-desc">{opt.descAr}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="settings-section">
                            <h3 className="settings-section-title">الظل</h3>
                            <div className="enhance-options-grid">
                                {SHADOWS.map(opt => (
                                    <button
                                        key={opt.value}
                                        className={`enhance-option-card ${shadow === opt.value ? 'selected' : ''}`}
                                        onClick={() => setShadow(opt.value)}
                                    >
                                        <span className="enhance-option-title">{opt.labelAr}</span>
                                        <span className="enhance-option-desc">{opt.descAr}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="settings-section enhance-double">
                            <div>
                                <h3 className="settings-section-title">نسبة العرض إلى الارتفاع</h3>
                                <div className="enhance-chips">
                                    {ASPECT_RATIOS.map(opt => (
                                        <button
                                            key={opt.value}
                                            className={`enhance-chip ${aspectRatio === opt.value ? 'selected' : ''}`}
                                            onClick={() => setAspectRatio(opt.value)}
                                        >
                                            {opt.labelAr}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <h3 className="settings-section-title">جودة التوليد</h3>
                                <div className="enhance-chips">
                                    {QUALITIES.map(opt => (
                                        <button
                                            key={opt.value}
                                            className={`enhance-chip ${renderQuality === opt.value ? 'selected' : ''}`}
                                            onClick={() => setRenderQuality(opt.value)}
                                            title={opt.descAr}
                                        >
                                            {opt.labelAr}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="settings-section">
                            <h3 className="settings-section-title">ملاحظات إضافية (اختياري)</h3>
                            <textarea
                                className="form-input"
                                value={customNotes}
                                onChange={(e) => setCustomNotes(e.target.value)}
                                rows={2}
                                placeholder="مثلاً: أظهر الزخارف بوضوح، حافظ على لمعان السطح، إلخ"
                            />
                        </div>

                        <div className="source-step-actions">
                            <button
                                className="btn-secondary"
                                onClick={() => setStep('analysis')}
                            >
                                <ArrowRight size={18} /> رجوع للتحقق
                            </button>
                            <button
                                className="btn-primary"
                                onClick={handleGenerate}
                                disabled={enhanceMutation.isPending}
                            >
                                {enhanceMutation.isPending ? (
                                    <><Loader2 size={18} className="spin" /> جاري الإرسال...</>
                                ) : (
                                    <><Sparkles size={18} /> ابدأ التحسين</>
                                )}
                            </button>
                        </div>

                        {enhanceMutation.isError && (
                            <div className="error-msg">
                                <XCircle size={16} />
                                {(enhanceMutation.error as any)?.response?.data?.error || 'فشل بدء التحسين. حاول مرة أخرى.'}
                            </div>
                        )}
                    </div>
                )}

                {/* ─── STEP 4a: GENERATING ────────────────────────── */}
                {step === 'generating' && (
                    <div className="wizard-panel generating-panel">
                        <Loader2 size={64} className="spin" />
                        <h2>جاري تحسين الصورة...</h2>
                        <p>عادة يستغرق ذلك من 30 إلى 90 ثانية حسب الجودة المختارة</p>
                        <div className="poll-progress">
                            <span>المحاولة {pollCount} من {MAX_POLLS}</span>
                        </div>
                    </div>
                )}

                {/* ─── STEP 4b: RESULT ────────────────────────────── */}
                {step === 'result' && generation && (
                    <div className="wizard-panel">
                        {generation.status === 'completed' && generation.result_image_url ? (
                            <>
                                <h2 className="panel-title">
                                    <CheckCircle2 size={20} className="text-success" /> تم التحسين بنجاح
                                </h2>

                                <div className="result-comparison">
                                    <div className="result-side">
                                        <h4>الصورة الأصلية</h4>
                                        <img src={generation.source_image_url} alt="المصدر" className="result-img" />
                                    </div>
                                    <div className="result-side">
                                        <h4>الصورة المحسّنة</h4>
                                        <img src={generation.result_image_url} alt="النتيجة" className="result-img" />
                                    </div>
                                </div>

                                <div className="result-actions">
                                    <a
                                        href={generation.result_image_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        download
                                        className="btn-secondary"
                                    >
                                        <Download size={16} /> تحميل
                                    </a>

                                    {selectedProductId && (
                                        <button
                                            className="btn-primary"
                                            onClick={() => attachMutation.mutate()}
                                            disabled={attachStatus === 'pending' || attachStatus === 'success'}
                                        >
                                            {attachStatus === 'pending' ? (
                                                <><Loader2 size={16} className="spin" /> جاري الربط...</>
                                            ) : attachStatus === 'success' ? (
                                                <><CheckCircle2 size={16} /> تم الربط</>
                                            ) : (
                                                <><Package size={16} /> إضافة الصورة للمنتج</>
                                            )}
                                        </button>
                                    )}

                                    <button className="btn-secondary" onClick={() => setStep('settings')}>
                                        <RefreshCw size={16} /> توليد مرة أخرى بإعدادات مختلفة
                                    </button>

                                    <button className="btn-secondary" onClick={resetAll}>
                                        صورة جديدة
                                    </button>
                                </div>

                                {attachMessage && (
                                    <div className={`attach-msg ${attachStatus}`}>
                                        {attachStatus === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                                        {attachMessage}
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <h2 className="panel-title">
                                    <XCircle size={20} className="text-danger" /> فشل التحسين
                                </h2>
                                <p className="error-detail">
                                    {generation.error_message || 'حدث خطأ غير معروف. حاول مرة أخرى.'}
                                </p>
                                <div className="result-actions">
                                    <button className="btn-primary" onClick={() => setStep('settings')}>
                                        <RefreshCw size={16} /> حاول مرة أخرى
                                    </button>
                                    <button className="btn-secondary" onClick={resetAll}>
                                        صورة جديدة
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* ─── PRODUCT PICKER MODAL ─────────────────────────── */}
            {showProductPicker && (
                <div className="picker-modal-overlay" onClick={() => setShowProductPicker(false)}>
                    <div className="picker-modal" onClick={e => e.stopPropagation()}>
                        <div className="picker-modal-header">
                            <h3>
                                {pickerProductId ? (
                                    <>
                                        <button className="picker-modal-back" onClick={() => { setPickerProductId(null); setPickerSearch('') }}>
                                            <ArrowRight size={16} />
                                        </button>
                                        {pickerProduct?.product_name_ar}
                                    </>
                                ) : (
                                    <>
                                        <Package size={18} /> اختر منتجاً وصورة
                                    </>
                                )}
                            </h3>
                            <button className="picker-modal-close" onClick={() => setShowProductPicker(false)}>
                                <XCircle size={20} />
                            </button>
                        </div>

                        {!pickerProductId ? (
                            <>
                                <div className="picker-modal-search">
                                    <input
                                        className="form-input"
                                        placeholder="ابحث بالاسم أو SKU..."
                                        value={pickerSearch}
                                        onChange={e => setPickerSearch(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                                <div className="picker-products-grid picker-modal-grid">
                                    {productsFetching && (
                                        <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'center', padding: 24 }}>
                                            <Loader2 size={24} className="spin" />
                                        </div>
                                    )}
                                    {!productsFetching && filteredProducts.map(p => {
                                        const thumb = p.main_image_url
                                        return (
                                            <button
                                                key={p.id}
                                                className="picker-product-card"
                                                onClick={() => {
                                                    setPickerProductId(p.id)
                                                    setSelectedProductId(p.id)
                                                }}
                                            >
                                                {thumb ? (
                                                    <img src={thumb} alt={p.product_name_ar} className="picker-product-thumb" />
                                                ) : (
                                                    <div className="picker-product-no-img">
                                                        <ImageIcon size={24} />
                                                    </div>
                                                )}
                                                <span className="picker-product-name">{p.product_name_ar}</span>
                                                <span className="picker-product-sku">{p.sku}</span>
                                            </button>
                                        )
                                    })}
                                    {!productsFetching && filteredProducts.length === 0 && (
                                        <p className="picker-empty">لا توجد منتجات تطابق البحث</p>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="picker-modal-images">
                                {pickerImagesFetching ? (
                                    <div className="picker-loading">
                                        <Loader2 size={28} className="spin" />
                                        <span>جاري تحميل الصور...</span>
                                    </div>
                                ) : pickerImages.length === 0 ? (
                                    <p className="picker-empty">لا توجد صور لهذا المنتج</p>
                                ) : (
                                    <div className="picker-images-grid picker-modal-grid">
                                        {pickerImages.map((img, idx) => (
                                            <button
                                                key={idx}
                                                className={`picker-image-card ${imageUrl === img.url ? 'selected' : ''}`}
                                                onClick={() => {
                                                    setImageUrl(img.url)
                                                    setImagePreview(img.url)
                                                    setShowProductPicker(false)
                                                }}
                                            >
                                                <img src={img.url} alt={`صورة ${idx + 1}`} />
                                                <span className="picker-image-type">{img.image_type}</span>
                                                {imageUrl === img.url && (
                                                    <div className="picker-image-selected-badge">
                                                        <CheckCircle2 size={16} />
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
