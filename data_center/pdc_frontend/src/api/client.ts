/**
 * Axios API client for Bayt Alebaa PDC.
 * Auto-injects JWT token and handles 401 refresh.
 */
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

const api = axios.create({
    baseURL: '/api/v1',
    headers: { 'Content-Type': 'application/json' },
})

// Request interceptor — inject access token
api.interceptors.request.use((config) => {
    const token = useAuthStore.getState().accessToken
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

// Response interceptor — handle 401 and refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const original = error.config
        if (error.response?.status === 401 && !original._retry) {
            original._retry = true
            const refreshToken = useAuthStore.getState().refreshToken
            if (refreshToken) {
                try {
                    const resp = await axios.post('/api/v1/auth/refresh/', { refresh: refreshToken })
                    const newAccess = resp.data.access
                    useAuthStore.getState().setTokens(newAccess, refreshToken)
                    original.headers.Authorization = `Bearer ${newAccess}`
                    return api(original)
                } catch {
                    useAuthStore.getState().logout()
                }
            }
        }
        return Promise.reject(error)
    }
)

export default api

// ── API helpers ──────────────────────────────────────────────
export const authAPI = {
    login: (email: string, password: string) =>
        api.post('/auth/login/', { email, password }),
    me: () => api.get('/users/me/'),
}

export const productsAPI = {
    list: (params?: object) => api.get('/products/', { params }),
    detail: (id: number) => api.get(`/products/${id}/`),
    create: (data: object) => api.post('/products/', data),
    update: (id: number, data: object) => api.patch(`/products/${id}/`, data),
    delete: (id: number) => api.delete(`/products/${id}/`),
    publish: (id: number) => api.post(`/products/${id}/publish/`),
    generateDescription: (id: number) => api.post(`/products/${id}/generate-description/`),
    generateImage: (id: number) => api.post(`/products/${id}/generate-image/`),
    attributes: (id: number) => api.get(`/products/${id}/attributes/`),
    listImages: (id: number) => api.get(`/products/${id}/images/`),
    uploadImageFile: (id: number, formData: FormData) =>
        api.post(`/products/${id}/images/upload/`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }),
    deleteImage: (productId: number, imageId: number) =>
        api.delete(`/products/${productId}/images/${imageId}/`),
    updateImage: (productId: number, imageId: number, data: object) =>
        api.patch(`/products/${productId}/images/${imageId}/`, data),
    importExcel: (formData: FormData) =>
        api.post('/products/import-excel/', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }),
    downloadImportTemplate: (categoryId?: string) =>
        api.get('/products/import-excel/template/', {
            params: categoryId ? { category_id: categoryId } : {},
            responseType: 'blob',
        }),
}

