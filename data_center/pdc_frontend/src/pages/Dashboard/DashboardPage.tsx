/**
 * Dashboard Page — rebuilt with live data
 * KPIs · Category Completeness · Pending Approvals · Recent Activity · Worst Products · Quick Actions
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
    Package, BarChart2, ImageOff, ClipboardCheck,
    AlertTriangle, CheckCircle2, TrendingUp, TrendingDown,
    Plus, Upload, BookOpen, ChevronLeft,
    Activity, Clock, Search, ChevronDown,
} from 'lucide-react'
import { analyticsAPI, approvalsAPI, logsAPI } from '@/api/client'
import { useAuthStore } from '@/store/authStore'

/* ── Types ── */
interface LiveReport {
    total_products: number
    overall_score: number
    complete_products: number
    complete_pct: number
    is_dept_restricted: boolean
    dept_name: string | null
    category_breakdown: { category: string; avg_score: number; count: number; color: string }[]
    field_gaps: { key: string; label: string; points: number; missing_count: number; missing_pct: number }[]
    worst_products: { id: number; sku: string; name_ar: string; category: string; score: number }[]
    filter_options: { categories: { id: number; name_ar: string }[] }
}
interface ApprovalList { count: number }
interface LogEntry {
    id: number
    action: string
    action_display: string
    user_name: string
    object_repr: string
    created_at: string
    content_type: string
}

/* ── Helpers ── */
const scoreColor = (s: number) =>
    s >= 76 ? '#22C55E' : s >= 51 ? '#EAB308' : s >= 26 ? '#F97316' : '#EF4444'

const scoreLabel = (s: number) =>
    s >= 76 ? 'ممتاز' : s >= 51 ? 'جيد' : s >= 26 ? 'متوسط' : 'ضعيف'

function timeAgo(dateStr: string) {
    if (!dateStr) return '—'
    const parsed = new Date(dateStr)
    if (isNaN(parsed.getTime())) return '—'
    const diff = Math.floor((Date.now() - parsed.getTime()) / 1000)
    if (diff < 0) return 'الآن'
    if (diff < 60) return `قبل ${diff} ث`
    if (diff < 3600) return `قبل ${Math.floor(diff / 60)} د`
    if (diff < 86400) return `قبل ${Math.floor(diff / 3600)} س`
    const days = Math.floor(diff / 86400)
    return `قبل ${days} ${days === 1 ? 'يوم' : 'يوم'}`
}

function actionColor(action: string) {
    if (action === 'create') return '#22C55E'
    if (action === 'update') return '#3B82F6'
    if (action === 'delete') return '#EF4444'
    return '#C8A84B'
}

function actionIcon(action: string) {
    if (action === 'create') return <Plus size={11} />
    if (action === 'update') return <Activity size={11} />
    if (action === 'delete') return <AlertTriangle size={11} />
    return <Activity size={11} />
}

/* ── Sub-components ── */
function KpiCard({
    label, value, sub, icon: Icon, color, onClick
}: {
    label: string; value: string | number; sub?: string
    icon: React.ElementType; color: string; onClick?: () => void
}) {
    return (
        <div
            onClick={onClick}
            style={{
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-card)', padding: '20px 22px',
                cursor: onClick ? 'pointer' : 'default',
                transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => onClick && ((e.currentTarget as HTMLDivElement).style.borderColor = `${color}55`)}
            onMouseLeave={e => onClick && ((e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border)')}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: `${color}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Icon size={18} color={color} strokeWidth={1.6} />
                </div>
                {onClick && <ChevronLeft size={14} style={{ color: 'var(--color-text-muted)', marginTop: 4 }} />}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1, marginBottom: 6 }}>
                {value}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>{label}</div>
            {sub && <div style={{ fontSize: 11, color, fontWeight: 600, marginTop: 5 }}>{sub}</div>}
        </div>
    )
}

