import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { decorativeAPI } from '@/api/client'
import type { DecorativeGeneration } from '@/types'
import {
    FolderOpen, ArrowRight, ArrowLeft, Loader2, RefreshCw,
    XCircle, CheckCircle2, Clock, Download, Image as ImageIcon,
    Box, Grid3x3, ImagePlus, Sparkles,
} from 'lucide-react'

type GalleryFilter = 'all' | 'completed' | 'enhance' | 'single' | 'multi'

interface Props {
    onBackToChoose: () => void
}

function getMode(g: DecorativeGeneration): 'enhance' | 'multi' | 'single' {
    if ((g.generation_settings as Record<string, unknown>)?.mode === 'enhance') return 'enhance'
    if (g.is_multi_product) return 'multi'
    return 'single'
}

function modeBadge(mode: 'enhance' | 'multi' | 'single') {
    if (mode === 'enhance') return { label: 'تحسين', icon: ImagePlus, className: 'mode-badge--enhance' }
    if (mode === 'multi') return { label: 'متعدد', icon: Grid3x3, className: 'mode-badge--multi' }
    return { label: 'منتج واحد', icon: Box, className: 'mode-badge--single' }
}

function statusBadge(status: string) {
    if (status === 'completed') return { label: 'مكتملة', className: 'status-badge--completed', Icon: CheckCircle2 }
    if (status === 'failed') return { label: 'فشلت', className: 'status-badge--failed', Icon: XCircle }
    if (status === 'generating') return { label: 'قيد التوليد', className: 'status-badge--generating', Icon: Loader2 }
    if (status === 'analyzing') return { label: 'قيد التحليل', className: 'status-badge--generating', Icon: Loader2 }
    if (status === 'analyzed') return { label: 'تم التحليل', className: 'status-badge--analyzed', Icon: Sparkles }
    return { label: status, className: 'status-badge--analyzed', Icon: Clock }
}

