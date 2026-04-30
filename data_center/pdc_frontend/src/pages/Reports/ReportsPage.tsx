/**
 * Reports Page — Live Completeness Analytics
 * Real-time data computed directly from active products
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
    RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts'
import { analyticsAPI } from '@/api/client'
import { BarChart2, RefreshCw, TrendingUp, AlertTriangle, CheckCircle2, Package, Target } from 'lucide-react'

/* ── Types ─────────────────────────────────────────────────────────────────── */
interface FilterOption { id: number; name_ar: string; count: number }
interface InvOption    { value: string; label: string; count: number }
interface StatusOption { value: string; label: string; count: number }

interface LiveReport {
    total_products: number
    overall_score: number
    complete_products: number
    complete_pct: number
    category_breakdown: { category: string; avg_score: number; count: number; color: string }[]
    score_distribution: { range: string; count: number; color: string }[]
    field_gaps: { key: string; label: string; points: number; missing_count: number; missing_pct: number }[]
    worst_products: { id: number; sku: string; name_ar: string; category: string; score: number; missing: string[] }[]
    top_products: { id: number; sku: string; name_ar: string; category: string; score: number }[]
    max_score: number
    is_dept_restricted: boolean
    dept_name: string | null
    filter_options: {
        categories: FilterOption[]
        brands: FilterOption[]
        inventory_types: InvOption[]
        statuses: StatusOption[]
    }
}

interface Filters {
    category_id: number | null
    brand_id: number | null
    score_range: string | null
    inventory_type: string | null
    status: string | null
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */
const scoreColor = (s: number) =>
    s >= 76 ? '#22C55E' : s >= 51 ? '#EAB308' : s >= 26 ? '#F97316' : '#EF4444'

const scoreBg = (s: number) =>
    s >= 76 ? 'rgba(34,197,94,0.1)' : s >= 51 ? 'rgba(234,179,8,0.1)' : s >= 26 ? 'rgba(249,115,22,0.1)' : 'rgba(239,68,68,0.1)'

const scoreLabel = (s: number) =>
    s >= 76 ? 'ممتاز' : s >= 51 ? 'جيد' : s >= 26 ? 'متوسط' : 'ضعيف'

/* ── Score Ring ─────────────────────────────────────────────────────────────── */
function ScoreRing({ score }: { score: number }) {
    const data = [{ value: score, fill: scoreColor(score) }]
    return (
        <div style={{ position: 'relative', width: 160, height: 160 }}>
            <RadialBarChart
                width={160} height={160}
                cx={80} cy={80}
                innerRadius={55} outerRadius={75}
                barSize={14}
                data={data}
                startAngle={90} endAngle={-270}
            >
                <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                <RadialBar background={{ fill: 'var(--color-surface-hover)' }} dataKey="value" angleAxisId={0} />
            </RadialBarChart>
            <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
            }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: scoreColor(score), lineHeight: 1 }}>
                    {score.toFixed(0)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>/ 100</div>
                <div style={{ fontSize: 10, color: scoreColor(score), fontWeight: 600, marginTop: 3 }}>
                    {scoreLabel(score)}
                </div>
            </div>
        </div>
    )
}


