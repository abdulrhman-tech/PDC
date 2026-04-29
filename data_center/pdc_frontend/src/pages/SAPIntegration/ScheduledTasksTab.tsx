import { useState, useEffect, useCallback } from 'react'
import { sapAPI, type SapEnv } from '@/api/client'
import {
    Clock, Play, ListChecks, Loader2, RefreshCw, X,
    CheckCircle2, AlertCircle, Circle, FolderTree, Package, Server,
} from 'lucide-react'

type Repeat = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'custom'
type RunStatus = 'never' | 'running' | 'success' | 'failed'

interface ScheduledTask {
    id: number
    task_type: 'sync_hierarchy' | 'sync_products'
    task_type_display: string
    is_active: boolean
    repeat: Repeat
    repeat_display: string
    day_of_month: number | null
    day_of_week: number | null
    hour: number
    minute: number
    custom_interval_days: number | null
    sap_env: SapEnv
    last_run_at: string | null
    last_run_status: RunStatus
    last_run_message: string
    last_run_duration: number | null
    next_run_at: string | null
}

interface TaskLog {
    id: number
    started_at: string | null
    finished_at: string | null
    status: RunStatus
    duration: number | null
    records_processed: number
    records_updated: number
    records_created: number
    records_failed: number
    records_skipped: number
    triggered_manually: boolean
    error_message: string
    details: any
}

const REPEAT_LABELS: Record<Repeat, string> = {
    daily: 'يومي',
    weekly: 'أسبوعي',
    monthly: 'شهري',
    quarterly: 'كل 3 أشهر',
    custom: 'مخصص',
}

const WEEKDAYS = ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد']

const HOURS_OPTIONS = Array.from({ length: 24 }, (_, h) => {
    const ampm = h < 12 ? 'AM' : 'PM'
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h
    return { value: h, label: `${display.toString().padStart(2, '0')}:00 ${ampm}` }
})

function fmtDateTime(iso: string | null): string {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleString('ar-SA', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })
}

function fmtDuration(s: number | null): string {
    if (s == null) return '—'
    if (s < 60) return `${s.toFixed(1)} ث`
    const m = Math.floor(s / 60)
    const sec = Math.round(s - m * 60)
    return `${m} د ${sec} ث`
}

function statusIcon(s: RunStatus) {
    if (s === 'success') return <CheckCircle2 size={14} style={{ color: '#5cb85c' }} />
    if (s === 'failed') return <AlertCircle size={14} style={{ color: '#d9534f' }} />
    if (s === 'running') return <Loader2 size={14} className="spin-icon" style={{ animation: 'sapSpin 1s linear infinite', color: 'var(--color-gold, #C8A84B)' }} />
    return <Circle size={14} style={{ color: 'var(--color-text-muted)' }} />
}

function statusLabel(s: RunStatus) {
    if (s === 'success') return 'نجح'
    if (s === 'failed') return 'فشل'
    if (s === 'running') return 'قيد التنفيذ'
    return 'لم ينفذ بعد'
}

const card: React.CSSProperties = {
    background: 'var(--color-surface, rgba(255,255,255,0.03))',
    border: '1px solid var(--color-border)',
    borderRadius: 12,
    padding: 18,
    marginBottom: 16,
}

const fieldRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap',
}

const labelStyle: React.CSSProperties = {
    fontSize: 12, color: 'var(--color-text-secondary)', minWidth: 70, fontWeight: 600,
}

const selectStyle: React.CSSProperties = {
    padding: '6px 10px', fontSize: 13, borderRadius: 6,
    border: '1px solid var(--color-border)', background: 'var(--color-bg, #1a1a1a)',
    color: 'var(--color-text, #fff)', fontFamily: 'inherit', minWidth: 120,
}

