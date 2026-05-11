/**
 * App.tsx — Main router for Bayt Alebaa PDC
 * RTL, role-based routing, auth guards
 * Pages are lazy-loaded so each route is its own JS chunk
 * (the browser downloads only the code it actually needs).
 */
import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import OnboardingFlow, { hasSeenOnboarding } from '@/components/onboarding/OnboardingFlow'
import Layout from '@/components/Layout/Layout'

const LoginPage              = lazy(() => import('@/pages/Login/LoginPage'))
const DashboardPage          = lazy(() => import('@/pages/Dashboard/DashboardPage'))
const ProductCatalogPage     = lazy(() => import('@/pages/ProductCatalog/ProductCatalogPage'))
const ProductDetailPage      = lazy(() => import('@/pages/ProductDetail/ProductDetailPage'))
const ProductManagementPage  = lazy(() => import('@/pages/ProductManagement/ProductManagementPage'))
const ProductFormPage        = lazy(() => import('@/pages/ProductForm/ProductFormPage'))
const UserManagementPage     = lazy(() => import('@/pages/UserManagement/UserManagementPage'))
const ReportsPage            = lazy(() => import('@/pages/Reports/ReportsPage'))
const ApprovalsPage          = lazy(() => import('@/pages/Approvals/ApprovalsPage'))
const AuditLogPage           = lazy(() => import('@/pages/AuditLog/AuditLogPage'))
const CategoriesPage         = lazy(() => import('@/pages/Categories/CategoriesPage'))
const SettingsPage           = lazy(() => import('@/pages/Settings/SettingsPage'))
const CatalogGeneratorPage   = lazy(() => import('@/pages/CatalogGenerator/CatalogGeneratorPage'))
const ProductSubmissionsPage = lazy(() => import('@/pages/ProductSubmissions/ProductSubmissionsPage'))
const FlipbookPage           = lazy(() => import('@/pages/Flipbook/FlipbookPage'))
const DecorativeGeneratorPage= lazy(() => import('@/pages/DecorativeGenerator/DecorativeGeneratorPage'))
const ServicesPage           = lazy(() => import('@/pages/Services/ServicesPage'))
const BranchesPage           = lazy(() => import('@/pages/Branches/BranchesPage'))
const ContactPage            = lazy(() => import('@/pages/Contact/ContactPage'))
const SAPIntegrationPage     = lazy(() => import('@/pages/SAPIntegration/SAPIntegrationPage'))
const ProjectsListPage       = lazy(() => import('@/pages/Projects/ProjectsListPage'))
const ProjectFormPage        = lazy(() => import('@/pages/Projects/ProjectFormPage'))

function PageLoader() {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100vh', background: 'var(--color-bg)',
        }}>
            <div style={{
                width: 36, height: 36, borderRadius: '50%',
                border: '3px solid rgba(200,168,75,0.2)',
                borderTopColor: '#C8A84B',
                animation: 'spin 0.7s linear infinite',
            }} />
        </div>
    )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
    if (!isAuthenticated) return <Navigate to="/catalog" replace />
    return <>{children}</>
}

function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
    const user = useAuthStore((s) => s.user)
    if (user?.role !== 'super_admin') return <Navigate to="/" replace />
    return <>{children}</>
}

function RequireManagerOrAdmin({ children }: { children: React.ReactNode }) {
    const user = useAuthStore((s) => s.user)
    if (user?.role !== 'مدير_قسم' && user?.role !== 'super_admin') return <Navigate to="/" replace />
    return <>{children}</>
}

function RequireReportAccess({ children }: { children: React.ReactNode }) {
    const user = useAuthStore((s) => s.user)
    if (!user?.permissions.can_view_reports) return <Navigate to="/" replace />
    return <>{children}</>
}

/** Index route: shows Dashboard if authenticated, otherwise go to /catalog */
function IndexRoute() {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
    if (!isAuthenticated) return <Navigate to="/catalog" replace />
    return <DashboardPage />
}

function CatalogWithOnboarding() {
    const [showOnboarding, setShowOnboarding] = useState(!hasSeenOnboarding())

    if (showOnboarding) {
        return <OnboardingFlow onComplete={() => setShowOnboarding(false)} />
    }

    return <ProductCatalogPage />
}