/* ── Main Page ──────────────────────────────────────────────────────────────── */
export default function ReportsPage() {
    const [refetchKey, setRefetchKey] = useState(0)
    const [filters, setFilters] = useState<Filters>({
        category_id: null,
        brand_id: null,
        score_range: null,
        inventory_type: null,
        status: null,
    })
    const [showFilters, setShowFilters] = useState(false)

    const activeFilterCount = Object.values(filters).filter(Boolean).length

    const { data, isLoading, isFetching } = useQuery<LiveReport>({
        queryKey: ['completeness-live', refetchKey, filters],
        queryFn: () => analyticsAPI.live({
            category_id: filters.category_id,
            brand_id: filters.brand_id,
            score_range: filters.score_range,
            inventory_type: filters.inventory_type,
            status: filters.status,
        }).then(r => r.data),
        staleTime: 0,
    })

    const setFilter = <K extends keyof Filters>(key: K, val: Filters[K]) =>
        setFilters(f => ({ ...f, [key]: f[key] === val ? null : val }))

    const clearFilters = () => setFilters({ category_id: null, brand_id: null, score_range: null, inventory_type: null, status: null })

    const r = data

    return (
        <div className="page-enter" style={{ fontFamily: 'inherit' }}>
            {/* ── Header ── */}
            <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h1 className="page-header-title">تقارير الاكتمال</h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                        <p className="page-header-sub" style={{ margin: 0 }}>بيانات لحظية مباشرة من كل المنتجات</p>
                        {data?.is_dept_restricted && data.dept_name && (
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                background: 'rgba(200,168,75,0.12)', border: '1px solid rgba(200,168,75,0.35)',
                                borderRadius: 20, padding: '2px 10px',
                                fontSize: 11, fontWeight: 700, color: 'var(--color-gold)',
                            }}>
                                <span style={{ fontSize: 10 }}>📂</span>
                                {data.dept_name} فقط
                            </span>
                        )}
                    </div>
                </div>
                <button
                    onClick={() => setRefetchKey(k => k + 1)}
                    disabled={isFetching}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px',
                        background: 'rgba(200,168,75,0.1)', border: '1px solid rgba(200,168,75,0.3)',
                        borderRadius: 8, color: 'var(--color-gold)', fontSize: 12, fontWeight: 600,
                        cursor: isFetching ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                        opacity: isFetching ? 0.6 : 1,
                    }}
                >
                    <RefreshCw size={13} style={{ animation: isFetching ? 'spin 0.8s linear infinite' : 'none' }} />
                    تحديث
                </button>
            </div>

            {/* ── Filters bar ── */}
            <div style={{
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                borderRadius: 14, marginBottom: 20, overflow: 'hidden',
            }}>
                {/* Filter toggle row */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 20px', cursor: 'pointer',
                }} onClick={() => setShowFilters(v => !v)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Target size={14} style={{ color: 'var(--color-gold)' }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>تصفية النتائج</span>
                        {activeFilterCount > 0 && (
                            <span style={{
                                background: '#C8A84B', color: 'var(--color-bg)',
                                borderRadius: 20, fontSize: 10, fontWeight: 800,
                                padding: '1px 7px', marginRight: 2,
                            }}>{activeFilterCount} فلتر نشط</span>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {activeFilterCount > 0 && (
                            <button onClick={e => { e.stopPropagation(); clearFilters() }} style={{
                                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                                color: '#EF4444', borderRadius: 6, padding: '3px 10px',
                                fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                            }}>مسح الكل</button>
                        )}
                        <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{showFilters ? '▲' : '▼'}</span>
                    </div>
                </div>

                {/* Filter panels */}
                {showFilters && (
                    <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--color-border)' }}>

                        {/* Score Range */}
                        <div style={{ marginTop: 16 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8, letterSpacing: 1 }}>نطاق الاكتمال</div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {[
                                    { value: 'low',     label: 'ضعيف (0–50%)',    color: '#EF4444' },
                                    { value: 'medium',  label: 'متوسط (51–79%)', color: '#F97316' },
                                    { value: 'high',    label: 'جيد (80–99%)',    color: '#EAB308' },
                                    { value: 'perfect', label: 'مكتمل (100%)',    color: '#22C55E' },
                                ].map(opt => (
                                    <button key={opt.value} onClick={() => setFilter('score_range', opt.value)}
                                        style={{
                                            padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                                            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                                            background: filters.score_range === opt.value ? `${opt.color}20` : 'var(--color-surface-raised)',
                                            border: `1px solid ${filters.score_range === opt.value ? opt.color : 'var(--color-border-strong)'}`,
                                            color: filters.score_range === opt.value ? opt.color : 'var(--color-text-secondary)',
                                        }}>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Status (نشط / مسودة) */}
                        {data?.filter_options?.statuses && data.filter_options.statuses.length > 1 && (
                            <div style={{ marginTop: 16 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8, letterSpacing: 1 }}>الحالة</div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {data.filter_options.statuses.map(opt => (
                                        <button key={opt.value} onClick={() => setFilter('status', opt.value)}
                                            style={{
                                                padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                                                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                                                background: filters.status === opt.value ? 'rgba(34,197,94,0.15)' : 'var(--color-surface-raised)',
                                                border: `1px solid ${filters.status === opt.value ? '#22C55E' : 'var(--color-border-strong)'}`,
                                                color: filters.status === opt.value ? '#22C55E' : 'var(--color-text-secondary)',
                                            }}>
                                            {opt.label}
                                            <span style={{ opacity: 0.55, fontSize: 10, marginRight: 5 }}>({opt.count.toLocaleString('ar')})</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Inventory type */}
                        {data?.filter_options?.inventory_types && data.filter_options.inventory_types.length > 1 && (
                            <div style={{ marginTop: 16 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8, letterSpacing: 1 }}>نوع المخزون</div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {data.filter_options.inventory_types.map(opt => (
                                        <button key={opt.value} onClick={() => setFilter('inventory_type', opt.value)}
                                            style={{
                                                padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                                                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                                                background: filters.inventory_type === opt.value ? 'rgba(200,168,75,0.15)' : 'var(--color-surface-raised)',
                                                border: `1px solid ${filters.inventory_type === opt.value ? '#C8A84B' : 'var(--color-border-strong)'}`,
                                                color: filters.inventory_type === opt.value ? '#C8A84B' : 'var(--color-text-secondary)',
                                            }}>
                                            {opt.label}
                                            <span style={{ opacity: 0.55, fontSize: 10, marginRight: 5 }}>({opt.count})</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Category filter — hidden for dept managers (auto-scoped to their dept) */}
                        {!data?.is_dept_restricted && data?.filter_options?.categories && data.filter_options.categories.length > 0 && (
                            <div style={{ marginTop: 16 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8, letterSpacing: 1 }}>القسم</div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {data.filter_options.categories.map(cat => (
                                        <button key={cat.id} onClick={() => setFilter('category_id', cat.id)}
                                            style={{
                                                padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                                                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                                                background: filters.category_id === cat.id ? 'rgba(99,179,237,0.15)' : 'var(--color-surface-raised)',
                                                border: `1px solid ${filters.category_id === cat.id ? '#63B3ED' : 'var(--color-border-strong)'}`,
                                                color: filters.category_id === cat.id ? '#63B3ED' : 'var(--color-text-secondary)',
                                            }}>
                                            {cat.name_ar}
                                            <span style={{ opacity: 0.55, fontSize: 10, marginRight: 5 }}>({cat.count})</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Brand filter */}
                        {data?.filter_options?.brands && data.filter_options.brands.length > 0 && (
                            <div style={{ marginTop: 16 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8, letterSpacing: 1 }}>الماركة</div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxHeight: 120, overflowY: 'auto' }}>
                                    {data.filter_options.brands.map(b => (
                                        <button key={b.id} onClick={() => setFilter('brand_id', b.id)}
                                            style={{
                                                padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                                                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                                                background: filters.brand_id === b.id ? 'rgba(167,139,250,0.15)' : 'var(--color-surface-raised)',
                                                border: `1px solid ${filters.brand_id === b.id ? '#A78BFA' : 'var(--color-border-strong)'}`,
                                                color: filters.brand_id === b.id ? '#A78BFA' : 'var(--color-text-secondary)',
                                            }}>
                                            {b.name_ar}
                                            <span style={{ opacity: 0.55, fontSize: 10, marginRight: 5 }}>({b.count})</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Active filter chips ── */}
            {activeFilterCount > 0 && data && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                    {filters.score_range && (
                        <span style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: 'rgba(200,168,75,0.12)', border: '1px solid rgba(200,168,75,0.3)',
                            borderRadius: 20, padding: '3px 12px', fontSize: 12, color: 'var(--color-gold)',
                        }}>
                            نطاق: {filters.score_range === 'low' ? 'ضعيف' : filters.score_range === 'medium' ? 'متوسط' : filters.score_range === 'high' ? 'جيد' : 'مكتمل'}
                            <button onClick={() => setFilter('score_range', null)} style={{ background: 'none', border: 'none', color: 'var(--color-gold)', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                        </span>
                    )}
                    {filters.category_id && (
                        <span style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: 'rgba(99,179,237,0.12)', border: '1px solid rgba(99,179,237,0.3)',
                            borderRadius: 20, padding: '3px 12px', fontSize: 12, color: '#63B3ED',
                        }}>
                            قسم: {data.filter_options?.categories?.find(c => c.id === filters.category_id)?.name_ar}
                            <button onClick={() => setFilter('category_id', null)} style={{ background: 'none', border: 'none', color: '#63B3ED', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                        </span>
                    )}
                    {filters.brand_id && (
                        <span style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)',
                            borderRadius: 20, padding: '3px 12px', fontSize: 12, color: '#A78BFA',
                        }}>
                            ماركة: {data.filter_options?.brands?.find(b => b.id === filters.brand_id)?.name_ar}
                            <button onClick={() => setFilter('brand_id', null)} style={{ background: 'none', border: 'none', color: '#A78BFA', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                        </span>
                    )}
                    {filters.inventory_type && (
                        <span style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: 'rgba(200,168,75,0.12)', border: '1px solid rgba(200,168,75,0.3)',
                            borderRadius: 20, padding: '3px 12px', fontSize: 12, color: 'var(--color-gold)',
                        }}>
                            مخزون: {filters.inventory_type}
                            <button onClick={() => setFilter('inventory_type', null)} style={{ background: 'none', border: 'none', color: 'var(--color-gold)', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                        </span>
                    )}
                    {filters.status && (
                        <span style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
                            borderRadius: 20, padding: '3px 12px', fontSize: 12, color: '#22C55E',
                        }}>
                            الحالة: {filters.status}
                            <button onClick={() => setFilter('status', null)} style={{ background: 'none', border: 'none', color: '#22C55E', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                        </span>
                    )}
                </div>
            )}

            {/* ── Loading skeleton ── */}
            {isLoading && (
                <div className="resp-kpi-grid" style={{ marginBottom: 24 }}>
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="skeleton" style={{ height: 110, borderRadius: 12 }} />
                    ))}
                </div>
            )}

            {/* ── No data ── */}
            {!isLoading && r && r.total_products === 0 && (
                <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--color-text-muted)' }}>
                    <BarChart2 size={52} strokeWidth={1} style={{ marginBottom: 16, opacity: 0.4 }} />
                    <p style={{ fontSize: 15 }}>لا توجد منتجات بعد</p>
                    <p style={{ fontSize: 12, marginTop: 6 }}>أضف منتجات أو خفّف الفلاتر لعرض التقرير</p>
                </div>
            )}

            {r && r.total_products > 0 && (
                <>
                    {/* ── KPI Row ── */}
                    <div className="resp-kpi-grid" style={{ marginBottom: 28 }}>
                        {[
                            {
                                icon: Target, color: 'var(--color-gold)',
                                label: 'معدل الاكتمال العام',
                                value: `${r.overall_score.toFixed(1)}%`,
                                sub: scoreLabel(r.overall_score),
                            },
                            {
                                icon: Package, color: '#60A5FA',
                                label: filters.status ? `إجمالي المنتجات (${filters.status})` : 'إجمالي المنتجات',
                                value: r.total_products.toLocaleString('ar-SA'),
                                sub: filters.status ? `منتج ${filters.status}` : 'كل الحالات',
                            },
                            {
                                icon: CheckCircle2, color: '#22C55E',
                                label: 'منتجات مكتملة (≥ 80%)',
                                value: r.complete_products.toLocaleString('ar-SA'),
                                sub: `${r.complete_pct}% من الإجمالي`,
                            },
                            {
                                icon: AlertTriangle, color: '#F97316',
                                label: 'تحتاج تحسين (< 50%)',
                                value: (r.score_distribution[0].count + r.score_distribution[1].count).toLocaleString('ar-SA'),
                                sub: 'منتج بيانات ناقصة',
                            },
                        ].map(({ icon: Icon, color, label, value, sub }) => (
                            <div key={label} style={{
                                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                                borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14,
                            }}>
                                <div style={{
                                    width: 46, height: 46, borderRadius: 12, flexShrink: 0,
                                    background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <Icon size={20} color={color} strokeWidth={1.5} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{label}</div>
                                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1 }}>{value}</div>
                                    <div style={{ fontSize: 11, color, marginTop: 4 }}>{sub}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* ── Overall Score + Distribution ── */}
                    <div className="resp-grid-sidebar" style={{ marginBottom: 24 }}>
                        {/* Score ring */}
                        <div style={{
                            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                            borderRadius: 14, padding: '24px 20px', display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', gap: 12,
                        }}>
                            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 600 }}>معدل الاكتمال الإجمالي</div>
                            <ScoreRing score={r.overall_score} />
                            <div style={{
                                padding: '4px 12px', borderRadius: 20,
                                background: scoreBg(r.overall_score),
                                color: scoreColor(r.overall_score), fontSize: 11, fontWeight: 600,
                            }}>
                                {scoreLabel(r.overall_score)}
                            </div>
                        </div>

                        {/* Distribution */}
                        <div style={{
                            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                            borderRadius: 14, padding: '24px 24px',
                        }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 20 }}>توزيع نسب الاكتمال</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                {r.score_distribution.map(d => (
                                    <div key={d.range}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{d.range}</span>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: d.color }}>
                                                {d.count} منتج ({r.total_products > 0 ? Math.round(d.count / r.total_products * 100) : 0}%)
                                            </span>
                                        </div>
                                        <div style={{ height: 8, background: 'var(--color-surface-hover)', borderRadius: 4, overflow: 'hidden' }}>
                                            <div style={{
                                                height: '100%', borderRadius: 4, background: d.color,
                                                width: `${r.total_products > 0 ? (d.count / r.total_products * 100) : 0}%`,
                                                transition: 'width 0.8s ease',
                                            }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ── Category breakdown ── */}
                    {r.category_breakdown.length > 0 && (
                        <div style={{
                            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                            borderRadius: 14, padding: '24px', marginBottom: 24,
                        }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 24 }}>اكتمال البيانات حسب القسم</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {[...r.category_breakdown].sort((a, b) => b.avg_score - a.avg_score).map(c => (
                                    <div key={c.category} style={{ display: 'flex', alignItems: 'center', gap: 14, direction: 'rtl' }}>
                                        {/* Category name */}
                                        <div style={{
                                            width: 160, flexShrink: 0, fontSize: 13, fontWeight: 600,
                                            color: 'var(--color-text-primary)', textAlign: 'right',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {c.category}
                                        </div>
                                        {/* Bar track */}
                                        <div style={{
                                            flex: 1, height: 34, background: 'var(--color-surface-hover)',
                                            borderRadius: 8, overflow: 'hidden', position: 'relative',
                                        }}>
                                            <div style={{
                                                height: '100%', borderRadius: 8,
                                                background: `linear-gradient(90deg, ${c.color}99, ${c.color})`,
                                                width: `${c.avg_score}%`,
                                                transition: 'width 0.9s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                                                paddingLeft: 10,
                                            }}>
                                                {c.avg_score >= 20 && (
                                                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-text-primary)', direction: 'ltr', paddingLeft: 6 }}>
                                                        {c.avg_score}%
                                                    </span>
                                                )}
                                            </div>
                                            {c.avg_score < 20 && (
                                                <span style={{
                                                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                                                    fontSize: 12, fontWeight: 800, color: 'var(--color-text-secondary)',
                                                }}>
                                                    {c.avg_score}%
                                                </span>
                                            )}
                                        </div>
                                        {/* Count badge */}
                                        <div style={{
                                            width: 56, flexShrink: 0, textAlign: 'center',
                                            padding: '3px 8px', borderRadius: 20,
                                            background: `${c.color}18`, border: `1px solid ${c.color}44`,
                                            fontSize: 11, fontWeight: 600, color: c.color,
                                        }}>
                                            {c.count} منتج
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {/* X-axis labels */}
                            <div style={{ display: 'flex', marginRight: 174, marginLeft: 70, marginTop: 12, justifyContent: 'space-between', direction: 'ltr' }}>
                                {[0, 25, 50, 75, 100].map(v => (
                                    <span key={v} style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{v}%</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Field gaps + Worst products ── */}
                    <div className="resp-2col" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 24 }}>
                        {/* Field gaps */}
                        <div style={{
                            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                            borderRadius: 14, padding: '24px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                                <AlertTriangle size={15} color="#F97316" />
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>أكثر الحقول غياباً</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {r.field_gaps.slice(0, 8).map(g => (
                                    <div key={g.key}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{g.label}</span>
                                            <span style={{ fontSize: 11, color: '#F97316', fontWeight: 600 }}>
                                                {g.missing_count} منتج ({g.missing_pct}%) · -{g.points}نقطة
                                            </span>
                                        </div>
                                        <div style={{ height: 5, background: 'var(--color-surface-hover)', borderRadius: 3, overflow: 'hidden' }}>
                                            <div style={{
                                                height: '100%', borderRadius: 3,
                                                background: g.missing_pct > 60 ? '#EF4444' : g.missing_pct > 30 ? '#F97316' : '#EAB308',
                                                width: `${g.missing_pct}%`,
                                                transition: 'width 0.8s ease',
                                            }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Worst products */}
                        <div style={{
                            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                            borderRadius: 14, padding: '24px', display: 'flex', flexDirection: 'column',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                <TrendingUp size={15} color="#EF4444" style={{ transform: 'rotate(180deg)' }} />
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>المنتجات الأقل اكتمالاً</span>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', maxHeight: 320 }}>
                                {r.worst_products.map((p, i) => (
                                    <div key={p.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '8px 0', borderBottom: '1px solid var(--color-border)',
                                    }}>
                                        <div style={{
                                            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                                            background: scoreBg(p.score),
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 10, fontWeight: 800, color: scoreColor(p.score),
                                        }}>
                                            {p.score}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 12, color: 'var(--color-text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {p.name_ar}
                                            </div>
                                            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 1 }}>
                                                {p.sku} · {p.category}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 3, flexShrink: 0, flexWrap: 'wrap', maxWidth: 120, justifyContent: 'flex-end' }}>
                                            {p.missing.slice(0, 3).map(f => (
                                                <span key={f} style={{
                                                    fontSize: 9, padding: '1px 5px', borderRadius: 4,
                                                    background: 'rgba(239,68,68,0.12)', color: '#EF4444',
                                                }}>
                                                    {f === 'main_image' ? 'صورة' : f === 'description_ar' ? 'وصف' :
                                                     f === 'brand' ? 'ماركة' : f === 'attributes' ? 'سمات' :
                                                     f === 'origin_country' ? 'بلد' : f === 'price_sar' ? 'سعر' :
                                                     f === 'product_name_en' ? 'EN' : f === 'lifestyle_image' ? 'ديكور' : f}
                                                </span>
                                            ))}
                                            {p.missing.length > 3 && (
                                                <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>+{p.missing.length - 3}</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ── Top products ── */}
                    {r.top_products.length > 0 && (
                        <div style={{
                            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                            borderRadius: 14, padding: '24px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                <TrendingUp size={15} color="#22C55E" />
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>المنتجات الأكثر اكتمالاً</span>
                            </div>
                            <div className="resp-grid-auto" style={{ gap: 10 }}>
                                {r.top_products.map((p, i) => (
                                    <div key={p.id} style={{
                                        padding: '10px 14px', borderRadius: 10,
                                        background: 'rgba(34,197,94,0.06)',
                                        border: '1px solid rgba(34,197,94,0.15)',
                                        display: 'flex', alignItems: 'center', gap: 10,
                                    }}>
                                        <div style={{
                                            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                                            background: 'rgba(34,197,94,0.15)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 12, fontWeight: 800, color: '#22C55E',
                                        }}>
                                            {p.score}
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: 12, color: 'var(--color-text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {p.name_ar}
                                            </div>
                                            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 1 }}>
                                                {p.category}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Footer ── */}
                    <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 11, marginTop: 28, paddingBottom: 8 }}>
                        البيانات لحظية من {r.total_products.toLocaleString('ar-SA')} منتج{filters.status ? ` (${filters.status})` : ''} · معادلة الاكتمال: وصف (15) + صورة رئيسية (15) + سمات (15) + ماركة (10) + بلد (10) + سعر (10) + اسم EN (10) + رابط (5) + لون (5) + صورة ديكورية (5)
                    </div>
                </>
            )}
        </div>
    )
}
