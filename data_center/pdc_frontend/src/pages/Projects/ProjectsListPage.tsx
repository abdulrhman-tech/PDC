/**
 * Projects List Page — مشاريعنا
 * Super admin and dept managers can manage; managers limited to projects
 * touching their categories (enforced by backend).
 */
import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    Plus, Search, Building2, MapPin, Image as ImageIcon,
    Pencil, Trash2, Eye, EyeOff, Loader2,
} from 'lucide-react'
import { projectsAPI } from '@/api/client'
import { getApiErrorMessage } from '@/api/errors'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'react-toastify'
import type { ProjectListItem } from '@/types'

type StatusFilter = 'all' | 'active' | 'inactive'

export default function ProjectsListPage() {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const user = useAuthStore(s => s.user)
    const canEdit = user?.role === 'super_admin' || user?.role === 'مدير_قسم'

    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

    const { data, isLoading } = useQuery({
        queryKey: ['projects-list', search, statusFilter],
        queryFn: () =>
            projectsAPI.list({
                search: search.trim() || undefined,
                is_active:
                    statusFilter === 'active' ? 'true'
                    : statusFilter === 'inactive' ? 'false'
                    : undefined,
            }).then(r => r.data),
    })

    const projects: ProjectListItem[] = useMemo(() => {
        const raw = data?.results ?? data ?? []
        return Array.isArray(raw) ? raw : []
    }, [data])

    const toggleMut = useMutation({
        mutationFn: (id: number) => projectsAPI.toggleActive(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects-list'] })
            toast.success('تم تحديث الحالة')
        },
        onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'فشل التحديث')),
    })

    const deleteMut = useMutation({
        mutationFn: (id: number) => projectsAPI.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects-list'] })
            toast.success('تم حذف المشروع')
        },
        onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'فشل الحذف')),
    })

    const handleDelete = (p: ProjectListItem) => {
        if (!window.confirm(`هل تريد حذف مشروع "${p.name_ar}" نهائياً؟ سيتم حذف جميع الصور.`)) return
        deleteMut.mutate(p.id)
    }

    return (
        <div style={{ padding: '0 4px', maxWidth: 1400, margin: '0 auto' }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 16, marginBottom: 24, flexWrap: 'wrap',
            }}>
                <div>
                    <h1 style={{
                        fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)',
                        margin: 0, display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                        <Building2 size={24} style={{ color: 'var(--color-gold)' }} strokeWidth={1.8} />
                        مشاريعنا
                    </h1>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: '4px 0 0' }}>
                        المشاريع المنفذة بمنتجات بيت الإباء — تظهر تلقائياً في صفحة كل منتج مرتبط
                    </p>
                </div>
                {canEdit && (
                    <button
                        onClick={() => navigate('/projects/new')}
                        className="btn-primary"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            padding: '10px 18px', fontSize: 14, fontWeight: 600,
                        }}
                    >
                        <Plus size={16} strokeWidth={2} />
                        إضافة مشروع
                    </button>
                )}
            </div>

            {/* Filters */}
            <div style={{
                display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap',
            }}>
                <div style={{ flex: '1 1 280px', position: 'relative' }}>
                    <Search size={15} strokeWidth={1.8} style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        color: 'var(--color-text-muted)',
                    }} />
                    <input
                        className="form-input"
                        placeholder="ابحث باسم المشروع أو الموقع…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ paddingRight: 36, width: '100%' }}
                    />
                </div>
                <select
                    className="form-input"
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                    style={{ width: 160 }}
                >
                    <option value="all">جميع الحالات</option>
                    <option value="active">نشط</option>
                    <option value="inactive">معطّل</option>
                </select>
            </div>

            {/* Body */}
            {isLoading ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--color-text-secondary)' }}>
                    <Loader2 size={28} className="spin" style={{ margin: '0 auto 12px' }} />
                    <div>جاري التحميل…</div>
                </div>
            ) : projects.length === 0 ? (
                <div style={{
                    background: 'var(--color-surface-raised)',
                    border: '1px dashed var(--color-border)',
                    borderRadius: 12, padding: 60, textAlign: 'center',
                    color: 'var(--color-text-secondary)',
                }}>
                    <Building2 size={48} strokeWidth={1.2} style={{
                        margin: '0 auto 16px', color: 'var(--color-text-muted)', opacity: 0.5,
                    }} />
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: 'var(--color-text-primary)' }}>
                        لا توجد مشاريع بعد
                    </div>
                    <div style={{ fontSize: 13 }}>
                        {canEdit ? 'ابدأ بإضافة مشروع جديد لعرض إنجازاتك أمام العملاء.' : 'لم يتم إضافة مشاريع حتى الآن.'}
                    </div>
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 16,
                }}>
                    {projects.map(p => (
                        <div
                            key={p.id}
                            style={{
                                background: 'var(--color-surface-raised)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 12,
                                overflow: 'hidden',
                                display: 'flex', flexDirection: 'column',
                                opacity: p.is_active ? 1 : 0.65,
                                transition: 'transform 0.15s, box-shadow 0.15s',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.transform = 'translateY(-2px)'
                                e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)'
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.transform = ''
                                e.currentTarget.style.boxShadow = ''
                            }}
                        >
                            {/* Cover */}
                            <div style={{
                                width: '100%', aspectRatio: '4 / 3',
                                background: 'var(--color-surface)',
                                position: 'relative', overflow: 'hidden',
                            }}>
                                {p.cover_image_url ? (
                                    <img
                                        src={p.cover_image_url}
                                        alt={p.name_ar}
                                        style={{
                                            width: '100%', height: '100%',
                                            objectFit: 'cover', display: 'block',
                                        }}
                                    />
                                ) : (
                                    <div style={{
                                        height: '100%', display: 'flex',
                                        alignItems: 'center', justifyContent: 'center',
                                        color: 'var(--color-text-muted)', flexDirection: 'column', gap: 6,
                                    }}>
                                        <ImageIcon size={32} strokeWidth={1.2} />
                                        <span style={{ fontSize: 11 }}>لا توجد صورة</span>
                                    </div>
                                )}
                                {!p.is_active && (
                                    <div style={{
                                        position: 'absolute', top: 8, right: 8,
                                        background: 'rgba(0,0,0,0.7)', color: '#fff',
                                        padding: '3px 10px', borderRadius: 12,
                                        fontSize: 10, fontWeight: 600,
                                    }}>
                                        معطّل
                                    </div>
                                )}
                            </div>

                            {/* Body */}
                            <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <div style={{
                                    fontSize: 15, fontWeight: 700,
                                    color: 'var(--color-text-primary)',
                                    marginBottom: 4,
                                    display: '-webkit-box',
                                    WebkitLineClamp: 1,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                }}>
                                    {p.name_ar}
                                </div>
                                {p.location_ar && (
                                    <div style={{
                                        fontSize: 12, color: 'var(--color-text-secondary)',
                                        display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8,
                                    }}>
                                        <MapPin size={11} strokeWidth={1.8} />
                                        <span style={{
                                            display: '-webkit-box',
                                            WebkitLineClamp: 1,
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden',
                                        }}>{p.location_ar}</span>
                                    </div>
                                )}
                                <div style={{
                                    display: 'flex', gap: 12, fontSize: 11,
                                    color: 'var(--color-text-muted)', marginTop: 'auto',
                                    paddingTop: 8, borderTop: '1px solid var(--color-border)',
                                }}>
                                    <span>{p.images_count} صورة</span>
                                    <span>•</span>
                                    <span>{p.products_count} منتج</span>
                                </div>
                            </div>

                            {/* Actions */}
                            {canEdit && (
                                <div style={{
                                    display: 'flex', borderTop: '1px solid var(--color-border)',
                                }}>
                                    <Link
                                        to={`/projects/${p.id}/edit`}
                                        style={{
                                            flex: 1, padding: '8px 0', textAlign: 'center',
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                            color: 'var(--color-text-secondary)', fontSize: 12,
                                            textDecoration: 'none', transition: 'background 0.15s',
                                            borderLeft: '1px solid var(--color-border)',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                                        onMouseLeave={e => e.currentTarget.style.background = ''}
                                    >
                                        <Pencil size={12} strokeWidth={1.8} />
                                        تعديل
                                    </Link>
                                    <button
                                        onClick={() => toggleMut.mutate(p.id)}
                                        disabled={toggleMut.isPending}
                                        style={{
                                            flex: 1, padding: '8px 0', border: 'none',
                                            background: 'transparent', cursor: 'pointer',
                                            color: 'var(--color-text-secondary)', fontSize: 12,
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                            borderLeft: '1px solid var(--color-border)',
                                            transition: 'background 0.15s',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                                        onMouseLeave={e => e.currentTarget.style.background = ''}
                                        title={p.is_active ? 'إخفاء من العامة' : 'إظهار للعامة'}
                                    >
                                        {p.is_active ? <EyeOff size={12} strokeWidth={1.8} /> : <Eye size={12} strokeWidth={1.8} />}
                                        {p.is_active ? 'إخفاء' : 'إظهار'}
                                    </button>
                                    <button
                                        onClick={() => handleDelete(p)}
                                        disabled={deleteMut.isPending}
                                        style={{
                                            flex: 1, padding: '8px 0', border: 'none',
                                            background: 'transparent', cursor: 'pointer',
                                            color: '#EF4444', fontSize: 12,
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                            transition: 'background 0.15s',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                                        onMouseLeave={e => e.currentTarget.style.background = ''}
                                    >
                                        <Trash2 size={12} strokeWidth={1.8} />
                                        حذف
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
