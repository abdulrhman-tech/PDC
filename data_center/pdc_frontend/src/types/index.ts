/**
 * TypeScript interfaces for Bayt Alebaa PDC
 */

export type UserRole = 'عام' | 'مبيعات' | 'مدير_قسم' | 'تسويق' | 'super_admin'

export interface UserPermissions {
    can_add_product: boolean
    can_publish_product: boolean
    can_generate_catalog: boolean
    can_view_reports: boolean
    can_manage_users: boolean
}

export interface User {
    id: number
    email: string
    name_ar: string
    name_en: string
    role: UserRole
    role_display: string
    department: number | null
    department_name: string | null
    avatar: string
    is_active: boolean
    date_joined: string
    permissions: UserPermissions
}

export type ProductStatus = 'نشط' | 'مسودة' | 'قيد_المراجعة' | 'موقوف' | 'منتهي'
export type InventoryType = 'دوري' | 'ستوك' | 'منتهي'
export type ImageType = 'main' | 'gallery' | 'detail' | 'lifestyle' | 'technical'
export type ImageStatus = 'pending_review' | 'approved' | 'rejected'

export interface ProductImage {
    id: number
    image_type: ImageType
    url: string
    order: number
    status: ImageStatus
    is_ai_generated: boolean
    created_at: string
}

export interface Product {
    id: number
    sku: string
    product_name_ar: string
    product_name_en: string
    description_ar: string
    description_en: string
    category: number
    category_name: string
    category_name_en: string
    category_slug: string
    subcategory: number | null
    subcategory_name: string | null
    brand: number | null
    brand_name: string | null
    brand_name_en: string | null
    origin_country_en: string | null
    color_en: string | null
    origin_country: string
    status: ProductStatus
    inventory_type: InventoryType
    color: string
    price_sar: string | null
    stock_status: string
    ecommerce_url: string
    attributes: Record<string, string>
    attribute_schema?: Array<{ key: string; label_ar: string; label_en?: string; type?: string; unit?: string; unit_en?: string; options?: string[]; options_en?: string[] }>
    images: ProductImage[]
    main_image_url: string | null
    completeness: number
    created_at: string
    updated_at: string
}

export interface AttributeSchemaItem {
    id: number
    field_key: string
    field_label_ar: string
    field_label_en: string
    field_type: 'text' | 'number' | 'select' | 'multi_select' | 'boolean' | 'dimensions'
    options: string[]
    is_required: boolean
    unit: string
    help_text_ar: string
    order: number
}

export interface SubCategory {
    id: number
    name_ar: string
    name_en: string
    slug: string
    is_active: boolean
}

export interface Category {
    id: number
    name_ar: string
    name_en: string
    slug: string
    icon: string
    description?: string
    is_active: boolean
    subcategories: SubCategory[]
}

export interface CategoryTreeNode {
    id: number
    code: string
    name_ar: string
    name_en: string
    level: number
    parent_id: number | null
    sort_order: number
    is_active: boolean
    icon: string
    description_ar: string
    attribute_count: number
    children_count: number
    children: CategoryTreeNode[]
}

export interface CategoryFlat {
    id: number
    code: string
    name_ar: string
    name_en: string
    level: number
    parent: number | null
    sort_order: number
    is_active: boolean
    path_ar: string
    path_en: string
    has_children: boolean
    has_products?: boolean
}

export interface Brand {
    id: number
    name: string
    name_ar: string
    origin_country: string
    logo_url: string
}

export interface PaginatedResponse<T> {
    count: number
    next: string | null
    previous: string | null
    results: T[]
}

export interface ProductFilters {
    category?: string
    status?: ProductStatus
    brand?: string
    inventory_type?: InventoryType
    has_images?: boolean
    search?: string
    ordering?: string
    page?: number
    page_size?: number
    price_min?: number
    price_max?: number
    color?: string
    origin_country?: string
}

