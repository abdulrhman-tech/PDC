/**
 * CatalogPreview — معاينة الكتالوج + طباعة PDF
 * يدعم: شبكة + قائمة + صفحة غلاف + تجميع حسب القسم + QR code
 */
import { useMemo } from 'react'
import { Package, Building2, MapPin, Calendar } from 'lucide-react'
import type { Product, CategoryFlat, Project } from '@/types'
import type { CatalogSettings } from './CatalogGeneratorPage'

interface Props {
    products: Product[]
    settings: CatalogSettings
    /* Flat categories with breadcrumb paths — the component only needs
       id + name_ar to build a category-name lookup, but we accept the
       full flat shape so callers can pass the same source of truth used
       by the dropdown filter. */
    categories: CategoryFlat[]
    projects?: Project[]
}

const THEMES = {
    gold:     { primary: '#C8A84B', dark: '#1a2636', light: '#fdf6e3', accent: '#8B6914' },
    blue:     { primary: '#3B82F6', dark: '#1e3a5f', light: '#eff6ff', accent: '#1D4ED8' },
    green:    { primary: '#10B981', dark: '#064e3b', light: '#ecfdf5', accent: '#047857' },
    dark:     { primary: '#6366F1', dark: '#1e1b4b', light: '#eef2ff', accent: '#4338CA' },
    burgundy: { primary: '#9B1B30', dark: '#2d0a10', light: '#fdf2f4', accent: '#7B1525' },
    teal:     { primary: '#0D9488', dark: '#042f2e', light: '#f0fdfa', accent: '#0B7A70' },
    charcoal: { primary: '#71717A', dark: '#18181b', light: '#f4f4f5', accent: '#52525B' },
    rose:     { primary: '#E11D48', dark: '#4c0519', light: '#fff1f2', accent: '#BE123C' },
}

function imgHeight(cols: number) {
    if (cols === 1) return 260
    if (cols === 2) return 200
    if (cols === 3) return 155
    return 120
}

/* ── ترجمة أسماء المواصفات ── */
const ATTR_LABELS_AR: Record<string, string> = {
    /* عام */
    size: 'الحجم',
    usage: 'الاستخدام',
    material: 'المادة',
    type: 'النوع',
    product_type: 'نوع المنتج',
    grade: 'الدرجة',
    series: 'السلسلة',
    collection: 'المجموعة',
    model: 'الموديل',
    quantity: 'الكمية',
    unit: 'الوحدة',
    category: 'الفئة',
    brand: 'الماركة',
    country_of_origin: 'بلد المنشأ',
    origin: 'المنشأ',
    warranty: 'الضمان',
    certifications: 'الشهادات',
    /* أبعاد */
    dimensions: 'الأبعاد',
    format: 'المقاس',
    width: 'العرض',
    length: 'الطول',
    height: 'الارتفاع',
    thickness: 'السُّمك',
    weight: 'الوزن',
    box_weight: 'وزن الصندوق',
    piece_per_box: 'قطعة/صندوق',
    pcs_per_box: 'قطعة/صندوق',
    sqm_per_box: 'م²/صندوق',
    /* سطح وتشطيب */
    surface_finish: 'نوع السطح',
    surface_type: 'نوع السطح',
    finish: 'التشطيب',
    finish_type: 'نوع التشطيب',
    texture: 'الملمس',
    pattern: 'النقش',
    sheen_level: 'مستوى اللمعان',
    color: 'اللون',
    colour: 'اللون',
    edge_type: 'نوع الحافة',
    shape: 'الشكل',
    /* بلاط وسيراميك */
    slip_resistance: 'مقاومة الانزلاق',
    water_absorption: 'امتصاص الماء',
    hardness: 'الصلابة',
    frost_resistance: 'مقاومة الصقيع',
    pei_rating: 'تقييم PEI',
    load_capacity: 'تحمل الحمولة',
    /* دهانات */
    paint_type: 'نوع الطلاء',
    coverage: 'التغطية',
    dry_time: 'وقت الجفاف',
    drying_time: 'وقت الجفاف',
    application_method: 'طريقة التطبيق',
    coats: 'عدد الطبقات',
    dilution: 'نسبة التخفيف',
    washability: 'قابلية الغسيل',
    /* إضاءة وكهرباء */
    light_type: 'نوع الإضاءة',
    color_temp: 'درجة حرارة اللون',
    voltage: 'الجهد الكهربائي',
    wattage: 'القدرة (واط)',
    lumens: 'الإضاءة (لومن)',
    /* تركيب وعزل */
    installation: 'طريقة التركيب',
    installation_type: 'نوع التركيب',
    fire_rating: 'تصنيف الحريق',
    sound_insulation: 'عزل صوتي',
    thermal_insulation: 'عزل حراري',
}

