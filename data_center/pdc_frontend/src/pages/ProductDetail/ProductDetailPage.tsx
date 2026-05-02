/**
 * Product Detail Page — Screen 3
 * Full image gallery + dynamic specs + AI actions
 */
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Edit3, Package, ExternalLink, CheckCircle, LogIn, LayoutGrid, ChevronRight, ChevronLeft, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { productsAPI } from '@/api/client'
import { pickBilingual } from '@/i18n/bilingual'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'react-toastify'
import LanguageToggle from '@/components/LanguageToggle/LanguageToggle'
import ProjectsForProduct from '@/pages/ProductDetail/ProjectsForProduct'
import type { Product } from '@/types'

const STATUS_BADGE: Record<string, string> = {
    'نشط': 'badge-active', 'مسودة': 'badge-draft',
    'قيد_المراجعة': 'badge-pending', 'موقوف': 'badge-inactive', 'منتهي': 'badge-discontinued',
}

export default function ProductDetailPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const user = useAuthStore((s) => s.user)
    const qc = useQueryClient()
    const { t, i18n } = useTranslation()
    const isAr = i18n.language === 'ar'
    const [selectedImage, setSelectedImage] = useState(0)
    const [specsOpen, setSpecsOpen] = useState(false)
    const [specsExpandAll, setSpecsExpandAll] = useState(false)
    const { data: product, isLoading } = useQuery<Product>({
        queryKey: ['product', id],
        queryFn: () => productsAPI.detail(Number(id)).then(r => r.data),
        enabled: !!id,
    })

    const publishMutation = useMutation({
        mutationFn: () => productsAPI.publish(Number(id)),
        onSuccess: () => {
            toast.success('تم نشر المنتج بنجاح')
            qc.invalidateQueries({ queryKey: ['product', id] })
        },
        onError: (err: unknown) => toast.error((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'فشل النشر'),
    })

    /* ── Shared header ── */
    const Header = () => (
        <header style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 28px', height: 64,
            background: 'var(--color-surface)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid var(--color-border)',
            position: 'sticky', top: 0, zIndex: 100,
            fontFamily: 'inherit',
        }}>
            {/* Logo */}
            <div
                style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}
                onClick={() => navigate('/catalog')}
            >
                <img
                    src="/logo.png"
                    alt="بيت الإباء"
                    style={{ height: 36, width: 'auto', filter: 'var(--logo-filter)', opacity: 0.92 }}
                />
                <div style={{ width: 1, height: 28, background: 'var(--color-border-strong)' }} />
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', letterSpacing: 0.4 }}>
                    {t('header.tagline')}
                </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <LanguageToggle size={34} />
                {user ? (
                    <>
                        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontFamily: 'inherit' }}>
                            {isAr ? user.name_ar : (user.name_en || user.name_ar)}
                        </span>
                        <button
                            onClick={() => navigate('/')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 7,
                                padding: '7px 16px',
                                background: 'rgba(200,168,75,0.12)',
                                border: '1px solid rgba(200,168,75,0.35)',
                                borderRadius: 7, color: 'var(--color-gold)', fontSize: 13,
                                fontFamily: 'inherit', cursor: 'pointer',
                            }}
                        >
                            <LayoutGrid size={14} />
                            {t('header.dashboard')}
                        </button>
                    </>
                ) : (
                    <button
                        onClick={() => navigate('/login')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 7,
                            padding: '7px 18px',
                            background: 'transparent',
                            border: '1.5px solid var(--color-blue)',
                            borderRadius: 7, color: 'var(--color-text-primary)', fontSize: 13,
                            fontFamily: 'inherit', cursor: 'pointer',
                        }}
                    >
                        <LogIn size={14} />
                        {t('header.login')}
                    </button>
                )}
            </div>
        </header>
    )

    if (isLoading) {
        return (
            <div dir={isAr ? 'rtl' : 'ltr'} style={{ minHeight: '100vh', background: 'var(--color-surface-hover)', fontFamily: 'inherit' }}>
                <Header />
                <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 28px' }}>
                    <div className="grid-2" style={{ gap: 40 }}>
                        <div className="skeleton" style={{ aspectRatio: '1/1', borderRadius: 12 }} />
                        <div style={{ paddingTop: 16 }}>
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="skeleton skeleton-text" style={{ marginBottom: 12, width: i % 2 === 0 ? '80%' : '60%' }} />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    if (!product) return null

    const allImages = product.images?.filter(img => img.status === 'approved') ?? []
    const currentImage = allImages[selectedImage]

    return (
        <div dir={isAr ? 'rtl' : 'ltr'} style={{ minHeight: '100vh', background: 'var(--color-surface-hover)', fontFamily: 'inherit' }}>
            <Header />

            <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 28px' }} className="page-enter">
            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                <button onClick={() => navigate('/catalog')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-secondary)', fontFamily: 'inherit', fontSize: 13 }}>
                    <ArrowRight size={14} />
                    {t('product.back')}
                </button>
                <span>/</span>
                <span>{pickBilingual(product.category_name, product.category_name_en, isAr)}</span>
                <span>/</span>
                <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{product.sku}</span>
            </div>

            <div className="grid-2" style={{ gap: 40, alignItems: 'flex-start' }}>
                {/* LEFT: Image Gallery */}
                <div>
                    {/* Main Image */}
                    <div style={{ position: 'relative' }}>
                        <div style={{
                            aspectRatio: '1/1', borderRadius: 14, overflow: 'hidden',
                            background: 'var(--color-surface)',
                            border: '1px solid var(--color-border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            marginBottom: 12,
                        }}>
                            {currentImage ? (
                                <img
                                    key={currentImage.id}
                                    src={currentImage.url}
                                    alt={product.product_name_ar}
                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                />
                            ) : (
                                <div style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                    <Package size={56} strokeWidth={1} />
                                    <p style={{ marginTop: 10, fontSize: 13 }}>{t('products.no_image')}</p>
                                </div>
                            )}
                        </div>

                        {/* Prev / Next arrows — only when multiple images */}
                        {allImages.length > 1 && (
                            <>
                                <button
                                    onClick={() => setSelectedImage(i => (i + 1) % allImages.length)}
                                    style={{
                                        position: 'absolute', top: '50%', right: 10,
                                        transform: 'translateY(-50%)',
                                        width: 36, height: 36, borderRadius: '50%',
                                        background: 'rgba(0,0,0,0.45)',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        color: '#fff', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        backdropFilter: 'blur(4px)',
                                    }}
                                >
                                    <ChevronRight size={18} />
                                </button>
                                <button
                                    onClick={() => setSelectedImage(i => (i - 1 + allImages.length) % allImages.length)}
                                    style={{
                                        position: 'absolute', top: '50%', left: 10,
                                        transform: 'translateY(-50%)',
                                        width: 36, height: 36, borderRadius: '50%',
                                        background: 'rgba(0,0,0,0.45)',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        color: '#fff', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        backdropFilter: 'blur(4px)',
                                    }}
                                >
                                    <ChevronLeft size={18} />
                                </button>

                                {/* Counter */}
                                <div style={{
                                    position: 'absolute', bottom: 22, left: '50%',
                                    transform: 'translateX(-50%)',
                                    background: 'rgba(0,0,0,0.5)',
                                    backdropFilter: 'blur(4px)',
                                    borderRadius: 20, padding: '3px 12px',
                                    fontSize: 12, color: 'rgba(255,255,255,0.75)',
                                    fontFamily: 'monospace', letterSpacing: 1,
                                }}>
                                    {selectedImage + 1} / {allImages.length}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Thumbnails strip */}
                    {allImages.length > 1 && (
                        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                            {allImages.map((img, idx) => (
                                <button
                                    key={img.id}
                                    onClick={() => setSelectedImage(idx)}
                                    style={{
                                        flexShrink: 0, width: 68, height: 68, borderRadius: 8,
                                        overflow: 'hidden', cursor: 'pointer',
                                        border: `2px solid ${idx === selectedImage ? 'var(--color-gold)' : 'var(--color-border)'}`,
                                        background: 'var(--color-surface)',
                                        opacity: idx === selectedImage ? 1 : 0.55,
                                        transition: 'opacity 0.2s, border-color 0.2s',
                                        padding: 0,
                                    }}
                                >
                                    <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* RIGHT: Product Info */}
                <div>
                    {/* Header */}
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                            <code style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text-secondary)', letterSpacing: 1 }}>{product.sku}</code>
                            <span style={{
                                fontSize: 11, padding: '2px 10px', borderRadius: 20,
                                background: 'rgba(74,144,217,0.15)', color: '#7bb8f0',
                                border: '1px solid rgba(74,144,217,0.25)',
                            }}>
                                {isAr ? product.inventory_type : (
                                    product.inventory_type === 'دوري' ? 'Periodic' :
                                    product.inventory_type === 'ستوك' ? 'In Stock' :
                                    product.inventory_type === 'منتهي' ? 'Discontinued' :
                                    product.inventory_type
                                )}
                            </span>
                        </div>
                        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4, color: 'var(--color-text-primary)' }}>
                            {!isAr && product.product_name_en ? product.product_name_en : product.product_name_ar}
                        </h1>
                    </div>

                    {/* Description — show AR in Arabic mode, EN in English mode */}
                    {(isAr ? product.description_ar : product.description_en) && (
                        <div style={{ marginBottom: 24 }}>
                            <p style={{
                                fontSize: 14,
                                lineHeight: 1.9,
                                color: 'var(--color-text-secondary)',
                                ...(isAr ? {} : { fontFamily: 'var(--font-latin)', direction: 'ltr', textAlign: 'left' }),
                            }}>
                                {isAr ? product.description_ar : product.description_en}
                            </p>
                        </div>
                    )}

                    {/* Key Info */}
                    <div style={{ marginBottom: 24 }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, paddingRight: 2 }}>
                            {t('product.basic_info')}
                        </p>
                    <div style={{ background: 'var(--color-surface)', borderRadius: 10, padding: 16, border: '1px solid var(--color-border)' }}>
                        {[
                            { label: t('product.category'), value: pickBilingual(product.category_name, product.category_name_en, isAr) },
                            { label: t('product.brand'), value: pickBilingual(product.brand_name, product.brand_name_en, isAr) },
                            { label: t('product.country'), value: pickBilingual(product.origin_country, product.origin_country_en, isAr) },
                            { label: t('product.color'), value: pickBilingual(product.color, product.color_en, isAr) },
                            { label: t('product.stock_status'), value: isAr ? product.stock_status : (
                                product.stock_status === 'متوفر' ? 'Available' :
                                product.stock_status === 'غير متوفر' ? 'Unavailable' :
                                product.stock_status === 'محدود' ? 'Limited' :
                                product.stock_status
                            )},
                            {
                                label: t('product.added_date'),
                                value: product.created_at
                                    ? new Date(product.created_at).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
                                    : null,
                            },
                            {
                                label: t('product.updated_date'),
                                value: product.updated_at
                                    ? new Date(product.updated_at).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
                                    : null,
                            },
                        ].filter(i => i.value).map(({ label, value }) => (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--color-border)' }}>
                                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{label}</span>
                                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{value}</span>
                            </div>
                        ))}
                    </div>
                    </div>

                    {/* Dynamic Attributes — Accordion */}
                    {Object.keys(product.attributes || {}).length > 0 && (
                        <div style={{ marginBottom: 24 }}>
                            {/* رأس الأكورديون */}
                            <button
                                onClick={() => setSpecsOpen(o => !o)}
                                style={{
                                    width: '100%', display: 'flex', alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '11px 16px',
                                    background: specsOpen ? 'var(--color-gold-light)' : 'var(--color-surface)',
                                    border: `1px solid ${specsOpen ? 'rgba(200,168,75,0.35)' : 'var(--color-border)'}`,
                                    borderRadius: specsOpen ? '10px 10px 0 0' : 10,
                                    cursor: 'pointer', transition: 'all .2s',
                                }}
                            >
                                <span style={{ fontSize: 14, fontWeight: 600, color: specsOpen ? 'var(--color-gold)' : 'var(--color-text-primary)' }}>
                                    {t('product.specs')}
                                    <span style={{ fontSize: 11, marginRight: 8, color: 'var(--color-text-muted)', fontWeight: 400 }}>
                                        ({new Set(Object.keys(product.attributes).map(k => k.endsWith('_en') ? k.slice(0, -3) : k)).size} {t('product.specs_unit')})
                                    </span>
                                </span>
                                <ChevronDown
                                    size={16}
                                    color={specsOpen ? 'var(--color-gold)' : 'var(--color-text-secondary)'}
                                    style={{ transition: 'transform .25s', transform: specsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                                />
                            </button>

                            {/* محتوى الأكورديون */}
                            {specsOpen && (() => {
                                const PRIORITY_KEYS = [
                                    'realsize', 'surfacenature', 'general_usage',
                                    'tilethickness', 'designgroup', 'classifications',
                                ]
                                const baseKeys = Array.from(new Set(
                                    Object.keys(product.attributes).map(k => k.endsWith('_en') ? k.slice(0, -3) : k)
                                ))
                                const allEntries: [string, string][] = baseKeys.map(baseKey => {
                                    const ar = product.attributes[baseKey] ? String(product.attributes[baseKey]) : ''
                                    const en = product.attributes[baseKey + '_en'] ? String(product.attributes[baseKey + '_en']) : ''
                                    const primary = pickBilingual(ar, en, isAr)
                                    return [baseKey, primary] as [string, string]
                                }).filter(([, v]) => v !== '')
                                const priorityIdx = (k: string) => {
                                    const i = PRIORITY_KEYS.indexOf(k.toLowerCase())
                                    return i === -1 ? PRIORITY_KEYS.length : i
                                }
                                const sortedEntries = [...allEntries].sort(([a], [b]) => {
                                    const ia = priorityIdx(a), ib = priorityIdx(b)
                                    if (ia !== ib) return ia - ib
                                    return 0
                                })
                                const PREVIEW_COUNT = 6
                                const hasMore = sortedEntries.length > PREVIEW_COUNT
                                const visibleEntries = (hasMore && !specsExpandAll)
                                    ? sortedEntries.slice(0, PREVIEW_COUNT)
                                    : sortedEntries
                                return (
                                    <div style={{
                                        background: 'var(--color-surface)',
                                        border: '1px solid rgba(200,168,75,0.2)',
                                        borderTop: 'none',
                                        borderRadius: '0 0 10px 10px',
                                        overflow: 'hidden',
                                        animation: 'fadeIn .18s ease',
                                    }}>
                                        {visibleEntries.map(([key, value]) => {
                                            const schemaItem = (product.attribute_schema || []).find(
                                                s => s.key === key
                                            )
                                            const labelAr = schemaItem?.label_ar || key
                                            const labelEn = schemaItem?.label_en || ''
                                            const unit = schemaItem?.unit || ''
                                            return (
                                                <div key={key} style={{
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    padding: '10px 16px', borderBottom: '1px solid var(--color-border)',
                                                }}>
                                                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                                                        {labelAr}
                                                        {labelEn && labelEn !== labelAr && (
                                                            <span style={{
                                                                fontSize: 10, opacity: 0.6, marginRight: 5,
                                                                direction: 'ltr', display: 'inline-block',
                                                            }}>
                                                                / {labelEn}
                                                            </span>
                                                        )}
                                                        {unit && <span style={{ fontSize: 11, marginRight: 4, opacity: 0.6 }}>({unit})</span>}
                                                    </span>
                                                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                                                        {value}
                                                    </span>
                                                </div>
                                            )
                                        })}
                                        {hasMore && (
                                            <button
                                                type="button"
                                                onClick={() => setSpecsExpandAll(v => !v)}
                                                style={{
                                                    width: '100%', padding: '10px 16px',
                                                    background: 'transparent', border: 'none',
                                                    borderTop: '1px solid var(--color-border)',
                                                    cursor: 'pointer', display: 'flex',
                                                    alignItems: 'center', justifyContent: 'center', gap: 6,
                                                    fontSize: 12, fontWeight: 600,
                                                    color: 'var(--color-gold, #C8A84B)',
                                                    fontFamily: 'inherit',
                                                }}
                                            >
                                                {specsExpandAll
                                                    ? (isAr ? 'عرض أقل' : 'Show less')
                                                    : (isAr
                                                        ? `عرض الكل (${sortedEntries.length} مواصفة)`
                                                        : `Show all (${sortedEntries.length})`)}
                                                <ChevronDown
                                                    size={14}
                                                    style={{
                                                        transition: 'transform .25s',
                                                        transform: specsExpandAll ? 'rotate(180deg)' : 'rotate(0deg)',
                                                    }}
                                                />
                                            </button>
                                        )}
                                    </div>
                                )
                            })()}
                        </div>
                    )}

                    {/* Our Projects (مشاريعنا) — only renders if there are any */}
                    <ProjectsForProduct productId={Number(id)} isAr={isAr} />

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 12 }}>
                        {user?.permissions.can_add_product && (
                            <button className="btn btn-secondary" onClick={() => navigate(`/products/${id}/edit`)}>
                                <Edit3 size={15} />
                                {t('product.edit')}
                            </button>
                        )}
                        {user?.permissions.can_publish_product && product.status !== 'نشط' && (
                            <button
                                className="btn btn-primary"
                                onClick={() => publishMutation.mutate()}
                                disabled={publishMutation.isPending}
                            >
                                <CheckCircle size={15} />
                                {publishMutation.isPending ? t('product.publishing') : t('product.publish')}
                            </button>
                        )}
                        {product.ecommerce_url && (
                            <a href={product.ecommerce_url} target="_blank" rel="noreferrer" className="btn btn-primary">
                                <ExternalLink size={15} />
                                {t('product.store')}
                            </a>
                        )}
                    </div>
                </div>
            </div>
            </div>
        </div>
    )
}
