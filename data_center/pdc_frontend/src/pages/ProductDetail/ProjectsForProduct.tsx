/**
 * Projects gallery shown on a public product page.
 * Renders nothing when there are no active projects for this product.
 */
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Building2, MapPin, Calendar, X, ChevronRight, ChevronLeft, ExternalLink, Package } from 'lucide-react'
import { projectsAPI } from '@/api/client'
import type { ProjectPublic } from '@/types'

interface Props {
    productId: number
    isAr: boolean
}

export default function ProjectsForProduct({ productId, isAr }: Props) {
    const [openId, setOpenId] = useState<number | null>(null)
    const [openIndex, setOpenIndex] = useState(0)

    const { data, isLoading } = useQuery({
        queryKey: ['projects-for-product', productId],
        queryFn: () => projectsAPI.forProduct(productId).then(r => r.data as ProjectPublic[]),
        enabled: !!productId && !Number.isNaN(productId),
    })

    const projects = Array.isArray(data) ? data : []
    const openProject = projects.find(p => p.id === openId) || null
    const totalImages = openProject?.images.length ?? 0

    const close = useCallback(() => setOpenId(null), [])
    const next = useCallback(() => {
        if (totalImages > 1) setOpenIndex(i => (i + 1) % totalImages)
    }, [totalImages])
    const prev = useCallback(() => {
        if (totalImages > 1) setOpenIndex(i => (i - 1 + totalImages) % totalImages)
    }, [totalImages])

    // Keyboard navigation + body-scroll lock while modal is open
    useEffect(() => {
        if (!openProject) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close()
            else if (e.key === 'ArrowRight') isAr ? next() : prev()
            else if (e.key === 'ArrowLeft') isAr ? prev() : next()
        }
        const prevOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        window.addEventListener('keydown', onKey)
        return () => {
            window.removeEventListener('keydown', onKey)
            document.body.style.overflow = prevOverflow
        }
    }, [openProject, close, next, prev, isAr])

    if (isLoading) return null
    if (projects.length === 0) return null

    const pickName = (p: ProjectPublic) =>
        isAr ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar)
    const pickLoc = (p: ProjectPublic) =>
        isAr ? (p.location_ar || p.location_en) : (p.location_en || p.location_ar)
    const pickDesc = (p: ProjectPublic) =>
        isAr ? (p.description_ar || p.description_en) : (p.description_en || p.description_ar)

    return (
        <div style={{ marginBottom: 20 }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginBottom: 12, paddingBottom: 8,
                borderBottom: '1px solid var(--color-border)',
            }}>
                <Building2 size={18} style={{ color: 'var(--color-gold)' }} strokeWidth={1.8} />
                <h3 style={{
                    fontSize: 16, fontWeight: 700,
                    color: 'var(--color-text-primary)', margin: 0,
                }}>
                    {isAr ? 'مشاريعنا التي تستخدم هذا المنتج' : 'Our projects using this product'}
                </h3>
                <span style={{
                    fontSize: 12, color: 'var(--color-text-muted)',
                    background: 'var(--color-surface)',
                    padding: '2px 8px', borderRadius: 10,
                }}>
                    {projects.length}
                </span>
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 12,
            }}>
                {projects.map(p => {
                    const cover = p.images.find(i => i.is_cover) || p.images[0]
                    return (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => { setOpenId(p.id); setOpenIndex(0) }}
                            style={{
                                background: 'var(--color-surface-raised)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 10, overflow: 'hidden',
                                cursor: 'pointer', padding: 0,
                                textAlign: 'inherit', fontFamily: 'inherit',
                                display: 'flex', flexDirection: 'column',
                                transition: 'transform 0.15s, box-shadow 0.15s',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.transform = 'translateY(-2px)'
                                e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.14)'
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.transform = ''
                                e.currentTarget.style.boxShadow = ''
                            }}
                        >
                            <div style={{
                                width: '100%', aspectRatio: '4 / 3',
                                background: 'var(--color-surface)', overflow: 'hidden',
                            }}>
                                {cover ? (
                                    <img
                                        src={cover.image_url}
                                        alt={cover.alt_text || pickName(p)}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                        loading="lazy"
                                    />
                                ) : null}
                            </div>
                            <div style={{ padding: 10 }}>
                                <div style={{
                                    fontSize: 13, fontWeight: 700,
                                    color: 'var(--color-text-primary)',
                                    marginBottom: 3,
                                    display: '-webkit-box',
                                    WebkitLineClamp: 1,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                }}>
                                    {pickName(p)}
                                </div>
                                {pickLoc(p) && (
                                    <div style={{
                                        fontSize: 11, color: 'var(--color-text-secondary)',
                                        display: 'flex', alignItems: 'center', gap: 4,
                                    }}>
                                        <MapPin size={10} strokeWidth={1.8} />
                                        <span style={{
                                            display: '-webkit-box',
                                            WebkitLineClamp: 1,
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden',
                                        }}>{pickLoc(p)}</span>
                                    </div>
                                )}
                            </div>
                        </button>
                    )
                })}
            </div>

            {/* ── Lightbox ── */}
            {openProject && (
                <div
                    onClick={close}
                    role="dialog"
                    aria-modal="true"
                    aria-label={pickName(openProject)}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 1000,
                        background: 'rgba(8, 10, 14, 0.92)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '24px 16px',
                        backdropFilter: 'blur(4px)',
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: '#1a1d24',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 14,
                            boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
                            maxWidth: 960, width: '100%',
                            maxHeight: 'calc(100vh - 48px)',
                            display: 'flex', flexDirection: 'column',
                            overflow: 'hidden',
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            display: 'flex', alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: 12,
                            padding: '16px 20px',
                            borderBottom: '1px solid rgba(255,255,255,0.08)',
                            background: 'linear-gradient(180deg, rgba(255,255,255,0.03), transparent)',
                            flex: '0 0 auto',
                        }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{
                                    fontSize: 17, fontWeight: 700,
                                    color: '#fff',
                                    lineHeight: 1.3,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}>
                                    {pickName(openProject)}
                                </div>
                                {(pickLoc(openProject) || openProject.project_year) && (
                                    <div style={{
                                        fontSize: 12.5, color: 'rgba(255,255,255,0.65)',
                                        display: 'flex', alignItems: 'center',
                                        gap: 14, marginTop: 6, flexWrap: 'wrap',
                                    }}>
                                        {pickLoc(openProject) && (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                                <MapPin size={12} strokeWidth={1.8} />
                                                {pickLoc(openProject)}
                                            </span>
                                        )}
                                        {openProject.project_year && (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                                <Calendar size={12} strokeWidth={1.8} />
                                                {openProject.project_year}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={close}
                                style={{
                                    flex: '0 0 auto',
                                    width: 36, height: 36,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '50%',
                                    color: '#fff', cursor: 'pointer',
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                                aria-label={isAr ? 'إغلاق' : 'Close'}
                            >
                                <X size={18} strokeWidth={2} />
                            </button>
                        </div>

                        {/* Scrollable body */}
                        <div style={{
                            overflowY: 'auto',
                            flex: '1 1 auto',
                            display: 'flex', flexDirection: 'column',
                        }}>
                            {/* Image stage */}
                            {totalImages > 0 && (
                                <div style={{
                                    position: 'relative',
                                    width: '100%',
                                    background: '#000',
                                    display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                    aspectRatio: '16 / 10',
                                    maxHeight: '62vh',
                                    overflow: 'hidden',
                                }}>
                                    <img
                                        src={openProject.images[openIndex]?.image_url}
                                        alt={openProject.images[openIndex]?.alt_text || pickName(openProject)}
                                        style={{
                                            maxWidth: '100%', maxHeight: '100%',
                                            objectFit: 'contain', display: 'block',
                                        }}
                                    />

                                    {totalImages > 1 && (
                                        <>
                                            {/* Previous (in RTL pages, "previous" sits on the right) */}
                                            <button
                                                type="button"
                                                onClick={prev}
                                                style={navBtnStyle(isAr ? 'right' : 'left')}
                                                aria-label={isAr ? 'السابق' : 'Previous'}
                                            >
                                                {isAr ? <ChevronRight size={22} strokeWidth={2} /> : <ChevronLeft size={22} strokeWidth={2} />}
                                            </button>
                                            {/* Next */}
                                            <button
                                                type="button"
                                                onClick={next}
                                                style={navBtnStyle(isAr ? 'left' : 'right')}
                                                aria-label={isAr ? 'التالي' : 'Next'}
                                            >
                                                {isAr ? <ChevronLeft size={22} strokeWidth={2} /> : <ChevronRight size={22} strokeWidth={2} />}
                                            </button>

                                                </>
                                    )}
                                </div>
                            )}

                            {/* Thumbnails strip + counter */}
                            {totalImages > 1 && (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '10px 16px',
                                    background: '#15181f',
                                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                                }}>
                                    {/* Counter badge — always visible, clearly separated from header */}
                                    <div style={{
                                        flex: '0 0 auto',
                                        fontSize: 12, fontWeight: 700,
                                        color: 'rgba(255,255,255,0.55)',
                                        background: 'rgba(255,255,255,0.06)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: 8,
                                        padding: '5px 10px',
                                        letterSpacing: 0.5,
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {openIndex + 1} / {totalImages}
                                    </div>

                                    {/* Scrollable thumbnail list */}
                                    <div style={{
                                        display: 'flex',
                                        gap: 8,
                                        overflowX: 'auto',
                                        flex: '1 1 0',
                                        justifyContent: totalImages <= 6 ? 'center' : 'flex-start',
                                    }}>
                                    {openProject.images.map((im, idx) => (
                                        <button
                                            key={im.id}
                                            type="button"
                                            onClick={() => setOpenIndex(idx)}
                                            style={{
                                                flex: '0 0 auto',
                                                width: 84, height: 60,
                                                border: idx === openIndex
                                                    ? '2px solid var(--color-gold)'
                                                    : '2px solid transparent',
                                                borderRadius: 6, overflow: 'hidden',
                                                padding: 0, cursor: 'pointer',
                                                background: 'transparent',
                                                opacity: idx === openIndex ? 1 : 0.6,
                                                transition: 'opacity 0.15s, border-color 0.15s',
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.opacity = idx === openIndex ? '1' : '0.6'
                                            }}
                                            aria-label={`${isAr ? 'صورة' : 'Image'} ${idx + 1}`}
                                        >
                                            <img src={im.image_url} alt=""
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                        </button>
                                    ))}
                                    </div>
                                </div>
                            )}

                            {/* Description */}
                            {pickDesc(openProject) && (
                                <div style={{
                                    padding: '18px 22px',
                                    color: 'rgba(255,255,255,0.88)',
                                    fontSize: 14, lineHeight: 1.8,
                                    whiteSpace: 'pre-wrap',
                                }}>
                                    {pickDesc(openProject)}
                                </div>
                            )}

                            {/* Linked products */}
                            {openProject.products && openProject.products.length > 0 && (
                                <div style={{
                                    padding: '16px 22px 20px',
                                    borderTop: pickDesc(openProject)
                                        ? '1px solid rgba(255,255,255,0.06)'
                                        : 'none',
                                    background: 'rgba(255,255,255,0.02)',
                                }}>
                                    <div style={{
                                        fontSize: 12.5, fontWeight: 700,
                                        color: 'rgba(255,255,255,0.6)',
                                        marginBottom: 12,
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        letterSpacing: 0.3,
                                    }}>
                                        <Package size={13} strokeWidth={1.8} />
                                        {isAr ? 'المنتجات المستخدمة في هذا المشروع' : 'Products used in this project'}
                                    </div>
                                    <div style={{
                                        display: 'flex', flexWrap: 'wrap', gap: 8,
                                    }}>
                                        {openProject.products.map(prod => {
                                            const label = isAr
                                                ? (prod.product_name_ar || prod.product_name_en || prod.sku)
                                                : (prod.product_name_en || prod.product_name_ar || prod.sku)
                                            const isCurrent = prod.id === productId
                                            return (
                                                <Link
                                                    key={prod.id}
                                                    to={`/products/${prod.id}`}
                                                    onClick={close}
                                                    style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                                        padding: '7px 12px',
                                                        background: isCurrent
                                                            ? 'rgba(200,168,75,0.15)'
                                                            : 'rgba(255,255,255,0.05)',
                                                        border: `1px solid ${isCurrent
                                                            ? 'rgba(200,168,75,0.5)'
                                                            : 'rgba(255,255,255,0.1)'}`,
                                                        borderRadius: 18,
                                                        fontSize: 12.5,
                                                        color: isCurrent ? 'var(--color-gold)' : '#fff',
                                                        textDecoration: 'none',
                                                        transition: 'background 0.15s, border-color 0.15s',
                                                    }}
                                                    onMouseEnter={e => {
                                                        if (isCurrent) return
                                                        e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                                                        e.currentTarget.style.borderColor = 'rgba(200,168,75,0.6)'
                                                    }}
                                                    onMouseLeave={e => {
                                                        if (isCurrent) return
                                                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                                                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                                                    }}
                                                    title={prod.sku}
                                                >
                                                    <ExternalLink size={11} strokeWidth={1.8} />
                                                    <span style={{
                                                        maxWidth: 240, overflow: 'hidden',
                                                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    }}>{label}</span>
                                                </Link>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function navBtnStyle(side: 'left' | 'right'): React.CSSProperties {
    return {
        position: 'absolute', top: '50%', transform: 'translateY(-50%)',
        [side]: 14,
        background: 'rgba(0,0,0,0.55)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '50%',
        width: 44, height: 44,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        backdropFilter: 'blur(4px)',
        transition: 'background 0.15s',
    } as React.CSSProperties
}
