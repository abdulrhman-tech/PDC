import { useState, useEffect, useCallback, useRef } from 'react'
import { useMutation, useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { decorativeAPI, productsAPI } from '@/api/client'
import type { DecorativeGeneration, Product, ProductImage } from '@/types'
import {
    Image as ImageIcon, Sparkles, Eye, Settings2, Loader2,
    CheckCircle2, XCircle, ArrowRight, ArrowLeft, Download,
    Clock, RefreshCw, Wand2, Upload, Layers, Package, Camera,
    LayoutGrid, Box, Grid3x3, ImagePlus, FolderOpen,
} from 'lucide-react'
import { getTemplatesForMode, type RoomTemplate } from './roomTemplates'
import MultiProductGenerator from './MultiProductGenerator'
import DualSameCategoryGenerator from './DualSameCategoryGenerator'
import ProductImageEnhancer from './ProductImageEnhancer'
import GenerationsGallery from './GenerationsGallery'
import './DecorativeGeneratorPage.css'

type GenerationMode = 'surface' | 'product' | 'showcase'

const SURFACE_SPACE_TYPES = [
    { value: 'living_room', label: 'غرفة معيشة', prompt: 'modern living room' },
    { value: 'bedroom', label: 'غرفة نوم', prompt: 'elegant bedroom' },
    { value: 'bathroom', label: 'حمام', prompt: 'modern bathroom' },
    { value: 'kitchen', label: 'مطبخ', prompt: 'contemporary kitchen' },
    { value: 'office', label: 'مكتب', prompt: 'home office' },
    { value: 'lobby', label: 'لوبي / استقبال', prompt: 'grand entrance lobby' },
    { value: 'restaurant', label: 'مطعم', prompt: 'upscale restaurant interior' },
    { value: 'outdoor', label: 'مساحة خارجية', prompt: 'outdoor patio area' },
]

const PRODUCT_SPACE_TYPES_SANITARY = [
    { value: 'bathroom', label: 'حمام عصري', prompt: 'modern luxury bathroom' },
    { value: 'bathroom_classic', label: 'حمام كلاسيكي', prompt: 'classic elegant bathroom' },
    { value: 'kitchen', label: 'مطبخ', prompt: 'contemporary kitchen' },
]

const PRODUCT_SPACE_TYPES_OUTDOOR = [
    { value: 'patio', label: 'فناء خارجي', prompt: 'outdoor patio' },
    { value: 'pool', label: 'منطقة مسبح', prompt: 'pool area' },
    { value: 'garden', label: 'حديقة', prompt: 'garden area' },
    { value: 'entrance', label: 'مدخل خارجي', prompt: 'outdoor entrance' },
]

const PRODUCT_SPACE_TYPES_DEFAULT = [
    { value: 'living_room', label: 'غرفة معيشة', prompt: 'modern living room' },
    { value: 'bathroom', label: 'حمام', prompt: 'modern bathroom' },
    { value: 'kitchen', label: 'مطبخ', prompt: 'contemporary kitchen' },
    { value: 'lobby', label: 'لوبي', prompt: 'grand entrance lobby' },
    { value: 'outdoor', label: 'مساحة خارجية', prompt: 'outdoor patio area' },
]

const PRODUCT_SPACE_TYPES_INDOOR_FURNITURE = [
    { value: 'living_room', label: 'غرفة معيشة', prompt: 'modern living room' },
    { value: 'bedroom', label: 'غرفة نوم', prompt: 'elegant bedroom' },
    { value: 'lobby', label: 'لوبي / مدخل', prompt: 'grand entrance lobby' },
    { value: 'office', label: 'مكتب', prompt: 'home office' },
    { value: 'restaurant', label: 'مطعم', prompt: 'upscale restaurant interior' },
]

interface ProductType {
    id: string
    subtype: string
    mode: GenerationMode
    placement: string
    labelAr: string
    labelEn: string
    emoji: string
}

interface ProductTypeGroup {
    groupLabel: string
    types: ProductType[]
}

const PRODUCT_TYPE_GROUPS: ProductTypeGroup[] = [
    {
        groupLabel: 'أرضيات',
        types: [
            { id: 'carpet', subtype: 'carpet', mode: 'surface', placement: 'floor', labelAr: 'موكيت', labelEn: 'Carpet', emoji: '🟫' },
            { id: 'parquet', subtype: 'parquet', mode: 'surface', placement: 'floor', labelAr: 'باركيه', labelEn: 'Parquet Wood', emoji: '🪵' },
            { id: 'lvt_spc', subtype: 'lvt_spc', mode: 'surface', placement: 'floor', labelAr: 'LVT / SPC', labelEn: 'Vinyl Plank', emoji: '📋' },
            { id: 'rubber_flooring', subtype: 'rubber_flooring', mode: 'surface', placement: 'floor', labelAr: 'أرضيات مطاطية', labelEn: 'Rubber Flooring', emoji: '⬛' },
        ],
    },
    {
        groupLabel: 'بلاط وحجر',
        types: [
            { id: 'ceramic_tile', subtype: 'ceramic_tile', mode: 'surface', placement: 'floor', labelAr: 'سيراميك وبورسلان', labelEn: 'Ceramic/Porcelain', emoji: '🔲' },
            { id: 'mosaic', subtype: 'mosaic', mode: 'surface', placement: 'floor', labelAr: 'موزاييك', labelEn: 'Mosaic', emoji: '🔷' },
            { id: 'pool_tile', subtype: 'pool_tile', mode: 'surface', placement: 'floor', labelAr: 'بلاط مسابح', labelEn: 'Pool Tiles', emoji: '🏊' },
            { id: 'marble', subtype: 'marble', mode: 'surface', placement: 'floor', labelAr: 'رخام وحجر طبيعي', labelEn: 'Marble / Stone', emoji: '🪨' },
        ],
    },
    {
        groupLabel: 'جدران',
        types: [
            { id: 'wall_ceramic', subtype: 'porcelain_tile', mode: 'surface', placement: 'wall', labelAr: 'بلاط ديكور جداري', labelEn: 'Decorative Wall Tile', emoji: '🧱' },
            { id: 'wallpaper', subtype: 'wallpaper', mode: 'surface', placement: 'wall', labelAr: 'ورق جداري', labelEn: 'Wallpaper', emoji: '🖼️' },
            { id: 'wall_cladding', subtype: 'wall_cladding', mode: 'surface', placement: 'wall', labelAr: 'جدران جلدية وكلادينج', labelEn: 'Wall Cladding', emoji: '🏗️' },
            { id: 'glass_block', subtype: 'glass_block', mode: 'surface', placement: 'wall', labelAr: 'بلوك زجاج', labelEn: 'Glass Block', emoji: '🔳' },
        ],
    },
    {
        groupLabel: 'منتجات',
        types: [
            { id: 'sanitary', subtype: 'sanitary', mode: 'product', placement: 'bathroom', labelAr: 'أدوات صحية', labelEn: 'Sanitary Ware', emoji: '🚿' },
            { id: 'indoor_furniture', subtype: 'indoor_furniture', mode: 'product', placement: 'living_room', labelAr: 'أثاث داخلي', labelEn: 'Indoor Furniture', emoji: '🛋️' },
            { id: 'outdoor_furniture', subtype: 'outdoor_furniture', mode: 'product', placement: 'outdoor', labelAr: 'جلسات خارجية ومظلات', labelEn: 'Outdoor Furniture', emoji: '⛱️' },
            { id: 'artificial_grass', subtype: 'outdoor_furniture', mode: 'product', placement: 'outdoor', labelAr: 'عشب صناعي', labelEn: 'Artificial Grass', emoji: '🌿' },
        ],
    },
    {
        groupLabel: 'مواد بناء',
        types: [
            { id: 'construction_adhesive', subtype: 'construction_material', mode: 'showcase', placement: 'studio', labelAr: 'غراء ومواد بناء', labelEn: 'Adhesives & Materials', emoji: '🧪' },
            { id: 'construction_profiles', subtype: 'construction_material', mode: 'showcase', placement: 'studio', labelAr: 'تروبات وفواصل', labelEn: 'Profiles & Joints', emoji: '📐' },
        ],
    },
]

const DESIGN_STYLES = [
    { value: 'modern', label: 'حديث', prompt: 'modern minimalist design' },
    { value: 'classic', label: 'كلاسيكي', prompt: 'classic European design' },
    { value: 'arabic', label: 'عربي / إسلامي', prompt: 'traditional Arabic Islamic design with geometric patterns' },
    { value: 'scandinavian', label: 'اسكندنافي', prompt: 'Scandinavian clean design' },
    { value: 'industrial', label: 'صناعي', prompt: 'industrial loft design' },
    { value: 'luxury', label: 'فاخر', prompt: 'luxury high-end interior design' },
    { value: 'rustic', label: 'ريفي', prompt: 'rustic countryside design' },
    { value: 'contemporary', label: 'معاصر', prompt: 'contemporary design' },
]

const LIGHTING_OPTIONS = [
    { value: 'natural', label: 'إضاءة طبيعية', prompt: 'natural daylight streaming through large windows' },
    { value: 'warm', label: 'إضاءة دافئة', prompt: 'warm golden ambient lighting' },
    { value: 'dramatic', label: 'إضاءة درامية', prompt: 'dramatic directional lighting with shadows' },
    { value: 'soft', label: 'إضاءة ناعمة', prompt: 'soft diffused lighting' },
    { value: 'evening', label: 'إضاءة مسائية', prompt: 'evening mood lighting with accent lamps' },
    { value: 'studio', label: 'إضاءة استوديو', prompt: 'professional studio lighting' },
]

const CAMERA_ANGLES = [
    { value: 'eye_level', label: 'مستوى العين', prompt: 'eye-level perspective shot' },
    { value: 'low_angle', label: 'زاوية منخفضة', prompt: 'low angle shot looking up' },
    { value: 'bird_eye', label: 'منظر علوي', prompt: 'bird\'s eye view from above' },
    { value: 'corner', label: 'زاوية ركنية', prompt: 'corner perspective showing two walls' },
    { value: 'close_up', label: 'لقطة قريبة', prompt: 'close-up detail shot' },
]

const MOOD_OPTIONS = [
    { value: 'warm', label: 'دافئ ومرحب', prompt: 'warm and inviting atmosphere' },
    { value: 'calm', label: 'هادئ ومريح', prompt: 'serene and peaceful atmosphere' },
    { value: 'energetic', label: 'حيوي ونشيط', prompt: 'energetic and vibrant atmosphere' },
    { value: 'elegant', label: 'أنيق وراقي', prompt: 'elegant and sophisticated atmosphere' },
    { value: 'cozy', label: 'مريح ودافئ', prompt: 'cozy and comfortable atmosphere' },
]

const ASPECT_RATIOS = [
    { value: '16:9', label: '16:9 عرضي' },
    { value: '1:1', label: '1:1 مربع' },
    { value: '9:16', label: '9:16 طولي' },
    { value: '4:3', label: '4:3 قياسي' },
]

const QUALITY_OPTIONS = [
    { value: 'preview', label: 'معاينة سريعة' },
    { value: 'standard', label: 'قياسي' },
    { value: 'high', label: 'عالي الجودة' },
]

const MODE_INFO: Record<GenerationMode, { icon: typeof Layers; label: string; desc: string; color: string }> = {
    surface: { icon: Layers, label: 'وضع الأسطح', desc: 'تركيب الخامة على أرضية أو جدار', color: 'mode-surface' },
    product: { icon: Package, label: 'وضع المنتجات', desc: 'وضع المنتج في مشهد واقعي', color: 'mode-product' },
    showcase: { icon: Camera, label: 'وضع العرض', desc: 'صورة منتج احترافية على خلفية نظيفة', color: 'mode-showcase' },
}

type WizardStep = 'type_select' | 'source' | 'analysis' | 'settings' | 'confirm' | 'generating' | 'result'

type TopMode = 'choose' | 'single' | 'multi' | 'dual' | 'enhance' | 'gallery'

export default function DecorativeGeneratorPage() {
    const [topMode, setTopMode] = useState<TopMode>('choose')

    if (topMode === 'multi') {
        return <MultiProductGenerator onBack={() => setTopMode('choose')} />
    }

    if (topMode === 'dual') {
        return <DualSameCategoryGenerator onBack={() => setTopMode('choose')} />
    }

    if (topMode === 'single') {
        return <SingleProductGenerator onBackToChoose={() => setTopMode('choose')} />
    }

    if (topMode === 'enhance') {
        return <ProductImageEnhancer onBackToChoose={() => setTopMode('choose')} />
    }

    if (topMode === 'gallery') {
        return <GenerationsGallery onBackToChoose={() => setTopMode('choose')} />
    }

    return (
        <div className="decorative-page">
            <div className="decorative-header">
                <div className="decorative-title">
                    <Wand2 size={28} />
                    <h1>توليد صور ديكورية</h1>
                </div>
                <p className="decorative-subtitle">
                    اختر نوع المشهد الذي تريد إنشاءه
                </p>
                <button
                    className="gallery-open-btn"
                    onClick={() => setTopMode('gallery')}
                >
                    <FolderOpen size={16} /> معرض جميع الصور
                </button>
            </div>

            <div className="decorative-content">
                <div className="mode-chooser">
                    <button className="mode-chooser-card" onClick={() => setTopMode('single')}>
                        <div className="mode-chooser-icon mode-chooser-icon--single">
                            <Box size={48} />
                        </div>
                        <div className="mode-chooser-title">مشهد منتج واحد</div>
                        <div className="mode-chooser-desc">
                            ضع منتجاً واحداً في مشهد ديكوري احترافي — مناسب للأرضيات والجدران والأثاث وغيرها
                        </div>
                    </button>

                    <button className="mode-chooser-card" onClick={() => setTopMode('multi')}>
                        <div className="mode-chooser-icon mode-chooser-icon--multi">
                            <Grid3x3 size={48} />
                        </div>
                        <div className="mode-chooser-title">مشهد متعدد المنتجات</div>
                        <div className="mode-chooser-desc">
                            ادمج عدة منتجات في مشهد واحد متكامل — أرضية مع جدار مع أثاث في غرفة واحدة
                        </div>
                    </button>

                    <button className="mode-chooser-card" onClick={() => setTopMode('dual')}>
                        <div className="mode-chooser-icon mode-chooser-icon--dual">
                            <LayoutGrid size={48} />
                        </div>
                        <div className="mode-chooser-title">دمج خامتين من نفس الفئة</div>
                        <div className="mode-chooser-desc">
                            اجمع نوعين من نفس الفئة (بلاط، باركيه، أرضيات مطاطية...) على سطح واحد بنمط شطرنج أو نصفين أو خطوط أو إطار
                        </div>
                    </button>

                    <button className="mode-chooser-card" onClick={() => setTopMode('enhance')}>
                        <div className="mode-chooser-icon mode-chooser-icon--enhance">
                            <ImagePlus size={48} />
                        </div>
                        <div className="mode-chooser-title">تحسين صورة منتج</div>
                        <div className="mode-chooser-desc">
                            حسّن جودة صورة منتج ضعيفة أو مأخوذة بالجوال وحوّلها إلى صورة كتالوج نظيفة على خلفية بيضاء
                        </div>
                    </button>
                </div>
            </div>
        </div>
    )
}

function SingleProductGenerator({ onBackToChoose }: { onBackToChoose: () => void }) {
    const [step, setStep] = useState<WizardStep>('type_select')
    const [imageUrl, setImageUrl] = useState('')
    const [imagePreview, setImagePreview] = useState('')
    const [selectedProductId, setSelectedProductId] = useState<number | undefined>()
    const [generation, setGeneration] = useState<DecorativeGeneration | null>(null)
    const [isDragging, setIsDragging] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [generationMode, setGenerationMode] = useState<GenerationMode>('surface')
    const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)

    const [spaceType, setSpaceType] = useState(SURFACE_SPACE_TYPES[0])
    const [designStyle, setDesignStyle] = useState(DESIGN_STYLES[0])
    const [lighting, setLighting] = useState(LIGHTING_OPTIONS[0])
    const [cameraAngle, setCameraAngle] = useState(CAMERA_ANGLES[0])
    const [mood, setMood] = useState(MOOD_OPTIONS[0])
    const [aspectRatio, setAspectRatio] = useState('16:9')
    const [quality, setQuality] = useState('standard')
    const [placement, setPlacement] = useState('main flooring feature')
    const [pollCount, setPollCount] = useState(0)

    const [editMode, setEditMode] = useState<GenerationMode>('surface')
    const [editColor, setEditColor] = useState('')
    const [editPattern, setEditPattern] = useState('')
    const [editSurface, setEditSurface] = useState('')
    const [editDescEn, setEditDescEn] = useState('')
    const [customPrompt, setCustomPrompt] = useState('')
    const [materialSubtypeHint, setMaterialSubtypeHint] = useState('')
    const [generationModeHint, setGenerationModeHint] = useState<GenerationMode>('surface')
    const [selectedProductTypeId, setSelectedProductTypeId] = useState('')
    const MAX_POLLS = 120

    const [sourceMode, setSourceMode] = useState<'choose' | 'upload' | 'product'>('choose')
    const [showProductPicker, setShowProductPicker] = useState(false)
    const [pickerSearch, setPickerSearch] = useState('')
    const [debouncedPickerSearch, setDebouncedPickerSearch] = useState('')
    const [pickerProductId, setPickerProductId] = useState<number | null>(null)
    const [attachStatus, setAttachStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
    const [attachMessage, setAttachMessage] = useState('')

    const scrollStateRef = useRef({ hasNextPage: false, isFetchingNextPage: false, fetchNextPage: (() => {}) as () => void })
    const scrollListenerRef = useRef<{ el: HTMLDivElement; handler: () => void } | null>(null)

    useEffect(() => {
        const t = setTimeout(() => setDebouncedPickerSearch(pickerSearch.trim()), 300)
        return () => clearTimeout(t)
    }, [pickerSearch])

    const {
        data: productsPages,
        isFetching: productsFetching,
        isFetchingNextPage,
        hasNextPage,
        fetchNextPage,
    } = useInfiniteQuery({
        queryKey: ['products-for-decorative', debouncedPickerSearch],
        queryFn: ({ pageParam = 1 }) => productsAPI.list({
            page_size: 60,
            page: pageParam,
            status: 'نشط',
            ...(debouncedPickerSearch ? { search: debouncedPickerSearch } : {}),
        }).then(r => r.data),
        getNextPageParam: (lastPage: any, allPages: any[]) => lastPage?.next ? allPages.length + 1 : undefined,
        initialPageParam: 1,
    })
    const products: Product[] = productsPages?.pages?.flatMap((p: any) => p?.results ?? []) ?? []

    scrollStateRef.current = { hasNextPage: !!hasNextPage, isFetchingNextPage, fetchNextPage }

    const pickerGridRef = useCallback((el: HTMLDivElement | null) => {
        if (scrollListenerRef.current) {
            scrollListenerRef.current.el.removeEventListener('scroll', scrollListenerRef.current.handler)
            scrollListenerRef.current = null
        }
        if (!el) return
        const handler = () => {
            const s = scrollStateRef.current
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200 && s.hasNextPage && !s.isFetchingNextPage) {
                s.fetchNextPage()
            }
        }
        el.addEventListener('scroll', handler)
        scrollListenerRef.current = { el, handler }
    }, [])

    const { data: historyResp, refetch: refetchHistory } = useQuery({
        queryKey: ['decorative-history'],
        queryFn: () => decorativeAPI.history({ page_size: 10 }),
    })
    const history: DecorativeGeneration[] = historyResp?.data ?? []

    const { data: pickerImagesResp, isFetching: pickerImagesFetching } = useQuery({
        queryKey: ['picker-product-images', pickerProductId],
        queryFn: () => productsAPI.listImages(pickerProductId!),
        enabled: !!pickerProductId,
    })

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
        mutationFn: (data: { image_url: string; product_id?: number; material_subtype_hint?: string; generation_mode_hint?: string }) =>
            decorativeAPI.analyze(data),
        onSuccess: (resp) => {
            setGeneration(resp.data)
            const analysis = resp.data.vision_analysis
            const rawMode = analysis?.generation_mode
            const mode: GenerationMode = rawMode === 'product' || rawMode === 'showcase' ? rawMode : 'surface'
            setGenerationMode(mode)
            setEditMode(mode)

            setEditColor(analysis?.color || '')
            setEditPattern(analysis?.pattern || '')
            setEditSurface(analysis?.surface || '')
            setEditDescEn(analysis?.description_en || '')

            if (mode === 'surface') {
                const rec = analysis?.recommended_placement
                if (rec === 'wall') setPlacement('main wall covering')
                else setPlacement('main flooring feature')
                setSpaceType(SURFACE_SPACE_TYPES[0])
            } else if (mode === 'product') {
                setPlacement('focal product')
                const subtype = analysis?.material_subtype
                const category = analysis?.product_category
                if (subtype === 'indoor_furniture') setSpaceType(PRODUCT_SPACE_TYPES_INDOOR_FURNITURE[0])
                else if (subtype === 'sanitary' || category === 'sanitary') setSpaceType(PRODUCT_SPACE_TYPES_SANITARY[0])
                else if (subtype === 'outdoor_furniture' || category === 'outdoor') setSpaceType(PRODUCT_SPACE_TYPES_OUTDOOR[0])
                else setSpaceType(PRODUCT_SPACE_TYPES_DEFAULT[0])
            } else {
                setPlacement('center product')
                setLighting(LIGHTING_OPTIONS.find(l => l.value === 'studio') || LIGHTING_OPTIONS[0])
            }

            setStep('analysis')
        },
    })

    const generateMutation = useMutation({
        mutationFn: (data: object) => decorativeAPI.generate(data),
        onSuccess: (resp) => {
            setGeneration(resp.data)
            setAttachStatus('idle')
            setAttachMessage('')
            setStep('generating')
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
                refetchHistory()
            }
        } catch {
            // polling error - will retry
        }
    }, [generation?.id, refetchHistory])

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
        if (file && file.type.startsWith('image/')) {
            handleFileSelect(file)
        }
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = () => {
        setIsDragging(false)
    }

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) handleFileSelect(file)
    }

    const handleAnalyze = () => {
        if (!imageUrl.trim()) return
        analyzeMutation.mutate({
            image_url: imageUrl,
            product_id: selectedProductId,
            material_subtype_hint: materialSubtypeHint || undefined,
            generation_mode_hint: materialSubtypeHint ? generationModeHint : undefined,
        })
    }

    const getSpaceTypeOptions = () => {
        if (generationMode === 'surface') return SURFACE_SPACE_TYPES
        if (generationMode === 'product') {
            const subtype = generation?.vision_analysis?.material_subtype || materialSubtypeHint
            if (subtype === 'indoor_furniture') return PRODUCT_SPACE_TYPES_INDOOR_FURNITURE
            if (subtype === 'sanitary') return PRODUCT_SPACE_TYPES_SANITARY
            if (subtype === 'outdoor_furniture') return PRODUCT_SPACE_TYPES_OUTDOOR
            const category = generation?.vision_analysis?.product_category
            if (category === 'sanitary') return PRODUCT_SPACE_TYPES_SANITARY
            if (category === 'outdoor') return PRODUCT_SPACE_TYPES_OUTDOOR
            return PRODUCT_SPACE_TYPES_DEFAULT
        }
        return []
    }

    const handleSelectTemplate = (template: RoomTemplate) => {
        setSelectedTemplate(template.id)
        const ds = template.default_settings
        const foundStyle = DESIGN_STYLES.find(s => s.value === ds.design_style)
        if (foundStyle) setDesignStyle(foundStyle)
        const foundLight = LIGHTING_OPTIONS.find(s => s.value === ds.lighting)
        if (foundLight) setLighting(foundLight)
        const foundAngle = CAMERA_ANGLES.find(s => s.value === ds.camera_angle)
        if (foundAngle) setCameraAngle(foundAngle)
        const foundMood = MOOD_OPTIONS.find(s => s.value === ds.mood)
        if (foundMood) setMood(foundMood)
        setAspectRatio(ds.aspect_ratio)

        const spaceOptions = getSpaceTypeOptions()
        const matchingSpace = spaceOptions.find(s => template.base_prompt.toLowerCase().includes(s.value.replace('_', ' ')))
        if (matchingSpace) setSpaceType(matchingSpace)
    }

    const handleGenerate = () => {
        if (!generation?.id) return
        setPollCount(0)

        const payload: Record<string, unknown> = {
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
            placement,
            lens_type: 'wide_angle',
            lens_type_prompt: 'wide-angle architectural lens',
            material_focus: 'detail',
            material_focus_prompt: 'detailed material texture visible',
            composition: 'rule_of_thirds',
            composition_prompt: 'rule of thirds composition',
            override_description_en: editDescEn,
            override_generation_mode: editMode,
            custom_notes: customPrompt,
        }

        generateMutation.mutate(payload)
    }

    const handleStartOver = () => {
        setStep('type_select')
        setGeneration(null)
        setImageUrl('')
        setImagePreview('')
        setSelectedProductId(undefined)
        setSelectedTemplate(null)
        setGenerationMode('surface')
        setMaterialSubtypeHint('')
        setGenerationModeHint('surface')
        setSelectedProductTypeId('')
        setSourceMode('choose')
        setShowProductPicker(false)
        setPickerSearch('')
        setPickerProductId(null)
        setAttachStatus('idle')
        setAttachMessage('')
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleSelectFromHistory = (item: DecorativeGeneration) => {
        setGeneration(item)
        setImageUrl(item.source_image_url)
        const rawMode = item.vision_analysis?.generation_mode
        const mode: GenerationMode = rawMode === 'product' || rawMode === 'showcase' ? rawMode : 'surface'
        setGenerationMode(mode)
        if (item.status === 'analyzed') setStep('analysis')
        else if (item.status === 'generating') setStep('generating')
        else if (item.status === 'completed' || item.status === 'failed') setStep('result')
    }

    const analysis = generation?.vision_analysis
    const modeInfo = MODE_INFO[generationMode]
    const ModeIcon = modeInfo.icon

    const stepIndex = ['type_select', 'source', 'analysis', 'settings', 'confirm', 'generating', 'result'].indexOf(step)

    const allProductTypes = PRODUCT_TYPE_GROUPS.flatMap(g => g.types)
    const selectedProductType = allProductTypes.find(t => t.id === selectedProductTypeId)

    const templates = generationMode !== 'showcase' ? getTemplatesForMode(generationMode) : []


    const pickerProduct = pickerProductId ? products.find(p => p.id === pickerProductId) : null
    const pickerImages: ProductImage[] = pickerImagesResp?.data ?? []

    const handleAttachToProduct = async () => {
        if (!generation?.id) return
        setAttachStatus('loading')
        setAttachMessage('')
        try {
            const resp = await decorativeAPI.attachToProduct(generation.id, selectedProductId)
            setAttachStatus('success')
            setAttachMessage(resp.data.message || 'تمت إضافة الصورة بنجاح')
        } catch (err: unknown) {
            setAttachStatus('error')
            const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
            setAttachMessage(msg || 'فشل إضافة الصورة للمنتج')
        }
    }

    return (
        <div className="decorative-page">
            <div className="decorative-header">
                <div className="decorative-title">
                    <Wand2 size={28} />
                    <h1>توليد صور ديكورية</h1>
                    <span className="mode-pill mode-pill--single">
                        <Box size={14} /> مشهد منتج واحد
                    </span>
                    <button className="btn-multi-product" onClick={onBackToChoose}>
                        <ArrowRight size={14} /> تغيير نوع المشهد
                    </button>
                </div>
                <p className="decorative-subtitle">
                    حوّل صور منتجاتك إلى تصاميم داخلية احترافية باستخدام الذكاء الاصطناعي
                </p>
            </div>

            <div className="wizard-steps">
                {[
                    { key: 'type_select', label: 'النوع', icon: LayoutGrid },
                    { key: 'source', label: 'الصورة', icon: ImageIcon },
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
                        <div className="wizard-step-icon">
                            <s.icon size={18} />
                        </div>
                        <span>{s.label}</span>
                    </div>
                ))}
            </div>

            <div className="decorative-content">
                {step === 'type_select' && (
                    <div className="step-panel">
                        <h2><LayoutGrid size={22} /> اختر نوع المنتج</h2>
                        <p>حدّد نوع المنتج مسبقاً لتحصل على أفضل نتائج من الذكاء الاصطناعي — يقلل هذا من أخطاء التصنيف التلقائي</p>

                        <div className="type-select-groups">
                            {PRODUCT_TYPE_GROUPS.map(group => (
                                <div key={group.groupLabel} className="type-category-group">
                                    <div className="type-category-label">{group.groupLabel}</div>
                                    <div className="type-cards-row">
                                        {group.types.map(pt => (
                                            <button
                                                key={pt.id}
                                                className={`type-card ${selectedProductTypeId === pt.id ? 'selected' : ''}`}
                                                onClick={() => {
                                                    setSelectedProductTypeId(pt.id)
                                                    setMaterialSubtypeHint(pt.subtype)
                                                    setGenerationModeHint(pt.mode)
                                                }}
                                            >
                                                <span className="type-card-emoji">{pt.emoji}</span>
                                                <span className="type-card-label-ar">{pt.labelAr}</span>
                                                <span className="type-card-label-en">{pt.labelEn}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="step-actions type-select-actions">
                            <button
                                className="btn-skip"
                                onClick={() => {
                                    setMaterialSubtypeHint('')
                                    setSelectedProductTypeId('')
                                    setSourceMode('choose')
                                    setPickerProductId(null)
                                    setPickerSearch('')
                                    setStep('source')
                                }}
                            >
                                تخطي — دع الذكاء الاصطناعي يختار
                            </button>
                            <button
                                className="btn-primary"
                                disabled={!selectedProductTypeId}
                                onClick={() => {
                                    setSourceMode('choose')
                                    setPickerProductId(null)
                                    setPickerSearch('')
                                    setStep('source')
                                }}
                            >
                                <ArrowLeft size={18} /> متابعة لرفع الصورة
                            </button>
                        </div>
                    </div>
                )}

                {step === 'source' && (
                    <div className="step-panel">
                        <h2>اختر صورة المنتج</h2>

                        {selectedProductType && (
                            <div className="preselected-type-badge">
                                <span className="preselected-type-emoji">{selectedProductType.emoji}</span>
                                <span>النوع المحدد: <strong>{selectedProductType.labelAr}</strong></span>
                                <button className="change-type-link" onClick={() => setStep('type_select')}>
                                    تغيير النوع
                                </button>
                            </div>
                        )}

                        {sourceMode === 'choose' && (
                            <div className="source-mode-cards">
                                <button
                                    className="source-mode-card"
                                    onClick={() => setSourceMode('upload')}
                                >
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
                                <button className="source-back-link" onClick={() => { setSourceMode('choose'); setImageUrl(''); setImagePreview('') }}>
                                    <ArrowRight size={14} /> تغيير طريقة الاختيار
                                </button>

                                <div
                                    className={`upload-dropzone ${isDragging ? 'dragging' : ''} ${imagePreview || imageUrl ? 'has-image' : ''}`}
                                    onDrop={handleDrop}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        onChange={handleFileInput}
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
                            <button
                                className="btn-secondary"
                                onClick={() => setStep('type_select')}
                            >
                                <ArrowRight size={18} /> تغيير النوع
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

                        {history.length > 0 && (
                            <div className="history-section">
                                <h3><Clock size={18} /> السجل الأخير</h3>
                                <div className="history-grid">
                                    {history.map(item => (
                                        <button
                                            key={item.id}
                                            className="history-card"
                                            onClick={() => handleSelectFromHistory(item)}
                                        >
                                            <img src={item.result_image_url || item.source_image_url} alt="" />
                                            <div className="history-card-info">
                                                <span className={`status-badge ${item.status}`}>
                                                    {item.status_display}
                                                </span>
                                                <span className="history-date">
                                                    {new Date(item.created_at).toLocaleDateString('ar-SA')}
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {step === 'analysis' && analysis && (
                    <div className="step-panel">
                        <h2>تحليل المنتج — راجع وعدّل</h2>
                        <p>الذكاء الاصطناعي حلّل صورتك. يمكنك تعديل أي قيمة غير صحيحة قبل المتابعة</p>

                        {selectedProductType && (
                            <div className="preselected-type-badge">
                                <span className="preselected-type-emoji">{selectedProductType.emoji}</span>
                                <span>النوع المحدد مسبقاً: <strong>{selectedProductType.labelAr}</strong></span>
                                <button className="change-type-link" onClick={() => setStep('type_select')}>
                                    تغيير
                                </button>
                            </div>
                        )}

                        <div className="analysis-mode-selector">
                            <label className="mode-select-label">وضع التوليد</label>
                            <div className="mode-select-cards">
                                {(['surface', 'product', 'showcase'] as GenerationMode[]).map(m => {
                                    const info = MODE_INFO[m]
                                    const Icon = info.icon
                                    return (
                                        <button
                                            key={m}
                                            className={`mode-select-card ${editMode === m ? 'selected ' + info.color : ''}`}
                                            onClick={() => {
                                                setEditMode(m)
                                                setGenerationMode(m)
                                                if (m === 'surface') {
                                                    setPlacement('main flooring feature')
                                                    setSpaceType(SURFACE_SPACE_TYPES[0])
                                                } else if (m === 'product') {
                                                    setPlacement('focal product')
                                                    const subtype = analysis?.material_subtype
                                                    const category = analysis?.product_category
                                                    if (subtype === 'indoor_furniture') setSpaceType(PRODUCT_SPACE_TYPES_INDOOR_FURNITURE[0])
                                                    else if (subtype === 'sanitary' || category === 'sanitary') setSpaceType(PRODUCT_SPACE_TYPES_SANITARY[0])
                                                    else if (subtype === 'outdoor_furniture' || category === 'outdoor') setSpaceType(PRODUCT_SPACE_TYPES_OUTDOOR[0])
                                                    else setSpaceType(PRODUCT_SPACE_TYPES_DEFAULT[0])
                                                } else {
                                                    setPlacement('center product')
                                                    setLighting(LIGHTING_OPTIONS.find(l => l.value === 'studio') || LIGHTING_OPTIONS[0])
                                                }
                                            }}
                                        >
                                            <Icon size={22} />
                                            <span className="mode-select-name">{info.label}</span>
                                            <span className="mode-select-desc">{info.desc}</span>
                                        </button>
                                    )
                                })}
                            </div>
                            <div className="analysis-hint">
                                💡 الموكيت (سجادة أرضية كاملة) = وضع الأسطح &nbsp;|&nbsp; السجادة المنفردة (على أرضية موجودة) = وضع المنتجات
                            </div>
                        </div>

                        <div className="analysis-layout analysis-layout-edit">
                            <div className="analysis-image">
                                <img src={generation?.source_image_url} alt="المنتج" />
                                <div className="analysis-ai-badge">🤖 تحليل AI</div>
                            </div>
                            <div className="analysis-editable">
                                <div className="editable-field">
                                    <label>اللون</label>
                                    <input
                                        className="form-input"
                                        value={editColor}
                                        onChange={e => setEditColor(e.target.value)}
                                        placeholder="مثال: أبيض رمادي، بيج دافئ..."
                                    />
                                </div>
                                <div className="editable-field">
                                    <label>النمط</label>
                                    <input
                                        className="form-input"
                                        value={editPattern}
                                        onChange={e => setEditPattern(e.target.value)}
                                        placeholder="مثال: هندسي، رخامي، سادة..."
                                    />
                                </div>
                                <div className="editable-field">
                                    <label>نوع السطح / المادة</label>
                                    <input
                                        className="form-input"
                                        value={editSurface}
                                        onChange={e => setEditSurface(e.target.value)}
                                        placeholder="مثال: بورسلين مصقول، رخام طبيعي..."
                                    />
                                </div>
                                <div className="editable-field">
                                    <label>الوصف الإنجليزي — يؤثر مباشرة على الصورة المولّدة</label>
                                    <textarea
                                        className="form-input form-textarea"
                                        value={editDescEn}
                                        onChange={e => setEditDescEn(e.target.value)}
                                        rows={3}
                                        dir="ltr"
                                        style={{ textAlign: 'left', fontFamily: 'monospace', fontSize: '13px' }}
                                        placeholder="e.g. large format white marble porcelain tile with gold veins..."
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="step-actions">
                            <button className="btn-secondary" onClick={() => setStep('source')}>
                                <ArrowRight size={18} /> العودة للصورة
                            </button>
                            <button className="btn-primary" onClick={() => setStep('settings')}>
                                <ArrowLeft size={18} /> متابعة للإعدادات
                            </button>
                        </div>
                    </div>
                )}

                {step === 'settings' && (
                    <div className="step-panel">
                        <h2>إعدادات التوليد</h2>
                        <p>
                            {generationMode === 'showcase'
                                ? 'اختر إعدادات التصوير الاحترافي'
                                : 'اختر نوع الفراغ وأسلوب التصميم'}
                        </p>

                        <div className={`mode-badge ${modeInfo.color} mode-badge-sm`}>
                            <ModeIcon size={16} />
                            <span>{modeInfo.label}</span>
                        </div>

                        <div className="settings-grid">
                            {generationMode !== 'showcase' && templates.length > 0 && (
                                <div className="setting-group">
                                    <label>قوالب جاهزة (اختياري)</label>
                                    <div className="templates-grid">
                                        {templates.map(t => (
                                            <button
                                                key={t.id}
                                                className={`template-card ${selectedTemplate === t.id ? 'selected' : ''}`}
                                                onClick={() => handleSelectTemplate(t)}
                                            >
                                                <span className="template-name">{t.name_ar}</span>
                                                <span className="template-name-en">{t.name_en}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {generationMode !== 'showcase' && (
                                <div className="setting-group">
                                    <label>نوع الفراغ</label>
                                    <div className="option-cards">
                                        {getSpaceTypeOptions().map(s => (
                                            <button
                                                key={s.value}
                                                className={`option-card ${spaceType.value === s.value ? 'selected' : ''}`}
                                                onClick={() => setSpaceType(s)}
                                            >
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {generationMode !== 'showcase' && (
                                <div className="setting-group">
                                    <label>أسلوب التصميم</label>
                                    <div className="option-cards">
                                        {DESIGN_STYLES.map(s => (
                                            <button
                                                key={s.value}
                                                className={`option-card ${designStyle.value === s.value ? 'selected' : ''}`}
                                                onClick={() => setDesignStyle(s)}
                                            >
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="setting-group">
                                <label>الإضاءة</label>
                                <div className="option-cards">
                                    {(generationMode === 'showcase'
                                        ? LIGHTING_OPTIONS.filter(l => ['studio', 'soft', 'natural'].includes(l.value))
                                        : LIGHTING_OPTIONS.filter(l => l.value !== 'studio')
                                    ).map(s => (
                                        <button
                                            key={s.value}
                                            className={`option-card ${lighting.value === s.value ? 'selected' : ''}`}
                                            onClick={() => setLighting(s)}
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {generationMode !== 'showcase' && (
                                <>
                                    <div className="setting-group">
                                        <label>زاوية الكاميرا</label>
                                        <div className="option-cards">
                                            {CAMERA_ANGLES.map(s => (
                                                <button
                                                    key={s.value}
                                                    className={`option-card ${cameraAngle.value === s.value ? 'selected' : ''}`}
                                                    onClick={() => setCameraAngle(s)}
                                                >
                                                    {s.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="setting-group">
                                        <label>المزاج</label>
                                        <div className="option-cards">
                                            {MOOD_OPTIONS.map(s => (
                                                <button
                                                    key={s.value}
                                                    className={`option-card ${mood.value === s.value ? 'selected' : ''}`}
                                                    onClick={() => setMood(s)}
                                                >
                                                    {s.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="setting-group">
                                <label>نسبة العرض إلى الارتفاع</label>
                                <div className="option-cards">
                                    {ASPECT_RATIOS.map(s => (
                                        <button
                                            key={s.value}
                                            className={`option-card ${aspectRatio === s.value ? 'selected' : ''}`}
                                            onClick={() => setAspectRatio(s.value)}
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="setting-group">
                                <label>جودة التوليد</label>
                                <div className="option-cards">
                                    {QUALITY_OPTIONS.map(s => (
                                        <button
                                            key={s.value}
                                            className={`option-card ${quality === s.value ? 'selected' : ''}`}
                                            onClick={() => setQuality(s.value)}
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="setting-group custom-notes-group">
                                <label>تعليمات إضافية للذكاء الاصطناعي (اختياري)</label>
                                <textarea
                                    className="form-input form-textarea"
                                    value={customPrompt}
                                    onChange={e => setCustomPrompt(e.target.value)}
                                    rows={3}
                                    placeholder="أضف توجيهات تفصيلية إضافية... مثال: add a large window with garden view, use herringbone pattern, warm gold accents..."
                                    dir="ltr"
                                    style={{ textAlign: 'left' }}
                                />
                            </div>
                        </div>

                        <div className="step-actions">
                            <button className="btn-secondary" onClick={() => setStep('analysis')}>
                                <ArrowRight size={18} /> العودة
                            </button>
                            <button
                                className="btn-primary"
                                onClick={() => setStep('confirm')}
                            >
                                <CheckCircle2 size={18} /> مراجعة قبل التوليد
                            </button>
                        </div>
                    </div>
                )}

                {step === 'confirm' && (
                    <div className="step-panel">
                        <h2>تأكيد قبل التوليد</h2>
                        <p>راجع الملخص أدناه — سيُستهلك رصيد واحد عند الضغط على "توليد الآن"</p>

                        <div className="confirm-layout">
                            <div className="confirm-image">
                                <img src={generation?.source_image_url} alt="المنتج" />
                                <div className={`mode-badge ${MODE_INFO[editMode].color} mode-badge-sm confirm-mode-badge`}>
                                    {(() => { const Icon = MODE_INFO[editMode].icon; return <Icon size={14} /> })()}
                                    <span>{MODE_INFO[editMode].label}</span>
                                </div>
                            </div>

                            <div className="confirm-details">
                                <div className="confirm-section">
                                    <h4>تحليل المنتج</h4>
                                    <div className="confirm-tags">
                                        {editColor && <span className="confirm-tag">🎨 {editColor}</span>}
                                        {editPattern && <span className="confirm-tag">📐 {editPattern}</span>}
                                        {editSurface && <span className="confirm-tag">🔲 {editSurface}</span>}
                                        {!editColor && !editPattern && !editSurface && (
                                            <span className="confirm-tag-empty">لا توجد تفاصيل إضافية</span>
                                        )}
                                    </div>
                                    {editDescEn && (
                                        <p className="confirm-desc-en">{editDescEn}</p>
                                    )}
                                </div>

                                {editMode !== 'showcase' && (
                                    <div className="confirm-section">
                                        <h4>إعدادات المشهد</h4>
                                        <div className="confirm-grid">
                                            <div className="confirm-item">
                                                <span className="confirm-item-label">الفراغ</span>
                                                <span className="confirm-item-value">{spaceType.label}</span>
                                            </div>
                                            <div className="confirm-item">
                                                <span className="confirm-item-label">الأسلوب</span>
                                                <span className="confirm-item-value">{designStyle.label}</span>
                                            </div>
                                            <div className="confirm-item">
                                                <span className="confirm-item-label">الإضاءة</span>
                                                <span className="confirm-item-value">{lighting.label}</span>
                                            </div>
                                            <div className="confirm-item">
                                                <span className="confirm-item-label">الكاميرا</span>
                                                <span className="confirm-item-value">{cameraAngle.label}</span>
                                            </div>
                                            <div className="confirm-item">
                                                <span className="confirm-item-label">المزاج</span>
                                                <span className="confirm-item-value">{mood.label}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="confirm-section">
                                    <h4>الجودة والنسبة</h4>
                                    <div className="confirm-tags">
                                        <span className="confirm-tag">
                                            {ASPECT_RATIOS.find(a => a.value === aspectRatio)?.label || aspectRatio}
                                        </span>
                                        <span className="confirm-tag">
                                            {QUALITY_OPTIONS.find(q => q.value === quality)?.label || quality}
                                        </span>
                                    </div>
                                </div>

                                {customPrompt && (
                                    <div className="confirm-section">
                                        <h4>تعليمات إضافية</h4>
                                        <p className="confirm-notes">{customPrompt}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="step-actions confirm-actions">
                            <button className="btn-secondary" onClick={() => setStep('settings')}>
                                <ArrowRight size={18} /> تعديل الإعدادات
                            </button>
                            <button
                                className="btn-generate"
                                onClick={handleGenerate}
                                disabled={generateMutation.isPending}
                            >
                                {generateMutation.isPending ? (
                                    <><Loader2 size={20} className="spin" /> جاري الإرسال...</>
                                ) : (
                                    <><Sparkles size={20} /> توليد الآن</>
                                )}
                            </button>
                        </div>

                        {generateMutation.isError && (
                            <div className="error-msg">
                                <XCircle size={16} />
                                فشل بدء التوليد. حاول مرة أخرى.
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
                            <h2>جاري توليد الصورة...</h2>
                            <p>
                                {generationMode === 'showcase'
                                    ? 'يتم إنشاء صورة المنتج الاحترافية'
                                    : generationMode === 'product'
                                        ? 'يتم دمج المنتج في المشهد'
                                        : 'يتم تركيب الخامة في التصميم الداخلي'}
                            </p>
                            <div className="generating-progress">
                                <div className="progress-bar">
                                    <div className="progress-fill" />
                                </div>
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
                                <h2>
                                    <CheckCircle2 size={22} className="text-success" />
                                    تم التوليد بنجاح!
                                </h2>

                                <div className="result-comparison">
                                    <div className="result-card">
                                        <h3>الصورة الأصلية</h3>
                                        <img src={generation.source_image_url} alt="الصورة المصدر" />
                                    </div>
                                    <div className="result-card result-generated">
                                        <h3>الصورة المولّدة</h3>
                                        <img src={generation.result_image_url} alt="الصورة المولّدة" />
                                    </div>
                                </div>

                                <div className="result-actions">
                                    <a
                                        href={generation.result_image_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn-primary"
                                    >
                                        <Download size={18} /> تحميل الصورة
                                    </a>
                                    {attachStatus !== 'success' && (
                                        <button
                                            className="btn-attach"
                                            onClick={handleAttachToProduct}
                                            disabled={attachStatus === 'loading' || (!selectedProductId && !generation.product)}
                                            title={(!selectedProductId && !generation.product) ? 'اختر منتجاً أولاً لإضافة الصورة إليه' : undefined}
                                        >
                                            {attachStatus === 'loading' ? (
                                                <><Loader2 size={18} className="spin" /> جاري الإضافة...</>
                                            ) : (
                                                <>📎 إضافة للمنتج</>
                                            )}
                                        </button>
                                    )}
                                    <button className="btn-secondary" onClick={() => {
                                        setStep('settings')
                                        setSelectedTemplate(null)
                                    }}>
                                        <RefreshCw size={18} /> توليد مرة أخرى
                                    </button>
                                    <button className="btn-secondary" onClick={handleStartOver}>
                                        <ArrowRight size={18} /> صورة جديدة
                                    </button>
                                </div>

                                {attachStatus === 'success' && (
                                    <div className="attach-success-msg">
                                        <CheckCircle2 size={16} />
                                        {attachMessage}
                                    </div>
                                )}
                                {attachStatus === 'error' && (
                                    <div className="error-msg">
                                        <XCircle size={16} />
                                        {attachMessage}
                                    </div>
                                )}

                                {generation.prompt_used && (
                                    <div className="prompt-display">
                                        <h4>البرومبت المُستخدم:</h4>
                                        <pre>{generation.prompt_used}</pre>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="error-result">
                                <XCircle size={48} className="text-error" />
                                <h2>فشل التوليد</h2>
                                <p>{generation.error_message || 'حدث خطأ غير متوقع'}</p>
                                <div className="result-actions">
                                    <button className="btn-primary" onClick={() => {
                                        setStep('settings')
                                        setSelectedTemplate(null)
                                    }}>
                                        <RefreshCw size={18} /> إعادة المحاولة
                                    </button>
                                    <button className="btn-secondary" onClick={handleStartOver}>
                                        <ArrowRight size={18} /> صورة جديدة
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

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
                                <div ref={pickerGridRef} className="picker-products-grid picker-modal-grid" style={{ maxHeight: 420, overflowY: 'auto' }}>
                                    {productsFetching && !isFetchingNextPage && (
                                        <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'center', padding: 24 }}>
                                            <Loader2 size={24} className="spin" />
                                        </div>
                                    )}
                                    {products.map(p => {
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
                                    {isFetchingNextPage && (
                                        <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'center', padding: 16 }}>
                                            <Loader2 size={20} className="spin" />
                                        </div>
                                    )}
                                    {!productsFetching && products.length === 0 && (
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
