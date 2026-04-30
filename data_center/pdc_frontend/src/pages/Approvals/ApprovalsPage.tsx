/**
 * Approvals Board — Screen 8
 * مدير النظام يراجع طلبات إضافة/تعديل المنتجات من مديري الأقسام
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    CheckCircle, XCircle, PackagePlus, Pencil,
    AlertCircle, Filter,
} from 'lucide-react'
import { approvalsAPI } from '@/api/client'
import { toast } from 'react-toastify'
import type { ApprovalRequest } from '@/types'
import { pickBilingual } from '@/i18n/bilingual'
import { useTranslation } from 'react-i18next'

const STATUS_LABEL: Record<string, string> = {
    pending: 'قيد الانتظار',
    ai_reviewed: 'مراجعة AI',
    human_reviewing: 'مراجعة بشرية',
    approved: 'مُوافق عليه',
    rejected: 'مرفوض',
}

const STATUS_COLOR: Record<string, string> = {
    pending: 'var(--color-pending)',
    ai_reviewed: 'var(--color-slate-blue)',
    human_reviewing: 'var(--color-gold)',
    approved: 'var(--color-active)',
    rejected: 'var(--color-inactive)',
}

const STATUS_BG: Record<string, string> = {
    pending: 'rgba(245,158,11,0.12)',
    ai_reviewed: 'rgba(96,165,250,0.12)',
    human_reviewing: 'rgba(200,168,75,0.12)',
    approved: 'rgba(52,211,153,0.12)',
    rejected: 'rgba(248,113,113,0.12)',
}

type FilterStatus = 'all' | 'pending' | 'approved' | 'rejected'

export default function ApprovalsPage() {
    const qc = useQueryClient()
    const { i18n } = useTranslation()
    const isAr = i18n.language === 'ar'
    const [notes, setNotes] = useState<Record<number, string>>({})
    const [filter, setFilter] = useState<FilterStatus>('pending')

    // "قيد الانتظار" must include all in-flight statuses (pending + ai_reviewed
    // + human_reviewing) so a request that has moved to an intermediate review
    // state is still visible in the active tab. Backend supports comma-separated.
    const statusParam =
        filter === 'all'      ? undefined :
        filter === 'pending'  ? 'pending,ai_reviewed,human_reviewing' :
        filter

    const { data, isLoading } = useQuery({
        queryKey: ['approvals', filter],
        queryFn: () => approvalsAPI.list(statusParam ? { status: statusParam } : {}).then(r => r.data),
    })
    const approvals: ApprovalRequest[] = data?.results ?? []

    const emptyCopy: Record<FilterStatus, string> = {
        pending:  'لا توجد طلبات قيد الانتظار',
        approved: 'لا توجد طلبات تمت الموافقة عليها',
        rejected: 'لا توجد طلبات مرفوضة',
        all:      'لا توجد طلبات اعتماد',
    }

    const approveMutation = useMutation({
        mutationFn: (id: number) => approvalsAPI.approve(id, notes[id] ?? ''),
        onSuccess: () => {
            toast.success('تمت الموافقة ونُشر المنتج')
            qc.invalidateQueries({ queryKey: ['approvals'] })
            qc.invalidateQueries({ queryKey: ['products'] })
        },
        onError: () => toast.error('فشل تأكيد الموافقة'),
    })

    const rejectMutation = useMutation({
        mutationFn: (id: number) => approvalsAPI.reject(id, notes[id] ?? ''),
        onSuccess: () => {
            toast.info('تم رفض الطلب وإعادة المنتج للحالة السابقة')
            qc.invalidateQueries({ queryKey: ['approvals'] })
            qc.invalidateQueries({ queryKey: ['products'] })
        },
        onError: () => toast.error('فشل الرفض'),
    })

    const filterBtns: { key: FilterStatus; label: string }[] = [
        { key: 'pending', label: 'قيد الانتظار' },
        { key: 'approved', label: 'موافق عليه' },
        { key: 'rejected', label: 'مرفوض' },
        { key: 'all', label: 'الكل' },
    ]

    return (
        <div className="page-enter">
            <div className="page-header">
                <div>
                    <h1 className="page-header-title">لوحة الموافقات</h1>
                    <p className="page-header-sub">مراجعة طلبات إضافة وتعديل المنتجات من مديري الأقسام</p>
                </div>
            </div>

            {/* فلتر الحالة */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                <Filter size={16} color="var(--color-warm-gray)" style={{ alignSelf: 'center' }} />
                {filterBtns.map(btn => (
                    <button
                        key={btn.key}
                        onClick={() => setFilter(btn.key)}
                        style={{
                            padding: '6px 16px',
                            borderRadius: 20,
                            border: '1.5px solid',
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all .15s',
                            borderColor: filter === btn.key ? 'var(--color-gold)' : 'var(--color-border)',
                            background: filter === btn.key ? 'var(--color-gold)' : 'transparent',
                            color: filter === btn.key ? 'var(--color-text-primary)' : 'var(--color-warm-gray)',
                        }}
                    >
                        {btn.label}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <div>{[...Array(3)].map((_, i) => (
                    <div key={i} className="skeleton" style={{ height: 160, borderRadius: 12, marginBottom: 12 }} />
                ))}</div>
            ) : approvals.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--color-warm-gray)' }}>
                    <CheckCircle size={48} strokeWidth={1} color="var(--color-active)" style={{ marginBottom: 16 }} />
                    <p>{emptyCopy[filter]}</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {approvals.map((req) => {
                        const isPending =
                            req.status === 'pending' ||
                            req.status === 'ai_reviewed' ||
                            req.status === 'human_reviewing'
                        const isEdit = req.request_type === 'edit_product'
                        const categoryLabel = pickBilingual(req.product_category, req.product_category_en, isAr)

                        return (
                            <div
                                key={req.id}
                                className="card p-24"
                                style={{ borderRight: `4px solid ${STATUS_COLOR[req.status] ?? 'var(--color-border)'}` }}
                            >
                                {/* الرأس */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                                    <div>
                                        {/* نوع الطلب + حالته */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                            {isEdit
                                                ? <Pencil size={15} color="var(--color-gold)" />
                                                : <PackagePlus size={15} color="var(--color-slate-blue)" />
                                            }
                                            <span style={{
                                                background: isEdit ? 'rgba(245,158,11,0.12)' : 'rgba(96,165,250,0.12)',
                                                color: isEdit ? 'var(--color-yellow)' : 'var(--color-blue)',
                                                fontSize: 11, padding: '2px 10px', borderRadius: 12, fontWeight: 700,
                                            }}>
                                                {req.request_type_display}
                                            </span>

                                            <span style={{
                                                background: STATUS_BG[req.status] ?? 'var(--color-surface-raised)',
                                                color: STATUS_COLOR[req.status],
                                                fontSize: 11, padding: '2px 10px', borderRadius: 12, fontWeight: 600,
                                            }}>
                                                {STATUS_LABEL[req.status] ?? req.status}
                                            </span>
                                        </div>

                                        {/* اسم المنتج */}
                                        <p style={{ fontSize: 16, fontWeight: 700, margin: '0 0 2px', color: 'var(--color-text)' }}>
                                            {req.product_name_ar}
                                        </p>
                                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: 12, color: 'var(--color-warm-gray)' }}>
                                                SKU: <code style={{ fontFamily: 'monospace' }}>{req.product_sku}</code>
                                            </span>
                                            {categoryLabel && (
                                                <span style={{ fontSize: 12, color: 'var(--color-warm-gray)' }}>
                                                    التصنيف: {categoryLabel}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* تاريخ الطلب */}
                                    <div style={{ textAlign: 'left', fontSize: 12, color: 'var(--color-warm-gray)' }}>
                                        <div>مقدّم بواسطة: <strong>{req.submitted_by_name}</strong></div>
                                        <div style={{ marginTop: 2 }}>
                                            {new Date(req.created_at).toLocaleDateString('ar-SA', {
                                                year: 'numeric', month: 'short', day: 'numeric',
                                                hour: '2-digit', minute: '2-digit'
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* ملاحظات المراجع السابقة (للمرفوض/الموافق) */}
                                {!isPending && req.reviewer_notes && (
                                    <div style={{
                                        background: req.status === 'approved' ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)',
                                        border: `1px solid ${req.status === 'approved' ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`,
                                        borderRadius: 8, padding: '8px 12px', marginBottom: 12,
                                        fontSize: 13, color: 'var(--color-text-secondary)',
                                    }}>
                                        <strong>ملاحظة المراجع ({req.reviewed_by_name}):</strong> {req.reviewer_notes}
                                    </div>
                                )}

                                {/* أزرار الموافقة/الرفض (للطلبات المعلقة فقط) */}
                                {isPending && (
                                    <>
                                        <div style={{ marginBottom: 10 }}>
                                            <label style={{
                                                fontSize: 12, fontWeight: 500,
                                                color: 'var(--color-slate-blue)',
                                                display: 'block', marginBottom: 4,
                                            }}>
                                                ملاحظات (اختياري)
                                            </label>
                                            <textarea
                                                className="form-textarea"
                                                style={{ height: 56, resize: 'none', fontSize: 13 }}
                                                placeholder="أضف ملاحظة للمراجعة..."
                                                value={notes[req.id] ?? ''}
                                                onChange={e => setNotes(n => ({ ...n, [req.id]: e.target.value }))}
                                            />
                                        </div>

                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button
                                                className="btn btn-primary btn-sm"
                                                onClick={() => approveMutation.mutate(req.id)}
                                                disabled={approveMutation.isPending || rejectMutation.isPending}
                                                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                                            >
                                                <CheckCircle size={14} />
                                                موافقة ونشر
                                            </button>
                                            <button
                                                className="btn btn-danger btn-sm"
                                                onClick={() => rejectMutation.mutate(req.id)}
                                                disabled={approveMutation.isPending || rejectMutation.isPending}
                                                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                                            >
                                                <XCircle size={14} />
                                                رفض
                                            </button>
                                        </div>
                                    </>
                                )}

                                {/* تنبيه للطلبات المعلقة بدون ملاحظات */}
                                {isPending && !notes[req.id] && (
                                    <p style={{ fontSize: 11, color: 'var(--color-warm-gray)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <AlertCircle size={12} />
                                        الموافقة ستنشر المنتج مباشرة — الرفض سيعيده للحالة السابقة
                                    </p>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
