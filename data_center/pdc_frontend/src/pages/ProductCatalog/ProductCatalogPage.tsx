/**
 * Product Catalog Page — Inspiration Gallery
 * Dark full-width masonry layout + collapsible filter panel
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Search, LogIn, LayoutGrid, SlidersHorizontal, X, ChevronDown, ChevronLeft, ChevronRight, Sun, Moon, BookOpen } from 'lucide-react'
import { productsAPI, categoriesAPI, brandsAPI } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import LanguageToggle from '@/components/LanguageToggle/LanguageToggle'
import { pickBilingual } from '@/i18n/bilingual'
import { resetOnboarding } from '@/components/onboarding/OnboardingFlow'
import type { Product, CategoryFlat, Brand, ProductFilters } from '@/types'

/* ─── Detect the browser's RTL scrollLeft model once.
 *  - 'negative' : modern Chrome/Firefox/Safari/Edge → scrollLeft in [-max, 0]
 *  - 'reverse'  : legacy Chrome ≤84 → scrollLeft in [0, max], 0 = start (visual right)
 *  - 'default'  : legacy WebKit → scrollLeft in [0, max], max = start (visual right)
 *  Using the canonical probe technique (see WICG/csswg-drafts#5278). ─── */
let _rtlScrollType: 'negative' | 'reverse' | 'default' | null = null
function detectRTLScrollType(): 'negative' | 'reverse' | 'default' {
    if (_rtlScrollType !== null) return _rtlScrollType
    if (typeof document === 'undefined' || !document.body) return 'negative'
    const probe = document.createElement('div')
    probe.dir = 'rtl'
    probe.style.cssText =
        'font-size:14px;width:1px;height:1px;position:absolute;' +
        'top:-9999px;left:-9999px;visibility:hidden;pointer-events:none;overflow:scroll'
    probe.appendChild(document.createTextNode('ABCD'))
    let type: 'negative' | 'reverse' | 'default' = 'negative'
    try {
        document.body.appendChild(probe)
        if (probe.scrollLeft > 0) {
            type = 'default'
        } else {
            probe.scrollLeft = 1
            type = probe.scrollLeft === 0 ? 'negative' : 'reverse'
        }
    } finally {
        if (probe.parentNode) probe.parentNode.removeChild(probe)
    }
    _rtlScrollType = type
    return type
}

/* ─── Variable aspect ratios for masonry variety ─── */
const RATIOS = ['140%', '100%', '120%', '85%', '155%', '95%', '130%', '110%', '75%', '145%', '105%', '90%']

/* ─── Category bg colors (no-image fallback) ─── */
const CAT_COLORS: Record<string, string> = {
    ceramics:  '#1E3A5F',
    marble:    '#3B2A1A',
    paints:    '#1A3D2B',
    furniture: '#2E1A3D',
    lighting:  '#3D2E1A',
    plumbing:  '#1A2E3D',
}
const FALLBACK_COLORS = ['#1E3A5F','#2D4A3E','#4A2D2D','#2D3D4A','#3D2D4A','#4A3D2D']

/* ─── Skeleton card ─── */
function SkeletonCard({ ratio }: { ratio: string }) {
    return (
        <div style={{ breakInside: 'avoid', marginBottom: 4 }}>
            <div style={{
                paddingBottom: ratio,
                background: 'var(--color-surface)',
                position: 'relative', overflow: 'hidden',
            }}>
                <div className="skeleton" style={{
                    position: 'absolute', inset: 0,
                }} />
            </div>
        </div>
    )
}

/* ─── View column icon ─── */
function ViewColIcon({ cols, size = 14 }: { cols: number; size?: number }) {
    const gap = 1.5
    const total = size
    const barW = (total - gap * (cols - 1)) / cols
    return (
        <svg width={total} height={total} viewBox={`0 0 ${total} ${total}`}>
            {Array.from({ length: cols }).map((_, i) => (
                <rect
                    key={i}
                    x={i * (barW + gap)}
                    y={0}
                    width={barW}
                    height={total}
                    rx={1}
                    fill="currentColor"
                />
            ))}
        </svg>
    )
}

/* ─── Pill button (for filter options) ─── */
function Pill({
    label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: '6px 14px',
                borderRadius: 20,
                border: active ? '1.5px solid var(--color-gold)' : '1.5px solid var(--color-border-strong)',
                background: active ? 'var(--color-gold-light)' : 'var(--color-surface)',
                color: active ? 'var(--color-gold)' : 'var(--color-text-secondary)',
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
                fontWeight: active ? 600 : 400,
            }}
        >
            {label}
        </button>
    )
}

const VIEW_OPTIONS = [
    { cols: 2, label: '٢ أعمدة' },
    { cols: 3, label: '٣ أعمدة' },
    { cols: 4, label: '٤ أعمدة' },
    { cols: 5, label: '٥ أعمدة' },
]

