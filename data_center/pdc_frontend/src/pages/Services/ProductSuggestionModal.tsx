import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { X, Upload, Trash2, Send } from 'lucide-react'
import { categoriesAPI, submissionsAPI } from '@/api/client'
import { pickBilingual } from '@/i18n/bilingual'
import type { CategoryFlat } from '@/types'

interface Props {
    onClose: () => void
}

export default function ProductSuggestionModal({ onClose }: Props) {
    const { t, i18n } = useTranslation()
    const isAr = i18n.language === 'ar'
    const catName = (c: { name_ar: string; name_en?: string }) =>
        pickBilingual(c.name_ar, c.name_en, isAr)

    const { data: categories = [] } = useQuery<CategoryFlat[]>({
        queryKey: ['categories-flat'],
        queryFn: () => categoriesAPI.flat().then(r => r.data),
        staleTime: 5 * 60 * 1000,
    })

    const [submitForm, setSubmitForm] = useState({
        sku: '', category: '', product_name_ar: '', submitter_name: '', submitter_email: '',
    })
    const [submitImages, setSubmitImages] = useState<File[]>([])
    const [submitting, setSubmitting] = useState(false)
    const [submitDone, setSubmitDone] = useState(false)

    const valid = !!submitForm.product_name_ar && !!submitForm.category
        && !!submitForm.submitter_name && !!submitForm.submitter_email
        && submitImages.length > 0

    return (
        <div
            onClick={e => { if (e.target === e.currentTarget) onClose() }}
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9000,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            }}
        >
            <div style={{
                background: 'var(--color-surface)', borderRadius: 16, width: '100%', maxWidth: 580,
                border: '1px solid rgba(200,168,75,0.25)', boxShadow: 'var(--shadow-lg)',
                maxHeight: '90vh', overflowY: 'auto',
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '20px 24px', borderBottom: '1px solid var(--color-border)',
                }}>
                    <div>
                        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 2, color: 'var(--color-text-primary)' }}>
                            {t('submit.title')}
                        </h2>
                        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                            {t('submit.subtitle')}
                        </p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                        <X size={20} />
                    </button>
                </div>

                {submitDone ? (
                    <div style={{ padding: 40, textAlign: 'center' }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--color-gold)' }}>
                            {t('submit.success_title')}
                        </h3>
                        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
                            {t('submit.success_body')}
                        </p>
                        <button
                            onClick={() => {
                                onClose()
                                setSubmitForm({ sku: '', category: '', product_name_ar: '', submitter_name: '', submitter_email: '' })
                                setSubmitImages([])
                                setSubmitDone(false)
                            }}
                            style={{
                                marginTop: 20, padding: '10px 28px', background: '#C8A84B',
                                border: 'none', borderRadius: 8, color: '#1a1a1a',
                                fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                            }}
                        >
                            {t('submit.close')}
                        </button>
                    </div>
                ) : (
                    <div style={{ padding: '20px 24px' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-gold)', letterSpacing: 1, marginBottom: 14 }}>
                            {t('submit.product_data')}
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>
                                {t('submit.product_name')} *
                            </label>
                            <input
                                value={submitForm.product_name_ar}
                                onChange={e => setSubmitForm(f => ({ ...f, product_name_ar: e.target.value }))}
                                placeholder={t('submit.product_name_placeholder')}
                                style={{
                                    width: '100%', padding: '10px 12px',
                                    background: 'var(--color-surface-raised)', border: '1px solid var(--color-border-strong)',
                                    borderRadius: 8, color: 'var(--color-text-primary)', fontSize: 13,
                                    fontFamily: 'inherit', boxSizing: 'border-box',
                                }}
                            />
                        </div>

                        <div className="grid-2" style={{ gap: 12, marginBottom: 14 }}>
                            <div>
                                <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>
                                    {t('submit.category')} *
                                </label>
                                <select
                                    value={submitForm.category}
                                    onChange={e => setSubmitForm(f => ({ ...f, category: e.target.value }))}
                                    style={{
                                        width: '100%', padding: '10px 12px',
                                        background: 'var(--color-surface-raised)', border: '1px solid var(--color-border-strong)',
                                        borderRadius: 8, color: submitForm.category ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                                        fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
                                    }}
                                >
                                    <option value="" style={{ background: 'var(--color-surface-raised)' }}>
                                        {t('submit.select_category')}
                                    </option>
                                    {categories.map((c: CategoryFlat) => (
                                        <option key={c.id} value={c.id} style={{ background: 'var(--color-surface-raised)' }}>
                                            {catName(c)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>
                                    {t('submit.sku')} <span style={{ opacity: 0.5 }}>({t('submit.optional')})</span>
                                </label>
                                <input
                                    value={submitForm.sku}
                                    onChange={e => setSubmitForm(f => ({ ...f, sku: e.target.value }))}
                                    placeholder="PDC-1234"
                                    style={{
                                        width: '100%', padding: '10px 12px',
                                        background: 'var(--color-surface-raised)', border: '1px solid var(--color-border-strong)',
                                        borderRadius: 8, color: 'var(--color-text-primary)', fontSize: 13,
                                        fontFamily: 'inherit', direction: 'ltr', textAlign: 'left', boxSizing: 'border-box',
                                    }}
                                />
                            </div>
                        </div>

                        {/* Images */}
                        <div style={{ marginBottom: 20 }}>
                            <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>
                                {t('submit.images')} * <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>({t('submit.images_hint')})</span>
                            </label>
                            <label style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                                padding: 18, border: '2px dashed rgba(200,168,75,0.3)', borderRadius: 10,
                                cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 13,
                                background: 'var(--color-gold-light)',
                            }}>
                                <Upload size={18} color="var(--color-gold)" />
                                {t('submit.upload_label')}
                                <input
                                    type="file" multiple accept="image/*" style={{ display: 'none' }}
                                    onChange={e => {
                                        const files = Array.from(e.target.files ?? [])
                                        setSubmitImages(prev => [...prev, ...files].slice(0, 10))
                                    }}
                                />
                            </label>
                            {submitImages.length > 0 && (
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                                    {submitImages.map((file, i) => (
                                        <div key={i} style={{ position: 'relative' }}>
                                            <img
                                                src={URL.createObjectURL(file)}
                                                style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-border-strong)' }}
                                                alt=""
                                            />
                                            <button
                                                onClick={() => setSubmitImages(prev => prev.filter((_, j) => j !== i))}
                                                style={{
                                                    position: 'absolute', top: -6, right: -6, background: '#E74C3C',
                                                    border: 'none', borderRadius: '50%', width: 18, height: 18,
                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                                                }}
                                            >
                                                <Trash2 size={10} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Your info */}
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-gold)', letterSpacing: 1, marginBottom: 14, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
                            {t('submit.your_info')}
                        </div>
                        <div className="grid-2" style={{ gap: 12, marginBottom: 20 }}>
                            <div>
                                <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>
                                    {t('submit.your_name')} *
                                </label>
                                <input
                                    value={submitForm.submitter_name}
                                    onChange={e => setSubmitForm(f => ({ ...f, submitter_name: e.target.value }))}
                                    placeholder={t('submit.your_name_placeholder')}
                                    style={{
                                        width: '100%', padding: '10px 12px',
                                        background: 'var(--color-surface-raised)', border: '1px solid var(--color-border-strong)',
                                        borderRadius: 8, color: 'var(--color-text-primary)', fontSize: 13,
                                        fontFamily: 'inherit', boxSizing: 'border-box',
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>
                                    {t('submit.your_email')} *
                                </label>
                                <input
                                    value={submitForm.submitter_email}
                                    onChange={e => setSubmitForm(f => ({ ...f, submitter_email: e.target.value }))}
                                    placeholder="example@email.com" type="email"
                                    style={{
                                        width: '100%', padding: '10px 12px',
                                        background: 'var(--color-surface-raised)', border: '1px solid var(--color-border-strong)',
                                        borderRadius: 8, color: 'var(--color-text-primary)', fontSize: 13,
                                        fontFamily: 'inherit', direction: 'ltr', textAlign: 'left', boxSizing: 'border-box',
                                    }}
                                />
                            </div>
                        </div>

                        {/* Submit */}
                        <>
                            <style>{`
                                @keyframes pdc-spin { to { transform: rotate(360deg); } }
                                @keyframes pdc-pulse { 0%,100%{opacity:.5} 50%{opacity:1} }
                                .pdc-spinner {
                                    width: 22px; height: 22px; border-radius: 50%;
                                    border: 3px solid rgba(26,26,26,0.25);
                                    border-top-color: #1a1a1a;
                                    animation: pdc-spin .7s linear infinite;
                                    flex-shrink: 0;
                                }
                                .pdc-step { animation: pdc-pulse 1.4s ease-in-out infinite; }
                            `}</style>

                            {submitting && (
                                <div style={{ marginBottom: 14, padding: '16px 18px', background: 'rgba(200,168,75,0.07)', border: '1px solid rgba(200,168,75,0.2)', borderRadius: 10 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                        <div className="pdc-spinner" />
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-gold)' }}>{t('submit.sending')}</div>
                                            <div className="pdc-step" style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 3 }}>
                                                {submitImages.length > 0 ? t('submit.uploading_images', { count: submitImages.length }) : t('submit.sending_data')}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ height: 3, background: 'rgba(200,168,75,0.15)', borderRadius: 2, overflow: 'hidden' }}>
                                        <div style={{ height: '100%', background: 'linear-gradient(90deg,#C8A84B,#a8832f)', borderRadius: 2, animation: 'pdc-progress 1.8s ease-in-out infinite', width: '60%' }} />
                                        <style>{`@keyframes pdc-progress { 0%{transform:translateX(120%)} 100%{transform:translateX(-200%)} }`}</style>
                                    </div>
                                </div>
                            )}

                            <button
                                disabled={submitting || !valid}
                                onClick={async () => {
                                    setSubmitting(true)
                                    try {
                                        const fd = new FormData()
                                        fd.append('sku', submitForm.sku)
                                        fd.append('category', submitForm.category)
                                        fd.append('product_name_ar', submitForm.product_name_ar)
                                        fd.append('submitter_name', submitForm.submitter_name)
                                        fd.append('submitter_email', submitForm.submitter_email)
                                        submitImages.forEach(img => fd.append('images', img))
                                        await submissionsAPI.create(fd)
                                        setSubmitDone(true)
                                    } catch { alert(t('submit.error')) }
                                    finally { setSubmitting(false) }
                                }}
                                style={{
                                    width: '100%', padding: '13px 20px',
                                    background: (valid && !submitting) ? 'linear-gradient(135deg, #C8A84B, #a8832f)' : 'rgba(200,168,75,0.25)',
                                    border: 'none', borderRadius: 10, color: '#1a1a1a', fontSize: 15, fontWeight: 700,
                                    fontFamily: 'inherit', cursor: (valid && !submitting) ? 'pointer' : 'not-allowed',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    opacity: submitting ? 0.6 : 1, transition: 'opacity .2s',
                                }}
                            >
                                {submitting
                                    ? <><div className="pdc-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> {t('submit.sending_btn')}</>
                                    : <><Send size={16} /> {t('submit.send_btn')}</>
                                }
                            </button>
                        </>
                        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 10 }}>
                            {t('submit.review_note')}
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