export default function App() {
    const theme = useThemeStore(s => s.theme)
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
    }, [theme])

    return (
        <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />

                    {/* Catalog is standalone — full-width, no sidebar, with onboarding on first visit */}
                    <Route path="/catalog" element={<CatalogWithOnboarding />} />

                    {/* Flipbook — standalone, public, no sidebar */}
                    <Route path="/flipbook" element={<FlipbookPage />} />

                    {/* Services — standalone, public */}
                    <Route path="/catalog/services" element={<ServicesPage />} />

                    {/* Branches — standalone, public */}
                    <Route path="/branches" element={<BranchesPage />} />

                    {/* Contact — standalone, public */}
                    <Route path="/contact" element={<ContactPage />} />

                    {/* Product detail — standalone, no sidebar */}
                    <Route path="/products/:id" element={<ProductDetailPage />} />

                    {/* All other pages share the Layout shell */}
                    <Route path="/" element={<Layout />}>
                        {/* Index: Dashboard for auth users, /catalog for guests */}
                        <Route index element={<IndexRoute />} />

                        {/* Screen 4: Product Management — dept_manager + super_admin only */}
                        <Route
                            path="products"
                            element={
                                <RequireAuth>
                                    <RequireManagerOrAdmin>
                                        <ProductManagementPage />
                                    </RequireManagerOrAdmin>
                                </RequireAuth>
                            }
                        />

                        {/* Screen 5: Add/Edit Product */}
                        <Route
                            path="products/new"
                            element={
                                <RequireAuth>
                                    <ProductFormPage />
                                </RequireAuth>
                            }
                        />
                        <Route
                            path="products/:id/edit"
                            element={
                                <RequireAuth>
                                    <ProductFormPage />
                                </RequireAuth>
                            }
                        />

                        {/* Screen 6: User Management (super admin only) */}
                        <Route
                            path="users"
                            element={
                                <RequireAuth>
                                    <RequireSuperAdmin>
                                        <UserManagementPage />
                                    </RequireSuperAdmin>
                                </RequireAuth>
                            }
                        />

                        {/* Screen 7: Completeness Reports */}
                        <Route
                            path="reports"
                            element={
                                <RequireAuth>
                                    <RequireReportAccess>
                                        <ReportsPage />
                                    </RequireReportAccess>
                                </RequireAuth>
                            }
                        />

                        {/* Screen 8: Approvals Board (super admin) */}
                        <Route
                            path="approvals"
                            element={
                                <RequireAuth>
                                    <RequireSuperAdmin>
                                        <ApprovalsPage />
                                    </RequireSuperAdmin>
                                </RequireAuth>
                            }
                        />

                        {/* Screen 9: Audit Log (super admin) */}
                        <Route
                            path="logs"
                            element={
                                <RequireAuth>
                                    <RequireSuperAdmin>
                                        <AuditLogPage />
                                    </RequireSuperAdmin>
                                </RequireAuth>
                            }
                        />

                        {/* Screen 10: Categories Management (super admin) */}
                        <Route
                            path="categories"
                            element={
                                <RequireAuth>
                                    <RequireSuperAdmin>
                                        <CategoriesPage />
                                    </RequireSuperAdmin>
                                </RequireAuth>
                            }
                        />

                        {/* Screen 11: Settings / Lookup Lists (super admin) */}
                        <Route
                            path="settings"
                            element={
                                <RequireAuth>
                                    <RequireSuperAdmin>
                                        <SettingsPage />
                                    </RequireSuperAdmin>
                                </RequireAuth>
                            }
                        />

                        {/* Screen 12: Catalog Generator — dept_manager + super_admin */}
                        <Route
                            path="catalog-generator"
                            element={
                                <RequireAuth>
                                    <RequireManagerOrAdmin>
                                        <CatalogGeneratorPage />
                                    </RequireManagerOrAdmin>
                                </RequireAuth>
                            }
                        />

                        {/* Screen 13: Product Submissions — manager + admin */}
                        <Route
                            path="submissions"
                            element={
                                <RequireAuth>
                                    <RequireManagerOrAdmin>
                                        <ProductSubmissionsPage />
                                    </RequireManagerOrAdmin>
                                </RequireAuth>
                            }
                        />

                        {/* Screen 14: Decorative Image Generator — super admin only */}
                        <Route
                            path="decorative-generator"
                            element={
                                <RequireAuth>
                                    <RequireSuperAdmin>
                                        <DecorativeGeneratorPage />
                                    </RequireSuperAdmin>
                                </RequireAuth>
                            }
                        />

                        {/* Screen 15: SAP Integration — super admin only */}
                        <Route
                            path="sap-integration"
                            element={
                                <RequireAuth>
                                    <RequireSuperAdmin>
                                        <SAPIntegrationPage />
                                    </RequireSuperAdmin>
                                </RequireAuth>
                            }
                        />

                        {/* Screen 16: Our Projects — every authenticated user can view */}
                        <Route
                            path="projects"
                            element={
                                <RequireAuth>
                                    <ProjectsListPage />
                                </RequireAuth>
                            }
                        />
                        <Route
                            path="projects/new"
                            element={
                                <RequireAuth>
                                    <ProjectFormPage />
                                </RequireAuth>
                            }
                        />
                        <Route
                            path="projects/:id/edit"
                            element={
                                <RequireAuth>
                                    <ProjectFormPage />
                                </RequireAuth>
                            }
                        />
                    </Route>

                    {/* Catch-all */}
                    <Route path="*" element={<Navigate to="/catalog" replace />} />
                </Routes>
            </Suspense>
        </BrowserRouter>
    )
}