export default function ProductCatalogPage() {
    const navigate = useNavigate()
    const user = useAuthStore((s) => s.user)
    const { theme, toggleTheme } = useThemeStore()
    const { t, i18n } = useTranslation()
    const isAr = i18n.language === 'ar'
    const nameField = (item: { product_name_ar: string; product_name_en?: string }) =>
        pickBilingual(item.product_name_ar, item.product_name_en, isAr)
    const catName = (c: { name_ar: string; name_en?: string }) =>
        pickBilingual(c.name_ar, c.name_en, isAr)

    /* ── Core state ── */
    const [filters, setFilters] = useState<ProductFilters>({ page_size: 24 })
    const [search, setSearch] = useState('')
    const [searchFocused, setSearchFocused] = useState(false)
    const [hoveredId, setHoveredId] = useState<number | null>(null)
    const [hoverCatId, setHoverCatId] = useState<number | null>(null)
    const [dropdownRect, setDropdownRect] = useState<{ top: number; right: number } | null>(null)
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const openCatDropdown = (catId: number, el: HTMLElement) => {
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
        const rect = el.getBoundingClientRect()
        setDropdownRect({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
        setHoverCatId(catId)
    }
    const closeCatDropdown = () => {
        closeTimerRef.current = setTimeout(() => {
            setHoverCatId(null)
            setDropdownRect(null)
        }, 120)
    }
    const cancelClose = () => {
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }

    /* ── Filter panel state ── */
    const [showFilters, setShowFilters] = useState(false)
    const [localPriceMin, setLocalPriceMin] = useState('')
    const [localPriceMax, setLocalPriceMax] = useState('')

    /* ── View mode (columns) ── */
    const [viewCols, setViewCols] = useState(() => {
        const saved = localStorage.getItem('catalog-view-cols')
        const n = saved ? Number(saved) : 4
        return [2, 3, 4, 5].includes(n) ? n : 4
    })
    const [screenWidth, setScreenWidth] = useState(window.innerWidth)

    useEffect(() => {
        const handler = () => setScreenWidth(window.innerWidth)
        window.addEventListener('resize', handler)
        return () => window.removeEventListener('resize', handler)
    }, [])

    useEffect(() => {
        localStorage.setItem('catalog-view-cols', String(viewCols))
    }, [viewCols])

    const effectiveCols = screenWidth <= 480 ? Math.min(viewCols, 1)
        : screenWidth <= 640 ? Math.min(viewCols, 2)
        : screenWidth <= 1024 ? Math.min(viewCols, 3)
        : viewCols

    const colMinWidth = effectiveCols === 1 ? '100%'
        : effectiveCols === 2 ? '300px'
        : effectiveCols === 3 ? '260px'
        : effectiveCols === 4 ? '240px'
        : '200px'


    /* ── Queries ── */
    const {
        data: infiniteData,
        isLoading,
        isFetchingNextPage,
        hasNextPage,
        fetchNextPage,
    } = useInfiniteQuery({
        queryKey: ['products', filters, search],
        queryFn: ({ pageParam = 1 }) =>
            productsAPI.list({ ...filters, page: pageParam, search }).then(r => r.data),
        getNextPageParam: (lastPage: { next: string | null; count: number }, allPages: unknown[]) => {
            if (!lastPage.next) return undefined
            return allPages.length + 1
        },
        initialPageParam: 1,
    })
    const loadMoreRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        const el = loadMoreRef.current
        if (!el) return
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
                    fetchNextPage()
                }
            },
            { threshold: 0.1 },
        )
        observer.observe(el)
        return () => observer.disconnect()
    }, [hasNextPage, isFetchingNextPage, fetchNextPage])

    const { data: categoriesData } = useQuery({
        queryKey: ['categories-flat'],
        queryFn: () => categoriesAPI.flat().then(r => r.data),
        staleTime: 60_000,
    })

    const { data: brandsData } = useQuery({
        queryKey: ['brands'],
        queryFn: () => brandsAPI.list().then(r => r.data),
    })

    const allCats: CategoryFlat[] = Array.isArray(categoriesData) ? categoriesData : (categoriesData?.results ?? [])
    // Top-strip: only level-1 active categories that actually contain products
    // (directly or via any descendant — backend computes has_products by walking
    // up the parent chain from every product's category). Use `!== false` so
    // older cached responses without the field gracefully fall back to "show",
    // avoiding an empty strip during the cache-warmup window after deploy.
    const categories: CategoryFlat[] = allCats
        .filter((c: CategoryFlat) => c.level === 1 && c.is_active !== false && c.has_products !== false)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name_ar.localeCompare(b.name_ar, 'ar'))
    // Sub-tabs (children dropdown) likewise only show populated children.
    const childrenOf = (parentId: number): CategoryFlat[] =>
        allCats.filter((c: CategoryFlat) => c.parent === parentId && c.has_products !== false)

    /* ── Category-tabs horizontal scroll: track overflow so we can show arrows ── */
    const tabsScrollRef = useRef<HTMLDivElement>(null)
    const [tabsScroll, setTabsScroll] = useState({ canStart: false, canEnd: false, isRTL: true })

    /** Normalize scrollLeft into a positive "distance from logical start" (0..max),
     *  using the detected RTL scroll model so behavior is identical across browsers. */
    const getNormalizedScroll = (el: HTMLElement) => {
        const max = Math.max(0, el.scrollWidth - el.clientWidth)
        const isRTL = getComputedStyle(el).direction === 'rtl'
        let pos = el.scrollLeft
        if (isRTL) {
            const model = detectRTLScrollType()
            if (model === 'negative')      pos = -pos              // [-max,0] → [0,max]
            else if (model === 'default')  pos = max - pos         // [0,max], 0=end
            // 'reverse' is already [0,max] with 0=start → use pos as-is
        }
        pos = Math.min(max, Math.max(0, pos)) // clamp sub-pixel drift
        return { pos, max, isRTL }
    }

    const updateTabsScroll = useCallback(() => {
        const el = tabsScrollRef.current
        if (!el) return
        const { pos, max, isRTL } = getNormalizedScroll(el)
        setTabsScroll({
            canStart: pos > 4,
            canEnd: max > 4 && pos < max - 4,
            isRTL,
        })
    }, [])

    useEffect(() => {
        updateTabsScroll()
        const el = tabsScrollRef.current
        if (!el) return
        el.addEventListener('scroll', updateTabsScroll, { passive: true })
        window.addEventListener('resize', updateTabsScroll)
        // ResizeObserver catches language/font changes that alter content width
        // without firing window.resize.
        let ro: ResizeObserver | null = null
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(updateTabsScroll)
            ro.observe(el)
            // Also observe a child to catch content-width changes
            if (el.firstElementChild) ro.observe(el.firstElementChild as Element)
        }
        return () => {
            el.removeEventListener('scroll', updateTabsScroll)
            window.removeEventListener('resize', updateTabsScroll)
            ro?.disconnect()
        }
    }, [updateTabsScroll, categories.length, i18n.language])

    const scrollTabs = (dir: 'forward' | 'backward') => {
        const el = tabsScrollRef.current
        if (!el) return
        const step = Math.max(200, el.clientWidth * 0.7)
        // 'forward' = move toward logical end of list. The sign of scrollBy(left)
        // needed to reach the logical end depends on the scroll model:
        //   LTR              : end is at +max scrollLeft → forward = +step
        //   RTL-reverse      : end is at +max scrollLeft → forward = +step
        //   RTL-negative     : end is at -max scrollLeft → forward = -step
        //   RTL-default      : end is at  0   scrollLeft (start at +max) → forward = -step
        const isRTL = getComputedStyle(el).direction === 'rtl'
        let forwardSign = 1
        if (isRTL) {
            const model = detectRTLScrollType()
            if (model === 'negative' || model === 'default') forwardSign = -1
        }
        const sign = dir === 'forward' ? forwardSign : -forwardSign
        el.scrollBy({ left: sign * step, behavior: 'smooth' })
    }
    const brands: Brand[] = brandsData?.results ?? []
    const products: Product[] = infiniteData?.pages?.flatMap((p: any) => p.results ?? []) ?? []
    const totalCount = (infiniteData?.pages?.[0] as any)?.count ?? 0

    /* ── Derived: unique colors & countries from current products ── */
    const allColors   = [...new Set(products.map(p => p.color).filter(Boolean))]
    const allCountries = [...new Set(products.map(p => p.origin_country).filter(Boolean))]

    /* ── Active filter count (excluding category + pagination) ── */
    const activeCount = [
        filters.brand,
        filters.color,
        filters.origin_country,
        filters.price_min,
        filters.price_max,
    ].filter(v => v !== undefined && v !== '').length

    /* ── Helpers ── */
    const applyPrice = useCallback(() => {
        setFilters(f => ({
            ...f,
            page: 1,
            price_min: localPriceMin ? Number(localPriceMin) : undefined,
            price_max: localPriceMax ? Number(localPriceMax) : undefined,
        }))
    }, [localPriceMin, localPriceMax])

    const clearAllFilters = () => {
        setFilters(f => ({
            page: 1,
            page_size: f.page_size,
            category: f.category,
        }))
        setLocalPriceMin('')
        setLocalPriceMax('')
    }

    const toggleBrand = (id: string) =>
        setFilters(f => ({ ...f, page: 1, brand: f.brand === id ? undefined : id }))

    const toggleColor = (c: string) =>
        setFilters(f => ({ ...f, page: 1, color: f.color === c ? undefined : c }))

    const toggleCountry = (c: string) =>
        setFilters(f => ({ ...f, page: 1, origin_country: f.origin_country === c ? undefined : c }))

    return (
        <div
            dir={isAr ? 'rtl' : 'ltr'}
            style={{
                fontFamily: 'inherit',
                minHeight: '100vh',
                background: 'var(--color-bg)',
                color: 'var(--color-text-primary)',
            }}
        >
            {/* ══════════════════════════════════════════
                HEADER
            ══════════════════════════════════════════ */}
            <header style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: screenWidth <= 640 ? '0 12px' : '0 28px',
                height: screenWidth <= 640 ? 52 : 64,
                background: 'var(--color-surface)',
                backdropFilter: 'blur(12px)',
                borderBottom: '1px solid var(--color-border)',
                position: 'sticky',
                top: 0,
                zIndex: 100,
                gap: 8,
            }}>
                {/* Logo — right side (RTL) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: screenWidth <= 640 ? 8 : 14, minWidth: 0, flex: '0 1 auto' }}>
                    <img
                        src="/logo.png"
                        alt="بيت الإباء"
                        style={{
                            height: screenWidth <= 640 ? 28 : 36,
                            width: 'auto',
                            filter: 'var(--logo-filter)',
                            opacity: 0.92,
                            flexShrink: 0,
                        }}
                    />
                    {screenWidth > 640 && (
                        <>
                            <div style={{
                                width: 1, height: 28,
                                background: 'var(--color-border-strong)',
                                flexShrink: 0,
                            }} />
                            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', letterSpacing: 0.4, lineHeight: 1.5 }}>
                                {t('header.tagline')}
                            </div>
                        </>
                    )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: screenWidth <= 640 ? 6 : 10, flexShrink: 0 }}>
                    <button
                        onClick={toggleTheme}
                        title={theme === 'dark' ? t('header.theme_to_light') : t('header.theme_to_dark')}
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: screenWidth <= 640 ? 32 : 36,
                            height: screenWidth <= 640 ? 32 : 36,
                            background: 'var(--color-surface-raised)',
                            border: '1px solid var(--color-border-strong)',
                            borderRadius: 8, cursor: 'pointer',
                            color: theme === 'dark' ? '#F59E0B' : '#6366F1',
                            transition: 'all 0.2s',
                            flexShrink: 0,
                        }}
                    >
                        {theme === 'dark' ? <Sun size={screenWidth <= 640 ? 14 : 16} strokeWidth={1.8} /> : <Moon size={screenWidth <= 640 ? 14 : 16} strokeWidth={1.8} />}
                    </button>

                    <LanguageToggle size={screenWidth <= 640 ? 32 : 36} />

                    {user ? (
                        <>
                            {screenWidth > 480 && (
                                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                                    {user.name_ar}
                                </span>
                            )}
                            <button
                                onClick={() => navigate('/')}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 5,
                                    padding: screenWidth <= 640 ? '5px 10px' : '7px 16px',
                                    background: 'rgba(200,168,75,0.12)',
                                    border: '1px solid rgba(200,168,75,0.35)',
                                    borderRadius: 7, color: '#C8A84B',
                                    fontSize: screenWidth <= 640 ? 11 : 13,
                                    fontFamily: 'inherit', cursor: 'pointer',
                                    transition: 'background 0.2s',
                                    whiteSpace: 'nowrap',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(200,168,75,0.22)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(200,168,75,0.12)')}
                            >
                                <LayoutGrid size={screenWidth <= 640 ? 12 : 14} />
                                {screenWidth > 480 ? t('header.dashboard') : t('header.dashboard_short')}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => navigate('/login')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                padding: screenWidth <= 640 ? '5px 10px' : '7px 18px',
                                background: 'transparent',
                                border: '1.5px solid var(--color-blue)',
                                borderRadius: 7, color: 'var(--color-text-primary)',
                                fontSize: screenWidth <= 640 ? 11 : 13,
                                fontFamily: 'inherit', cursor: 'pointer',
                                transition: 'background 0.2s',
                                whiteSpace: 'nowrap',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(74,144,217,0.12)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            <LogIn size={screenWidth <= 640 ? 12 : 14} />
                            {screenWidth > 480 ? t('header.login') : t('header.login_short')}
                        </button>
                    )}

                    <button
                        onClick={() => navigate('/catalog/services')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: screenWidth <= 640 ? '6px 10px' : '8px 18px',
                            background: 'transparent',
                            border: '1.5px solid var(--color-gold)',
                            borderRadius: 7, color: 'var(--color-gold)',
                            fontSize: screenWidth <= 640 ? 11 : 13, fontWeight: 600,
                            fontFamily: 'inherit', cursor: 'pointer',
                            transition: 'background 0.2s, transform 0.15s',
                            whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(200,168,75,0.12)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = '' }}
                    >
                        <LayoutGrid size={screenWidth <= 640 ? 13 : 15} />
                        {screenWidth > 480 ? 'خدمات أخرى' : 'خدمات'}
                    </button>

                    <button
                        onClick={() => navigate('/flipbook')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: screenWidth <= 640 ? '6px 10px' : '8px 18px',
                            background: 'transparent',
                            border: '1.5px solid var(--color-gold)',
                            borderRadius: 7, color: 'var(--color-gold)',
                            fontSize: screenWidth <= 640 ? 11 : 13, fontWeight: 600,
                            fontFamily: 'inherit', cursor: 'pointer',
                            transition: 'background 0.2s, transform 0.15s',
                            whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(200,168,75,0.12)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = '' }}
                    >
                        <BookOpen size={screenWidth <= 640 ? 13 : 15} />
                        {screenWidth > 480 ? t('header.catalog') : t('header.catalog_short')}
                    </button>
                </div>
            </header>

            {/* ══════════════════════════════════════════
                SEARCH BAR
            ══════════════════════════════════════════ */}
            <div style={{ padding: screenWidth <= 640 ? '16px 12px 0' : '24px 28px 0' }}>
                <div style={{ position: 'relative', maxWidth: 720, margin: '0 auto' }}>
                    <Search size={17} style={{
                        position: 'absolute',
                        left: 16, top: '50%',
                        transform: 'translateY(-50%)',
                        color: searchFocused ? 'var(--color-gold)' : 'var(--color-text-muted)',
                        pointerEvents: 'none',
                        transition: 'color 0.2s',
                    }} />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        onFocus={() => setSearchFocused(true)}
                        onBlur={() => setSearchFocused(false)}
                        placeholder={t('search.placeholder')}
                        style={{
                            width: '100%', boxSizing: 'border-box',
                            background: 'var(--color-surface)',
                            border: `1.5px solid ${searchFocused ? 'var(--color-gold)' : 'var(--color-border-strong)'}`,
                            borderRadius: 11,
                            paddingRight: 16, paddingLeft: 44,
                            paddingTop: screenWidth <= 640 ? 10 : 13,
                            paddingBottom: screenWidth <= 640 ? 10 : 13,
                            fontSize: screenWidth <= 640 ? 13 : 14,
                            fontFamily: 'inherit',
                            color: 'var(--color-text-primary)', outline: 'none',
                            transition: 'border-color 0.25s',
                        }}
                    />
                </div>
            </div>

            {/* ══════════════════════════════════════════
                CATEGORY TABS + FILTER TOGGLE
            ══════════════════════════════════════════ */}
            <div style={{
                padding: screenWidth <= 640 ? '12px 12px 0' : '18px 28px 0',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
            }}>
                {/* Tabs scroll area + overflow arrows */}
                <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
                {tabsScroll.canStart && (
                    <button
                        type="button"
                        onClick={() => scrollTabs('backward')}
                        aria-label={t('catalog.scroll_back', 'الرجوع للتصنيفات السابقة')}
                        style={{
                            position: 'absolute',
                            top: 0, bottom: 0,
                            insetInlineStart: 0,
                            width: 32,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            // Solid bg sits on the start edge (visual right in RTL, visual left in LTR)
                            // and fades toward the content area (inward).
                            background: tabsScroll.isRTL
                                ? 'linear-gradient(to left, var(--color-bg) 35%, rgba(0,0,0,0))'
                                : 'linear-gradient(to right, var(--color-bg) 35%, rgba(0,0,0,0))',
                            border: 'none', cursor: 'pointer',
                            color: 'var(--color-text-secondary)',
                            zIndex: 2,
                        }}
                    >
                        {tabsScroll.isRTL ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                    </button>
                )}
                {tabsScroll.canEnd && (
                    <button
                        type="button"
                        onClick={() => scrollTabs('forward')}
                        aria-label={t('catalog.scroll_forward', 'التصنيفات التالية')}
                        style={{
                            position: 'absolute',
                            top: 0, bottom: 0,
                            insetInlineEnd: 0,
                            width: 32,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: tabsScroll.isRTL
                                ? 'linear-gradient(to right, var(--color-bg) 35%, rgba(0,0,0,0))'
                                : 'linear-gradient(to left, var(--color-bg) 35%, rgba(0,0,0,0))',
                            border: 'none', cursor: 'pointer',
                            color: 'var(--color-text-secondary)',
                            zIndex: 2,
                        }}
                    >
                        {tabsScroll.isRTL ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
                    </button>
                )}
                <div ref={tabsScrollRef} style={{
                    display: 'flex',
                    gap: screenWidth <= 640 ? 2 : 4,
                    overflowX: 'auto',
                    scrollbarWidth: 'none',
                }}>
                    <button
                        onClick={() => setFilters(f => ({ ...f, category: undefined, page: 1 }))}
                        style={{
                            flexShrink: 0,
                            padding: screenWidth <= 640 ? '6px 12px' : '8px 18px',
                            background: 'transparent', border: 'none',
                            borderBottom: !filters.category
                                ? '2px solid #C8A84B'
                                : '2px solid transparent',
                            color: !filters.category ? 'var(--color-gold)' : 'var(--color-text-secondary)',
                            fontSize: screenWidth <= 640 ? 12 : 14, cursor: 'pointer',
                            fontFamily: 'inherit',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.2s',
                            fontWeight: !filters.category ? 600 : 400,
                        }}
                    >
                        {t('filters.all')}
                    </button>

                    {categories.map(c => {
                        const children2 = childrenOf(c.id)
                        const isActive = filters.category === String(c.id) || children2.some(ch => filters.category === String(ch.id))
                        const isHovering = hoverCatId === c.id
                        return (
                            <button
                                key={c.id}
                                onClick={() => setFilters(f => ({ ...f, category: String(c.id), page: 1 }))}
                                onMouseEnter={e => children2.length > 0 ? openCatDropdown(c.id, e.currentTarget) : undefined}
                                onMouseLeave={() => children2.length > 0 ? closeCatDropdown() : undefined}
                                style={{
                                    flexShrink: 0,
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    padding: screenWidth <= 640 ? '6px 12px' : '8px 18px',
                                    background: 'transparent', border: 'none',
                                    borderBottom: isActive ? '2px solid #C8A84B' : '2px solid transparent',
                                    color: isActive ? 'var(--color-gold)' : isHovering ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                    fontSize: screenWidth <= 640 ? 12 : 14, cursor: 'pointer',
                                    fontFamily: 'inherit', whiteSpace: 'nowrap',
                                    transition: 'all 0.2s', fontWeight: isActive ? 600 : 400,
                                }}
                            >
                                {catName(c)}
                                {children2.length > 0 && (
                                    <ChevronDown size={11} style={{ opacity: 0.6, transition: 'transform 0.2s', transform: isHovering ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                                )}
                            </button>
                        )
                    })}
                </div>
                </div>

                {/* Filter toggle button */}
                <button
                    onClick={() => setShowFilters(v => !v)}
                    style={{
                        flexShrink: 0,
                        display: 'flex', alignItems: 'center', gap: screenWidth <= 640 ? 4 : 7,
                        padding: screenWidth <= 640 ? '5px 10px' : '7px 16px',
                        background: showFilters
                            ? 'rgba(200,168,75,0.15)'
                            : activeCount > 0
                                ? 'rgba(200,168,75,0.1)'
                                : 'var(--color-surface)',
                        border: showFilters || activeCount > 0
                            ? '1.5px solid rgba(200,168,75,0.5)'
                            : '1.5px solid var(--color-border-strong)',
                        borderRadius: 9,
                        color: showFilters || activeCount > 0 ? 'var(--color-gold)' : 'var(--color-text-secondary)',
                        fontSize: screenWidth <= 640 ? 11 : 13, cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: 'all 0.2s',
                        marginBottom: 2,
                    }}
                >
                    <SlidersHorizontal size={14} />
                    {t('filters.label')}
                    {activeCount > 0 && (
                        <span style={{
                            background: '#C8A84B',
                            color: '#1C1C2E',
                            borderRadius: 10,
                            padding: '0 7px',
                            fontSize: 11,
                            fontWeight: 700,
                            lineHeight: '18px',
                            display: 'inline-block',
                        }}>
                            {activeCount}
                        </span>
                    )}
                    <ChevronDown
                        size={13}
                        style={{
                            transform: showFilters ? 'rotate(180deg)' : 'rotate(0)',
                            transition: 'transform 0.25s',
                        }}
                    />
                </button>
            </div>

            {/* ══════════════════════════════════════════
                FILTER PANEL (collapsible)
            ══════════════════════════════════════════ */}
            {showFilters && (
                <div style={{
                    margin: screenWidth <= 640 ? '8px 12px 0' : '12px 28px 0',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: screenWidth <= 640 ? 10 : 14,
                    padding: screenWidth <= 640 ? '14px 12px' : '20px 24px',
                }}>
                    <div className="resp-grid-auto" style={{ gap: '20px 32px' }}>

                        {/* ── Brand filter ── */}
                        {brands.length > 0 && (
                            <div>
                                <div style={{
                                    fontSize: 11, color: 'var(--color-text-muted)',
                                    letterSpacing: 1.2, marginBottom: 10,
                                    fontWeight: 600, textTransform: 'uppercase',
                                }}>
                                    {t('filters.brand')}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                                    {brands.map(b => (
                                        <Pill
                                            key={b.id}
                                            label={!isAr && b.name ? b.name : (b.name_ar || b.name)}
                                            active={filters.brand === String(b.id)}
                                            onClick={() => toggleBrand(String(b.id))}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Color filter ── */}
                        {allColors.length > 0 && (
                            <div>
                                <div style={{
                                    fontSize: 11, color: 'var(--color-text-muted)',
                                    letterSpacing: 1.2, marginBottom: 10,
                                    fontWeight: 600, textTransform: 'uppercase',
                                }}>
                                    {t('filters.color')}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                                    {allColors.map(c => (
                                        <Pill
                                            key={c}
                                            label={c}
                                            active={filters.color === c}
                                            onClick={() => toggleColor(c)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Origin Country filter ── */}
                        {allCountries.length > 0 && (
                            <div>
                                <div style={{
                                    fontSize: 11, color: 'var(--color-text-muted)',
                                    letterSpacing: 1.2, marginBottom: 10,
                                    fontWeight: 600, textTransform: 'uppercase',
                                }}>
                                    {t('filters.country')}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                                    {allCountries.map(c => (
                                        <Pill
                                            key={c}
                                            label={c}
                                            active={filters.origin_country === c}
                                            onClick={() => toggleCountry(c)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Price Range filter ── */}
                        <div>
                            <div style={{
                                fontSize: 11, color: 'var(--color-text-muted)',
                                letterSpacing: 1.2, marginBottom: 10,
                                fontWeight: 600, textTransform: 'uppercase',
                            }}>
                                {t('filters.price_range')}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input
                                    type="number"
                                    placeholder={t('filters.price_from')}
                                    value={localPriceMin}
                                    onChange={e => setLocalPriceMin(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && applyPrice()}
                                    style={{
                                        width: 80,
                                        background: 'var(--color-surface-raised)',
                                        border: '1.5px solid var(--color-border-strong)',
                                        borderRadius: 8,
                                        padding: '7px 10px',
                                        fontSize: 13,
                                        color: 'var(--color-text-primary)',
                                        outline: 'none',
                                        fontFamily: 'inherit',
                                    }}
                                />
                                <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>—</span>
                                <input
                                    type="number"
                                    placeholder={t('filters.price_to')}
                                    value={localPriceMax}
                                    onChange={e => setLocalPriceMax(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && applyPrice()}
                                    style={{
                                        width: 80,
                                        background: 'var(--color-surface-raised)',
                                        border: '1.5px solid var(--color-border-strong)',
                                        borderRadius: 8,
                                        padding: '7px 10px',
                                        fontSize: 13,
                                        color: 'var(--color-text-primary)',
                                        outline: 'none',
                                        fontFamily: 'inherit',
                                    }}
                                />
                                <button
                                    onClick={applyPrice}
                                    style={{
                                        padding: '7px 14px',
                                        background: 'var(--color-gold-light)',
                                        border: '1.5px solid rgba(200,168,75,0.4)',
                                        borderRadius: 8,
                                        color: 'var(--color-gold)',
                                        fontSize: 12,
                                        cursor: 'pointer',
                                        fontFamily: 'inherit',
                                        fontWeight: 600,
                                    }}
                                >
                                    {t('filters.apply')}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Clear all filters */}
                    {activeCount > 0 && (
                        <div style={{ marginTop: 16, borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
                            <button
                                onClick={clearAllFilters}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'rgba(255,100,100,0.7)',
                                    fontSize: 13,
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    padding: 0,
                                }}
                            >
                                <X size={13} />
                                {t('filters.clear_all')}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Active filter chips */}
            {activeCount > 0 && (
                <div style={{
                    padding: screenWidth <= 640 ? '8px 12px 0' : '12px 28px 0',
                    display: 'flex',
                    gap: 6,
                    flexWrap: 'wrap',
                }}>
                    {filters.brand && (() => {
                        const b = brands.find(x => String(x.id) === filters.brand)
                        return b ? (
                            <div key="brand" style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                background: 'rgba(200,168,75,0.12)',
                                border: '1px solid rgba(200,168,75,0.3)',
                                borderRadius: 20,
                                padding: '4px 10px 4px 8px',
                                fontSize: 12, color: '#C8A84B',
                            }}>
                                {b.name_ar || b.name}
                                <X size={11} style={{ cursor: 'pointer' }} onClick={() => setFilters(f => ({ ...f, brand: undefined }))} />
                            </div>
                        ) : null
                    })()}
                    {filters.color && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            background: 'rgba(200,168,75,0.12)',
                            border: '1px solid rgba(200,168,75,0.3)',
                            borderRadius: 20,
                            padding: '4px 10px 4px 8px',
                            fontSize: 12, color: '#C8A84B',
                        }}>
                            {filters.color}
                            <X size={11} style={{ cursor: 'pointer' }} onClick={() => setFilters(f => ({ ...f, color: undefined }))} />
                        </div>
                    )}
                    {filters.origin_country && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            background: 'rgba(200,168,75,0.12)',
                            border: '1px solid rgba(200,168,75,0.3)',
                            borderRadius: 20,
                            padding: '4px 10px 4px 8px',
                            fontSize: 12, color: '#C8A84B',
                        }}>
                            {filters.origin_country}
                            <X size={11} style={{ cursor: 'pointer' }} onClick={() => setFilters(f => ({ ...f, origin_country: undefined }))} />
                        </div>
                    )}
                    {(filters.price_min !== undefined || filters.price_max !== undefined) && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            background: 'rgba(200,168,75,0.12)',
                            border: '1px solid rgba(200,168,75,0.3)',
                            borderRadius: 20,
                            padding: '4px 10px 4px 8px',
                            fontSize: 12, color: '#C8A84B',
                        }}>
                            {filters.price_min ?? 0} — {filters.price_max ?? '∞'} ر.س
                            <X size={11} style={{ cursor: 'pointer' }} onClick={() => {
                                setFilters(f => ({ ...f, price_min: undefined, price_max: undefined }))
                                setLocalPriceMin('')
                                setLocalPriceMax('')
                            }} />
                        </div>
                    )}
                </div>
            )}

            {/* Count + View Mode Row */}
            <div style={{
                padding: screenWidth <= 640 ? '8px 12px 4px' : '10px 28px 6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
            }}>
                <div style={{ fontSize: screenWidth <= 640 ? 11 : 12, color: 'var(--color-text-muted)', letterSpacing: 0.3 }}>
                    {!isLoading && `${totalCount} منتج`}
                </div>

                {screenWidth > 480 && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 8,
                        padding: '3px 4px',
                    }}>
                        {VIEW_OPTIONS.map(({ cols, label }) => {
                            const isActive = viewCols === cols
                            const isDisabled = (screenWidth <= 640 && cols > 2)
                                || (screenWidth <= 1024 && cols > 3)
                            return (
                                <button
                                    key={cols}
                                    onClick={() => setViewCols(cols)}
                                    title={label}
                                    disabled={isDisabled}
                                    style={{
                                        width: 30,
                                        height: 26,
                                        borderRadius: 5,
                                        border: 'none',
                                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                                        display: isDisabled ? 'none' : 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: isActive ? 'var(--color-gold-light)' : 'transparent',
                                        color: isActive ? 'var(--color-gold)' : 'var(--color-text-muted)',
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    <ViewColIcon cols={cols} size={14} />
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* ══════════════════════════════════════════
                MASONRY GRID
            ══════════════════════════════════════════ */}
            <div style={{ padding: screenWidth <= 640 ? '2px 2px 40px' : '4px 4px 60px' }}>

                {isLoading ? (
                    <div style={{ columns: `${effectiveCols} ${colMinWidth}`, columnGap: 4 }}>
                        {RATIOS.map((r, i) => <SkeletonCard key={i} ratio={r} />)}
                    </div>

                ) : products.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '100px 0' }}>
                        <Search
                            size={44} strokeWidth={1}
                            color="var(--color-text-muted)"
                            style={{ margin: '0 auto 20px', display: 'block' }}
                        />
                        <p style={{ color: 'var(--color-text-muted)', fontSize: 15, margin: 0 }}>
                            {t('products.none')}
                        </p>
                        {activeCount > 0 && (
                            <button
                                onClick={clearAllFilters}
                                style={{
                                    marginTop: 16,
                                    padding: '8px 20px',
                                    background: 'rgba(200,168,75,0.12)',
                                    border: '1px solid rgba(200,168,75,0.3)',
                                    borderRadius: 8,
                                    color: '#C8A84B',
                                    fontSize: 13,
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                }}
                            >
                                {t('filters.clear')}
                            </button>
                        )}
                    </div>

                ) : (
                    <div style={{ columns: `${effectiveCols} ${colMinWidth}`, columnGap: 4 }}>
                        {products.map((product, idx) => {
                            const isHovered = hoveredId === product.id
                            const ratio = RATIOS[idx % RATIOS.length]
                            const catSlug = product.category_name?.toLowerCase().replace(/\s+/g, '') ?? ''
                            const bgColor = CAT_COLORS[catSlug] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length]

                            return (
                                <div
                                    key={product.id}
                                    style={{
                                        breakInside: 'avoid',
                                        marginBottom: 4,
                                        position: 'relative',
                                        cursor: 'pointer',
                                    }}
                                    onClick={() => navigate(`/products/${product.id}`)}
                                    onMouseEnter={() => setHoveredId(product.id)}
                                    onMouseLeave={() => setHoveredId(null)}
                                >
                                    {/* ── Image wrapper ── */}
                                    <div style={{
                                        position: 'relative',
                                        paddingBottom: ratio,
                                        overflow: 'hidden',
                                        background: bgColor,
                                    }}>

                                        {product.main_image_url ? (
                                            <img
                                                src={product.main_image_url}
                                                alt={product.product_name_ar}
                                                loading="lazy"
                                                style={{
                                                    position: 'absolute', inset: 0,
                                                    width: '100%', height: '100%',
                                                    objectFit: 'cover',
                                                    transform: isHovered ? 'scale(1.06)' : 'scale(1)',
                                                    transition: 'transform 0.55s cubic-bezier(0.25,0.46,0.45,0.94)',
                                                }}
                                            />
                                        ) : (
                                            <div style={{
                                                position: 'absolute', inset: 0,
                                                background: bgColor,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                padding: '20px 16px',
                                            }}>
                                                <span style={{
                                                    fontSize: 15, fontWeight: 600,
                                                    color: 'rgba(255,255,255,0.65)',
                                                    textAlign: 'center', lineHeight: 1.6,
                                                }}>
                                                    {nameField(product)}
                                                </span>
                                            </div>
                                        )}

                                        {/* Category badge */}
                                        <div style={{
                                            position: 'absolute', top: 10, right: 10, zIndex: 2,
                                            background: 'rgba(44, 110, 180, 0.82)',
                                            backdropFilter: 'blur(6px)',
                                            padding: '3px 10px',
                                            borderRadius: 20,
                                            fontSize: 11, color: '#fff',
                                            fontWeight: 500, letterSpacing: 0.2,
                                            pointerEvents: 'none',
                                        }}>
                                            {product.category_name}
                                        </div>

                                        {/* Hover / mobile overlay */}
                                        {(() => {
                                            const isMobileView = screenWidth <= 640
                                            const showOverlay = isMobileView || isHovered
                                            return (
                                                <div style={{
                                                    position: 'absolute', inset: 0, zIndex: 3,
                                                    background: isMobileView
                                                        ? 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.15) 50%, transparent 70%)'
                                                        : 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.35) 45%, transparent 72%)',
                                                    opacity: showOverlay ? 1 : 0,
                                                    transition: 'opacity 0.3s ease',
                                                    display: 'flex', flexDirection: 'column',
                                                    justifyContent: 'flex-end',
                                                    padding: isMobileView ? '10px 10px' : '18px 14px',
                                                    pointerEvents: showOverlay ? 'auto' : 'none',
                                                }}>
                                                    <div style={{
                                                        fontSize: isMobileView ? 13 : 15, fontWeight: 600, color: '#fff',
                                                        lineHeight: 1.45, marginBottom: 2,
                                                        transform: showOverlay ? 'translateY(0)' : 'translateY(8px)',
                                                        transition: 'transform 0.35s ease',
                                                    }}>
                                                        {nameField(product)}
                                                    </div>
                                                    <div style={{
                                                        fontSize: isMobileView ? 10 : 11, color: 'rgba(255,255,255,0.5)',
                                                        marginBottom: isMobileView ? 0 : 10, letterSpacing: 1,
                                                        fontFamily: "'JetBrains Mono', monospace",
                                                        transform: showOverlay ? 'translateY(0)' : 'translateY(8px)',
                                                        transition: 'transform 0.35s ease 0.04s',
                                                    }}>
                                                        {product.sku}
                                                    </div>
                                                    {!isMobileView && (
                                                        <div style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                                            fontSize: 13, color: '#C8A84B', fontWeight: 600,
                                                            transform: isHovered ? 'translateY(0)' : 'translateY(8px)',
                                                            transition: 'transform 0.35s ease 0.08s',
                                                        }}>
                                                            {t('products.view')}
                                                            <span style={{ display: 'inline-block', transform: isAr ? 'scaleX(-1)' : '' }}>→</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })()}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* ══════════════════════════════════════════
                INFINITE SCROLL SENTINEL
            ══════════════════════════════════════════ */}
            <div ref={loadMoreRef} style={{ height: 1 }} />
            {isFetchingNextPage && (
                <div style={{
                    display: 'flex', justifyContent: 'center',
                    alignItems: 'center', gap: 10,
                    padding: '24px 0 40px',
                }}>
                    <div style={{
                        width: 28, height: 28,
                        border: '3px solid var(--color-border-strong)',
                        borderTopColor: 'var(--color-gold)',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                    }} />
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
                        {t('products.loading', 'جاري تحميل المزيد...')}
                    </span>
                </div>
            )}
            {!hasNextPage && products.length > 0 && (
                <div style={{
                    textAlign: 'center',
                    padding: '24px 0 40px',
                    color: 'var(--color-text-muted)',
                    fontSize: 13,
                }}>
                    {t('products.allLoaded', `تم عرض جميع المنتجات (${totalCount})`)}
                </div>
            )}

            <div style={{ textAlign: 'center', padding: '32px 0 8px' }}>
                <button
                    onClick={resetOnboarding}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 11, color: 'var(--color-text-muted)', opacity: 0.35,
                        fontFamily: 'inherit', padding: '4px 12px',
                    }}
                >
                    إعادة عرض الترحيب
                </button>
            </div>

            {/* ── Fixed category children dropdown (outside overflow containers) ── */}
            {hoverCatId !== null && dropdownRect && (() => {
                const cat = categories.find(c => c.id === hoverCatId)
                const kids = cat ? childrenOf(cat.id) : []
                if (!cat || kids.length === 0) return null
                return (
                    <div
                        onMouseEnter={cancelClose}
                        onMouseLeave={closeCatDropdown}
                        style={{
                            position: 'fixed',
                            top: dropdownRect.top,
                            right: dropdownRect.right,
                            zIndex: 9999,
                            minWidth: 180,
                            background: 'var(--color-surface)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 10,
                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                            padding: '6px',
                            direction: 'rtl',
                        }}
                    >
                        {/* All parent */}
                        <button
                            onClick={() => { setFilters(f => ({ ...f, category: String(cat.id), page: 1 })); setHoverCatId(null); setDropdownRect(null) }}
                            style={{
                                display: 'block', width: '100%', textAlign: 'right',
                                padding: '8px 12px', background: 'none', border: 'none',
                                cursor: 'pointer', borderRadius: 6, fontSize: 13,
                                fontFamily: 'inherit', color: 'var(--color-text-secondary)',
                                fontStyle: 'italic',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                            {isAr ? `كل ${cat.name_ar}` : `All ${cat.name_en ?? cat.name_ar}`}
                        </button>
                        <div style={{ height: 1, background: 'var(--color-border)', margin: '2px 6px' }} />
                        {kids.map(child => (
                            <button
                                key={child.id}
                                onClick={() => { setFilters(f => ({ ...f, category: String(child.id), page: 1 })); setHoverCatId(null); setDropdownRect(null) }}
                                style={{
                                    display: 'block', width: '100%', textAlign: 'right',
                                    padding: '9px 12px', background: 'none', border: 'none',
                                    cursor: 'pointer', borderRadius: 6, fontSize: 13,
                                    fontFamily: 'inherit', color: 'var(--color-text-primary)',
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(200,168,75,0.09)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                            >
                                {catName(child)}
                            </button>
                        ))}
                    </div>
                )
            })()}
        </div>
    )
}
