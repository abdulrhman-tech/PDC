/**
 * RTL Sidebar Layout — responsive: drawer on mobile, collapsible on desktop
 */
import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
    LayoutGrid, Package, Plus, BarChart2,
    CheckSquare, ScrollText, Users, LogOut,
    Bell, LogIn, Layers, Settings2, Inbox,
    ChevronRight, ChevronLeft, BookOpen,
    Menu, X, Sun, Moon, Wand2, Link2,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { useQuery } from '@tanstack/react-query'
import { approvalsAPI } from '@/api/client'

const navItems = [
    { to: '/',        label: 'لوحة التحكم',      icon: LayoutGrid, exact: true, key: 'dashboard', needsAuth: true },
    { to: '/catalog', label: 'كتالوج المنتجات',  icon: LayoutGrid,              key: 'catalog'   },
    { to: '/products',label: 'إدارة المنتجات',   icon: Package,                 key: 'products',  needsManager: true },
    { to: '/catalog-generator', label: 'توليد الكتالوج', icon: BookOpen, key: 'catalog-generator', needsManager: true },
    { to: '/reports', label: 'تقارير الاكتمال',  icon: BarChart2,               key: 'reports',   needsReport: true },
    { to: '/submissions', label: 'اقتراحات المنتجات', icon: Inbox,       key: 'submissions', needsManager: true },
    { to: '/approvals',   label: 'لوحة الموافقات',    icon: CheckSquare, key: 'approvals',   needsAdmin: true },
    { to: '/logs',        label: 'سجل العمليات',      icon: ScrollText,  key: 'logs',        needsAdmin: true },
    { to: '/users',       label: 'إدارة المستخدمين', icon: Users,       key: 'users',       needsAdmin: true },
    { to: '/categories',  label: 'إدارة التصنيفات',      icon: Layers,      key: 'categories',  needsAdmin: true },
    { to: '/decorative-generator', label: 'توليد صور ديكورية', icon: Wand2, key: 'decorative-generator', needsAdmin: true },
    { to: '/sap-integration', label: 'ربط SAP', icon: Link2, key: 'sap-integration', needsAdmin: true },
    { to: '/settings',    label: 'الإعدادات',          icon: Settings2,   key: 'settings',    needsAdmin: true },
]

function useIsMobile() {
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024)
    useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth <= 1024)
        window.addEventListener('resize', handler)
        return () => window.removeEventListener('resize', handler)
    }, [])
    return isMobile
}