function translateAttrKey(key: string, language: 'ar' | 'en'): string {
    if (language === 'en') return key
    /* إذا كان المفتاح عربياً أصلاً، اعد إرجاعه كما هو */
    if (/[\u0600-\u06FF]/.test(key)) return key
    return ATTR_LABELS_AR[key] ?? ATTR_LABELS_AR[key.toLowerCase()] ?? key
}

/* ── QR Image ── */
function QRCode({ url, size = 56 }: { url: string; size?: number }) {
    const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}&format=png&margin=2`
    return (
        <img
            src={src}
            alt="QR"
            style={{ width: size, height: size, display: 'block', flexShrink: 0 }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
    )
}

/* ── فاصل قسم ── */
function CategoryDivider({ name, theme }: { name: string; theme: typeof THEMES['gold'] }) {
    return (
        <div
            className="catalog-card"
            style={{
                gridColumn: '1 / -1',
                background: `linear-gradient(135deg, ${theme.dark}, ${theme.accent}40)`,
                borderRadius: 10,
                padding: '12px 20px',
                display: 'flex', alignItems: 'center', gap: 12,
                breakInside: 'avoid', pageBreakInside: 'avoid',
                breakBefore: 'auto',
            }}
        >
            <div style={{
                width: 4, height: 30, borderRadius: 2,
                background: theme.primary, flexShrink: 0,
            }} />
            <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{name}</div>
            </div>
        </div>
    )
}

/* ── بطاقة شبكة ── */
function GridCard({
    product, idx, settings, theme,
}: {
    product: Product
    idx: number
    settings: CatalogSettings
    theme: typeof THEMES['gold']
}) {
    const lang = settings.language ?? 'ar'
    const attrs = product.attributes
        ? Object.entries(product.attributes as Record<string, unknown>).filter(([, v]) => v !== null && v !== '')
        : []
    const maxAttrs = settings.columns <= 2 ? 6 : settings.columns === 3 ? 4 : 3
    const qrUrl = settings.qrBaseUrl + product.id
    const mainName = lang === 'en'
        ? (product.product_name_en || product.product_name_ar)
        : product.product_name_ar
    const subName = lang === 'en'
        ? (product.product_name_en ? product.product_name_ar : null)
        : product.product_name_en

    return (
        <div className="catalog-card" style={{
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            breakInside: 'avoid',
            pageBreakInside: 'avoid',
        }}>
            {/* صورة */}
            {settings.showImages && (
                <div style={{
                    background: '#f3f4f6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: imgHeight(settings.columns),
                    overflow: 'hidden',
                    borderBottom: `2px solid ${theme.primary}20`,
                    flexShrink: 0,
                }}>
                    {product.main_image_url ? (
                        <img
                            src={product.main_image_url}
                            alt={product.product_name_ar}
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                        />
                    ) : (
                        <div style={{ textAlign: 'center', color: '#94a3b8', padding: 16 }}>
                            <Package size={28} strokeWidth={1.5} />
                            <div style={{ fontSize: 10, marginTop: 4 }}>لا توجد صورة</div>
                        </div>
                    )}
                </div>
            )}

            {/* محتوى */}
            <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 9, color: theme.primary, fontWeight: 700, marginBottom: 3, letterSpacing: 0.5 }}>
                    {String(idx + 1).padStart(2, '0')}
                </div>
                <div style={{
                    fontSize: settings.columns <= 2 ? 14 : 12,
                    fontWeight: 700, color: '#111827',
                    marginBottom: 2, lineHeight: 1.4,
                    direction: lang === 'en' ? 'ltr' : 'rtl',
                }}>
                    {mainName}
                </div>
                {subName && (
                    <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 6, fontStyle: 'italic', direction: lang === 'en' ? 'rtl' : 'ltr', textAlign: lang === 'en' ? 'right' : 'left' }}>
                        {subName}
                    </div>
                )}
                {settings.showSku && (
                    <div style={{
                        display: 'inline-block', fontSize: 9, fontFamily: 'monospace',
                        background: `${theme.primary}18`, color: theme.accent,
                        padding: '2px 6px', borderRadius: 4, marginBottom: 6, fontWeight: 600,
                    }}>
                        {product.sku}
                    </div>
                )}
                {settings.showDescription && product.description_ar && (
                    <p style={{
                        fontSize: 10, color: '#4b5563', margin: '0 0 6px',
                        lineHeight: 1.6,
                        display: '-webkit-box', WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                        {product.description_ar}
                    </p>
                )}
                {settings.showSpecs && attrs.length > 0 && (
                    <div style={{
                        background: '#f9fafb', borderRadius: 6,
                        padding: '6px 8px', marginBottom: 6,
                        border: '1px solid #e5e7eb', flex: 1,
                    }}>
                        {attrs.slice(0, maxAttrs).map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 2, gap: 4 }}>
                                <span style={{ color: '#6b7280', flexShrink: 0 }}>{translateAttrKey(k, lang)}:</span>
                                <span style={{ color: '#111827', fontWeight: 600, textAlign: 'left' }}>{String(v)}</span>
                            </div>
                        ))}
                        {attrs.length > maxAttrs && !settings.showStoreButton && (
                            product.ecommerce_url ? (
                                <a
                                    href={product.ecommerce_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ fontSize: 9, color: theme.primary, marginTop: 2, display: 'block', textDecoration: 'none', fontWeight: 600 }}
                                >
                                    +{attrs.length - maxAttrs} {lang === 'en' ? 'more specs ←' : 'مواصفة أخرى ←'}
                                </a>
                            ) : (
                                <div style={{ fontSize: 9, color: theme.primary, marginTop: 2 }}>
                                    +{attrs.length - maxAttrs} {lang === 'en' ? 'more specs' : 'مواصفة أخرى'}
                                </div>
                            )
                        )}
                    </div>
                )}

                {/* QR code */}
                {settings.showQrCode && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto', paddingTop: 4 }}>
                        <QRCode url={qrUrl} size={settings.columns >= 3 ? 44 : 56} />
                    </div>
                )}
            </div>

            {/* السعر */}
            {settings.showPrice && product.price_sar && (
                <div style={{
                    padding: '7px 12px',
                    background: `linear-gradient(135deg, ${theme.dark}, ${theme.accent}20)`,
                    borderTop: `1px solid ${theme.primary}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexShrink: 0,
                }}>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)' }}>{lang === 'en' ? 'Price' : 'السعر'}</span>
                    <span style={{ fontSize: settings.columns <= 2 ? 15 : 13, fontWeight: 800, color: theme.primary }}>
                        {parseFloat(product.price_sar).toLocaleString('ar-SA')}
                        <span style={{ fontSize: 9, fontWeight: 400, marginRight: 2 }}>{lang === 'en' ? 'SAR' : 'ر.س'}</span>
                    </span>
                </div>
            )}

            {/* زر المتجر */}
            {settings.showStoreButton && product.ecommerce_url && (
                <a
                    href={product.ecommerce_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        display: 'block', textAlign: 'center',
                        padding: '7px 10px',
                        background: theme.primary,
                        color: '#fff',
                        fontSize: 10, fontWeight: 700,
                        textDecoration: 'none',
                        flexShrink: 0,
                        direction: 'rtl',
                    }}
                >
                    عرض في المتجر الإلكتروني ←
                </a>
            )}
        </div>
    )
}