export interface CompletenessReport {
    id: number
    overall_score: number
    total_products: number
    complete_products: number
    category_scores: Record<string, number>
    critical_gaps: string[]
    recommendations: {
        priority: 'high' | 'medium' | 'low'
        action_ar: string
        affected_count: number
        affected_categories: string[]
    }[]
    missing_lifestyle_images: number
    missing_main_images: number
    missing_sap_data: number
    generated_at: string
}

export interface AuditLog {
    id: number
    user: number
    user_name: string
    action: string
    action_display: string
    content_type: string
    object_id: number | null
    object_repr: string
    details: string
    ip_address: string
    created_at: string
}

export interface ApprovalRequest {
    id: number
    product: number
    product_sku: string
    product_name_ar: string
    product_category: string
    product_category_en?: string
    request_type: 'new_product' | 'edit_product'
    request_type_display: string
    submitted_by: number
    submitted_by_name: string
    status: 'pending' | 'ai_reviewed' | 'human_reviewing' | 'approved' | 'rejected'
    ai_score: number | null
    ai_auto_approve_eligible: boolean
    reviewer_notes: string
    reviewed_by: number | null
    reviewed_by_name: string | null
    reviewed_at: string | null
    created_at: string
    updated_at: string
}

export interface VisionAnalysis {
    product_type: string
    product_type_en: string
    color: string
    color_en: string
    pattern: string
    pattern_en: string
    surface: string
    surface_en: string
    description_en: string
    material_subtype?: string
    generation_mode?: 'surface' | 'product' | 'showcase'
    recommended_placement?: string
    product_category?: string
}

export type DecorativeStatus = 'analyzing' | 'analyzed' | 'generating' | 'completed' | 'failed'

export type MultiProductRole = 'floor' | 'wall' | 'focal' | 'accent'

export interface MultiProductSlot {
    role: MultiProductRole
    image_url: string
    product_id?: number
    material_subtype_hint?: string
    generation_mode_hint?: string
    analysis?: VisionAnalysis
}

export interface DecorativeGeneration {
    id: number
    product: number | null
    product_name: string
    source_image_url: string
    status: DecorativeStatus
    status_display: string
    vision_analysis: VisionAnalysis
    generation_settings: Record<string, string>
    prompt_used: string
    negative_prompt: string
    kie_task_id: string
    result_image_url: string
    error_message: string
    is_multi_product: boolean
    multi_product_data: MultiProductSlot[]
    created_by: number | null
    created_by_name: string
    created_at: string
    updated_at: string
}

// ── Projects (مشاريعنا) ──────────────────────────────────────────────
export interface ProjectImageRecord {
    id: number
    image_url: string
    alt_text: string
    sort_order: number
    is_cover: boolean
    created_at: string
}

export interface ProjectProductRef {
    id: number
    sku: string
    product_name_ar: string
    product_name_en: string
    main_image_url: string | null
    category_name_ar: string
    category_name_en: string
}

export interface ProjectListItem {
    id: number
    name_ar: string
    name_en: string
    location_ar: string
    location_en: string
    is_active: boolean
    cover_image_url: string | null
    images_count: number
    products_count: number
    created_at: string
}

export interface Project {
    id: number
    name_ar: string
    name_en: string
    description_ar: string
    description_en: string
    location_ar: string
    location_en: string
    project_year: number | null
    is_active: boolean
    sort_order: number
    products: ProjectProductRef[]
    product_id_list: number[]
    images: ProjectImageRecord[]
    created_by_name: string
    created_at: string
    updated_at: string
}

export interface ProjectPublic {
    id: number
    name_ar: string
    name_en: string
    description_ar: string
    description_en: string
    location_ar: string
    location_en: string
    project_year: number | null
    images: Array<{ id: number; image_url: string; alt_text: string; is_cover: boolean }>
    products: Array<{ id: number; sku: string; product_name_ar: string; product_name_en: string }>
}
