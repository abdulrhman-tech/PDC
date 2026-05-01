/**
 * Projects gallery shown on a public product page.
 * Renders nothing when there are no active projects for this product.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Building2, MapPin, X, ChevronRight, ChevronLeft, ExternalLink } from 'lucide-react'
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

    if (isLoading) return null
    const projects = Array.isArray(data) ? data : []
    if (projects.length === 0) return null

    const openProject = projects.find(p => p.id === openId) || null

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
                    onClick={() => setOpenId(null)}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 1000,
                        background: 'rgba(0,0,0,0.85)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 20,
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: 'var(--color-surface-raised)',
                            borderRadius: 12, maxWidth: 980, width: '100%',
                            maxHeight: '92vh', overflow: 'auto',
                            display: 'flex', flexDirection: 'column',
                        }}
                    >
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '14px 18px', borderBottom: '1px solid var(--color-border)',
                        }}>
                            <div>
                                <div style={{
                                    fontSize: 16, fontWeight: 700,
                                    color: 'var(--color-text-primary)',
                                }}>
                                    {pickName(openProject)}
                                </div>
                                {pickLoc(openProject) && (
                                    <div style={{
                                        fontSize: 12, color: 'var(--color-text-secondary)',
                                        display: 'flex', alignItems: 'center', gap: 4, marginTop: 2,
                                    }}>
                                        <MapPin size={11} strokeWidth={1.8} />
                                        {pickLoc(openProject)}
                                        {openProject.project_year ? ` • ${openProject.project_year}` : ''}
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setOpenId(null)}
                                style={{
                                    background: 'transparent', border: 'none', cursor: 'pointer',
                                    color: 'var(--color-text-secondary)', padding: 6,
                                }}
                                aria-label="إغلاق"
                            >
                                <X size={18} strokeWidth={1.8} />
                            </button>
                        </div>

                        {/* Main image with prev/next */}
                        {openProject.images.length > 0 && (
                            <div style={{
                                position: 'relative', width: '100%',
                                background: '#000', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                minHeight: 320, maxHeight: '60vh',
                            }}>
                                <img
                                    src={openProject.images[openIndex]?.image_url}
                                    alt={openProject.images[openIndex]?.alt_text || pickName(openProject)}
                                    style={{
                                        maxWidth: '100%', maxHeight: '60vh',
                                        objectFit: 'contain', display: 'block',
                                    }}
                                />
                                {openProject.images.length > 1 && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setOpenIndex(i =>
                                                (i - 1 + openProject.images.length) % openProject.images.length)}
                                            style={navBtnStyle('right')}
                                            aria-label="السابق"
                                        >
                                            <ChevronRight size={20} strokeWidth={2} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setOpenIndex(i =>
                                                (i + 1) % openProject.images.length)}
                                            style={navBtnStyle('left')}
                                            aria-label="التالي"
                                        >
                                            <ChevronLeft size={20} strokeWidth={2} />
                                        </button>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Thumbnails */}
                        {openProject.images.length > 1 && (
                            <div style={{
                                display: 'flex', gap: 6, padding: 10,
                                overflowX: 'auto',
                                borderBottom: pickDesc(openProject) ? '1px solid var(--color-border)' : 'none',
                            }}>
                                {openProject.images.map((im, idx) => (
                                    <button
                                        key={im.id}
                                        type="button"
                                        onClick={() => setOpenIndex(idx)}
                                        style={{
                                            flex: '0 0 auto',
                                            width: 70, height: 50,
                                            border: idx === openIndex
                                                ? '2px solid var(--color-gold)'
                                                : '2px solid transparent',
                                            borderRadius: 6, overflow: 'hidden',
                                            padding: 0, cursor: 'pointer', background: 'transparent',
                                        }}
                                    >
                                        <img src={im.image_url} alt=""
                                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                    </button>
                                ))}
                            </div>
                        )}

                        {pickDesc(openProject) && (
                            <div style={{
                                padding: '14px 18px',
                                color: 'var(--color-text-primary)',
                                fontSize: 14, lineHeight: 1.7,
                                whiteSpace: 'pre-wrap',
                            }}>
                                {pickDesc(openProject)}
                            </div>
                        )}

                        {/* Linked products */}
                        {openProject.products && openProject.products.length > 0 && (
                            <div style={{
                                padding: '14px 18px',
                                borderTop: '1px solid var(--color-border)',
                            }}>
                                <div style={{
                                    fontSize: 13, fontWeight: 700,
                                    color: 'var(--color-text-primary)',
                                    marginBottom: 10,
                                }}>
                                    {isAr ? 'المنتجات المستخدمة في هذا المشروع' : 'Products used in this project'}
                                </div>
                                <div style={{
                                    display: 'flex', flexWrap: 'wrap', gap: 8,
                                }}>
                                    {openProject.products.map(prod => {
                                        const label = isAr
                                            ? (prod.product_name_ar || prod.product_name_en || prod.sku)
                                            : (prod.product_name_en || prod.product_name_ar || prod.sku)
                                        return (
                                            <Link
                                                key={prod.id}
                                                to={`/products/${prod.id}`}
                                                onClick={() => setOpenId(null)}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                                    padding: '6px 10px',
                                                    background: 'var(--color-surface)',
                                                    border: '1px solid var(--color-border)',
                                                    borderRadius: 16,
                                                    fontSize: 12,
                                                    color: 'var(--color-text-primary)',
                                                    textDecoration: 'none',
                                                    transition: 'background 0.15s, border-color 0.15s',
                                                }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.background = 'var(--color-surface-hover)'
                                                    e.currentTarget.style.borderColor = 'var(--color-gold)'
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.background = 'var(--color-surface)'
                                                    e.currentTarget.style.borderColor = 'var(--color-border)'
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
            )}
        </div>
    )
}

function navBtnStyle(side: 'left' | 'right'): React.CSSProperties {
    return {
        position: 'absolute', top: '50%', transform: 'translateY(-50%)',
        [side]: 12,
        background: 'rgba(0,0,0,0.55)', color: '#fff',
        border: 'none', borderRadius: '50%',
        width: 40, height: 40,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
    } as React.CSSProperties
}