/* ── بطاقة قائمة ── */
function ListCard({
    product, idx, settings, theme,
}: {
    product: Product
    idx: number
    settings: CatalogSettings
    theme: typeof THEMES['gold']
}) {
    const lang = settings.language ?? 'ar'
    const attrs = product.attributes
        ? Object.entries(product.attributes as Record<string, unknown>).filter(([, v]) => v !== null && v !== '')
        : []
    const qrUrl = settings.qrBaseUrl + product.id
    const mainName = lang === 'en'
        ? (product.product_name_en || product.product_name_ar)
        : product.product_name_ar
    const subName = lang === 'en'
        ? (product.product_name_en ? product.product_name_ar : null)
        : product.product_name_en

    return (
        <div className="catalog-card" style={{
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'row',
            breakInside: 'avoid',
            pageBreakInside: 'avoid',
            minHeight: 130,
        }}>
            {/* صورة */}
            {settings.showImages && (
                <div style={{
                    width: 160, flexShrink: 0,
                    background: '#f3f4f6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderLeft: `3px solid ${theme.primary}`,
                    overflow: 'hidden',
                }}>
                    {product.main_image_url ? (
                        <img src={product.main_image_url} alt={product.product_name_ar}
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                        />
                    ) : (
                        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                            <Package size={32} strokeWidth={1.5} />
                        </div>
                    )}
                </div>
            )}

            {/* محتوى */}
            <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: theme.primary, fontWeight: 700 }}>
                            {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#111827', lineHeight: 1.3, direction: lang === 'en' ? 'ltr' : 'rtl' }}>
                            {mainName}
                        </span>
                    </div>
                    {subName && (
                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, direction: lang === 'en' ? 'rtl' : 'ltr', textAlign: lang === 'en' ? 'right' : 'left', fontStyle: 'italic' }}>
                            {subName}
                        </div>
                    )}
                    {settings.showDescription && product.description_ar && (
                        <p style={{
                            fontSize: 11, color: '#4b5563', margin: '0 0 8px', lineHeight: 1.6,
                            display: '-webkit-box', WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>
                            {product.description_ar}
                        </p>
                    )}
                    {settings.showSpecs && attrs.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginBottom: 4 }}>
                            {attrs.slice(0, 8).map(([k, v]) => (
                                <div key={k} style={{ fontSize: 10, color: '#374151' }}>
                                    <span style={{ color: '#9ca3af' }}>{translateAttrKey(k, lang)}: </span>
                                    <span style={{ fontWeight: 600 }}>{String(v)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {settings.showSku && (
                            <span style={{
                                fontSize: 10, fontFamily: 'monospace',
                                background: `${theme.primary}18`, color: theme.accent,
                                padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                            }}>
                                {product.sku}
                            </span>
                        )}
                        {settings.showQrCode && (
                            <QRCode url={qrUrl} size={48} />
                        )}
                        {settings.showStoreButton && product.ecommerce_url && (
                            <a
                                href={product.ecommerce_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    padding: '5px 12px', borderRadius: 6,
                                    background: theme.primary,
                                    color: '#fff',
                                    fontSize: 10, fontWeight: 700,
                                    textDecoration: 'none',
                                    direction: 'rtl',
                                }}
                            >
                                عرض في المتجر الإلكتروني ←
                            </a>
                        )}
                    </div>
                    {settings.showPrice && product.price_sar && (
                        <div style={{
                            background: `linear-gradient(135deg, ${theme.dark}, ${theme.accent}30)`,
                            padding: '4px 14px', borderRadius: 8,
                            display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{lang === 'en' ? 'Price:' : 'السعر:'}</span>
                            <span style={{ fontSize: 18, fontWeight: 800, color: theme.primary }}>
                                {parseFloat(product.price_sar).toLocaleString('ar-SA')}
                            </span>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>{lang === 'en' ? 'SAR' : 'ر.س'}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

/* ══════════════════════════════════════════
   صفحة مشاريعنا
══════════════════════════════════════════ */
function ProjectsPage({
    projects, settings, theme,
}: {
    projects: Project[]
    settings: CatalogSettings
    theme: typeof THEMES['gold']
}) {
    const lang = settings.language ?? 'ar'
    if (!projects.length) return null

    return (
        <div style={{
            breakBefore: 'page', pageBreakBefore: 'always',
            background: '#ffffff',
        }}>
            {/* رأس صفحة المشاريع */}
            <div style={{
                background: theme.dark,
                padding: '22px 32px',
                borderBottom: `4px solid ${theme.primary}`,
                display: 'flex', alignItems: 'center', gap: 16,
            }}>
                <div style={{
                    width: 44, height: 44, borderRadius: 10,
                    background: `${theme.primary}25`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `1px solid ${theme.primary}40`,
                }}>
                    <Building2 size={22} color={theme.primary} />
                </div>
                <div>
                    <div style={{ fontSize: 26, fontWeight: 900, color: theme.primary, letterSpacing: 0.5 }}>
                        مشاريعنا
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                        Our Projects
                    </div>
                </div>
                <div style={{ marginRight: 'auto', textAlign: 'left' }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                        {projects.length} {projects.length === 1 ? 'مشروع' : 'مشاريع'}
                    </div>
                </div>
            </div>

            {/* شريط لوني رفيع */}
            <div style={{ height: 3, background: `linear-gradient(90deg, ${theme.primary}, ${theme.accent})` }} />

            {/* قائمة المشاريع */}
            <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                {projects.map((project, idx) => {
                    const coverImg =
                        project.images?.find(i => i.is_cover)?.image_url
                        || project.images?.[0]?.image_url
                        || null
                    const name = lang === 'en'
                        ? (project.name_en || project.name_ar)
                        : project.name_ar
                    const location = lang === 'en'
                        ? (project.location_en || project.location_ar)
                        : project.location_ar
                    const desc = lang === 'en'
                        ? (project.description_en || project.description_ar)
                        : project.description_ar

                    return (
                        <div
                            key={project.id}
                            className="catalog-card"
                            style={{
                                display: 'flex', flexDirection: 'row',
                                border: `1px solid ${theme.primary}25`,
                                borderRadius: 12, overflow: 'hidden',
                                breakInside: 'avoid', pageBreakInside: 'avoid',
                                background: '#ffffff',
                                boxShadow: `0 1px 6px ${theme.primary}10`,
                            }}
                        >
                            {/* صورة الغلاف */}
                            <div style={{
                                width: 200, minHeight: 180, flexShrink: 0,
                                background: '#f3f4f6',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                overflow: 'hidden',
                                borderLeft: `4px solid ${theme.primary}`,
                                position: 'relative',
                            }}>
                                {/* رقم المشروع */}
                                <div style={{
                                    position: 'absolute', top: 8, right: 8, zIndex: 2,
                                    width: 28, height: 28, borderRadius: '50%',
                                    background: theme.primary,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 11, fontWeight: 800, color: theme.dark,
                                }}>
                                    {String(idx + 1).padStart(2, '0')}
                                </div>
                                {coverImg ? (
                                    <img
                                        src={coverImg}
                                        alt={name}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover', minHeight: 180 }}
                                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                                    />
                                ) : (
                                    <div style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>
                                        <Building2 size={36} strokeWidth={1.2} />
                                        <div style={{ fontSize: 10, marginTop: 6 }}>لا توجد صورة</div>
                                    </div>
                                )}
                            </div>

                            {/* تفاصيل المشروع */}
                            <div style={{ flex: 1, padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>

                                {/* الاسم */}
                                <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', lineHeight: 1.3 }}>
                                    {name}
                                </div>

                                {/* الموقع + السنة */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                                    {location && (
                                        <span style={{
                                            display: 'flex', alignItems: 'center', gap: 4,
                                            fontSize: 12, color: theme.accent, fontWeight: 600,
                                        }}>
                                            <MapPin size={11} />
                                            {location}
                                        </span>
                                    )}
                                    {project.project_year && (
                                        <span style={{
                                            display: 'flex', alignItems: 'center', gap: 4,
                                            fontSize: 12, color: '#6b7280', fontWeight: 600,
                                        }}>
                                            <Calendar size={11} />
                                            {project.project_year}
                                        </span>
                                    )}
                                </div>

                                {/* الوصف */}
                                {desc && (
                                    <p style={{
                                        fontSize: 12, color: '#4b5563', lineHeight: 1.75,
                                        margin: 0,
                                        display: '-webkit-box',
                                        WebkitLineClamp: 3,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                    }}>
                                        {desc}
                                    </p>
                                )}

                                {/* شريط الصور الإضافية */}
                                {(() => {
                                    const galleryImgs = (project.images ?? [])
                                        .filter(i => !i.is_cover && i.image_url)
                                        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                                        .slice(0, 4)
                                    if (!galleryImgs.length) return null
                                    return (
                                        <div style={{ marginTop: 2 }}>
                                            <div style={{
                                                fontSize: 9, fontWeight: 700, color: '#9ca3af',
                                                textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 5,
                                            }}>
                                                {lang === 'en' ? 'Project Gallery' : 'معرض الصور'}
                                            </div>
                                            <div style={{ display: 'flex', gap: 5 }}>
                                                {galleryImgs.map(img => (
                                                    <div
                                                        key={img.id}
                                                        style={{
                                                            width: 72, height: 52,
                                                            borderRadius: 6, overflow: 'hidden',
                                                            border: `1px solid ${theme.primary}30`,
                                                            flexShrink: 0,
                                                            background: '#f3f4f6',
                                                        }}
                                                    >
                                                        <img
                                                            src={img.image_url}
                                                            alt={img.alt_text || ''}
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })()}

                                {/* المنتجات المرتبطة */}
                                {project.products && project.products.length > 0 && (
                                    <div style={{ marginTop: 'auto' }}>
                                        <div style={{
                                            fontSize: 9, fontWeight: 700, color: '#9ca3af',
                                            textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6,
                                        }}>
                                            المنتجات المستخدمة
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                            {project.products.slice(0, 14).map(prod => (
                                                <div key={prod.id} style={{
                                                    display: 'flex', alignItems: 'center', gap: 4,
                                                    background: `${theme.primary}12`,
                                                    border: `1px solid ${theme.primary}28`,
                                                    borderRadius: 5, padding: '2px 7px',
                                                }}>
                                                    {prod.main_image_url && (
                                                        <img
                                                            src={prod.main_image_url}
                                                            alt={prod.product_name_ar}
                                                            style={{ width: 16, height: 16, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }}
                                                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                                                        />
                                                    )}
                                                    <span style={{
                                                        fontSize: 9, color: theme.accent,
                                                        fontWeight: 700, fontFamily: 'monospace',
                                                    }}>
                                                        {prod.sku}
                                                    </span>
                                                </div>
                                            ))}
                                            {project.products.length > 14 && (
                                                <div style={{
                                                    background: '#f3f4f6', borderRadius: 5,
                                                    padding: '2px 7px', fontSize: 9, color: '#6b7280', fontWeight: 600,
                                                }}>
                                                    +{project.products.length - 14}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

const COVER_BG =
    'https://pub-aafb229d4aed463c8d2160dc56eb9da7.r2.dev/logo/hf_20260404_220903_0d161b98-63f7-4ff7-ab3f-2c56f56ee979.png'

/* ── صفحة الغلاف ── */
function CoverPage({ settings, theme }: { settings: CatalogSettings; theme: typeof THEMES['gold'] }) {
    return (
        <div style={{
            width: '100%', minHeight: 680,
            background: '#0f1923',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            position: 'relative', overflow: 'hidden',
            breakAfter: 'page', pageBreakAfter: 'always',
        }}>
            {/* صورة الخلفية الثابتة */}
            <img
                src={settings.coverImageUrl || COVER_BG}
                alt="غلاف"
                style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    objectFit: 'cover',
                }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />

            {/* أوفرلي بلون الثيم */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: `linear-gradient(160deg, ${theme.dark}f5 0%, ${theme.dark}e8 60%, ${theme.accent}99 100%)`,
            }} />

            {/* شريط علوي */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0,
                height: 6, background: `linear-gradient(90deg, ${theme.primary}, ${theme.accent})`,
            }} />

            {/* محتوى الغلاف */}
            <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '48px 40px' }}>
                {/* لوجو */}
                <img
                    src="/logo.png"
                    alt="بيت الإباء"
                    style={{ height: 80, width: 'auto', objectFit: 'contain', marginBottom: 32, filter: 'brightness(0) invert(1)' }}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />

                {/* اسم الشركة */}
                <div style={{ fontSize: 14, color: theme.primary, fontWeight: 700, marginBottom: 12, direction: 'rtl' }}>
                    {settings.companyName}
                </div>

                {/* خط فاصل */}
                <div style={{ width: 80, height: 3, background: theme.primary, margin: '0 auto 24px', borderRadius: 2 }} />

                {/* عنوان الكتالوج */}
                <div style={{ fontSize: 36, fontWeight: 900, color: '#ffffff', lineHeight: 1.2, marginBottom: 12 }}>
                    {settings.catalogTitle}
                </div>

                {settings.catalogSubtitle && (
                    <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.55)', letterSpacing: 1 }}>
                        {settings.catalogSubtitle}
                    </div>
                )}

                {settings.clientName && (
                    <div style={{ marginTop: 28, fontSize: 14, color: theme.primary, fontWeight: 600 }}>
                        خاص بـ: {settings.clientName}
                    </div>
                )}

                <div style={{
                    marginTop: settings.clientName ? 24 : 48, fontSize: 12, color: 'rgba(255,255,255,0.35)',
                    borderTop: '1px solid rgba(255,255,255,0.1)',
                    paddingTop: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                }}>
                    <span>{new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long' })}</span>
                    {settings.storeUrl && (
                        <span style={{ color: 'rgba(255,255,255,0.3)', direction: 'ltr', fontSize: 11 }}>
                            {settings.storeUrl.replace(/^https?:\/\//, '')}
                        </span>
                    )}
                </div>
            </div>

            {/* شريط سفلي */}
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                height: 4, background: `linear-gradient(90deg, ${theme.accent}, ${theme.primary})`,
            }} />
        </div>
    )
}

/* ══════════════════════════════════════════
   المكوّن الرئيسي
══════════════════════════════════════════ */
export default function CatalogPreview({ products, settings, categories, projects = [] }: Props) {
    const theme = THEMES[settings.theme]
    const isList = settings.layout === 'list'

    const categoryMap = useMemo(() => {
        const map: Record<string, string> = {}
        categories.forEach(c => { map[String(c.id)] = c.name_ar })
        return map
    }, [categories])

    type Group = { groupId: string; groupName: string; items: Product[] }

    const groups: Group[] = useMemo(() => {
        if (settings.groupByBrand) {
            const seen: Record<string, Group> = {}
            const order: string[] = []
            products.forEach(p => {
                const bname = p.brand_name || 'بدون ماركة'
                if (!seen[bname]) {
                    seen[bname] = { groupId: bname, groupName: bname, items: [] }
                    order.push(bname)
                }
                seen[bname].items.push(p)
            })
            return order.map(id => seen[id])
        }
        if (settings.groupByCategory) {
            const seen: Record<string, Group> = {}
            const order: string[] = []
            products.forEach(p => {
                const cid = String(p.category)
                if (!seen[cid]) {
                    seen[cid] = { groupId: cid, groupName: categoryMap[cid] || 'غير مصنّف', items: [] }
                    order.push(cid)
                }
                seen[cid].items.push(p)
            })
            return order.map(id => seen[id])
        }
        return [{ groupId: '', groupName: '', items: products }]
    }, [products, settings.groupByCategory, settings.groupByBrand, categoryMap])

    /* ترقيم عالمي */
    let globalIdx = 0

    return (
        <>
            {/* شريط معلومات المعاينة (لا يُطبع) */}
            <div className="no-print" style={{
                background: '#243347', borderRadius: 12, padding: '10px 16px',
                marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                border: '1px solid rgba(255,255,255,0.08)',
            }}>
                <div style={{ fontSize: 12, color: '#cbd5e1', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span><span style={{ color: '#C8A84B', fontWeight: 700 }}>{products.length}</span> منتج</span>
                    <span>·</span>
                    <span style={{ color: '#C8A84B', fontWeight: 700 }}>
                        {isList ? 'قائمة' : `${settings.columns} أعمدة`}
                    </span>
                    <span>·</span>
                    <span style={{ color: theme.primary, fontWeight: 700 }}>
                        {({'gold':'ذهبي','blue':'أزرق','green':'أخضر','dark':'داكن','burgundy':'عنابي','teal':'تركوازي','charcoal':'فحمي','rose':'وردي'} as Record<string,string>)[settings.theme] || settings.theme}
                    </span>
                    {settings.groupByCategory && <span>· <span style={{ color: '#10B981' }}>مجمّع حسب القسم</span></span>}
                    {settings.groupByBrand && <span>· <span style={{ color: '#10B981' }}>مجمّع حسب الماركة</span></span>}
                    {settings.showCoverPage && <span>· <span style={{ color: '#C8A84B' }}>مع غلاف</span></span>}
                    {settings.showQrCode && <span>· <span style={{ color: '#C8A84B' }}>QR</span></span>}
                    {settings.clientName && <span>· <span style={{ color: '#C8A84B' }}>خاص بـ {settings.clientName}</span></span>}
                    {settings.showProjectsPage && projects.length > 0 && (
                        <span>· <span style={{ color: '#10B981', fontWeight: 700 }}>مشاريعنا ({projects.length})</span></span>
                    )}
                </div>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>اضغط "طباعة" → "حفظ كـ PDF"</span>
            </div>

            {/* ════ منطقة الطباعة ════ */}
            <div
                id="catalog-print-root"
                style={{
                    background: '#ffffff', borderRadius: 14, overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.1)',
                    fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif",
                    direction: 'rtl', color: '#000000',
                }}
            >
                {/* صفحة الغلاف */}
                {settings.showCoverPage && <CoverPage settings={settings} theme={theme} />}

                {/* رأس الكتالوج */}
                {settings.showHeader && (
                    <div className="catalog-header" style={{
                        background: theme.dark, color: '#ffffff',
                        padding: '22px 32px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        borderBottom: `4px solid ${theme.primary}`,
                    }}>
                        <div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: theme.primary, marginBottom: 3 }}>
                                {settings.companyName}
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', marginBottom: 2 }}>
                                {settings.catalogTitle}
                            </div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                                {settings.catalogSubtitle}
                            </div>
                            {settings.clientName && (
                                <div style={{ fontSize: 11, color: theme.primary, marginTop: 6, fontWeight: 600 }}>
                                    خاص بـ: {settings.clientName}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                            <img
                                src="/logo.png" alt="بيت الإباء"
                                style={{ height: 68, width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                            />
                            {settings.storeUrl && (
                                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', direction: 'ltr' }}>
                                    {settings.storeUrl.replace(/^https?:\/\//, '')}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* شريط لوني */}
                <div style={{ height: 4, background: `linear-gradient(90deg, ${theme.primary}, ${theme.accent})` }} />

                {/* المنتجات */}
                <div style={{ position: 'relative', background: '#f9fafb' }}>
                    {/* Watermark */}
                    <div style={{
                        position: 'absolute', top: '50%', left: '50%',
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none', zIndex: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <img src="/logo.png" alt="" style={{ width: 320, height: 'auto', opacity: 0.05, userSelect: 'none' }} />
                    </div>

                    <div style={{ padding: 24, position: 'relative', zIndex: 1 }}>
                        {groups.map((group) => (
                            <div key={group.groupId || 'all'}>
                                {(settings.groupByCategory || settings.groupByBrand) && group.groupName && (
                                    <div style={{ marginBottom: 14, marginTop: group.groupId === groups[0].groupId ? 0 : 28 }}>
                                        <CategoryDivider name={group.groupName} theme={theme} />
                                    </div>
                                )}

                                {/* شبكة المنتجات لهذا القسم */}
                                <div
                                    className="catalog-grid"
                                    style={{
                                        marginBottom: 16,
                                        ...(isList
                                            ? { display: 'flex', flexDirection: 'column', gap: 14 }
                                            : { display: 'grid', gridTemplateColumns: `repeat(${settings.columns}, 1fr)`, gap: 14 }
                                        ),
                                    }}
                                >
                                    {group.items.map((product) => {
                                        const idx = globalIdx++
                                        return isList
                                            ? <ListCard key={product.id} product={product} idx={idx} settings={settings} theme={theme} />
                                            : <GridCard key={product.id} product={product} idx={idx} settings={settings} theme={theme} />
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* صفحة مشاريعنا */}
                {settings.showProjectsPage && projects.length > 0 && (
                    <ProjectsPage projects={projects} settings={settings} theme={theme} />
                )}

                {settings.showFooter && (
                    <div className="catalog-footer" style={{
                        background: theme.dark, color: 'rgba(255,255,255,0.7)',
                        padding: '13px 32px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, borderTop: `3px solid ${theme.primary}`,
                        gap: 6,
                    }}>
                        <span>{settings.footerText} {new Date().getFullYear()}</span>
                        {settings.storeUrl && (
                            <span style={{ color: theme.primary, fontWeight: 600, direction: 'ltr' }}>
                                — {settings.storeUrl.replace(/^https?:\/\//, '')}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </>
    )
}

