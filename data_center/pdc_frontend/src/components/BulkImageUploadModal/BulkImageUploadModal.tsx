/**
 * BulkImageUploadModal
 * رفع صور جماعي مرتبط بأكواد المنتجات.
 *
 * يدعم اصطلاحَين يمكن خلطهما في الطلب نفسه:
 *
 * 1) ملفات مفردة: {sku}.jpg، {sku}_1.jpg، {sku}_2.jpg …
 * 2) مجلدات: مجلد باسم {sku} (أو {sku}.jpg) وداخله 1.jpg, 2.jpg, 3.jpg, 4.jpg
 *    حيث 1.jpg هي الصورة الرئيسية للمنتج.
 */
import { useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Images, Upload, CheckCircle2, XCircle, AlertCircle, Loader2, FileImage, FolderUp, Folder } from 'lucide-react'
import { decorativeAPI } from '@/api/client'
import { toast } from 'react-toastify'

interface MatchedItem {
    filename: string
    sku: string
    product_name: string
    image_id: number
    r2_url: string
    image_type?: string
    order?: number
}

interface UnmatchedItem {
    filename: string
    parsed_sku: string
}

interface ErrorItem {
    filename: string
    error: string
}

interface UploadResult {
    total: number
    matched_count: number
    unmatched_count: number
    error_count: number
    matched: MatchedItem[]
    unmatched: UnmatchedItem[]
    errors: ErrorItem[]
}

/** Internal queue entry — keeps the file plus its display-relative path. */
interface QueuedFile {
    file: File
    /** Either just the filename or "folder/filename" for folder uploads. */
    relativePath: string
}

interface Props {
    onClose: () => void
}

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

/**
 * Recursively reads a DataTransfer entry (file or directory) and yields
 * QueuedFile objects with their relative paths preserved.
 */
async function readEntry(entry: any, basePath = ''): Promise<QueuedFile[]> {
    if (!entry) return []
    if (entry.isFile) {
        return new Promise<QueuedFile[]>((resolve) => {
            entry.file(
                (file: File) => {
                    if (!ALLOWED_TYPES.includes(file.type)) { resolve([]); return }
                    const rel = basePath ? `${basePath}/${file.name}` : file.name
                    resolve([{ file, relativePath: rel }])
                },
                () => resolve([])
            )
        })
    }
    if (entry.isDirectory) {
        const reader = entry.createReader()
        const all: QueuedFile[] = []
        // readEntries returns a batch at a time — keep reading until empty.
        const readBatch = (): Promise<void> =>
            new Promise<void>((resolve) => {
                reader.readEntries(async (entries: any[]) => {
                    if (!entries.length) { resolve(); return }
                    const childBase = basePath ? `${basePath}/${entry.name}` : entry.name
                    for (const child of entries) {
                        const sub = await readEntry(child, childBase)
                        all.push(...sub)
                    }
                    await readBatch()
                    resolve()
                }, () => resolve())
            })
        await readBatch()
        return all
    }
    return []
}

