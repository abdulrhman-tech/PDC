import { useState, useCallback, useEffect, useRef } from 'react'
import { sapAPI } from '@/api/client'
import { Link2, RefreshCw, X, Loader2, Stethoscope, FolderTree, Search, Calendar, Clock, Server } from 'lucide-react'
import HierarchyTab from './HierarchyTab'
import ProductLookupTab from './ProductLookupTab'
import ProductsByDateTab from './ProductsByDateTab'
import ScheduledTasksTab from './ScheduledTasksTab'
import { SapEnvProvider, useSapEnv } from './SapEnvContext'
import './SAPIntegrationPage.css'

interface ConnectionResult {
    connected: boolean
    status_code?: number
    response_time?: number
    sample_count?: number
    environment?: string
    base_url?: string
    error?: string
    detail?: string
}

type TabId = 'hierarchy' | 'product' | 'date' | 'schedule'

const LAST_SYNC_KEY = 'sap_last_sync_at'

function fmtRelative(iso: string | null): string {
    if (!iso) return 'لم تتم المزامنة بعد'
    const then = new Date(iso).getTime()
    const diff = Math.floor((Date.now() - then) / 1000)
    if (diff < 60) return 'الآن'
    if (diff < 3600) return `قبل ${Math.floor(diff / 60)} دقيقة`
    if (diff < 86400) return `قبل ${Math.floor(diff / 3600)} ساعة`
    return `قبل ${Math.floor(diff / 86400)} يوم`
}

export default function SAPIntegrationPage() {
    return (
        <SapEnvProvider>
            <SAPIntegrationPageInner />
        </SapEnvProvider>
    )
}

