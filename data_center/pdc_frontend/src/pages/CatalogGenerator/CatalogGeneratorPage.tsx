/**
 * CatalogGeneratorPage — توليد كتالوج PDF ديناميكي
 * تخطيط: لوحة إعدادات يسار + معاينة فورية يمين
 */
import { useState, useMemo, useRef, useCallback } from 'react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { useQuery } from '@tanstack/react-query'
import {
    BookOpen, Search, CheckSquare, Square, Settings2,
    Download, Package, CheckCircle2, GripVertical, X,
    ChevronDown, ChevronUp, LayoutGrid, List, QrCode,
    FileImage, SplitSquareHorizontal,
} from 'lucide-react'
import { productsAPI, categoriesAPI } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import type { Product, CategoryFlat } from '@/types'
import CatalogPreview from './CatalogPreview'

/* ── خيارات التصميم ──────────────────────────────────── */
export interface CatalogSettings {
    companyName: string
    catalogTitle: string
    catalogSubtitle: string
    showPrice: boolean
    showSku: boolean
    showSpecs: boolean
    showDescription: boolean
    showImages: boolean
    columns: 1 | 2 | 3 | 4
    layout: 'grid' | 'list'
    theme: 'gold' | 'blue' | 'green' | 'dark' | 'burgundy' | 'teal' | 'charcoal' | 'rose'
    showHeader: boolean
    showFooter: boolean
    footerText: string
    groupByCategory: boolean
    groupByBrand: boolean
    showCoverPage: boolean
    coverImageUrl: string
    showQrCode: boolean
    qrBaseUrl: string
    storeUrl: string
    showStoreButton: boolean
    clientName: string
    language: 'ar' | 'en'
    pdfOrientation: 'portrait' | 'landscape'
}

const DEFAULT_SETTINGS: CatalogSettings = {
    companyName: 'بيت الإباء',
    catalogTitle: 'كتالوج المنتجات',
    catalogSubtitle: 'Product Data Center',
    showPrice: true,
    showSku: true,
    showSpecs: true,
    showDescription: false,
    showImages: true,
    columns: 3,
    layout: 'grid',
    theme: 'gold',
    showHeader: true,
    showFooter: true,
    footerText: 'جميع الحقوق محفوظة © بيت الإباء',
    groupByCategory: false,
    groupByBrand: false,
    showCoverPage: false,
    coverImageUrl: '',
    showQrCode: false,
    qrBaseUrl: window.location.origin + '/products/',
    storeUrl: 'https://baytalebaa.com',
    showStoreButton: false,
    clientName: '',
    language: 'ar',
    pdfOrientation: 'portrait',
}

const THEMES = {
    gold:     { label: 'ذهبي',     primary: '#C8A84B', dark: '#1a2636' },
    blue:     { label: 'أزرق',     primary: '#3B82F6', dark: '#1e3a5f' },
    green:    { label: 'أخضر',     primary: '#10B981', dark: '#064e3b' },
    dark:     { label: 'داكن',     primary: '#6366F1', dark: '#1e1b4b' },
    burgundy: { label: 'عنابي',    primary: '#9B1B30', dark: '#2d0a10' },
    teal:     { label: 'تركوازي',  primary: '#0D9488', dark: '#042f2e' },
    charcoal: { label: 'فحمي',     primary: '#71717A', dark: '#18181b' },
    rose:     { label: 'وردي',     primary: '#E11D48', dark: '#4c0519' },
}

/* ── Toggle صغير ── */
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!value)}
            style={{
                width: 40, height: 22, borderRadius: 11, border: 'none',
                background: value ? 'var(--color-gold)' : 'var(--color-border-strong)',
                cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0,
            }}
        >
            <div style={{
                width: 16, height: 16, borderRadius: '50%', background: 'white',
                position: 'absolute', top: 3,
                right: value ? 20 : 3,
                transition: 'right .2s',
            }} />
        </button>
    )
}

/* ── قسم قابل للطي ── */
function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div style={{ marginBottom: 16 }}>
            <button
                onClick={() => setOpen(p => !p)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '6px 0', marginBottom: open ? 10 : 0,
                }}
            >
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {title}
                </span>
                {open ? <ChevronUp size={14} color="var(--color-text-muted)" /> : <ChevronDown size={14} color="var(--color-text-muted)" />}
            </button>
            {open && children}
        </div>
    )
}