export default function Layout() {
    const { user, logout } = useAuthStore()
    const { theme, toggleTheme } = useThemeStore()
    const navigate = useNavigate()
    const location = useLocation()
    const isMobile = useIsMobile()

    const [collapsed, setCollapsed] = useState(false)
    const [mobileOpen, setMobileOpen] = useState(false)

    useEffect(() => {
        if (isMobile) setMobileOpen(false)
    }, [location.pathname, isMobile])

    useEffect(() => {
        if (mobileOpen) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => { document.body.style.overflow = '' }
    }, [mobileOpen])

    const handleLogout = () => {
        logout()
        navigate('/catalog')
    }

    const initials = user?.name_ar?.charAt(0) || 'م'

    const { data: pendingData } = useQuery({
        queryKey: ['approvals-badge'],
        queryFn: () => approvalsAPI.list({ status: 'pending' }).then(r => r.data),
        enabled: user?.role === 'super_admin',
        refetchInterval: 60_000,
    })
    const pendingCount: number = pendingData?.count ?? 0

    const canSee = (item: typeof navItems[0]) => {
        if (item.needsAuth    && !user) return false
        if (item.needsAdmin   && user?.role !== 'super_admin') return false
        if (item.needsManager && user?.role !== 'مدير_قسم' && user?.role !== 'super_admin') return false
        if (item.needsReport  && !user?.permissions.can_view_reports) return false
        return true
    }

    const sidebarClass = isMobile
        ? `sidebar mobile-sidebar${mobileOpen ? ' mobile-open' : ''}`
        : `sidebar${collapsed ? ' collapsed' : ''}`

    const mainClass = isMobile
        ? 'main-content mobile-main'
        : `main-content${collapsed ? ' collapsed' : ''}`

    return (
        <div className="layout">

            {/* ── Mobile hamburger ── */}
            {isMobile && (
                <button
                    className="mobile-hamburger"
                    onClick={() => setMobileOpen(true)}
                    aria-label="فتح القائمة"
                >
                    <Menu size={22} strokeWidth={1.8} />
                </button>
            )}

            {/* ── Desktop collapse toggle ── */}
            {!isMobile && (
                <button
                    onClick={() => setCollapsed(p => !p)}
                    title={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
                    className="sidebar-toggle-btn"
                    style={{
                        right: collapsed ? 'calc(var(--sidebar-collapsed-width) - 16px)' : 'calc(var(--sidebar-width) - 16px)',
                    }}
                >
                    {collapsed
                        ? <ChevronLeft size={15} strokeWidth={2.5} />
                        : <ChevronRight size={15} strokeWidth={2.5} />
                    }
                </button>
            )}

            {/* ── Mobile overlay ── */}
            {isMobile && mobileOpen && (
                <div className="mobile-overlay" onClick={() => setMobileOpen(false)} />
            )}

            {/* ── Sidebar ── */}
            <aside className={sidebarClass}>

                {/* Close button on mobile */}
                {isMobile && (
                    <button
                        className="mobile-close-btn"
                        onClick={() => setMobileOpen(false)}
                    >
                        <X size={20} />
                    </button>
                )}

                {/* Brand Logo */}
                <div className="sidebar-logo">
                    <div style={{
                        width: 40, height: 40,
                        background: 'linear-gradient(135deg, var(--color-gold), #e8c44a)',
                        borderRadius: 10,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        <span style={{ color: 'var(--color-charcoal)', fontWeight: 700, fontSize: 18 }}>ب</span>
                    </div>
                    <div className="sidebar-logo-text-wrap">
                        <div className="sidebar-logo-text">بيت الإباء</div>
                        <div className="sidebar-logo-sub">Product Data Center</div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="sidebar-nav">
                    <div className="sidebar-section-label">القائمة الرئيسية</div>

                    {navItems.filter(canSee).map((item) => (
                        <NavLink
                            key={item.key}
                            to={item.to}
                            end={item.exact}
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            title={collapsed && !isMobile ? item.label : undefined}
                        >
                            <item.icon className="nav-icon" strokeWidth={1.5} />
                            <span style={{ flex: 1 }}>{item.label}</span>
                            {item.key === 'approvals' && pendingCount > 0 && (
                                <span style={{
                                    background: '#EF4444',
                                    color: 'var(--color-text-primary)',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    minWidth: 18,
                                    height: 18,
                                    borderRadius: 9,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '0 4px',
                                    flexShrink: 0,
                                    lineHeight: 1,
                                }}>
                                    {pendingCount > 99 ? '99+' : pendingCount}
                                </span>
                            )}
                        </NavLink>
                    ))}

                    {user?.permissions.can_add_product && (
                        <>
                            <div className="sidebar-section-label" style={{ marginTop: 16 }}>إجراءات</div>
                            <NavLink
                                to="/products/new"
                                className="nav-item"
                                title={collapsed && !isMobile ? 'إضافة منتج' : undefined}
                            >
                                <Plus className="nav-icon" strokeWidth={1.5} />
                                <span>إضافة منتج</span>
                            </NavLink>
                        </>
                    )}
                </nav>

                {/* User Info + Logout / Login */}
                {user ? (
                    <div className="sidebar-user">
                        <div className="user-avatar" title={collapsed && !isMobile ? user.name_ar : undefined}>{initials}</div>
                        <div className="sidebar-user-info">
                            <div className="user-info-name">{user.name_ar}</div>
                            <div className="user-info-role">{user.role_display}</div>
                        </div>
                        <button
                            onClick={handleLogout}
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--color-text-secondary)', padding: 4,
                                borderRadius: 4, transition: 'color var(--transition-base)',
                                flexShrink: 0,
                            }}
                            title="تسجيل الخروج"
                        >
                            <LogOut size={16} strokeWidth={1.5} />
                        </button>
                    </div>
                ) : (
                    <div className="sidebar-user" style={{ cursor: 'pointer' }} onClick={() => navigate('/login')}>
                        <div className="user-avatar" style={{ background: 'var(--color-surface-hover)' }}>
                            <LogIn size={16} strokeWidth={1.5} />
                        </div>
                        <div className="sidebar-user-info">
                            <div className="user-info-name">تسجيل الدخول</div>
                            <div className="user-info-role">زيارة فقط</div>
                        </div>
                    </div>
                )}
            </aside>

            {/* Main Content */}
            <div className={mainClass}>
                {/* Top Bar */}
                <header className="topbar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {isMobile && <div style={{ width: 36 }} />}
                        <div style={{ color: 'var(--color-warm-gray)', fontSize: 13 }}>
                            {new Date().toLocaleDateString('ar-SA', {
                                weekday: isMobile ? undefined : 'long',
                                year: 'numeric', month: 'long', day: 'numeric'
                            })}
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                            onClick={toggleTheme}
                            title={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
                            style={{
                                background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
                                color: theme === 'dark' ? '#F59E0B' : '#6366F1',
                                display: 'flex', alignItems: 'center', gap: 6,
                                fontSize: 13, transition: 'all 0.2s',
                            }}
                        >
                            {theme === 'dark' ? <Sun size={15} strokeWidth={1.8} /> : <Moon size={15} strokeWidth={1.8} />}
                            {!isMobile && <span style={{ color: 'var(--color-text-secondary)' }}>{theme === 'dark' ? 'فاتح' : 'داكن'}</span>}
                        </button>
                        <button style={{
                            background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)',
                            borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
                            color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6,
                            fontSize: 13, transition: 'all 0.15s',
                        }}>
                            <Bell size={15} strokeWidth={1.5} />
                            {!isMobile && <span>الإشعارات</span>}
                        </button>
                    </div>
                </header>

                {/* Page Content */}
                <main className="page-content page-enter">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
