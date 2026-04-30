/**
 * CategoryTreeSelect — hierarchical category picker
 * Shows a dropdown with the full tree (indented) for selecting any node.
 */
import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, X, Search } from 'lucide-react'
import { categoriesAPI } from '@/api/client'
import type { CategoryFlat } from '@/types'

interface Props {
    value: number | string | null
    onChange: (id: number | null, cat?: CategoryFlat) => void
    placeholder?: string
    disabled?: boolean
    style?: React.CSSProperties
}

const LEVEL_COLORS: Record<number, string> = {
    1: '#C8A84B', 2: '#4A90D9', 3: '#50B478', 4: '#B464C8', 5: '#DC6450',
}

export function CategoryTreeSelect({ value, onChange, placeholder = 'اختر التصنيف...', disabled, style }: Props) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const ref = useRef<HTMLDivElement>(null)

    const { data: cats = [] } = useQuery<CategoryFlat[]>({
        queryKey: ['categories-flat'],
        queryFn: () => categoriesAPI.flat().then(r => r.data),
        staleTime: 60_000,
    })

    const selected = cats.find(c => c.id === Number(value))

    const VISIBLE_LIMIT = 250
    const filteredAll = search.trim()
        ? cats.filter(c => {
            const q = search.toLowerCase()
            return (
                c.name_ar.includes(search) ||
                c.name_en.toLowerCase().includes(q) ||
                c.code.toLowerCase().includes(q) ||
                (c.path_ar || '').includes(search) ||
                (c.path_en || '').toLowerCase().includes(q)
            )
        })
        : cats
    let filtered = filteredAll.slice(0, VISIBLE_LIMIT)
    // Make sure the currently selected category is always discoverable in the
    // dropdown even when it would otherwise fall outside the visible slice.
    if (selected && !filtered.some(c => c.id === selected.id) && filteredAll.some(c => c.id === selected.id)) {
        filtered = [selected, ...filtered.slice(0, VISIBLE_LIMIT - 1)]
    }
    const hiddenCount = Math.max(0, filteredAll.length - filtered.length)

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    return (
        <div ref={ref} style={{ position: 'relative', ...style }}>
            {/* Trigger */}
            <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setOpen(o => !o)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', padding: '9px 12px',
                    border: `1px solid ${open ? 'var(--color-gold)' : 'var(--color-border-strong)'}`,
                    borderRadius: 8, background: 'var(--color-surface-raised)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.6 : 1,
                    fontSize: 13, fontFamily: 'inherit', textAlign: 'right',
                    boxSizing: 'border-box',
                }}>
                {selected ? (
                    <span style={{ flex: 1, color: 'var(--color-text-primary)', textAlign: 'right' }}>
                        <span style={{ fontSize: 10, color: LEVEL_COLORS[selected.level] ?? '#C8A84B', fontWeight: 700, background: 'rgba(200,168,75,0.08)', padding: '1px 5px', borderRadius: 3, marginLeft: 6 }}>
                            M{selected.level}
                        </span>
                        {selected.name_ar}
                        {selected.name_en && (
                            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginRight: 6, fontFamily: 'var(--font-latin)', direction: 'ltr', display: 'inline' }}>
                                {selected.name_en}
                            </span>
                        )}
                    </span>
                ) : (
                    <span style={{ flex: 1, color: 'var(--color-text-secondary)', textAlign: 'right' }}>{placeholder}</span>
                )}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {value && (
                        <span
                            role="button"
                            onClick={e => { e.stopPropagation(); onChange(null) }}
                            style={{ cursor: 'pointer', color: 'var(--color-text-secondary)', display: 'flex' }}>
                            <X size={14} />
                        </span>
                    )}
                    <ChevronDown size={14} color="var(--color-text-secondary)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                </div>
            </button>

            {/* Dropdown */}
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', right: 0, left: 0,
                    background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)',
                    borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                    zIndex: 1000, maxHeight: 320, display: 'flex', flexDirection: 'column',
                }}>
                    {/* Search */}
                    <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={13} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
                            <input
                                autoFocus
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="ابحث..."
                                style={{
                                    width: '100%', padding: '7px 30px 7px 10px',
                                    border: '1px solid var(--color-border)', borderRadius: 6,
                                    background: 'var(--color-surface-raised)',
                                    fontSize: 12, fontFamily: 'inherit', outline: 'none',
                                    color: 'var(--color-text-primary)', boxSizing: 'border-box',
                                }} />
                        </div>
                    </div>

                    {/* Options */}
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {filtered.length === 0 && (
                            <div style={{ padding: '16px', textAlign: 'center', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                                لا توجد نتائج
                            </div>
                        )}
                        {!search.trim() && cats.length > VISIBLE_LIMIT && (
                            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--color-text-muted)', borderBottom: '1px dashed var(--color-border)', background: 'rgba(200,168,75,0.04)' }}>
                                يعرض {VISIBLE_LIMIT} من أصل {cats.length} تصنيف — اكتب للبحث في الكل
                            </div>
                        )}
                        {filtered.map(cat => {
                            const isSelected = cat.id === Number(value)
                            const lColor = LEVEL_COLORS[cat.level] ?? '#C8A84B'
                            return (
                                <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => { onChange(cat.id, cat); setOpen(false); setSearch('') }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        width: '100%', padding: '8px 12px',
                                        paddingRight: `${12 + (cat.level - 1) * 16}px`,
                                        border: 'none', background: isSelected ? 'rgba(200,168,75,0.1)' : 'transparent',
                                        cursor: 'pointer', textAlign: 'right', fontSize: 13, fontFamily: 'inherit',
                                        color: 'var(--color-text-primary)',
                                    }}
                                    onMouseEnter={e => !isSelected && ((e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)')}
                                    onMouseLeave={e => !isSelected && ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
                                    {/* Level dot */}
                                    <span style={{
                                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                                        background: lColor, opacity: cat.is_active ? 1 : 0.4,
                                    }} />
                                    {/* Level badge */}
                                    <span style={{
                                        fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, flexShrink: 0,
                                        color: lColor, background: `${lColor}18`,
                                    }}>M{cat.level}</span>
                                    {/* Name + parent path for disambiguation */}
                                    <span style={{ flex: 1, opacity: cat.is_active ? 1 : 0.5, minWidth: 0 }}>
                                        <div style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {cat.name_ar}
                                            {cat.name_en && cat.name_en !== cat.name_ar && (
                                                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginRight: 6, fontFamily: 'var(--font-latin)', direction: 'ltr', display: 'inline' }}>
                                                    {cat.name_en}
                                                </span>
                                            )}
                                        </div>
                                        {cat.level > 1 && cat.path_ar && cat.path_ar !== cat.name_ar && (
                                            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {cat.path_ar.replace(/ \/ [^/]+$/, '')}
                                            </div>
                                        )}
                                    </span>
                                    {/* Not active */}
                                    {!cat.is_active && (
                                        <span style={{ fontSize: 9, color: '#e07070', border: '1px solid rgba(224,112,112,0.3)', padding: '0 4px', borderRadius: 3 }}>موقوف</span>
                                    )}
                                </button>
                            )
                        })}
                        {hiddenCount > 0 && (
                            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center', borderTop: '1px dashed var(--color-border)' }}>
                                + {hiddenCount} نتيجة إضافية — حدّد البحث أكثر
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default CategoryTreeSelect