function fmtDate(s: string): string {
    try {
        const d = new Date(s)
        return d.toLocaleString('ar-SA', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    } catch {
        return s
    }
}

export default function GenerationsGallery({ onBackToChoose }: Props) {
    const [filter, setFilter] = useState<GalleryFilter>('all')
    const [lightboxItem, setLightboxItem] = useState<DecorativeGeneration | null>(null)

    const { data, isLoading, isError, refetch, isFetching } = useQuery({
        queryKey: ['decorative-history', 'gallery'],
        queryFn: () => decorativeAPI.history({ page_size: 100 }),
        staleTime: 30_000,
    })

    const items: DecorativeGeneration[] = data?.data?.results || data?.data || []

    const filtered = useMemo(() => {
        if (filter === 'all') return items
        if (filter === 'completed') return items.filter(g => g.status === 'completed')
        return items.filter(g => getMode(g) === filter)
    }, [items, filter])

    const counts = useMemo(() => ({
        all: items.length,
        completed: items.filter(g => g.status === 'completed').length,
        enhance: items.filter(g => getMode(g) === 'enhance').length,
        single: items.filter(g => getMode(g) === 'single').length,
        multi: items.filter(g => getMode(g) === 'multi').length,
    }), [items])

    return (
        <div className="decorative-page">
            <div className="decorative-header">
                <div className="decorative-title">
                    <FolderOpen size={28} />
                    <h1>معرض الصور المُولَّدة</h1>
                </div>
                <p className="decorative-subtitle">
                    استعرض جميع الصور التي أنشأتها — توليد ديكوري، متعدد المنتجات، وتحسين الصور
                </p>
                <div className="gallery-header-actions">
                    <button className="back-to-mode-btn" onClick={onBackToChoose}>
                        <ArrowRight size={16} /> رجوع
                    </button>
                    <button
                        className="back-to-mode-btn"
                        onClick={() => refetch()}
                        disabled={isFetching}
                    >
                        {isFetching ? (
                            <Loader2 size={16} className="spin" />
                        ) : (
                            <RefreshCw size={16} />
                        )}
                        تحديث
                    </button>
                </div>
            </div>

            <div className="decorative-content">
                <div className="gallery-filters">
                    {([
                        { value: 'all', labelAr: 'الكل', count: counts.all },
                        { value: 'completed', labelAr: 'المكتملة فقط', count: counts.completed },
                        { value: 'enhance', labelAr: 'تحسين الصور', count: counts.enhance },
                        { value: 'single', labelAr: 'منتج واحد', count: counts.single },
                        { value: 'multi', labelAr: 'متعدد المنتجات', count: counts.multi },
                    ] as Array<{ value: GalleryFilter; labelAr: string; count: number }>).map(f => (
                        <button
                            key={f.value}
                            className={`gallery-filter-chip ${filter === f.value ? 'selected' : ''}`}
                            onClick={() => setFilter(f.value)}
                            aria-pressed={filter === f.value}
                        >
                            {f.labelAr}
                            <span className="gallery-filter-count">{f.count}</span>
                        </button>
                    ))}
                </div>

                {isLoading && (
                    <div className="gallery-loading">
                        <Loader2 size={36} className="spin" />
                        <span>جاري تحميل الصور...</span>
                    </div>
                )}

                {isError && (
                    <div className="error-msg gallery-error">
                        <XCircle size={18} />
                        فشل تحميل الصور. حاول مرة أخرى.
                    </div>
                )}

                {!isLoading && !isError && filtered.length === 0 && (
                    <div className="gallery-empty">
                        <ImageIcon size={48} />
                        <h3>لا توجد صور بعد</h3>
                        <p>ابدأ بإنشاء أول صورة من إحدى المهام في الصفحة السابقة.</p>
                        <button className="btn-primary" onClick={onBackToChoose}>
                            <ArrowLeft size={16} /> ابدأ التوليد
                        </button>
                    </div>
                )}

                {!isLoading && filtered.length > 0 && (
                    <div className="gallery-grid">
                        {filtered.map(item => {
                            const mode = getMode(item)
                            const mb = modeBadge(mode)
                            const sb = statusBadge(item.status)
                            const thumb = item.result_image_url || item.source_image_url
                            const ModeIcon = mb.icon
                            return (
                                <button
                                    key={item.id}
                                    className="gallery-card"
                                    onClick={() => setLightboxItem(item)}
                                >
                                    <div className="gallery-card-thumb-wrap">
                                        {thumb ? (
                                            <img src={thumb} alt={`صورة ${item.id}`} className="gallery-card-thumb" />
                                        ) : (
                                            <div className="gallery-card-no-thumb">
                                                <ImageIcon size={36} />
                                            </div>
                                        )}
                                        <span className={`gallery-mode-badge ${mb.className}`}>
                                            <ModeIcon size={12} />
                                            {mb.label}
                                        </span>
                                        <span className={`gallery-status-badge ${sb.className}`}>
                                            <sb.Icon size={12} />
                                            {sb.label}
                                        </span>
                                    </div>
                                    <div className="gallery-card-meta">
                                        <span className="gallery-card-product">
                                            {item.product_name || 'بدون منتج مرتبط'}
                                        </span>
                                        <span className="gallery-card-date">{fmtDate(item.created_at)}</span>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* ─── LIGHTBOX MODAL ─────────────────────────────────────── */}
            {lightboxItem && (
                <GalleryLightbox
                    item={lightboxItem}
                    onClose={() => setLightboxItem(null)}
                />
            )}
        </div>
    )
}

interface LightboxProps {
    item: DecorativeGeneration
    onClose: () => void
}

function GalleryLightbox({ item, onClose }: LightboxProps) {
    const mode = getMode(item)
    const mb = modeBadge(mode)
    const sb = statusBadge(item.status)
    const ModeIcon = mb.icon
    const titleId = `lightbox-title-${item.id}`

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleKey)
        return () => window.removeEventListener('keydown', handleKey)
    }, [onClose])

    return (
        <div className="lightbox-overlay" onClick={onClose}>
            <div
                className="lightbox-modal"
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
            >
                <div className="lightbox-header">
                    <div className="lightbox-title" id={titleId}>
                        <span className={`gallery-mode-badge ${mb.className}`}>
                            <ModeIcon size={14} />
                            {mb.label}
                        </span>
                        <span className={`gallery-status-badge ${sb.className}`}>
                            <sb.Icon size={14} />
                            {sb.label}
                        </span>
                        <span className="lightbox-meta-product">
                            {item.product_name || 'بدون منتج'}
                        </span>
                        <span className="lightbox-meta-date">{fmtDate(item.created_at)}</span>
                    </div>
                    <button
                        className="lightbox-close-btn"
                        onClick={onClose}
                        aria-label="إغلاق"
                        type="button"
                    >
                        <XCircle size={22} />
                    </button>
                </div>

                <div className="lightbox-body">
                    <div className="lightbox-images">
                        {item.source_image_url && (
                            <div className="lightbox-img-col">
                                <h4>الصورة المصدر</h4>
                                <img src={item.source_image_url} alt="مصدر" className="lightbox-img" />
                                <a
                                    href={item.source_image_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn-secondary lightbox-dl"
                                    download
                                >
                                    <Download size={14} /> تحميل المصدر
                                </a>
                            </div>
                        )}
                        {item.result_image_url ? (
                            <div className="lightbox-img-col">
                                <h4>الصورة النهائية</h4>
                                <img src={item.result_image_url} alt="نتيجة" className="lightbox-img" />
                                <a
                                    href={item.result_image_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn-primary lightbox-dl"
                                    download
                                >
                                    <Download size={14} /> تحميل النهائية
                                </a>
                            </div>
                        ) : (
                            <div className="lightbox-img-col">
                                <h4>الصورة النهائية</h4>
                                <div className="lightbox-no-result">
                                    {item.status === 'failed' ? (
                                        <>
                                            <XCircle size={36} />
                                            <p>{item.error_message || 'فشل التوليد'}</p>
                                        </>
                                    ) : (
                                        <>
                                            <Loader2 size={36} className="spin" />
                                            <p>لم تكتمل بعد</p>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