/* ══════════════════════════════════════════════
   الصفحة الرئيسية
══════════════════════════════════════════════ */
export default function CatalogGeneratorPage() {
    const { user } = useAuthStore()
    const isDeptManager = user?.role === 'مدير_قسم'

    /* الحالة */
    const [leftTab, setLeftTab] = useState<'products' | 'design'>('products')
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
    const [orderedIds, setOrderedIds] = useState<number[]>([])
    const [settings, setSettings] = useState<CatalogSettings>(DEFAULT_SETTINGS)
    const [search, setSearch] = useState('')
    const [catFilter, setCatFilter] = useState<string>('')
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
    const dragItem = useRef<number | null>(null)
    const dragOver = useRef<number | null>(null)

    const setSetting = <K extends keyof CatalogSettings>(k: K, v: CatalogSettings[K]) =>
        setSettings(s => {
            const next = { ...s, [k]: v }
            if (k === 'groupByBrand' && v === true) next.groupByCategory = false
            if (k === 'groupByCategory' && v === true) next.groupByBrand = false
            return next
        })

    /* ── جلب البيانات ──
       Note: we intentionally DO NOT filter by status here. The catalog
       generator is an internal tool — the user picks which products to
       include — so we surface every product (نشط/مسودة/قيد_المراجعة/…)
       and let selection drive what ends up in the PDF. We also use the
       flat category endpoint to get breadcrumb paths + parent links so
       we can show a hierarchical dropdown and cascade-filter by subtree. */
    const { data: productsData, isLoading } = useQuery({
        queryKey: ['catalog-products'],
        queryFn: () => productsAPI.list({ page_size: 2000 }).then(r => r.data),
    })
    const { data: categoriesData } = useQuery({
        queryKey: ['categories', 'flat'],
        queryFn: () => categoriesAPI.flat().then(r => r.data),
    })

    /* Flat categories list (CategoryFlat[]) — has path_ar, parent, has_products. */
    const flatCategories: CategoryFlat[] = useMemo(
        () => (Array.isArray(categoriesData) ? categoriesData : []) as CategoryFlat[],
        [categoriesData],
    )
    const allProducts: Product[] = useMemo(() => productsData?.results ?? [], [productsData])

    /* Build parent → all-descendants map (includes self) so picking a root
       category cascades to every leaf below it. Without this, selecting
       a root returned zero products because products live on deep subs. */
    const descendantsByCategory = useMemo(() => {
        const childrenOf = new Map<number, number[]>()
        for (const c of flatCategories) {
            if (c.parent != null) {
                const arr = childrenOf.get(c.parent) ?? []
                arr.push(c.id)
                childrenOf.set(c.parent, arr)
            }
        }
        const map = new Map<number, Set<number>>()
        const collect = (rootId: number): Set<number> => {
            const acc = new Set<number>([rootId])
            const stack = [rootId]
            while (stack.length) {
                const cur = stack.pop()!
                for (const child of childrenOf.get(cur) ?? []) {
                    if (!acc.has(child)) {
                        acc.add(child)
                        stack.push(child)
                    }
                }
            }
            return acc
        }
        for (const c of flatCategories) map.set(c.id, collect(c.id))
        return map
    }, [flatCategories])

    /* Categories shown in the dropdown — only those that actually contain
       products (directly or via descendants). Avoids drowning the user in
       1.4k empty branches. Sorted for display: level (roots first), then
       breadcrumb path. */
    const dropdownCategories: CategoryFlat[] = useMemo(() => {
        return flatCategories
            .filter(c => c.has_products)
            .sort((a, b) => {
                if (a.level !== b.level) return a.level - b.level
                return (a.path_ar || a.name_ar).localeCompare(b.path_ar || b.name_ar, 'ar')
            })
    }, [flatCategories])

    /* ── فلترة ── */
    const filtered = useMemo(() => {
        let list = allProducts
        if (catFilter) {
            const allowed = descendantsByCategory.get(Number(catFilter)) ?? new Set<number>([Number(catFilter)])
            list = list.filter(p => p.category != null && allowed.has(Number(p.category)))
        }
        if (search.trim()) {
            const q = search.trim().toLowerCase()
            list = list.filter(p =>
                p.product_name_ar?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)
            )
        }
        return list
    }, [allProducts, catFilter, search, descendantsByCategory])

    /* ── المنتجات المختارة بترتيبها (مع إزالة المكررات) ── */
    const selectedProducts = useMemo(() => {
        const seen = new Set<number>()
        return orderedIds
            .filter(id => { if (seen.has(id)) return false; seen.add(id); return true })
            .map(id => allProducts.find(p => p.id === id))
            .filter(Boolean) as Product[]
    }, [orderedIds, allProducts])

    /* ── تحديد/إلغاء منتج ── */
    const toggleProduct = useCallback((id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
        setOrderedIds(prev => {
            if (prev.includes(id)) return prev.filter(x => x !== id)
            return [...prev, id]
        })
    }, [])

    /* ── تحديد الكل ── */
    const allFilteredSelected = filtered.length > 0 && filtered.every(p => selectedIds.has(p.id))
    const toggleAll = useCallback(() => {
        if (allFilteredSelected) {
            const removeSet = new Set(filtered.map(p => p.id))
            setSelectedIds(prev => {
                const next = new Set(prev)
                removeSet.forEach(id => next.delete(id))
                return next
            })
            setOrderedIds(prev => prev.filter(id => !removeSet.has(id)))
        } else {
            setSelectedIds(prev => {
                const next = new Set(prev)
                filtered.forEach(p => next.add(p.id))
                return next
            })
            setOrderedIds(prev => {
                const existing = new Set(prev)
                const toAdd = filtered.filter(p => !existing.has(p.id)).map(p => p.id)
                return [...prev, ...toAdd]
            })
        }
    }, [allFilteredSelected, filtered])

    /* ── Drag to reorder ── */
    const handleDragStart = (idx: number) => { dragItem.current = idx }
    const handleDragEnter = (idx: number) => { dragOver.current = idx }
    const handleDragEnd = () => {
        if (dragItem.current === null || dragOver.current === null) return
        const arr = [...orderedIds]
        const [removed] = arr.splice(dragItem.current, 1)
        arr.splice(dragOver.current, 0, removed)
        setOrderedIds(arr)
        dragItem.current = null
        dragOver.current = null
    }

    /* ── توليد PDF احترافي ── */
    async function handlePrint() {
        const el = document.getElementById('catalog-print-root')
        if (!el || isGeneratingPdf) return
        setIsGeneratingPdf(true)
        try {
            /* ① انتظر تحميل الخطوط كاملاً */
            await document.fonts.ready

            /* ② قياس مواضع البطاقات والروابط بعد إخفاء no-print مؤقتاً
               (html2canvas يخفيها أيضاً ← يجب أن تتطابق القياسات) */
            const noPrintEls = Array.from(el.querySelectorAll('.no-print')) as HTMLElement[]
            const savedDisplays = noPrintEls.map(n => n.style.display)
            noPrintEls.forEach(n => { n.style.display = 'none' })
            await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))

            const rootRect = el.getBoundingClientRect()

            // نهايات صفوف البطاقات (لفواصل الصفحات الذكية)
            const cardBreakSet = new Set<number>()
            el.querySelectorAll('.catalog-card').forEach(card => {
                const r = card.getBoundingClientRect()
                const bottom = Math.round(r.bottom - rootRect.top)
                if (bottom > 0) cardBreakSet.add(bottom)
            })
            const cardBreaks = Array.from(cardBreakSet).sort((a, b) => a - b)

            // مواضع أزرار المتجر (لإضافة روابط قابلة للنقر في الـ PDF)
            type LinkData = { url: string; topCss: number; leftCss: number; w: number; h: number }
            const pdfLinks: LinkData[] = []
            el.querySelectorAll('.catalog-card a[href]').forEach(a => {
                const anchor = a as HTMLAnchorElement
                if (!anchor.href || anchor.href.startsWith('#')) return
                const r = anchor.getBoundingClientRect()
                pdfLinks.push({
                    url: anchor.href,
                    topCss: r.top - rootRect.top,
                    leftCss: r.left - rootRect.left,
                    w: r.width,
                    h: r.height,
                })
            })

            // أعد عناصر no-print كما كانت
            noPrintEls.forEach((n, i) => { n.style.display = savedDisplays[i] })

            /* ③ جلب الصور مسبقاً كـ data URL عبر بروكسي الـ backend (لحل CORS مع R2) */
            const imgDataMap = new Map<string, string>()
            const toProxyUrl = (src: string) =>
                src.includes('r2.dev')
                    ? `/api/proxy-image/?url=${encodeURIComponent(src)}`
                    : src
            await Promise.allSettled(
                Array.from(el.querySelectorAll('img')).map(async (imgEl) => {
                    const src = (imgEl as HTMLImageElement).src
                    if (!src || src.startsWith('data:') || src.startsWith('blob:')) return
                    try {
                        const res = await fetch(toProxyUrl(src))
                        if (!res.ok) return
                        const blob = await res.blob()
                        await new Promise<void>((resolve) => {
                            const reader = new FileReader()
                            reader.onload = () => {
                                imgDataMap.set(src, reader.result as string)
                                resolve()
                            }
                            reader.onerror = () => resolve()
                            reader.readAsDataURL(blob)
                        })
                    } catch { /* تجاهل الصور الفاشلة */ }
                })
            )

            /* ④ رسم الكتالوج كاملاً على كانفاس بدقة عالية */
            const SCALE = 2
            const canvas = await html2canvas(el, {
                scale: SCALE,
                useCORS: true,
                allowTaint: false,
                backgroundColor: '#ffffff',
                logging: false,
                imageTimeout: 20000,
                onclone: (doc) => {
                    doc.querySelectorAll('.no-print').forEach(n => {
                        (n as HTMLElement).style.display = 'none'
                    })
                    doc.querySelectorAll('img').forEach((img) => {
                        const dataUrl = imgDataMap.get((img as HTMLImageElement).src)
                        if (dataUrl) (img as HTMLImageElement).src = dataUrl
                    })
                },
            })

            /* ⑤ حساب أبعاد الصفحات — كل صفحة A4 كاملة، لا تقطيع للبطاقات */
            const isLandscape = settings.pdfOrientation === 'landscape'
            const PDF_W  = isLandscape ? 297 : 210         // عرض الصفحة بالـ mm
            const PDF_H  = isLandscape ? 210 : 297         // ارتفاع A4 بالـ mm
            const canvasW = canvas.width
            const canvasH = canvas.height
            // ارتفاع A4 بالـ canvas pixels
            const a4HeightCanvas = Math.round(canvasW * PDF_H / PDF_W)
            const a4HeightCss = a4HeightCanvas / SCALE
            const totalCssH = canvasH / SCALE

            /*
             * كل slice تحتوي على:
             *   topPx         — بداية المحتوى في الكانفاس
             *   contentHeightPx — ارتفاع المحتوى الفعلي
             *   pageHeightPx  — ارتفاع الصفحة في الـ PDF (دائماً A4 أو أكثر)
             */
            type Slice = { topPx: number; contentHeightPx: number; pageHeightPx: number }
            const slices: Slice[] = []
            let pageCssTop = 0

            while (pageCssTop < totalCssH) {
                const maxCssBottom = pageCssTop + a4HeightCss
                const isLastChunk = maxCssBottom >= totalCssH

                if (isLastChunk) {
                    /* الشريحة الأخيرة: كل المحتوى المتبقي بما فيه الفوتر، محشوة لـ A4 */
                    const contentHeightPx = Math.round((totalCssH - pageCssTop) * SCALE)
                    const pageHeightPx = Math.max(contentHeightPx, a4HeightCanvas)
                    if (contentHeightPx > 0) slices.push({ topPx: Math.round(pageCssTop * SCALE), contentHeightPx, pageHeightPx })
                    break
                }

                /*
                 * ابحث عن آخر نهاية صف بطاقات داخل الصفحة.
                 * للـ landscape: الصفحة أقصر → قد لا يوجد فاصل داخلها؛
                 *   نمتد للأمام بمقدار ارتفاع الصفحة كاملاً لإيجاد
                 *   نهاية الصف التالي وتضمينه بدلاً من التقطيع.
                 * للـ portrait: تسامح 5px فقط للـ sub-pixel.
                 */
                const fwdTolerance = isLandscape ? Math.round(a4HeightCss) : 5
                let breakCss = maxCssBottom  // افتراضي: اقطع عند حد A4
                for (let i = cardBreaks.length - 1; i >= 0; i--) {
                    const b = cardBreaks[i]
                    if (b > pageCssTop + a4HeightCss * 0.2 && b <= maxCssBottom + fwdTolerance) {
                        breakCss = b  // للـ landscape: نسمح بتجاوز maxCssBottom
                        break
                    }
                }

                const topPx = Math.round(pageCssTop * SCALE)
                const contentHeightPx = Math.round((breakCss - pageCssTop) * SCALE)
                /*
                 * للـ portrait: الصفحة دائماً a4HeightCanvas (ثابت) → محتوى أعلاها + أبيض أسفلها
                 * للـ landscape: الصفحة = ارتفاع المحتوى الفعلي (متغير حسب الصف)
                 *   ← دائماً أوسع من ارتفاعها لأن صف البطاقات < عرض الصفحة (297mm)
                 */
                const pageHeightPx = isLandscape ? contentHeightPx : a4HeightCanvas
                if (contentHeightPx > 0) slices.push({ topPx, contentHeightPx, pageHeightPx })
                pageCssTop = breakCss
            }

            /* ⑥ بناء PDF — كل صفحة 297mm مع محتوى أعلاها وأبيض أسفلها */
            const cssToMm = (css: number) => css * PDF_W * SCALE / canvasW

            let pdf: jsPDF | null = null
            slices.forEach(({ topPx, contentHeightPx, pageHeightPx }, idx) => {
                const heightMm = pageHeightPx * PDF_W / canvasW
                const pageTopCss = topPx / SCALE
                const contentBottomCss = (topPx + contentHeightPx) / SCALE

                /* رسم الشريحة: خلفية بيضاء + محتوى الكتالوج */
                const sliceCanvas = document.createElement('canvas')
                sliceCanvas.width = canvasW
                sliceCanvas.height = pageHeightPx
                const ctx = sliceCanvas.getContext('2d')!
                ctx.fillStyle = '#ffffff'
                ctx.fillRect(0, 0, canvasW, pageHeightPx)
                ctx.drawImage(canvas, 0, topPx, canvasW, contentHeightPx, 0, 0, canvasW, contentHeightPx)
                const imgData = sliceCanvas.toDataURL('image/jpeg', 0.95)

                if (idx === 0) {
                    pdf = new jsPDF({ orientation: settings.pdfOrientation, unit: 'mm', format: [PDF_W, heightMm] })
                } else {
                    pdf!.addPage([PDF_W, heightMm])
                }
                pdf!.addImage(imgData, 'JPEG', 0, 0, PDF_W, heightMm)

                /* روابط قابلة للنقر لأزرار المتجر في هذه الصفحة */
                pdfLinks.forEach(link => {
                    const linkBottom = link.topCss + link.h
                    if (link.topCss >= pageTopCss - 2 && linkBottom <= contentBottomCss + 2) {
                        pdf!.link(
                            cssToMm(link.leftCss),
                            cssToMm(link.topCss - pageTopCss),
                            cssToMm(link.w),
                            cssToMm(link.h),
                            { url: link.url }
                        )
                    }
                })
            })

            /* ⑦ حفظ الملف */
            const filename = `${settings.catalogTitle || 'كتالوج'} — ${settings.companyName || 'بيت الإباء'}.pdf`
                .replace(/[/\\:*?"<>|]/g, '-')
            pdf!.save(filename)
        } catch (err) {
            console.error('PDF generation failed:', err)
            alert('حدث خطأ أثناء إنشاء PDF، يرجى المحاولة مجدداً')
        } finally {
            setIsGeneratingPdf(false)
        }
    }

    /* ════════════════════════ RENDER ════════════════════════ */
    return (
        <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>

            {/* ── رأس الصفحة ── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 20px', borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-surface)', flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: 9,
                        background: 'rgba(200,168,75,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <BookOpen size={18} color="var(--color-gold)" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>توليد الكتالوج</h1>
                        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>
                            {selectedIds.size} منتج مختار
                        </p>
                    </div>
                </div>
                <button
                    onClick={handlePrint}
                    disabled={selectedIds.size === 0 || isGeneratingPdf}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '9px 20px', borderRadius: 10, border: 'none',
                        cursor: (selectedIds.size === 0 || isGeneratingPdf) ? 'not-allowed' : 'pointer',
                        background: (selectedIds.size > 0 && !isGeneratingPdf) ? 'var(--color-gold)' : 'var(--color-border-strong)',
                        color: (selectedIds.size > 0 && !isGeneratingPdf) ? '#000' : 'var(--color-text-muted)',
                        fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
                        transition: 'all .2s', minWidth: 180, justifyContent: 'center',
                    }}
                >
                    {isGeneratingPdf ? (
                        <>
                            <span style={{
                                width: 14, height: 14, border: '2px solid currentColor',
                                borderTopColor: 'transparent', borderRadius: '50%',
                                display: 'inline-block', animation: 'spin 0.7s linear infinite',
                            }} />
                            جاري إنشاء PDF...
                        </>
                    ) : (
                        <>
                            <Download size={15} />
                            تحميل PDF
                        </>
                    )}
                </button>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>

            {/* ── التخطيط الرئيسي ── */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* ══ اللوحة اليسرى ══ */}
                <div style={{
                    width: 340, flexShrink: 0,
                    borderLeft: '1px solid var(--color-border)',
                    display: 'flex', flexDirection: 'column',
                    background: 'var(--color-surface)',
                    overflow: 'hidden',
                }}>
                    {/* تبويبات */}
                    <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
                        {([
                            { key: 'products', label: 'المنتجات', icon: <Package size={14} /> },
                            { key: 'design',   label: 'التصميم',  icon: <Settings2 size={14} /> },
                        ] as const).map(({ key, label, icon }) => (
                            <button
                                key={key}
                                onClick={() => setLeftTab(key)}
                                style={{
                                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    padding: '11px 8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                    background: leftTab === key ? 'var(--color-surface-raised)' : 'transparent',
                                    color: leftTab === key ? 'var(--color-gold)' : 'var(--color-text-muted)',
                                    fontWeight: leftTab === key ? 700 : 400, fontSize: 13,
                                    borderBottom: leftTab === key ? '2px solid var(--color-gold)' : '2px solid transparent',
                                    transition: 'all .15s',
                                }}
                            >
                                {icon} {label}
                            </button>
                        ))}
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px' }}>

                        {/* ────── تبويب المنتجات ────── */}
                        {leftTab === 'products' && (
                            <div>
                                {/* بحث + فلتر */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                                    <div style={{ position: 'relative' }}>
                                        <Search size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
                                        <input
                                            value={search}
                                            onChange={e => setSearch(e.target.value)}
                                            placeholder="بحث..."
                                            style={{
                                                width: '100%', padding: '8px 30px 8px 10px',
                                                background: 'var(--color-surface-raised)', border: '1px solid var(--color-border-strong)',
                                                borderRadius: 8, color: 'var(--color-text-primary)', fontSize: 12, boxSizing: 'border-box',
                                            }}
                                        />
                                    </div>
                                    {!isDeptManager && (
                                        <select
                                            value={catFilter}
                                            onChange={e => setCatFilter(e.target.value)}
                                            style={{
                                                width: '100%', padding: '8px 10px',
                                                background: 'var(--color-surface-raised)', border: '1px solid var(--color-border-strong)',
                                                borderRadius: 8, color: 'var(--color-text-primary)', fontSize: 12, boxSizing: 'border-box',
                                            }}
                                        >
                                            <option value="">كل الأقسام</option>
                                            {dropdownCategories.map(c => (
                                                <option key={c.id} value={String(c.id)}>
                                                    {c.path_ar || c.name_ar}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    <button
                                        onClick={toggleAll}
                                        style={{
                                            padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
                                            background: allFilteredSelected ? 'rgba(16,185,129,0.1)' : 'rgba(200,168,75,0.08)',
                                            border: `1px solid ${allFilteredSelected ? '#10B981' : 'var(--color-gold)'}40`,
                                            color: allFilteredSelected ? '#10B981' : 'var(--color-gold)',
                                            fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                                            width: '100%', justifyContent: 'center', fontFamily: 'inherit',
                                        }}
                                    >
                                        {allFilteredSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                                        {allFilteredSelected ? 'إلغاء تحديد الظاهرين' : `تحديد الكل (${filtered.length})`}
                                    </button>
                                </div>

                                {/* قائمة المنتجات */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflowY: 'auto', marginBottom: 16 }}>
                                    {isLoading ? (
                                        [...Array(6)].map((_, i) => (
                                            <div key={i} className="skeleton" style={{ height: 52, borderRadius: 8 }} />
                                        ))
                                    ) : filtered.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 20, color: 'var(--color-text-muted)', fontSize: 12 }}>
                                            لا توجد منتجات
                                        </div>
                                    ) : filtered.map(p => {
                                        const selected = selectedIds.has(p.id)
                                        return (
                                            <div
                                                key={p.id}
                                                onClick={() => toggleProduct(p.id)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 8,
                                                    padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                                                    background: selected ? 'rgba(200,168,75,0.1)' : 'var(--color-surface-raised)',
                                                    border: `1px solid ${selected ? 'rgba(200,168,75,0.4)' : 'var(--color-border)'}`,
                                                    transition: 'all .12s',
                                                }}
                                            >
                                                <div style={{
                                                    width: 34, height: 34, borderRadius: 6, flexShrink: 0,
                                                    overflow: 'hidden', background: 'var(--color-surface)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    {p.main_image_url
                                                        ? <img src={p.main_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        : <Package size={14} color="var(--color-text-muted)" />
                                                    }
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {p.product_name_ar}
                                                    </div>
                                                    <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{p.sku}</div>
                                                </div>
                                                <div style={{
                                                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                                                    background: selected ? 'var(--color-gold)' : 'var(--color-surface-hover)',
                                                    border: `1px solid ${selected ? 'var(--color-gold)' : 'var(--color-border-strong)'}`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    {selected && <CheckCircle2 size={11} color="#000" strokeWidth={3} />}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* المنتجات المختارة — مع سحب لإعادة الترتيب */}
                                {orderedIds.length > 0 && (
                                    <div>
                                        <div style={{
                                            fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)',
                                            marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
                                            textTransform: 'uppercase', letterSpacing: 0.5,
                                        }}>
                                            <SplitSquareHorizontal size={12} />
                                            الترتيب في الكتالوج ({orderedIds.length})
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {orderedIds.map((id, idx) => {
                                                const p = allProducts.find(x => x.id === id)
                                                if (!p) return null
                                                return (
                                                    <div
                                                        key={id}
                                                        draggable
                                                        onDragStart={() => handleDragStart(idx)}
                                                        onDragEnter={() => handleDragEnter(idx)}
                                                        onDragEnd={handleDragEnd}
                                                        onDragOver={e => e.preventDefault()}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 6,
                                                            padding: '5px 8px', borderRadius: 7,
                                                            background: 'var(--color-surface-raised)',
                                                            border: '1px solid var(--color-border)',
                                                            cursor: 'grab',
                                                        }}
                                                    >
                                                        <GripVertical size={13} color="var(--color-text-muted)" style={{ flexShrink: 0 }} />
                                                        <span style={{ fontSize: 10, color: 'var(--color-gold)', fontWeight: 700, width: 18, flexShrink: 0 }}>
                                                            {String(idx + 1).padStart(2, '0')}
                                                        </span>
                                                        {p.main_image_url && (
                                                            <img src={p.main_image_url} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                                                        )}
                                                        <span style={{ flex: 1, fontSize: 11, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {p.product_name_ar}
                                                        </span>
                                                        <button
                                                            onClick={e => { e.stopPropagation(); toggleProduct(id) }}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0, display: 'flex' }}
                                                        >
                                                            <X size={12} color="var(--color-text-muted)" />
                                                        </button>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ────── تبويب التصميم ────── */}
                        {leftTab === 'design' && (
                            <div>
                                {/* معلومات الكتالوج (ثابتة) */}
                                <Section title="معلومات الكتالوج">
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {([
                                            ['اسم الشركة', settings.companyName],
                                            ['عنوان الكتالوج', settings.catalogTitle],
                                            ['العنوان الفرعي', settings.catalogSubtitle],
                                            ['التذييل', settings.footerText],
                                        ] as const).map(([label, value]) => (
                                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{label}</span>
                                                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 600 }}>{value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </Section>

                                {/* خيارات مخصصة */}
                                <Section title="خيارات مخصصة">
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <div>
                                            <label style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
                                                كتالوج خاص لـ (شركة / عميل)
                                            </label>
                                            <input
                                                value={settings.clientName}
                                                onChange={e => setSetting('clientName', e.target.value)}
                                                placeholder="مثال: شركة المقاولات المتحدة"
                                                style={{
                                                    width: '100%', padding: '7px 10px', boxSizing: 'border-box',
                                                    background: 'var(--color-surface-raised)', border: '1px solid var(--color-border-strong)',
                                                    borderRadius: 7, color: 'var(--color-text-primary)', fontSize: 12,
                                                }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>المتجر الإلكتروني</span>
                                            <span style={{ fontSize: 11, color: 'var(--color-gold)', fontWeight: 600, direction: 'ltr' }}>
                                                baytalebaa.com
                                            </span>
                                        </div>
                                    </div>
                                </Section>

                                {/* صفحة الغلاف */}
                                <Section title="صفحة الغلاف" defaultOpen={false}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <FileImage size={13} /> إظهار صفحة غلاف
                                        </span>
                                        <Toggle value={settings.showCoverPage} onChange={v => setSetting('showCoverPage', v)} />
                                    </div>
                                    {settings.showCoverPage && (
                                        <div>
                                            <label style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>رابط صورة الغلاف (اختياري)</label>
                                            <input
                                                value={settings.coverImageUrl}
                                                onChange={e => setSetting('coverImageUrl', e.target.value)}
                                                placeholder="https://..."
                                                style={{
                                                    width: '100%', padding: '7px 10px', boxSizing: 'border-box',
                                                    background: 'var(--color-surface-raised)', border: '1px solid var(--color-border-strong)',
                                                    borderRadius: 7, color: 'var(--color-text-primary)', fontSize: 12,
                                                }}
                                            />
                                        </div>
                                    )}
                                </Section>

                                {/* التخطيط */}
                                <Section title="التخطيط">
                                    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                                        {([
                                            { v: 'grid', label: 'شبكة', icon: <LayoutGrid size={13} /> },
                                            { v: 'list', label: 'قائمة', icon: <List size={13} /> },
                                        ] as const).map(({ v, label, icon }) => (
                                            <button key={v} onClick={() => setSetting('layout', v)} style={{
                                                flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                                                background: settings.layout === v ? 'rgba(200,168,75,0.15)' : 'var(--color-surface-raised)',
                                                border: `1px solid ${settings.layout === v ? 'var(--color-gold)' : 'var(--color-border-strong)'}`,
                                                color: settings.layout === v ? 'var(--color-gold)' : 'var(--color-text-muted)',
                                                fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                            }}>
                                                {icon} {label}
                                            </button>
                                        ))}
                                    </div>
                                    {settings.layout === 'grid' && (
                                        <div>
                                            <label style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'block', marginBottom: 6 }}>عدد الأعمدة</label>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                {([1, 2, 3, 4] as const).map(n => (
                                                    <button key={n} onClick={() => setSetting('columns', n)} style={{
                                                        flex: 1, padding: '7px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
                                                        background: settings.columns === n ? 'rgba(200,168,75,0.15)' : 'var(--color-surface-raised)',
                                                        border: `1px solid ${settings.columns === n ? 'var(--color-gold)' : 'var(--color-border-strong)'}`,
                                                        color: settings.columns === n ? 'var(--color-gold)' : 'var(--color-text-muted)',
                                                        fontSize: 12, fontWeight: 600,
                                                    }}>{n}</button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </Section>

                                {/* لغة الكتالوج */}
                                <Section title="لغة الكتالوج">
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {([
                                            { val: 'ar', label: 'عربي بالكامل', sub: 'أسماء المواصفات بالعربية' },
                                            { val: 'en', label: 'English Only', sub: 'Specs in English' },
                                        ] as const).map(({ val, label, sub }) => (
                                            <button
                                                key={val}
                                                onClick={() => setSetting('language', val)}
                                                style={{
                                                    flex: 1, padding: '8px 6px', borderRadius: 8, cursor: 'pointer',
                                                    fontFamily: 'inherit', textAlign: 'center', border: '1px solid',
                                                    borderColor: settings.language === val ? 'var(--color-gold)' : 'var(--color-border-strong)',
                                                    background: settings.language === val ? 'rgba(200,168,75,0.12)' : 'var(--color-surface-raised)',
                                                    color: settings.language === val ? 'var(--color-gold)' : 'var(--color-text-muted)',
                                                    transition: 'all .15s',
                                                }}
                                            >
                                                <div style={{ fontSize: 12, fontWeight: 700 }}>{label}</div>
                                                <div style={{ fontSize: 10, marginTop: 2, opacity: 0.75 }}>{sub}</div>
                                            </button>
                                        ))}
                                    </div>
                                </Section>

                                {/* اتجاه PDF */}
                                <Section title="اتجاه PDF">
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {([
                                            { val: 'portrait',  labelAr: 'عمودي',  labelEn: 'Portrait',  icon: '▯' },
                                            { val: 'landscape', labelAr: 'أفقي',   labelEn: 'Landscape', icon: '▭' },
                                        ] as const).map(({ val, labelAr, labelEn, icon }) => (
                                            <button
                                                key={val}
                                                onClick={() => setSetting('pdfOrientation', val)}
                                                style={{
                                                    flex: 1, padding: '10px 6px', borderRadius: 8, cursor: 'pointer',
                                                    fontFamily: 'inherit', textAlign: 'center', border: '1px solid',
                                                    borderColor: settings.pdfOrientation === val ? 'var(--color-gold)' : 'var(--color-border-strong)',
                                                    background: settings.pdfOrientation === val ? 'rgba(200,168,75,0.12)' : 'var(--color-surface-raised)',
                                                    color: settings.pdfOrientation === val ? 'var(--color-gold)' : 'var(--color-text-muted)',
                                                    transition: 'all .15s',
                                                }}
                                            >
                                                <div style={{ fontSize: 18, lineHeight: 1 }}>{icon}</div>
                                                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>{labelAr}</div>
                                                <div style={{ fontSize: 10, opacity: 0.7 }}>{labelEn}</div>
                                            </button>
                                        ))}
                                    </div>
                                </Section>

                                {/* الثيم */}
                                <Section title="لون الثيم">
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                        {Object.entries(THEMES).map(([key, t]) => (
                                            <button key={key} onClick={() => setSetting('theme', key as CatalogSettings['theme'])} title={t.label} style={{
                                                width: 26, height: 26, borderRadius: '50%', background: t.primary,
                                                border: 'none', cursor: 'pointer',
                                                outline: settings.theme === key ? `3px solid ${t.primary}` : '3px solid transparent',
                                                outlineOffset: 3, transition: 'outline .15s',
                                            }} />
                                        ))}
                                    </div>
                                </Section>

                                {/* خيارات العرض */}
                                <Section title="خيارات العرض">
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {([
                                            ['showImages',       'إظهار الصور'],
                                            ['showPrice',        'إظهار السعر'],
                                            ['showSku',          'إظهار الرمز (SKU)'],
                                            ['showSpecs',        'إظهار المواصفات'],
                                            ['showDescription',  'إظهار الوصف'],
                                            ['showHeader',       'رأس الكتالوج'],
                                            ['showFooter',       'تذييل الكتالوج'],
                                            ['groupByCategory',   'تجميع حسب القسم'],
                                            ['groupByBrand',      'تجميع حسب الماركة'],
                                            ['showStoreButton',   'زر "عرض في المتجر" لكل منتج'],
                                            ['showQrCode',        'QR Code لكل منتج'],
                                        ] as const).map(([key, label]) => (
                                            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    {key === 'showQrCode' && <QrCode size={13} />}
                                                    {label}
                                                </span>
                                                <Toggle
                                                    value={settings[key] as boolean}
                                                    onChange={v => setSetting(key, v as CatalogSettings[typeof key])}
                                                />
                                            </div>
                                        ))}
                                    </div>

                                    {/* رابط QR الأساسي */}
                                    {settings.showQrCode && (
                                        <div style={{ marginTop: 12 }}>
                                            <label style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
                                                رابط QR الأساسي (يُضاف إليه id المنتج)
                                            </label>
                                            <input
                                                value={settings.qrBaseUrl}
                                                onChange={e => setSetting('qrBaseUrl', e.target.value)}
                                                style={{
                                                    width: '100%', padding: '7px 10px', boxSizing: 'border-box',
                                                    background: 'var(--color-surface-raised)', border: '1px solid var(--color-border-strong)',
                                                    borderRadius: 7, color: 'var(--color-text-primary)', fontSize: 11,
                                                }}
                                            />
                                        </div>
                                    )}
                                </Section>
                            </div>
                        )}
                    </div>
                </div>

                {/* ══ اللوحة اليمنى — المعاينة الفورية ══ */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: 'var(--color-surface-raised)' }}>
                    {selectedProducts.length === 0 ? (
                        <div style={{
                            height: '100%', display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', gap: 16,
                            color: 'var(--color-text-muted)',
                        }}>
                            <BookOpen size={48} strokeWidth={1} style={{ opacity: 0.3 }} />
                            <div style={{ textAlign: 'center' }}>
                                <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>اختر منتجات لتبدأ</p>
                                <p style={{ fontSize: 13, opacity: 0.7 }}>المعاينة تظهر هنا فوراً عند تحديد منتجات من اللوحة اليسرى</p>
                            </div>
                        </div>
                    ) : (
                        <CatalogPreview
                            products={selectedProducts}
                            settings={settings}
                            categories={flatCategories}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}