function QuickAction({ icon: Icon, label, color, onClick }: {
    icon: React.ElementType; label: string; color: string; onClick: () => void
}) {
    return (
        <button onClick={onClick} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: `${color}0f`, border: `1px solid ${color}30`,
            borderRadius: 10, padding: '11px 16px', cursor: 'pointer',
            fontFamily: 'inherit', color: color,
            fontSize: 13, fontWeight: 600, transition: 'all 0.15s', flex: 1,
            justifyContent: 'center',
        }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${color}1a`; (e.currentTarget as HTMLButtonElement).style.borderColor = `${color}60` }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `${color}0f`; (e.currentTarget as HTMLButtonElement).style.borderColor = `${color}30` }}
        >
            <Icon size={15} strokeWidth={1.8} />
            {label}
        </button>
    )
}

/* ── Main ── */
export default function DashboardPage() {
    const navigate = useNavigate()
    const user = useAuthStore(s => s.user)
    const isDeptManager = user?.role === 'مدير_قسم'

    const [catSearch, setCatSearch] = useState('')
    const [catVisible, setCatVisible] = useState(10)

    const { data: live, isLoading: liveLoading } = useQuery<LiveReport>({
        queryKey: ['dashboard-live'],
        queryFn: () => analyticsAPI.dashboard().then(r => r.data),
        staleTime: 10 * 60_000,
        retry: 1,
    })

    const { data: approvals } = useQuery<ApprovalList>({
        queryKey: ['pending-approvals-count'],
        queryFn: () => approvalsAPI.list({ status: 'pending' }).then(r => r.data),
        staleTime: 30_000,
    })

    const { data: logsData } = useQuery<{ results: LogEntry[] }>({
        queryKey: ['recent-activity'],
        queryFn: () => logsAPI.list({ page_size: 8 }).then(r => r.data),
        staleTime: 30_000,
    })

    const pendingCount = approvals?.count ?? 0
    const recentLogs = logsData?.results ?? []
    const top5worst = live?.worst_products?.slice(0, 5) ?? []
    const categoryBreakdown = live?.category_breakdown ?? []

    const missingImgCount = live?.field_gaps?.find(f => f.key === 'main_image')?.missing_count ?? 0

    return (
        <div className="page-enter" style={{ fontFamily: 'inherit' }}>

            {/* ── Header ── */}
            <div style={{ marginBottom: 28 }}>
                <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 4 }}>
                    أهلاً، {user?.name_ar?.split(' ')[0]} 👋
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <p style={{ fontSize: 13, color: 'var(--color-blue)', margin: 0 }}>
                        لوحة التحكم الرئيسية — مركز بيانات منتجات بيت الإباء
                    </p>
                    {live?.is_dept_restricted && live.dept_name && (
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            background: 'rgba(200,168,75,0.12)', border: '1px solid rgba(200,168,75,0.35)',
                            borderRadius: 20, padding: '2px 10px',
                            fontSize: 11, fontWeight: 700, color: 'var(--color-gold)',
                        }}>
                            📂 {live.dept_name} فقط
                        </span>
                    )}
                </div>
            </div>

            {/* ── Quick Actions ── */}
            <div className="resp-quick-actions" style={{ marginBottom: 24 }}>
                <QuickAction icon={Plus} label="منتج جديد" color="#22C55E" onClick={() => navigate('/products/new')} />
                <QuickAction icon={Upload} label="استيراد Excel" color="#3B82F6" onClick={() => navigate('/products')} />
                <QuickAction icon={BookOpen} label="توليد كتالوج" color="#C8A84B" onClick={() => navigate('/catalog-generator')} />
                {!isDeptManager && (
                    <QuickAction icon={BarChart2} label="تقارير الاكتمال" color="#A78BFA" onClick={() => navigate('/reports')} />
                )}
                {!isDeptManager && pendingCount > 0 && (
                    <QuickAction icon={ClipboardCheck} label={`موافقات معلقة (${pendingCount})`} color="#F97316" onClick={() => navigate('/approvals')} />
                )}
            </div>

            {/* ── KPI Cards ── */}
            <div className="resp-kpi-grid" style={{ marginBottom: 24 }}>
                <KpiCard
                    value={liveLoading ? '…' : live?.total_products?.toLocaleString('ar') ?? 0}
                    label="إجمالي المنتجات"
                    icon={Package}
                    color="#63B3ED"
                    onClick={() => navigate('/products')}
                />
                <KpiCard
                    value={liveLoading ? '…' : live ? `${live.overall_score.toFixed(0)}%` : '—'}
                    label="متوسط اكتمال البيانات"
                    sub={live ? scoreLabel(live.overall_score) : undefined}
                    icon={BarChart2}
                    color={live ? scoreColor(live.overall_score) : '#C8A84B'}
                    onClick={() => navigate('/reports')}
                />
                <KpiCard
                    value={liveLoading ? '…' : live?.complete_products ?? 0}
                    label="منتجات مكتملة (≥80%)"
                    sub={live ? `${live.complete_pct}% من الإجمالي` : undefined}
                    icon={CheckCircle2}
                    color="#22C55E"
                />
                <KpiCard
                    value={liveLoading ? '…' : missingImgCount}
                    label="منتجات بلا صورة رئيسية"
                    icon={ImageOff}
                    color="#EF4444"
                    onClick={() => navigate('/products')}
                />
                {!isDeptManager && (
                    <KpiCard
                        value={pendingCount}
                        label="طلبات موافقة معلقة"
                        sub={pendingCount > 0 ? 'تحتاج مراجعة' : 'لا يوجد معلق'}
                        icon={ClipboardCheck}
                        color={pendingCount > 0 ? '#F97316' : '#22C55E'}
                        onClick={() => navigate('/approvals')}
                    />
                )}
            </div>

            {/* ── Row 2: Category Completeness + Recent Activity ── */}
            <div className="resp-2col" style={{ marginBottom: 18 }}>

                {/* Category Completeness */}
                <div style={{
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-card)', padding: '22px 24px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <BarChart2 size={15} style={{ color: 'var(--color-gold)' }} />
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>اكتمال البيانات حسب القسم</span>
                        </div>
                        <button onClick={() => navigate('/reports')} style={{
                            background: 'none', border: 'none', color: 'var(--color-gold)',
                            fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        }}>عرض التفاصيل ←</button>
                    </div>

                    {liveLoading ? (
                        [...Array(5)].map((_, i) => (
                            <div key={i} style={{ marginBottom: 16 }}>
                                <div className="skeleton" style={{ height: 10, borderRadius: 4, marginBottom: 8, width: '60%' }} />
                                <div className="skeleton" style={{ height: 8, borderRadius: 4 }} />
                            </div>
                        ))
                    ) : categoryBreakdown.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-muted)', fontSize: 13 }}>
                            لا توجد بيانات أقسام
                        </div>
                    ) : (() => {
                        const sorted = [...categoryBreakdown].sort((a, b) => b.avg_score - a.avg_score)
                        const filtered = catSearch.trim()
                            ? sorted.filter(c => c.category.includes(catSearch.trim()))
                            : sorted
                        const visible = filtered.slice(0, catVisible)
                        const hasMore = filtered.length > catVisible
                        return (
                            <>
                                {/* Search */}
                                <div style={{ position: 'relative', marginBottom: 14 }}>
                                    <Search size={13} style={{
                                        position: 'absolute', right: 10, top: '50%',
                                        transform: 'translateY(-50%)',
                                        color: 'var(--color-text-muted)', pointerEvents: 'none',
                                    }} />
                                    <input
                                        value={catSearch}
                                        onChange={e => { setCatSearch(e.target.value); setCatVisible(10) }}
                                        placeholder="ابحث عن قسم..."
                                        style={{
                                            width: '100%', boxSizing: 'border-box',
                                            padding: '7px 32px 7px 10px',
                                            background: 'var(--color-surface-raised)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 8, color: 'var(--color-text-primary)',
                                            fontSize: 12, fontFamily: 'inherit', outline: 'none',
                                            direction: 'rtl',
                                        }}
                                        onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-gold)')}
                                        onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                                    />
                                    {catSearch && (
                                        <button
                                            onClick={() => { setCatSearch(''); setCatVisible(10) }}
                                            style={{
                                                position: 'absolute', left: 8, top: '50%',
                                                transform: 'translateY(-50%)',
                                                background: 'none', border: 'none', cursor: 'pointer',
                                                color: 'var(--color-text-muted)', fontSize: 14, lineHeight: 1,
                                                padding: '0 2px',
                                            }}
                                        >×</button>
                                    )}
                                </div>

                                {/* Count badge */}
                                {catSearch.trim() && (
                                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 10 }}>
                                        {filtered.length} نتيجة من {sorted.length}
                                    </div>
                                )}

                                {/* List */}
                                {filtered.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-text-muted)', fontSize: 13 }}>
                                        لا توجد نتائج للبحث
                                    </div>
                                ) : (
                                    visible.map(cat => (
                                        <div key={cat.category} style={{ marginBottom: 14 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
                                                <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>{cat.category}</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{cat.count} منتج</span>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: cat.color }}>{cat.avg_score}%</span>
                                                </div>
                                            </div>
                                            <div style={{ height: 6, background: 'var(--color-surface-hover)', borderRadius: 4, overflow: 'hidden' }}>
                                                <div style={{
                                                    height: '100%', borderRadius: 4,
                                                    background: `linear-gradient(90deg, ${cat.color}88, ${cat.color})`,
                                                    width: `${cat.avg_score}%`,
                                                    transition: 'width 0.8s ease',
                                                }} />
                                            </div>
                                        </div>
                                    ))
                                )}

                                {/* Show More */}
                                {hasMore && (
                                    <button
                                        onClick={() => setCatVisible(v => v + 10)}
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            gap: 6, width: '100%', marginTop: 6,
                                            padding: '8px 0',
                                            background: 'var(--color-surface-raised)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 8, cursor: 'pointer',
                                            color: 'var(--color-text-secondary)',
                                            fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                                            transition: 'border-color 0.15s, color 0.15s',
                                        }}
                                        onMouseEnter={e => {
                                            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-gold)'
                                            ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--color-gold)'
                                        }}
                                        onMouseLeave={e => {
                                            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border)'
                                            ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-secondary)'
                                        }}
                                    >
                                        <ChevronDown size={13} />
                                        عرض المزيد ({filtered.length - catVisible} متبقي)
                                    </button>
                                )}
                            </>
                        )
                    })()}
                </div>

                {/* Recent Activity */}
                <div style={{
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-card)', padding: '22px 24px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Activity size={15} style={{ color: 'var(--color-blue)' }} />
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>آخر العمليات</span>
                        </div>
                        {!isDeptManager && (
                            <button onClick={() => navigate('/audit-log')} style={{
                                background: 'none', border: 'none', color: '#63B3ED',
                                fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                            }}>الكل ←</button>
                        )}
                    </div>

                    {recentLogs.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-muted)', fontSize: 13 }}>
                            لا توجد عمليات حديثة
                        </div>
                    ) : (
                        <div style={{
                            display: 'flex', flexDirection: 'column', gap: 10,
                            maxHeight: 340, overflowY: 'auto',
                            paddingLeft: 2, paddingRight: 4,
                            scrollbarWidth: 'thin',
                            scrollbarColor: 'rgba(200,168,75,0.2) transparent',
                        }}>
                            {recentLogs.map(log => (
                                <div key={log.id} style={{
                                    display: 'flex', alignItems: 'flex-start', gap: 10,
                                    padding: '10px 12px',
                                    background: 'var(--color-surface-raised)',
                                    borderRadius: 8, border: '1px solid var(--color-border)',
                                }}>
                                    <div style={{
                                        width: 24, height: 24, borderRadius: 6, flexShrink: 0, marginTop: 1,
                                        background: `${actionColor(log.action)}18`,
                                        border: `1px solid ${actionColor(log.action)}30`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: actionColor(log.action),
                                    }}>
                                        {actionIcon(log.action)}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {log.object_repr}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2, display: 'flex', gap: 6 }}>
                                            <span>{log.action_display}</span>
                                            <span>·</span>
                                            <span>{log.user_name}</span>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                                        <Clock size={9} />
                                        {timeAgo(log.created_at)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Row 3: Field Gaps + Worst Products ── */}
            <div className="resp-2col-reverse" style={{ marginBottom: 18 }}>

                {/* Field Gaps — top missing fields */}
                <div style={{
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-card)', padding: '22px 24px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                        <AlertTriangle size={15} style={{ color: 'var(--color-orange)' }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>أكثر الحقول غياباً</span>
                    </div>

                    {liveLoading ? (
                        [...Array(4)].map((_, i) => (
                            <div key={i} className="skeleton" style={{ height: 48, borderRadius: 8, marginBottom: 10 }} />
                        ))
                    ) : !live?.field_gaps?.length ? (
                        <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--color-text-muted)', fontSize: 13 }}>
                            <CheckCircle2 size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
                            <p>جميع الحقول مكتملة</p>
                        </div>
                    ) : (
                        live.field_gaps.slice(0, 6).map(gap => (
                            <div key={gap.key} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '9px 12px', marginBottom: 8,
                                background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.12)',
                                borderRadius: 8,
                            }}>
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>{gap.label}</div>
                                    <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>
                                        {gap.missing_count} منتج · {gap.points} نقطة
                                    </div>
                                </div>
                                <div style={{
                                    fontSize: 13, fontWeight: 800,
                                    color: gap.missing_pct > 60 ? '#EF4444' : gap.missing_pct > 30 ? '#F97316' : '#EAB308',
                                }}>
                                    {gap.missing_pct}%
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Worst Products */}
                <div style={{
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-card)', padding: '22px 24px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <TrendingDown size={15} style={{ color: 'var(--color-red)' }} />
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>منتجات تحتاج تحسين</span>
                        </div>
                        <button onClick={() => navigate('/reports')} style={{
                            background: 'none', border: 'none', color: '#EF4444',
                            fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        }}>عرض الكل ←</button>
                    </div>

                    {liveLoading ? (
                        [...Array(5)].map((_, i) => (
                            <div key={i} className="skeleton" style={{ height: 52, borderRadius: 8, marginBottom: 10 }} />
                        ))
                    ) : top5worst.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-muted)', fontSize: 13 }}>
                            <TrendingUp size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
                            <p>جميع المنتجات في حالة جيدة</p>
                        </div>
                    ) : (
                        top5worst.map((p, idx) => (
                            <div
                                key={p.id}
                                onClick={() => navigate(`/products/${p.id}/edit`)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '10px 14px', marginBottom: 8,
                                    background: 'var(--color-surface-raised)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: 9, cursor: 'pointer', transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-hover)'}
                                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-raised)'}
                            >
                                <div style={{
                                    width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                                    background: `${scoreColor(p.score)}15`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 11, fontWeight: 800, color: scoreColor(p.score),
                                }}>
                                    {idx + 1}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)',
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {p.name_ar || p.sku}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                                        {p.category} · {p.sku}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                                    <div style={{ fontSize: 16, fontWeight: 800, color: scoreColor(p.score) }}>{p.score}%</div>
                                    <div style={{ fontSize: 9, color: 'var(--color-text-muted)', marginTop: 1 }}>اكتمال</div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
