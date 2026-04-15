/**
 * App.tsx — Main router for Bayt Alebaa PDC
 * RTL, role-based routing, auth guards
 */
import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import OnboardingFlow, { hasSeenOnboarding } from '@/components/onboarding/OnboardingFlow'
import Layout from '@/components/Layout/Layout'
import LoginPage from '@/pages/Login/LoginPage'
import DashboardPage from '@/pages/Dashboard/DashboardPage'
import ProductCatalogPage from '@/pages/ProductCatalog/ProductCatalogPage'
import ProductDetailPage from '@/pages/ProductDetail/ProductDetailPage'
import ProductManagementPage from '@/pages/ProductManagement/ProductManagementPage'
import ProductFormPage from '@/pages/ProductForm/ProductFormPage'
import UserManagementPage from '@/pages/UserManagement/UserManagementPage'
import ReportsPage from '@/pages/Reports/ReportsPage'
import ApprovalsPage from '@/pages/Approvals/ApprovalsPage'
import AuditLogPage from '@/pages/AuditLog/AuditLogPage'
import CategoriesPage from '@/pages/Categories/CategoriesPage'
import SettingsPage from '@/pages/Settings/SettingsPage'
import CatalogGeneratorPage from '@/pages/CatalogGenerator/CatalogGeneratorPage'
import ProductSubmissionsPage from '@/pages/ProductSubmissions/ProductSubmissionsPage'
import FlipbookPage from '@/pages/Flipbook/FlipbookPage'
import DecorativeGeneratorPage from '@/pages/DecorativeGenerator/DecorativeGeneratorPage'
import ServicesPage from '@/pages/Services/ServicesPage'
import BranchesPage from '@/pages/Branches/BranchesPage'
import ContactPage from '@/pages/Contact/ContactPage'
import SAPIntegrationPage from '@/pages/SAPIntegration/SAPIntegrationPage'

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
                </Route>

                {/* Catch-all */}
                <Route path="*" element={<Navigate to="/catalog" replace />} />
            </Routes>
        </BrowserRouter>
    )
}