export default function BulkImageUploadModal({ onClose }: Props) {
    const [items, setItems] = useState<QueuedFile[]>([])
    const [uploading, setUploading] = useState(false)
    const [result, setResult] = useState<UploadResult | null>(null)
    const [dragging, setDragging] = useState(false)
    const [activeTab, setActiveTab] = useState<'matched' | 'unmatched' | 'errors'>('matched')
    const fileInputRef = useRef<HTMLInputElement>(null)
    const folderInputRef = useRef<HTMLInputElement>(null)

    const addQueued = useCallback((incoming: QueuedFile[]) => {
        if (!incoming.length) return
        setItems(prev => {
            const seen = new Set(prev.map(p => p.relativePath))
            const fresh = incoming.filter(q => !seen.has(q.relativePath))
            return [...prev, ...fresh]
        })
        setResult(null)
    }, [])

    /** Add loose files (from the file input or simple drop, no folder context). */
    const addPlainFiles = useCallback((incoming: FileList | File[]) => {
        const arr = Array.from(incoming).filter(f => ALLOWED_TYPES.includes(f.type))
        addQueued(arr.map(f => ({ file: f, relativePath: f.name })))
    }, [addQueued])

    /** Add files from a directory picker — preserves webkitRelativePath. */
    const addFolderFiles = useCallback((incoming: FileList) => {
        const arr = Array.from(incoming).filter(f => ALLOWED_TYPES.includes(f.type))
        const queued: QueuedFile[] = arr.map(f => {
            const rel = (f as any).webkitRelativePath || f.name
            return { file: f, relativePath: rel }
        })
        addQueued(queued)
    }, [addQueued])

    /** Drop handler — supports both files and dropped folders via webkitGetAsEntry. */
    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault()
        setDragging(false)
        const dt = e.dataTransfer
        const itemsList = dt.items
        // Use entry traversal when available (supports folders).
        if (itemsList && itemsList.length && (itemsList[0] as any).webkitGetAsEntry) {
            const collected: QueuedFile[] = []
            const entries: any[] = []
            for (let i = 0; i < itemsList.length; i++) {
                const entry = (itemsList[i] as any).webkitGetAsEntry()
                if (entry) entries.push(entry)
            }
            for (const entry of entries) {
                const sub = await readEntry(entry)
                collected.push(...sub)
            }
            addQueued(collected)
            return
        }
        // Fallback: plain files only.
        addPlainFiles(dt.files)
    }, [addQueued, addPlainFiles])

    const handleUpload = async () => {
        if (items.length === 0) { toast.warning('اختر صوراً أو مجلداً أولاً'); return }
        if (items.length > 200) { toast.warning('الحد الأقصى 200 صورة في الطلب الواحد'); return }
        setUploading(true)
        try {
            const fd = new FormData()
            // Append files and parallel relative_paths in matched order so
            // the server can zip them when at least one item came from a folder.
            const anyFromFolder = items.some(it => it.relativePath.includes('/'))
            for (const it of items) {
                fd.append('files', it.file)
                if (anyFromFolder) {
                    fd.append('relative_paths', it.relativePath)
                }
            }
            const res = await decorativeAPI.bulkImagesUpload(fd)
            setResult(res.data)
            if (res.data.matched_count > 0) {
                toast.success(`تم رفع ${res.data.matched_count} صورة بنجاح`)
            }
            if (res.data.unmatched_count > 0) {
                toast.warning(`${res.data.unmatched_count} صورة لم تجد منتجاً مطابقاً`)
            }
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'فشل رفع الصور'
            toast.error(msg)
        } finally {
            setUploading(false)
        }
    }

    // Group queued items by folder for display.
    const groupedItems = (() => {
        const groups: Record<string, QueuedFile[]> = {}
        const looseKey = '__loose__'
        for (const it of items) {
            const folder = it.relativePath.includes('/')
                ? it.relativePath.split('/')[0]
                : looseKey
            if (!groups[folder]) groups[folder] = []
            groups[folder].push(it)
        }
        return groups
    })()

    const overlay: React.CSSProperties = {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }
    const box: React.CSSProperties = {
        background: 'var(--color-surface)', border: '1px solid rgba(200,168,75,0.25)', borderRadius: 16,
        padding: 28, width: '100%', maxWidth: 740, maxHeight: '92vh', overflowY: 'auto',
        fontFamily: 'inherit', direction: 'rtl',
    }
    const sectionBox: React.CSSProperties = {
        background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)',
        borderRadius: 10, padding: '14px 16px', marginBottom: 14,
    }

    return createPortal(
        <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
            <div style={box}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(200,168,75,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Images size={20} color="#C8A84B" />
                        </div>
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>رفع صور جماعية</div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                                ارفع صوراً مفردة أو مجلداً كاملاً باسم رمز الصنف
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 4 }}>
                        <X size={18} />
                    </button>
                </div>

                {/* Naming convention */}
                <div style={sectionBox}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-gold)', marginBottom: 10 }}>الطرق المدعومة لتسمية الصور</div>

                    {/* Loose files convention */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 6 }}>أ — ملفات مفردة</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                        {[
                            { name: 'F19.006-2.jpg', desc: 'صورة للمنتج F19.006-2' },
                            { name: 'F19.006-2_1.jpg', desc: 'صورة إضافية لنفس المنتج' },
                            { name: 'C360.376.jpg', desc: 'صورة للمنتج C360.376' },
                            { name: 'C360.376_2.jpg', desc: 'صورة إضافية لنفس المنتج' },
                        ].map(ex => (
                            <div key={ex.name} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', background: 'rgba(200,168,75,0.06)', borderRadius: 8 }}>
                                <FileImage size={14} color="#C8A84B" style={{ marginTop: 1, flexShrink: 0 }} />
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>{ex.name}</div>
                                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>{ex.desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Folder convention */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 6 }}>ب — مجلدات (يمكن رفع أكثر من مجلد دفعة واحدة)</div>
                    <div style={{ padding: '10px 12px', background: 'rgba(200,168,75,0.06)', borderRadius: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <Folder size={14} color="#C8A84B" />
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>F19.006-2/</span>
                        </div>
                        <div style={{ paddingInlineStart: 22, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>
                            <div><span style={{ color: '#22c55e', fontWeight: 700 }}>1.jpg</span> <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'inherit', fontSize: 11 }}>← الصورة الرئيسية</span></div>
                            <div>2.jpg <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'inherit', fontSize: 11 }}>← صورة معرض</span></div>
                            <div>3.jpg <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'inherit', fontSize: 11 }}>← صورة معرض</span></div>
                            <div>4.jpg <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'inherit', fontSize: 11 }}>← صورة معرض</span></div>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 8, lineHeight: 1.6 }}>
                            اسم المجلد = رمز الصنف (يمكن أن يكون <span style={{ fontFamily: 'monospace' }}>F19.006-2</span> أو <span style={{ fontFamily: 'monospace' }}>F19.006-2.jpg</span>) — الصورة المرقّمة 1 تصبح الرئيسية تلقائياً وتحلّ محل أي صورة رئيسية سابقة.
                        </div>
                    </div>
                </div>

                {/* Drop zone + buttons */}
                <div
                    onDrop={handleDrop}
                    onDragOver={e => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    style={{
                        border: `2px dashed ${dragging ? '#C8A84B' : 'var(--color-border-strong)'}`,
                        borderRadius: 12, padding: '24px 20px', textAlign: 'center',
                        background: dragging ? 'rgba(200,168,75,0.06)' : 'var(--color-surface-raised)',
                        transition: 'all 0.2s', marginBottom: 14,
                    }}
                >
                    <Upload size={28} color={dragging ? '#C8A84B' : 'var(--color-text-secondary)'} style={{ margin: '0 auto 10px' }} />
                    <div style={{ fontSize: 14, fontWeight: 600, color: dragging ? 'var(--color-gold)' : 'var(--color-text-primary)', marginBottom: 4 }}>
                        اسحب الصور أو المجلدات هنا
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 14 }}>
                        JPG · PNG · WebP — حتى 10 ميجابايت للصورة، 200 صورة كحد أقصى
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)',
                                color: 'var(--color-text-primary)', cursor: 'pointer', fontFamily: 'inherit',
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                            }}
                        >
                            <FileImage size={14} /> اختيار صور
                        </button>
                        <button
                            type="button"
                            onClick={() => folderInputRef.current?.click()}
                            style={{
                                padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                background: 'rgba(200,168,75,0.10)', border: '1px solid rgba(200,168,75,0.45)',
                                color: 'var(--color-gold)', cursor: 'pointer', fontFamily: 'inherit',
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                            }}
                        >
                            <FolderUp size={14} /> اختيار مجلد(ات)
                        </button>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        style={{ display: 'none' }}
                        onChange={e => { if (e.target.files) addPlainFiles(e.target.files); e.target.value = '' }}
                    />
                    <input
                        ref={folderInputRef}
                        type="file"
                        multiple
                        // @ts-expect-error: webkitdirectory is non-standard but widely supported.
                        webkitdirectory="true"
                        directory=""
                        style={{ display: 'none' }}
                        onChange={e => { if (e.target.files) addFolderFiles(e.target.files); e.target.value = '' }}
                    />
                </div>

                {/* Selected files list (grouped) */}
                {items.length > 0 && !result && (
                    <div style={sectionBox}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                المحدد ({items.length} صورة في {Object.keys(groupedItems).length} {Object.keys(groupedItems).length === 1 ? 'مجموعة' : 'مجموعات'})
                            </div>
                            <button
                                onClick={() => setItems([])}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--color-text-secondary)' }}
                            >
                                مسح الكل
                            </button>
                        </div>
                        <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {Object.entries(groupedItems).map(([folder, list]) => {
                                const isLoose = folder === '__loose__'
                                return (
                                    <div key={folder} style={{ background: 'rgba(200,168,75,0.04)', border: '1px solid rgba(200,168,75,0.12)', borderRadius: 8, padding: '8px 10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {isLoose ? <FileImage size={13} color="#C8A84B" /> : <Folder size={13} color="#C8A84B" />}
                                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>
                                                    {isLoose ? 'ملفات مفردة' : folder}
                                                </span>
                                                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>({list.length})</span>
                                            </div>
                                            <button
                                                onClick={() => setItems(prev => prev.filter(p => !list.includes(p)))}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 0 }}
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingInlineStart: 18 }}>
                                            {list.map((q, i) => {
                                                const display = isLoose ? q.file.name : q.relativePath.split('/').slice(1).join('/')
                                                const isOne = !isLoose && /^1\.(jpe?g|png|webp)$/i.test(display)
                                                return (
                                                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11 }}>
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: isOne ? '#22c55e' : 'var(--color-text-primary)', fontFamily: 'monospace', fontWeight: isOne ? 700 : 400 }}>
                                                            <FileImage size={11} color={isOne ? '#22c55e' : '#C8A84B'} />
                                                            {display}
                                                            {isOne && <span style={{ fontFamily: 'inherit', fontSize: 10, color: '#22c55e' }}>(رئيسية)</span>}
                                                        </span>
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)' }}>
                                                            <span>{(q.file.size / 1024).toFixed(0)} KB</span>
                                                            <button
                                                                onClick={() => setItems(prev => prev.filter(p => p !== q))}
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 0 }}
                                                            >
                                                                <X size={11} />
                                                            </button>
                                                        </span>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Results */}
                {result && (
                    <div style={{ marginBottom: 14 }}>
                        {/* Summary cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
                            <div style={{ padding: '12px 14px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 10, textAlign: 'center' }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e' }}>{result.matched_count}</div>
                                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>تم الربط بنجاح</div>
                            </div>
                            <div style={{ padding: '12px 14px', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 10, textAlign: 'center' }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: '#eab308' }}>{result.unmatched_count}</div>
                                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>لم يُعثر على منتج</div>
                            </div>
                            <div style={{ padding: '12px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, textAlign: 'center' }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444' }}>{result.error_count}</div>
                                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>أخطاء</div>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                            {(['matched', 'unmatched', 'errors'] as const).map(tab => {
                                const labels = { matched: `نجح (${result.matched_count})`, unmatched: `غير مطابق (${result.unmatched_count})`, errors: `أخطاء (${result.error_count})` }
                                const active = activeTab === tab
                                return (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        style={{
                                            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: active ? 700 : 500,
                                            background: active ? 'rgba(200,168,75,0.15)' : 'var(--color-surface-raised)',
                                            border: active ? '1px solid rgba(200,168,75,0.5)' : '1px solid var(--color-border)',
                                            color: active ? 'var(--color-gold)' : 'var(--color-text-secondary)',
                                            cursor: 'pointer', fontFamily: 'inherit',
                                        }}
                                    >
                                        {labels[tab]}
                                    </button>
                                )
                            })}
                        </div>

                        <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {activeTab === 'matched' && result.matched.map((item, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 8 }}>
                                    <CheckCircle2 size={14} color="#22c55e" style={{ flexShrink: 0 }} />
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>{item.filename}</span>
                                            <span style={{ fontSize: 11, color: '#22c55e', background: 'rgba(34,197,94,0.12)', padding: '1px 6px', borderRadius: 4 }}>{item.sku}</span>
                                            {item.image_type === 'main' && (
                                                <span style={{ fontSize: 10, color: '#1a1206', background: '#C8A84B', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>رئيسية</span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>{item.product_name}</div>
                                    </div>
                                </div>
                            ))}

                            {activeTab === 'unmatched' && result.unmatched.map((item, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.15)', borderRadius: 8 }}>
                                    <AlertCircle size={14} color="#eab308" style={{ flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>{item.filename}</div>
                                        <div style={{ fontSize: 11, color: '#eab308', marginTop: 2 }}>الكود المُستخرج: <span style={{ fontFamily: 'monospace' }}>{item.parsed_sku}</span> — لم يُعثر على منتج</div>
                                    </div>
                                </div>
                            ))}

                            {activeTab === 'errors' && result.errors.map((item, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8 }}>
                                    <XCircle size={14} color="#ef4444" style={{ flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>{item.filename}</div>
                                        <div style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>{item.error}</div>
                                    </div>
                                </div>
                            ))}

                            {activeTab === 'matched' && result.matched.length === 0 && (
                                <div style={{ textAlign: 'center', padding: 20, color: 'var(--color-text-secondary)', fontSize: 13 }}>لا يوجد</div>
                            )}
                            {activeTab === 'unmatched' && result.unmatched.length === 0 && (
                                <div style={{ textAlign: 'center', padding: 20, color: '#22c55e', fontSize: 13 }}>جميع الصور وجدت منتجات مطابقة ✓</div>
                            )}
                            {activeTab === 'errors' && result.errors.length === 0 && (
                                <div style={{ textAlign: 'center', padding: 20, color: '#22c55e', fontSize: 13 }}>لا أخطاء ✓</div>
                            )}
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                    {result && (
                        <button
                            onClick={() => { setItems([]); setResult(null) }}
                            style={{
                                padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                                background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)',
                                color: 'var(--color-text-primary)', cursor: 'pointer', fontFamily: 'inherit',
                            }}
                        >
                            رفع صور جديدة
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        style={{
                            padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                            background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)',
                            color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'inherit',
                        }}
                    >
                        إغلاق
                    </button>
                    {!result && (
                        <button
                            onClick={handleUpload}
                            disabled={uploading || items.length === 0}
                            style={{
                                padding: '9px 22px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                                background: uploading || items.length === 0 ? 'rgba(200,168,75,0.3)' : 'var(--color-gold)',
                                border: 'none', color: uploading || items.length === 0 ? 'rgba(255,255,255,0.5)' : '#1a1206',
                                cursor: uploading || items.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                                display: 'flex', alignItems: 'center', gap: 8,
                            }}
                        >
                            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                            {uploading ? `جارٍ الرفع…` : `رفع ${items.length > 0 ? items.length + ' صورة' : 'الصور'}`}
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    )
}