export const categoriesAPI = {
    list:           () => api.get('/categories/'),
    tree:           () => api.get('/categories/tree/'),
    flat:           () => api.get('/categories/flat/'),
    detail:         (id: number) => api.get(`/categories/${id}/`),
    create:         (data: object) => api.post('/categories/', data),
    update:         (id: number, data: object) => api.patch(`/categories/${id}/`, data),
    delete:         (id: number) => api.delete(`/categories/${id}/`),
    attributes:     (id: number) => api.get(`/categories/${id}/attributes/`),
    addAttribute:   (id: number, data: object) => api.post(`/categories/${id}/attributes/`, data),
    updateAttribute:(schemaId: number, data: object) => api.patch(`/categories/schemas/${schemaId}/`, data),
    deleteAttribute:(schemaId: number) => api.delete(`/categories/schemas/${schemaId}/`),
    children:                (catId: number) => api.get(`/categories/${catId}/children/`),
    addChild:                (catId: number, data: object) => api.post(`/categories/${catId}/children/`, data),
    downloadImportTemplate:  () => api.get('/categories/import-excel/template/', { responseType: 'blob' }),
    importExcel:             (formData: FormData) =>
        api.post('/categories/import-excel/', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
    untranslatedCount:       () =>
        api.get<{ count: number }>('/categories/untranslated-count/'),
    bulkTranslate:           (limit = 20, exclude_ids: number[] = []) =>
        api.post<{
            processed: number; succeeded: number; succeeded_ids: number[];
            failed: number; remaining: number;
            errors: { id: number; code: string; name: string; error: string }[];
        }>('/categories/bulk-translate/', { limit, exclude_ids }),
    attributesUntranslatedCount: () =>
        api.get<{ count: number }>('/categories/attributes-untranslated-count/'),
    bulkTranslateAttributes: (limit = 15, exclude_ids: number[] = []) =>
        api.post<{
            processed: number; succeeded: number; succeeded_ids: number[];
            failed: number; remaining: number;
            errors: { id: number; key: string; name: string; error: string }[];
        }>('/categories/bulk-translate-attributes/', { limit, exclude_ids }),
    // Legacy subcategories (backward compat)
    subcategories:  (catId: number) => api.get(`/categories/${catId}/subcategories/`),
    addSubcategory: (catId: number, data: object) => api.post(`/categories/${catId}/subcategories/`, data),
    updateSubcategory:(subId: number, data: object) => api.patch(`/categories/subcategories/${subId}/`, data),
    deleteSubcategory:(subId: number) => api.delete(`/categories/subcategories/${subId}/`),
}

export const brandsAPI = {
    list:   () => api.get('/products/brands/'),
    create: (data: object) => api.post('/products/brands/', data),
    update: (id: number, data: object) => api.patch(`/products/brands/${id}/`, data),
    delete: (id: number) => api.delete(`/products/brands/${id}/`),
}

export const submissionsAPI = {
    list:                () => api.get('/products/submissions/'),
    detail:              (id: number) => api.get(`/products/submissions/${id}/`),
    create:              (data: FormData) => api.post('/products/submissions/', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
    update:              (id: number, data: object) => api.patch(`/products/submissions/${id}/`, data),
    submitForApproval:   (id: number) => api.post(`/products/submissions/${id}/submit_for_approval/`),
    approve:             (id: number) => api.post(`/products/submissions/${id}/approve/`),
    reject:              (id: number, reason: string) => api.post(`/products/submissions/${id}/reject/`, { reason }),
}

export const settingsAPI = {
    lookups: (type?: string) => api.get('/settings/lookups/', { params: type ? { type } : {} }),
    createLookup: (data: object) => api.post('/settings/lookups/', data),
    updateLookup: (id: number, data: object) => api.patch(`/settings/lookups/${id}/`, data),
    deleteLookup: (id: number) => api.delete(`/settings/lookups/${id}/`),
}

export const analyticsAPI = {
    completeness: () => api.get('/analytics/completeness/'),
    live: (params?: {
        category_id?: number | null
        brand_id?: number | null
        score_range?: string | null
        inventory_type?: string | null
    }) => api.get('/analytics/completeness/live/', { params }),
}

export const logsAPI = {
    list: (params?: object) => api.get('/logs/', { params }),
    forProduct: (productId: number) =>
        api.get('/logs/', { params: { content_type: 'product', object_id: productId, page_size: 100 } }),
}

export const approvalsAPI = {
    list: (params?: object) => api.get('/approvals/', { params }),
    approve: (id: number, notes: string) =>
        api.post(`/approvals/${id}/approve/`, { reviewer_notes: notes }),
    reject: (id: number, notes: string) =>
        api.post(`/approvals/${id}/reject/`, { reviewer_notes: notes }),
}

export const usersAPI = {
    list: (params?: object) => api.get('/users/', { params }),
    create: (data: object) => api.post('/users/', data),
    update: (id: number, data: object) => api.patch(`/users/${id}/`, data),
}

export const decorativeAPI = {
    uploadImage: (formData: FormData) =>
        api.post('/decorative/upload/', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }),
    bulkImagesUpload: (formData: FormData) =>
        api.post('/decorative/bulk-images-upload/', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }),
    analyze: (data: {
        image_url: string
        product_id?: number
        material_subtype_hint?: string
        generation_mode_hint?: string
    }) =>
        api.post('/decorative/analyze/', data),
    generate: (data: object) =>
        api.post('/decorative/generate/', data),
    checkStatus: (generationId: number) =>
        api.get(`/decorative/${generationId}/status/`),
    detail: (generationId: number) =>
        api.get(`/decorative/${generationId}/`),
    delete: (generationId: number) =>
        api.delete(`/decorative/${generationId}/`),
    history: (params?: { product_id?: number; page_size?: number }) =>
        api.get('/decorative/history/', { params }),
    credits: () => api.get('/decorative/credits/'),
    attachToProduct: (generationId: number, productId?: number, productIds?: number[]) =>
        api.post(`/decorative/${generationId}/attach-to-product/`,
            productIds && productIds.length > 0
                ? { product_ids: productIds }
                : productId ? { product_id: productId } : {}
        ),
    analyzeMulti: (data: {
        slots: Array<{
            role: string
            image_url: string
            product_id?: number
            material_subtype_hint?: string
            generation_mode_hint?: string
        }>
    }) => api.post('/decorative/analyze-multi/', data),
    generateMulti: (data: object) =>
        api.post('/decorative/generate-multi/', data),
    enhance: (data: {
        generation_id: number
        background?: string
        lighting?: string
        framing?: string
        shadow?: string
        aspect_ratio?: string
        render_quality?: string
        override_description_en?: string
        custom_notes?: string
    }) => api.post('/decorative/enhance/', data),
}

export const sapAPI = {
    testConnection: () => api.get('/sap/test-connection/'),
    diagnose: () => api.get('/sap/diagnose/'),
    hierarchy: () => api.get('/sap/hierarchy/'),
    syncHierarchy: (dryRun = false) =>
        api.post(`/sap/hierarchy/sync/${dryRun ? '?dry_run=true' : ''}`),
    syncHierarchySelected: (codes: string[]) =>
        api.post('/sap/hierarchy/sync-selected/', { codes }),
    getProduct: (materialNumber: string) =>
        api.get(`/sap/product/${encodeURIComponent(materialNumber)}/`),
    saveProduct: (materialNumber: string) =>
        api.post(`/sap/product/${encodeURIComponent(materialNumber)}/save/`),
    getProductsByDate: (dateFrom: string, dateTo: string) =>
        api.get(`/sap/products/?date_from=${dateFrom}&date_to=${dateTo}`),
    syncProducts: (products: any[]) =>
        api.post('/sap/products/sync/', { products }),

    // Scheduled tasks
    listScheduledTasks: () => api.get('/sap/scheduled-tasks/'),
    updateScheduledTask: (id: number, payload: any) =>
        api.patch(`/sap/scheduled-tasks/${id}/`, payload),
    runScheduledTaskNow: (id: number, background = true) =>
        api.post(`/sap/scheduled-tasks/${id}/run-now/?background=${background ? 'true' : 'false'}`),
    getTaskLogs: (id: number, limit = 20) =>
        api.get(`/sap/scheduled-tasks/${id}/logs/?limit=${limit}`),
}

export const translateAPI = {
    translate: (text: string, from: string = 'ar', to: string = 'en') =>
        api.post<{ translated: string }>('/sap/translate/', { text, from, to }),
}