function SAPIntegrationPageInner() {
    const { env, setEnv } = useSapEnv()
    const envRef = useRef(env)
    useEffect(() => { envRef.current = env }, [env])

    const [connectionStatus, setConnectionStatus] = useState<ConnectionResult | null>(null)
    const [testing, setTesting] = useState(false)
    const [diagnosing, setDiagnosing] = useState(false)
    const [diagnoseResult, setDiagnoseResult] = useState<any>(null)
    const [activeTab, setActiveTab] = useState<TabId>('hierarchy')
    const [lastSync, setLastSync] = useState<string | null>(null)

    useEffect(() => {
        setLastSync(localStorage.getItem(LAST_SYNC_KEY))
    }, [])

    // Clear stale status/diagnostics whenever the user switches env so the badges
    // and panels never display data fetched against the other server.
    useEffect(() => {
        setConnectionStatus(null)
        setDiagnoseResult(null)
    }, [env])

    const markSynced = useCallback(() => {
        const now = new Date().toISOString()
        localStorage.setItem(LAST_SYNC_KEY, now)
        setLastSync(now)
    }, [])

    const handleTestConnection = useCallback(async () => {
        const reqEnv = env
        setTesting(true)
        try {
            const { data } = await sapAPI.testConnection(reqEnv)
            // Discard the response if the user switched env mid-flight; otherwise
            // a DEV result could end up displayed under the PRD selection.
            if (envRef.current !== reqEnv) return
            setConnectionStatus(data)
        } catch (e: any) {
            if (envRef.current !== reqEnv) return
            setConnectionStatus(e?.response?.data || { connected: false, error: 'فشل الاتصال' })
        } finally {
            if (envRef.current === reqEnv) setTesting(false)
        }
    }, [env])

    const handleDiagnose = useCallback(async () => {
        const reqEnv = env
        setDiagnosing(true); setDiagnoseResult(null)
        try {
            const { data } = await sapAPI.diagnose(reqEnv)
            if (envRef.current !== reqEnv) return
            setDiagnoseResult(data)
        } catch (e: any) {
            if (envRef.current !== reqEnv) return
            setDiagnoseResult({ error: e?.response?.data?.error || 'فشل التشخيص' })
        } finally {
            if (envRef.current === reqEnv) setDiagnosing(false)
        }
    }, [env])

    const tabs: { id: TabId; label: string; icon: any }[] = [
        { id: 'hierarchy', label: 'شجرة التصنيفات', icon: FolderTree },
        { id: 'product', label: 'بحث صنف', icon: Search },
        { id: 'date', label: 'أصناف حسب الفترة', icon: Calendar },
        { id: 'schedule', label: 'المهام المجدولة', icon: Clock },
    ]

    return (
        <div className="sap-page">
            <div className="sap-page-header">
                <Link2 size={22} strokeWidth={1.5} style={{ color: 'var(--color-gold)' }} />
                <h1>ربط SAP</h1>
                <div className="sap-env-switcher" role="group" aria-label="بيئة SAP">
                    <Server size={14} className="sap-env-switcher-icon" />
                    <span className="sap-env-switcher-label">البيئة:</span>
                    {(['DEV', 'PRD'] as const).map(option => (
                        <button
                            key={option}
                            type="button"
                            className={`sap-env-switcher-btn ${option.toLowerCase()}${env === option ? ' active' : ''}`}
                            onClick={() => setEnv(option)}
                            aria-pressed={env === option}
                        >
                            {option}
                        </button>
                    ))}
                </div>
                <span className="sap-last-sync-pill" style={{ marginRight: 'auto' }}>
                    آخر مزامنة: {fmtRelative(lastSync)}
                </span>
            </div>

            <div className="sap-connection-bar">
                <div className="sap-connection-status">
                    <span className={`status-dot ${connectionStatus === null ? 'unknown' : connectionStatus.connected ? 'connected' : 'disconnected'}`} />
                    {connectionStatus === null ? 'لم يتم الاختبار' : connectionStatus.connected ? 'متصل' : (connectionStatus.error || 'غير متصل')}
                </div>
                <div className="sap-connection-meta">
                    {connectionStatus?.response_time != null && <span>⏱ {connectionStatus.response_time} ثانية</span>}
                    {connectionStatus?.base_url && <span style={{ direction: 'ltr', unicodeBidi: 'embed' }}>{connectionStatus.base_url}</span>}
                </div>
                <button className="sap-test-btn" onClick={handleTestConnection} disabled={testing}>
                    {testing ? <Loader2 size={14} className="spin-icon" style={{ animation: 'sapSpin 1s linear infinite' }} /> : <RefreshCw size={14} />}
                    اختبار الاتصال
                </button>
                <button className="sap-test-btn" onClick={handleDiagnose} disabled={diagnosing}>
                    {diagnosing ? <Loader2 size={14} className="spin-icon" style={{ animation: 'sapSpin 1s linear infinite' }} /> : <Stethoscope size={14} />}
                    تشخيص الاتصال
                </button>
            </div>

            {connectionStatus && !connectionStatus.connected && connectionStatus.detail && (
                <div className="sap-error-box">{connectionStatus.detail}</div>
            )}

            {diagnoseResult && (
                <div className="sap-diagnose-results">
                    <div className="sap-diagnose-header">
                        <Stethoscope size={16} />
                        <span>نتائج التشخيص</span>
                        <button className="sap-detail-close" onClick={() => setDiagnoseResult(null)}><X size={14} /></button>
                    </div>
                    {diagnoseResult.error && !diagnoseResult.dns && !diagnoseResult.proxy_tcp && (
                        <div className="sap-error-box" style={{ marginBottom: 0 }}>{diagnoseResult.error}</div>
                    )}
                    {diagnoseResult.host && (
                        <div className="sap-diagnose-grid">
                            <div className="sap-diagnose-item"><span className="diag-label">الوضع</span>
                                <span className="diag-value">{diagnoseResult.mode === 'proxy' ? '🔀 عبر Proxy' : '🔗 اتصال مباشر'}</span>
                            </div>
                            <div className="sap-diagnose-item"><span className="diag-label">سيرفر SAP</span>
                                <span className="diag-value" style={{ direction: 'ltr' }}>{diagnoseResult.host}:{diagnoseResult.port}</span>
                            </div>
                            <div className="sap-diagnose-item"><span className="diag-label">بيانات الدخول</span>
                                <span className={`diag-status ${diagnoseResult.has_credentials ? 'ok' : 'fail'}`}>
                                    {diagnoseResult.has_credentials ? '✅ موجودة' : '❌ مفقودة'}
                                </span>
                            </div>
                            {diagnoseResult.mode === 'proxy' ? (
                                <>
                                    <div className="sap-diagnose-item"><span className="diag-label">Proxy URL</span>
                                        <span className="diag-value" style={{ direction: 'ltr', fontSize: 12 }}>{diagnoseResult.proxy_url}</span>
                                    </div>
                                    <div className="sap-diagnose-item"><span className="diag-label">Proxy TCP</span>
                                        <span className={`diag-status ${diagnoseResult.proxy_tcp?.status === 'ok' ? 'ok' : 'fail'}`}>
                                            {diagnoseResult.proxy_tcp?.status === 'ok'
                                                ? `✅ متصل (${diagnoseResult.proxy_tcp.time}s)`
                                                : `❌ ${diagnoseResult.proxy_tcp?.error || 'محجوب'}`}
                                        </span>
                                    </div>
                                    <div className="sap-diagnose-item"><span className="diag-label">Proxy → SAP</span>
                                        <span className={`diag-status ${diagnoseResult.proxy_sap?.status === 'ok' ? 'ok' : 'fail'}`}>
                                            {diagnoseResult.proxy_sap?.status === 'ok'
                                                ? `✅ HTTP ${diagnoseResult.proxy_sap.http_status} (${diagnoseResult.proxy_sap.time}s)`
                                                : `❌ ${diagnoseResult.proxy_sap?.error?.substring(0, 120) || 'فشل'}`}
                                        </span>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="sap-diagnose-item"><span className="diag-label">DNS</span>
                                        <span className={`diag-status ${diagnoseResult.dns?.status === 'ok' ? 'ok' : 'fail'}`}>
                                            {diagnoseResult.dns?.status === 'ok' ? `✅ ${diagnoseResult.dns.ip}` : `❌ ${diagnoseResult.dns?.error || 'فشل'}`}
                                        </span>
                                    </div>
                                    <div className="sap-diagnose-item"><span className="diag-label">TCP Port {diagnoseResult.port}</span>
                                        <span className={`diag-status ${diagnoseResult.tcp?.status === 'ok' ? 'ok' : 'fail'}`}>
                                            {diagnoseResult.tcp?.status === 'ok' ? `✅ مفتوح (${diagnoseResult.tcp.time}s)` : `❌ ${diagnoseResult.tcp?.error || 'محجوب'}`}
                                        </span>
                                    </div>
                                    <div className="sap-diagnose-item"><span className="diag-label">HTTPS</span>
                                        <span className={`diag-status ${diagnoseResult.https?.status === 'ok' ? 'ok' : 'fail'}`}>
                                            {diagnoseResult.https?.status === 'ok'
                                                ? `✅ HTTP ${diagnoseResult.https.http_status} (${diagnoseResult.https.time}s)`
                                                : `❌ ${diagnoseResult.https?.error?.substring(0, 120) || 'فشل'}`}
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div className="sap-tabs">
                {tabs.map(t => {
                    const Icon = t.icon
                    return (
                        <button
                            key={t.id}
                            className={`sap-tab${activeTab === t.id ? ' active' : ''}`}
                            onClick={() => setActiveTab(t.id)}
                        >
                            <Icon size={16} />
                            <span>{t.label}</span>
                        </button>
                    )
                })}
            </div>

            <div className="sap-tab-content">
                <div style={{ display: activeTab === 'hierarchy' ? 'block' : 'none' }}>
                    <HierarchyTab onSyncComplete={markSynced} />
                </div>
                <div style={{ display: activeTab === 'product' ? 'block' : 'none' }}>
                    <ProductLookupTab onProductSaved={markSynced} />
                </div>
                <div style={{ display: activeTab === 'date' ? 'block' : 'none' }}>
                    <ProductsByDateTab onSyncComplete={markSynced} />
                </div>
                <div style={{ display: activeTab === 'schedule' ? 'block' : 'none' }}>
                    <ScheduledTasksTab />
                </div>
            </div>
        </div>
    )
}
