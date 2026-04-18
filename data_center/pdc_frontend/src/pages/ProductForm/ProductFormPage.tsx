/**
 * Product Form — Screen 5
 * Add/Edit product with dynamic attributes per category
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Save, ArrowRight, Sparkles, Loader2, Download } from 'lucide-react'
import { productsAPI, categoriesAPI, settingsAPI, brandsAPI, sapAPI } from '@/api/client'
import { toast } from 'react-toastify'
import type { AttributeSchemaItem } from '@/types'
import ImageManager from '@/components/ImageManager/ImageManager'
import { useAuthStore } from '@/store/authStore'
import CategoryCascadeSelect from '@/components/CategoryTreeSelect/CategoryCascadeSelect'

export default function ProductFormPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const isEdit = !!id
    const { user } = useAuthStore()
    const isDeptManager = user?.role === 'مدير_قسم'
    const role = user?.role as string | undefined
    const canFetchSap = role === 'super_admin' || role === 'مدير_نظام' || role === 'مدير_قسم'

    const [sapFetching, setSapFetching] = useState(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [sapPending, setSapPending] = useState<any | null>(null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [form, setForm] = useState<Record<string, any>>({
        product_name_ar: '', product_name_en: '', sku: '',
        category: '', brand: '', origin_country: '', status: 'مسودة',
        inventory_type: 'دوري', color: '', description_ar: '', description_en: '',
        ecommerce_url: '', attributes: {},
    })
    const [attrSchema, setAttrSchema] = useState<AttributeSchemaItem[]>([])
    const [generatingDesc, setGeneratingDesc] = useState(false)

    // Load existing product for edit
    const { data: product } = useQuery({
        queryKey: ['product', id],
        queryFn: () => productsAPI.detail(Number(id)).then(r => r.data),
        enabled: isEdit,
    })

    useEffect(() => {
        if (product) {
            setForm({
                product_name_ar: product.product_name_ar,
                product_name_en: product.product_name_en,
                sku: product.sku,
                category: product.category,
                brand: product.brand ?? '',
                origin_country: product.origin_country,
                status: product.status,
                inventory_type: product.inventory_type,
                color: product.color,
                description_ar: product.description_ar,
                description_en: product.description_en ?? '',
                ecommerce_url: product.ecommerce_url,
                attributes: product.attributes ?? {},
            })
        }
    }, [product])

    // Load flat categories list for dept manager auto-select
    const { data: categoriesFlat = [] } = useQuery({
        queryKey: ['categories-flat'],
        queryFn: () => categoriesAPI.flat().then(r => r.data),
        staleTime: 60_000,
    })

    // Load lookup values (countries + colors)
    const { data: countriesData } = useQuery({
        queryKey: ['lookups-country'],
        queryFn: () => settingsAPI.lookups('country').then(r => {
            const d = r.data; return (Array.isArray(d) ? d : d.results ?? []).filter((x: { is_active: boolean }) => x.is_active)
        }),
    })
    const { data: colorsData } = useQuery({
        queryKey: ['lookups-color'],
        queryFn: () => settingsAPI.lookups('color').then(r => {
            const d = r.data; return (Array.isArray(d) ? d : d.results ?? []).filter((x: { is_active: boolean }) => x.is_active)
        }),
    })
    const countries: { id: number; name_ar: string }[] = countriesData ?? []
    const colors: { id: number; name_ar: string }[] = colorsData ?? []

    // Load brands
    const { data: brandsData } = useQuery({
        queryKey: ['brands'],
        queryFn: () => brandsAPI.list().then(r => r.data),
    })
    const brands: { id: number; name_ar: string; name: string }[] =
        (brandsData?.results ?? brandsData ?? [])

    // Auto-select category for dept managers (only one category available)
    useEffect(() => {
        if (!isEdit && categoriesFlat.length === 1 && !form.category) {
            set('category', categoriesFlat[0].id)
        }
    }, [categoriesFlat, isEdit, form.category])

    // When category changes: reload attr schema
    useEffect(() => {
        if (form.category) {
            categoriesAPI.attributes(Number(form.category)).then(r => {
                // API now returns { root_id, root_name_ar, is_inherited, schemas }
                setAttrSchema(r.data.schemas ?? r.data.results ?? (Array.isArray(r.data) ? r.data : []))
            }).catch(() => { })
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.category])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const set = (key: string, value: any) => setForm(f => ({ ...f, [key]: value }))
    const setAttr = (key: string, value: string) =>
        setForm(f => ({ ...f, attributes: { ...f.attributes, [key]: value } }))

    // Save mutation
    const saveMutation = useMutation({
        mutationFn: () => isEdit
            ? productsAPI.update(Number(id), form)
            : productsAPI.create(form),
        onSuccess: (res) => {
            if (isDeptManager) {
                toast.info(isEdit
                    ? 'تم حفظ التعديلات — في انتظار موافقة مدير النظام للنشر'
                    : 'تم إنشاء المنتج — في انتظار موافقة مدير النظام للنشر'
                )
            } else {
                toast.success(isEdit ? 'تم حفظ التعديلات' : 'تم إنشاء المنتج بنجاح')
            }
            navigate(`/products/${res.data.id}`)
        },
        onError: (err: unknown) => {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'حدث خطأ، يرجى المحاولة مجدداً'
            toast.error(msg)
        },
    })

    const COUNTRY_CODE_TO_AR: Record<string, string> = {
        CN: 'الصين', SA: 'السعودية', AE: 'الإمارات', IT: 'إيطاليا', ES: 'إسبانيا',
        TR: 'تركيا', IN: 'الهند', EG: 'مصر', KR: 'كوريا', JP: 'اليابان',
        US: 'الولايات المتحدة', DE: 'ألمانيا', FR: 'فرنسا', GB: 'بريطانيا',
        VN: 'فيتنام', TH: 'تايلاند', MY: 'ماليزيا', ID: 'إندونيسيا', BR: 'البرازيل',
        IR: 'إيران', PT: 'البرتغال', PK: 'باكستان', BD: 'بنغلاديش', JO: 'الأردن',
    }

    const normalizeAttrKey = (name: string): string =>
        (name || '').toLowerCase().replace(/\s+/g, '_').slice(0, 50)

    const findAttrValue = (attrs: { name: string; value: string }[], substring: string): string => {
        const lower = substring.toLowerCase()
        const hit = attrs.find(a => (a.name || '').toLowerCase().includes(lower) && (a.value || '').trim() !== '')
        return hit?.value ?? ''
    }

    // Builds a patch object by mapping the SAP product to form fields.
    // mode: 'replace' overrides everything, 'fill_empty' only sets blank fields.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buildPatchFromSap = (sapData: any, mode: 'replace' | 'fill_empty') => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const patch: Record<string, any> = {}
        const isEmpty = (v: unknown) => v === '' || v === null || v === undefined

        const tryStr = (key: string, val: string) => {
            if (!val) return
            if (mode === 'replace' || isEmpty(form[key])) patch[key] = val
        }

        tryStr('product_name_ar', sapData.description_ar || '')
        tryStr('product_name_en', sapData.description_en || '')

        // Category lookup by material_group_code
        const groupCode = sapData.material_group_code || ''
        if (groupCode) {
            const localCat = categoriesFlat.find((c: { code: string }) => c.code === groupCode)
            if (localCat) {
                if (mode === 'replace' || isEmpty(form.category)) patch.category = localCat.id
            } else {
                toast.warning(`التصنيف ${groupCode} غير موجود في النظام — يحتاج مزامنة`)
            }
        }

        const attrs: { name: string; value: string }[] = sapData.attributes || []

        // Brand from attributes
        const brandName = findAttrValue(attrs, 'BRAND')
        if (brandName) {
            const brand = brands.find(b =>
                (b.name_ar || '').trim() === brandName.trim() ||
                (b.name || '').toLowerCase().trim() === brandName.toLowerCase().trim()
            )
            if (brand && (mode === 'replace' || isEmpty(form.brand))) patch.brand = brand.id
        }

        // Origin country (translate code if possible, then match against lookup)
        const originRaw = sapData.origin_country || ''
        if (originRaw) {
            const arName = COUNTRY_CODE_TO_AR[originRaw.toUpperCase()] || originRaw
            const country = countries.find(c => c.name_ar === arName)
            const finalVal = country?.name_ar ?? arName
            if (mode === 'replace' || isEmpty(form.origin_country)) patch.origin_country = finalVal
        }

        // Color from attributes
        const colorVal = findAttrValue(attrs, 'COLOR')
        if (colorVal) {
            const colorObj = colors.find(c => c.name_ar === colorVal)
            const finalColor = colorObj?.name_ar ?? colorVal
            if (mode === 'replace' || isEmpty(form.color)) patch.color = finalColor
        }

        // Dynamic attributes — only those with non-empty values matching schema keys
        if (attrSchema.length > 0) {
            const schemaByKey = new Map(attrSchema.map(s => [s.field_key, s]))
            const newAttrs = { ...(form.attributes || {}) }
            let touched = false
            for (const a of attrs) {
                const value = (a.value || '').trim()
                if (!value) continue
                const key = normalizeAttrKey(a.name)
                if (!schemaByKey.has(key)) continue
                const existing = newAttrs[key]
                if (mode === 'replace' || existing === '' || existing === undefined || existing === null) {
                    newAttrs[key] = value
                    touched = true
                }
            }
            if (touched) patch.attributes = newAttrs
        }

        return patch
    }

    const applySapData = (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sapData: any,
        mode: 'replace' | 'fill_empty',
    ) => {
        const patch = buildPatchFromSap(sapData, mode)
        if (Object.keys(patch).length === 0) {
            toast.info('لا توجد بيانات جديدة للتعبئة من SAP')
            return
        }
        setForm(f => ({ ...f, ...patch, sku: f.sku }))
        toast.success(`تم جلب بيانات الصنف ${sapData.material_number || ''} من SAP`)
    }

    const handleSapFetch = async () => {
        const sku = (form.sku || '').trim()
        if (!sku) return toast.warning('أدخل رقم SKU أولاً')
        setSapFetching(true)
        try {
            const res = await sapAPI.getProduct(sku)
            const sapData = res.data
            // Detect whether form already contains user data we might overwrite.
            const baseFields = ['product_name_ar', 'product_name_en', 'category', 'brand', 'origin_country', 'color']
            const hasExisting = baseFields.some(k => {
                const v = form[k]
                return v !== '' && v !== null && v !== undefined
            }) || Object.values(form.attributes || {}).some(v => v !== '' && v !== null && v !== undefined)

            if (hasExisting) {
                setSapPending(sapData)
            } else {
                applySapData(sapData, 'replace')
            }
        } catch (err: unknown) {
            const e = err as { response?: { status?: number; data?: { error?: string } } }
            if (e?.response?.status === 404) {
                toast.error('الصنف غير موجود في SAP. تأكد من الرمز.')
            } else {
                toast.error(e?.response?.data?.error || 'فشل الاتصال بـ SAP. حاول مرة ثانية.')
            }
        } finally {
            setSapFetching(false)
        }
    }

    const handleGenerateDescription = async () => {
        if (!isEdit) return toast.warning('احفظ المنتج أولاً ثم توليد الوصف')
        setGeneratingDesc(true)
        try {
            const res = await productsAPI.generateDescription(Number(id))
            if (res.data.description_ar) set('description_ar', res.data.description_ar)
            if (res.data.description_en) set('description_en', res.data.description_en)
            toast.success('تم توليد الوصف بالعربي والإنجليزي')
        } catch {
            toast.error('فشل توليد الوصف')
        } finally {
            setGeneratingDesc(false)
        }
    }

    const renderAttrField = (schema: AttributeSchemaItem) => {
        const val = form.attributes?.[schema.field_key] ?? ''

        if (schema.field_type === 'select' || schema.field_type === 'multi_select') {
            return (
                <select className="form-select" value={val}
                    onChange={e => setAttr(schema.field_key, e.target.value)}>
                    <option value="">اختر {schema.field_label_ar}</option>
                    {schema.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            )
        }
        if (schema.field_type === 'boolean') {
            return (
                <select className="form-select" value={val}
                    onChange={e => setAttr(schema.field_key, e.target.value)}>
                    <option value="">—</option>
                    <option value="نعم">نعم ✓</option>
                    <option value="لا">لا ✗</option>
                </select>
            )
        }
        return (
            <input
                type={schema.field_type === 'number' ? 'number' : 'text'}
                id={`attr-${schema.field_key}`}
                className="form-input"
                value={val}
                onChange={e => setAttr(schema.field_key, e.target.value)}
                placeholder={schema.help_text_ar || schema.field_label_ar}
            />
        )
    }

    return (
        <div className="page-enter">
            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, fontSize: 13, color: 'var(--color-warm-gray)' }}>
                <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-warm-gray)' }}>
                    <ArrowRight size={14} />
                    العودة
                </button>
                <span>/</span>
                <span>{isEdit ? 'تعديل المنتج' : 'إضافة منتج جديد'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
                <h1 className="page-header-title">{isEdit ? 'تعديل المنتج' : 'إضافة منتج جديد'}</h1>
                <button
                    className="btn btn-primary"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                >
                    {saveMutation.isPending ? <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Save size={15} />}
                    {saveMutation.isPending ? 'جاري الحفظ...' : 'حفظ المنتج'}
                </button>
            </div>

            <div className="grid-2" style={{ gap: 24, alignItems: 'flex-start' }}>
                {/* LEFT: Base Fields */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Base Info Card */}
                    <div className="card p-24">
                        <h3 style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                            البيانات الأساسية
                        </h3>

                        <div className="form-group">
                            <label className="form-label" htmlFor="sku">رقم SKU *</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input id="sku" className="form-input" style={{ fontFamily: 'var(--font-mono)', flex: 1 }}
                                    value={form.sku} onChange={e => set('sku', e.target.value)}
                                    placeholder="مثال: CER-60X60-WHT-001" disabled={isEdit} />
                                {canFetchSap && (form.sku || '').trim() && (
                                    <button
                                        type="button"
                                        onClick={handleSapFetch}
                                        disabled={sapFetching}
                                        title="جلب بيانات الصنف من SAP"
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 6,
                                            padding: '0 14px', whiteSpace: 'nowrap',
                                            background: 'var(--color-gold, #C8A84B)',
                                            color: '#0e0e0e', border: 'none', borderRadius: 8,
                                            fontSize: 12, fontWeight: 700, cursor: sapFetching ? 'wait' : 'pointer',
                                            opacity: sapFetching ? 0.7 : 1, fontFamily: 'inherit',
                                        }}
                                    >
                                        {sapFetching
                                            ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                                            : <Download size={14} />}
                                        {sapFetching ? 'جاري الجلب...' : 'جلب من SAP'}
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">اسم المنتج بالعربية *</label>
                            <input className="form-input" value={form.product_name_ar}
                                onChange={e => set('product_name_ar', e.target.value)}
                                placeholder="مثال: سيراميك بورسلاني أبيض مط" />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Product Name in English</label>
                            <input className="form-input" value={form.product_name_en}
                                onChange={e => set('product_name_en', e.target.value)}
                                placeholder="White Matte Porcelain Tile" style={{ direction: 'ltr', textAlign: 'left' }} />
                        </div>

                        <div className="form-group">
                            <label className="form-label">التصنيف *</label>
                            {isDeptManager && categoriesFlat.length === 1 ? (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '10px 14px', background: 'rgba(200,168,75,0.07)',
                                    border: '1px solid rgba(200,168,75,0.35)', borderRadius: 8,
                                }}>
                                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#C8A84B', flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#C8A84B' }}>{categoriesFlat[0].name_ar}</div>
                                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>قسمك المعيّن</div>
                                    </div>
                                </div>
                            ) : (
                                <CategoryCascadeSelect
                                    value={form.category || null}
                                    onChange={id => set('category', id ?? '')}
                                    placeholder="اختر التصنيف..."
                                />
                            )}
                        </div>

                        <div className="grid-2">
                            <div className="form-group">
                                <label className="form-label">الماركة</label>
                                <select className="form-select" value={form.brand}
                                    onChange={e => set('brand', e.target.value || null)}>
                                    <option value="">بدون ماركة</option>
                                    {brands.map(b => (
                                        <option key={b.id} value={b.id}>{b.name_ar || b.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">بلد المنشأ</label>
                                <select className="form-select" value={form.origin_country}
                                    onChange={e => set('origin_country', e.target.value)}>
                                    <option value="">اختر البلد</option>
                                    {countries.map(c => (
                                        <option key={c.id} value={c.name_ar}>{c.name_ar}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid-2">
                            <div className="form-group">
                                <label className="form-label">اللون</label>
                                <select className="form-select" value={form.color}
                                    onChange={e => set('color', e.target.value)}>
                                    <option value="">اختر اللون</option>
                                    {colors.map(c => (
                                        <option key={c.id} value={c.name_ar}>{c.name_ar}</option>
                                    ))}
                                </select>
                            </div>
                            <div />
                        </div>

                        <div className="form-group">
                            <label className="form-label">رابط المتجر الإلكتروني</label>
                            <input className="form-input" value={form.ecommerce_url}
                                onChange={e => set('ecommerce_url', e.target.value)}
                                placeholder="https://store.baytalebaa.com/product/..."
                                style={{ direction: 'ltr', textAlign: 'left' }} />
                        </div>

                        <div className="grid-2">
                            <div className="form-group">
                                <label className="form-label">الحالة</label>
                                <select className="form-select" value={form.status}
                                    onChange={e => set('status', e.target.value)}>
                                    <option value="مسودة">مسودة</option>
                                    <option value="قيد_المراجعة">قيد المراجعة</option>
                                    <option value="نشط">نشط</option>
                                    <option value="موقوف">موقوف</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">نوع المخزون</label>
                                <select className="form-select" value={form.inventory_type}
                                    onChange={e => set('inventory_type', e.target.value)}>
                                    <option value="دوري">دوري</option>
                                    <option value="ستوك">ستوك</option>
                                    <option value="منتهي">منتهي</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Description Card */}
                    <div className="card p-24">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h3>الوصف</h3>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={handleGenerateDescription}
                                disabled={generatingDesc}
                            >
                                {generatingDesc
                                    ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
                                    : <Sparkles size={13} />}
                                توليد AI
                            </button>
                        </div>
                        <textarea
                            className="form-textarea"
                            style={{ minHeight: 120, resize: 'vertical' }}
                            value={form.description_ar}
                            onChange={e => set('description_ar', e.target.value)}
                            placeholder="أدخل وصفاً احترافياً للمنتج أو اضغط 'توليد AI' لإنشائه تلقائياً..."
                        />
                        <p className="form-help">{form.description_ar.split(' ').filter(Boolean).length} كلمة (يُنصح بـ 60-90)</p>

                        <div style={{ marginTop: 14 }}>
                            <label className="form-label" style={{ fontFamily: 'var(--font-latin)', direction: 'ltr' }}>
                                Description (English)
                            </label>
                            <textarea
                                className="form-textarea"
                                dir="ltr"
                                style={{ minHeight: 100, resize: 'vertical', fontFamily: 'var(--font-latin)' }}
                                value={form.description_en}
                                onChange={e => set('description_en', e.target.value)}
                                placeholder="Enter an English product description or use 'توليد AI' to generate both..."
                            />
                            <p className="form-help" style={{ direction: 'ltr', textAlign: 'left', fontFamily: 'var(--font-latin)' }}>
                                {form.description_en.split(' ').filter(Boolean).length} words (50–80 recommended)
                            </p>
                        </div>
                    </div>
                </div>

                {/* RIGHT: Dynamic Attributes */}
                <div className="card p-24">
                    <div style={{ marginBottom: 20 }}>
                        <h3>السمات الديناميكية</h3>
                        <p style={{ fontSize: 12, color: 'var(--color-warm-gray)', marginTop: 4 }}>
                            {form.category
                                ? `حقول خاصة بتصنيف: ${categoriesFlat.find((c: { id: number }) => c.id === Number(form.category))?.name_ar ?? ''}`
                                : 'اختر التصنيف أولاً لإظهار الحقول الخاصة بها'}
                        </p>
                    </div>

                    {!form.category ? (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-warm-gray)' }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: 12,
                                background: 'var(--color-cream)', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', margin: '0 auto 12px',
                            }}>
                                <span style={{ fontSize: 24 }}>📋</span>
                            </div>
                            <p style={{ fontSize: 13 }}>اختر التصنيف من اليمين</p>
                        </div>
                    ) : attrSchema.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-warm-gray)', fontSize: 13 }}>
                            لا توجد حقول ديناميكية لهذا التصنيف
                        </div>
                    ) : (
                        <div>
                            <div className="gold-line" style={{ marginBottom: 16 }} />

                            {/* Group required fields first */}
                            {[...attrSchema].sort((a, b) => {
                                if (a.is_required && !b.is_required) return -1
                                if (!a.is_required && b.is_required) return 1
                                return a.order - b.order
                            }).map((schema) => (
                                <div key={schema.field_key} className="form-group">
                                    <label className="form-label" htmlFor={`attr-${schema.field_key}`}
                                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span>{schema.field_label_ar}</span>
                                        {schema.is_required && (
                                            <span style={{ color: '#e07070', fontSize: 13, lineHeight: 1 }}>*</span>
                                        )}
                                        {schema.unit && (
                                            <span style={{
                                                color: 'var(--color-warm-gray)', fontWeight: 400,
                                                fontSize: 11, background: 'var(--color-cream)',
                                                padding: '1px 6px', borderRadius: 4,
                                            }}>
                                                {schema.unit}
                                            </span>
                                        )}
                                    </label>
                                    {renderAttrField(schema)}
                                    {schema.help_text_ar && (
                                        <p className="form-help">{schema.help_text_ar}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Image Manager — only shown when editing an existing product */}
            {isEdit && id && (
                <ImageManager productId={Number(id)} />
            )}

            {!isEdit && (
                <div className="card p-24" style={{ marginTop: 24, textAlign: 'center', color: 'var(--color-warm-gray)' }}>
                    <p style={{ fontSize: 13 }}>
                        احفظ المنتج أولاً ثم يمكنك رفع الصور وإدارتها
                    </p>
                </div>
            )}

            {sapPending && (
                <div
                    onClick={() => setSapPending(null)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 2000,
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: 'var(--color-surface, #1a1a1a)',
                            color: 'var(--color-text-primary, #fff)',
                            border: '1px solid var(--color-border-strong, #333)',
                            borderRadius: 12, padding: 24, maxWidth: 480, width: '90%',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                        }}
                    >
                        <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 16 }}>
                            تعبئة الحقول من SAP
                        </h3>
                        <p style={{ fontSize: 13, color: 'var(--color-text-secondary, #aaa)', marginBottom: 20 }}>
                            الحقول فيها بيانات حالية. كيف تريد التعامل مع بيانات SAP؟
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <button
                                type="button"
                                onClick={() => { applySapData(sapPending, 'replace'); setSapPending(null) }}
                                style={{
                                    padding: '10px 14px', borderRadius: 8, border: 'none',
                                    background: 'var(--color-gold, #C8A84B)', color: '#0e0e0e',
                                    fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                                }}
                            >
                                استبدال الكل
                            </button>
                            <button
                                type="button"
                                onClick={() => { applySapData(sapPending, 'fill_empty'); setSapPending(null) }}
                                style={{
                                    padding: '10px 14px', borderRadius: 8,
                                    border: '1px solid var(--color-border-strong, #444)',
                                    background: 'var(--color-surface-raised, #222)',
                                    color: 'var(--color-text-primary, #fff)',
                                    fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                                }}
                            >
                                تعبئة الفارغ فقط
                            </button>
                            <button
                                type="button"
                                onClick={() => setSapPending(null)}
                                style={{
                                    padding: '8px 14px', borderRadius: 8, border: 'none',
                                    background: 'transparent', color: 'var(--color-text-secondary, #aaa)',
                                    fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                                }}
                            >
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    )
}