export default function ScheduledTasksTab() {
    const [tasks, setTasks] = useState<ScheduledTask[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [savingId, setSavingId] = useState<number | null>(null)
    const [runningId, setRunningId] = useState<number | null>(null)
    const [runResult, setRunResult] = useState<{ taskId: number; message: string; ok: boolean } | null>(null)
    const [logsModal, setLogsModal] = useState<{ task: ScheduledTask; logs: TaskLog[]; loading: boolean } | null>(null)

    const fetchTasks = useCallback(async () => {
        try {
            const { data } = await sapAPI.listScheduledTasks()
            setTasks(data.tasks || [])
        } catch (e: any) {
            setError(e?.response?.data?.error || 'فشل تحميل المهام المجدولة')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchTasks() }, [fetchTasks])

    // poll while any task is running
    useEffect(() => {
        const anyRunning = tasks.some(t => t.last_run_status === 'running') || runningId !== null
        if (!anyRunning) return
        const id = setInterval(fetchTasks, 4000)
        return () => clearInterval(id)
    }, [tasks, runningId, fetchTasks])

    const updateTask = async (task: ScheduledTask, payload: Partial<ScheduledTask>) => {
        setSavingId(task.id)
        try {
            const { data } = await sapAPI.updateScheduledTask(task.id, payload)
            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...data } : t))
        } catch (e: any) {
            setError(e?.response?.data?.error || 'فشل حفظ الإعدادات')
        } finally {
            setSavingId(null)
        }
    }

    const runNow = async (task: ScheduledTask) => {
        setRunningId(task.id)
        setRunResult(null)
        try {
            const { data } = await sapAPI.runScheduledTaskNow(task.id, true)
            setRunResult({ taskId: task.id, message: data?.message || 'بدأ التنفيذ', ok: true })
            setTimeout(fetchTasks, 1500)
        } catch (e: any) {
            setRunResult({
                taskId: task.id,
                message: e?.response?.data?.error || 'فشل بدء التنفيذ',
                ok: false,
            })
        } finally {
            setRunningId(null)
        }
    }

    const openLogs = async (task: ScheduledTask) => {
        setLogsModal({ task, logs: [], loading: true })
        try {
            const { data } = await sapAPI.getTaskLogs(task.id, 20)
            setLogsModal({ task, logs: data.logs || [], loading: false })
        } catch {
            setLogsModal({ task, logs: [], loading: false })
        }
    }

    if (loading) {
        return (
            <div className="sap-spinner">
                <Loader2 size={20} className="spin-icon" /> جاري التحميل...
            </div>
        )
    }

    return (
        <div className="sap-scheduled-tab">
            {error && <div className="sap-error-box">{error}</div>}

            <div style={{
                marginBottom: 14, fontSize: 13, color: 'var(--color-text-secondary)',
                background: 'rgba(200,168,75,0.06)', border: '1px solid rgba(200,168,75,0.25)',
                padding: '10px 14px', borderRadius: 8, lineHeight: 1.7,
            }}>
                <Clock size={14} style={{ verticalAlign: 'middle', marginLeft: 6, color: 'var(--color-gold, #C8A84B)' }} />
                المهام المجدولة تنفذ مزامنة SAP تلقائياً وفق الجدول. عند تعطيل المهمة، يبقى زر "تنفيذ الآن" متاحاً للتشغيل اليدوي.
            </div>

            {tasks.map(task => {
                const isHierarchy = task.task_type === 'sync_hierarchy'
                const Icon = isHierarchy ? FolderTree : Package
                const isRunning = task.last_run_status === 'running' || runningId === task.id
                const showRunResult = runResult?.taskId === task.id
                return (
                    <div key={task.id} style={card}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Icon size={20} style={{ color: 'var(--color-gold, #C8A84B)' }} strokeWidth={1.5} />
                                <div>
                                    <div style={{ fontSize: 15, fontWeight: 700 }}>{task.task_type_display}</div>
                                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                                        {isHierarchy
                                            ? 'سحب شجرة التصنيفات والسمات من SAP'
                                            : 'تحديث الأصناف الموجودة في النظام والتي تغيّرت في SAP'}
                                    </div>
                                </div>
                            </div>
                            <label style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                                padding: '6px 12px', borderRadius: 999,
                                background: task.is_active ? 'rgba(92,184,92,0.15)' : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${task.is_active ? 'rgba(92,184,92,0.4)' : 'var(--color-border)'}`,
                                fontSize: 12, fontWeight: 600,
                                color: task.is_active ? '#5cb85c' : 'var(--color-text-muted)',
                            }}>
                                <input
                                    type="checkbox"
                                    checked={task.is_active}
                                    onChange={e => updateTask(task, { is_active: e.target.checked })}
                                    disabled={savingId === task.id}
                                    style={{ accentColor: 'var(--color-gold, #C8A84B)', cursor: 'pointer' }}
                                />
                                {task.is_active ? 'مفعّل' : 'معطّل'}
                            </label>
                        </div>

                        <div style={{ display: 'grid', gap: 6 }}>
                            <div style={fieldRow}>
                                <label style={labelStyle}>التكرار</label>
                                <select
                                    style={selectStyle}
                                    value={task.repeat}
                                    onChange={e => updateTask(task, { repeat: e.target.value as Repeat })}
                                    disabled={savingId === task.id}
                                >
                                    {(Object.keys(REPEAT_LABELS) as Repeat[]).map(r =>
                                        <option key={r} value={r}>{REPEAT_LABELS[r]}</option>
                                    )}
                                </select>
                            </div>

                            {task.repeat === 'monthly' && (
                                <div style={fieldRow}>
                                    <label style={labelStyle}>اليوم</label>
                                    <select
                                        style={selectStyle}
                                        value={task.day_of_month ?? 1}
                                        onChange={e => updateTask(task, { day_of_month: parseInt(e.target.value) })}
                                        disabled={savingId === task.id}
                                    >
                                        {Array.from({ length: 28 }, (_, i) => i + 1).map(d =>
                                            <option key={d} value={d}>{d}</option>
                                        )}
                                    </select>
                                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>من كل شهر</span>
                                </div>
                            )}

                            {task.repeat === 'weekly' && (
                                <div style={fieldRow}>
                                    <label style={labelStyle}>اليوم</label>
                                    <select
                                        style={selectStyle}
                                        value={task.day_of_week ?? 0}
                                        onChange={e => updateTask(task, { day_of_week: parseInt(e.target.value) })}
                                        disabled={savingId === task.id}
                                    >
                                        {WEEKDAYS.map((name, i) =>
                                            <option key={i} value={i}>{name}</option>
                                        )}
                                    </select>
                                </div>
                            )}

                            {task.repeat === 'custom' && (
                                <div style={fieldRow}>
                                    <label style={labelStyle}>كل</label>
                                    <input
                                        type="number" min={1} max={365}
                                        value={task.custom_interval_days ?? 30}
                                        onChange={e => updateTask(task, { custom_interval_days: parseInt(e.target.value) || 1 })}
                                        disabled={savingId === task.id}
                                        style={{ ...selectStyle, width: 90, minWidth: 0 }}
                                    />
                                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>يوم</span>
                                </div>
                            )}

                            <div style={fieldRow}>
                                <label style={labelStyle}>الساعة</label>
                                <select
                                    style={selectStyle}
                                    value={task.hour}
                                    onChange={e => updateTask(task, { hour: parseInt(e.target.value) })}
                                    disabled={savingId === task.id}
                                >
                                    {HOURS_OPTIONS.map(h =>
                                        <option key={h.value} value={h.value}>{h.label}</option>
                                    )}
                                </select>
                            </div>

                            <div style={fieldRow}>
                                <label style={labelStyle}>
                                    <Server size={12} style={{ verticalAlign: 'middle', marginLeft: 4 }} />
                                    البيئة
                                </label>
                                <select
                                    style={selectStyle}
                                    value={task.sap_env}
                                    onChange={e => updateTask(task, { sap_env: e.target.value as SapEnv })}
                                    disabled={savingId === task.id}
                                >
                                    <option value="DEV">DEV — اختبار (8323)</option>
                                    <option value="PRD">PRD — إنتاج (8325)</option>
                                </select>
                                <span
                                    className={`env-badge ${task.sap_env.toLowerCase()}`}
                                    style={{ marginRight: 4 }}
                                >
                                    {task.sap_env}
                                </span>
                            </div>
                        </div>

                        <div style={{
                            marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-border)',
                            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12,
                        }}>
                            <div>
                                <div style={{ color: 'var(--color-text-secondary)', marginBottom: 4 }}>آخر تنفيذ</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {statusIcon(task.last_run_status)}
                                    <span>{fmtDateTime(task.last_run_at)}</span>
                                    {task.last_run_status !== 'never' && (
                                        <span style={{ color: 'var(--color-text-muted)' }}>
                                            ({statusLabel(task.last_run_status)}{task.last_run_duration != null ? ` · ${fmtDuration(task.last_run_duration)}` : ''})
                                        </span>
                                    )}
                                </div>
                                {task.last_run_status === 'failed' && task.last_run_message && (
                                    <div style={{ marginTop: 4, color: '#d9534f', fontSize: 11, lineHeight: 1.5 }}>
                                        {task.last_run_message.slice(0, 200)}
                                    </div>
                                )}
                            </div>
                            <div>
                                <div style={{ color: 'var(--color-text-secondary)', marginBottom: 4 }}>التنفيذ القادم</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Clock size={13} style={{ color: 'var(--color-gold, #C8A84B)' }} />
                                    <span>{task.is_active ? fmtDateTime(task.next_run_at) : 'متوقف'}</span>
                                </div>
                            </div>
                        </div>

                        {showRunResult && (
                            <div style={{
                                marginTop: 10, padding: '8px 12px', borderRadius: 6, fontSize: 12,
                                background: runResult?.ok ? 'rgba(92,184,92,0.1)' : 'rgba(217,83,79,0.1)',
                                color: runResult?.ok ? '#5cb85c' : '#d9534f',
                                border: `1px solid ${runResult?.ok ? 'rgba(92,184,92,0.3)' : 'rgba(217,83,79,0.3)'}`,
                            }}>
                                {runResult?.message}
                            </div>
                        )}

                        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                                className="sap-sync-btn"
                                onClick={() => runNow(task)}
                                disabled={isRunning}
                                style={{ background: 'rgba(200,168,75,0.18)', borderColor: 'rgba(200,168,75,0.6)' }}
                            >
                                {isRunning
                                    ? <Loader2 size={14} className="spin-icon" style={{ animation: 'sapSpin 1s linear infinite' }} />
                                    : <Play size={14} />}
                                تنفيذ الآن
                            </button>
                            <button className="sap-test-btn" onClick={() => openLogs(task)}>
                                <ListChecks size={14} /> سجل التنفيذ
                            </button>
                            {savingId === task.id && (
                                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <Loader2 size={12} className="spin-icon" style={{ animation: 'sapSpin 1s linear infinite' }} /> جاري الحفظ...
                                </span>
                            )}
                        </div>
                    </div>
                )
            })}

            <div style={{
                display: 'flex', justifyContent: 'flex-end', marginTop: 8,
            }}>
                <button className="sap-test-btn" onClick={fetchTasks}>
                    <RefreshCw size={14} /> تحديث الحالة
                </button>
            </div>

            {logsModal && (
                <div className="sap-sync-modal-overlay" onClick={() => setLogsModal(null)}>
                    <div className="sap-sync-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <h3 style={{ margin: 0 }}>سجل التنفيذ — {logsModal.task.task_type_display}</h3>
                            <button className="sap-detail-close" onClick={() => setLogsModal(null)}><X size={18} /></button>
                        </div>
                        {logsModal.loading ? (
                            <div className="sap-spinner"><Loader2 size={18} className="spin-icon" /> جاري التحميل...</div>
                        ) : logsModal.logs.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 30, color: 'var(--color-text-secondary)' }}>
                                لا يوجد سجل تنفيذ بعد
                            </div>
                        ) : (
                            <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                                <table className="sap-products-table" style={{ fontSize: 12 }}>
                                    <thead>
                                        <tr>
                                            <th>الوقت</th>
                                            <th>الحالة</th>
                                            <th>المدة</th>
                                            <th>معالج</th>
                                            <th>محدّث</th>
                                            <th>متجاهل</th>
                                            <th>فاشل</th>
                                            <th>المصدر</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logsModal.logs.map(log => (
                                            <tr key={log.id}>
                                                <td>{fmtDateTime(log.started_at)}</td>
                                                <td>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                        {statusIcon(log.status)} {statusLabel(log.status)}
                                                    </span>
                                                </td>
                                                <td>{fmtDuration(log.duration)}</td>
                                                <td>{log.records_processed}</td>
                                                <td style={{ color: '#5cb85c' }}>{log.records_updated + log.records_created}</td>
                                                <td style={{ color: 'var(--color-text-muted)' }}>{log.records_skipped || '—'}</td>
                                                <td style={{ color: log.records_failed ? '#d9534f' : 'inherit' }}>{log.records_failed || '—'}</td>
                                                <td style={{ fontSize: 11 }}>{log.triggered_manually ? 'يدوي' : 'تلقائي'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {logsModal.logs.some(l => l.error_message) && (
                                    <details style={{ marginTop: 12, fontSize: 12 }}>
                                        <summary style={{ cursor: 'pointer', color: '#d9534f', fontWeight: 600 }}>
                                            تفاصيل الأخطاء ({logsModal.logs.filter(l => l.error_message).length})
                                        </summary>
                                        <div style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto' }}>
                                            {logsModal.logs.filter(l => l.error_message).map(l => (
                                                <div key={l.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
                                                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{fmtDateTime(l.started_at)}</div>
                                                    <div style={{ color: '#d9534f', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap' }}>
                                                        {l.error_message.slice(0, 600)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </details>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
