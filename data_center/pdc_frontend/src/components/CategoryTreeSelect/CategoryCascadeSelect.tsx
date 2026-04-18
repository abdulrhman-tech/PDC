/**
 * CategoryCascadeSelect — hierarchical category picker using cascading dropdowns.
 * Shows up to 5 dropdowns, one per level. Selecting a level reveals the next
 * (only when children exist). Changing a higher level clears the lower ones.
 * Saves the deepest selected category id via onChange.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { categoriesAPI } from '@/api/client'
import type { CategoryFlat } from '@/types'

interface Props {
    value: number | string | null
    onChange: (id: number | null, cat?: CategoryFlat) => void
    placeholder?: string
    disabled?: boolean
    style?: React.CSSProperties
}

const LEVEL_LABELS: Record<number, string> = {
    1: 'التصنيف الرئيسي',
    2: 'التصنيف الفرعي',
    3: 'المستوى 3',
    4: 'المستوى 4',
    5: 'المستوى 5',
}

const LEVEL_COLORS: Record<number, string> = {
    1: '#C8A84B', 2: '#4A90D9', 3: '#50B478', 4: '#B464C8', 5: '#DC6450',
}

export function CategoryCascadeSelect({ value, onChange, placeholder, disabled, style }: Props) {
    const { data: cats = [] } = useQuery<CategoryFlat[]>({
        queryKey: ['categories-flat'],
        queryFn: () => categoriesAPI.flat().then(r => r.data),
        staleTime: 60_000,
    })

    const { byId, childrenOf, roots } = useMemo(() => {
        const byId = new Map<number, CategoryFlat>()
        const childrenOf = new Map<number | null, CategoryFlat[]>()
        for (const c of cats) {
            byId.set(c.id, c)
            const key = c.parent ?? null
            const arr = childrenOf.get(key) ?? []
            arr.push(c)
            childrenOf.set(key, arr)
        }
        for (const arr of childrenOf.values()) {
            arr.sort((a, b) => (a.sort_order - b.sort_order) || a.name_ar.localeCompare(b.name_ar))
        }
        const roots = (childrenOf.get(null) ?? []).filter(c => c.level === 1)
        return { byId, childrenOf, roots }
    }, [cats])

    const [path, setPath] = useState<number[]>([])

    useEffect(() => {
        if (cats.length === 0) return
        const numericValue = value != null && value !== '' ? Number(value) : null
        if (!numericValue) {
            if (path.length > 0) setPath([])
            return
        }
        if (path.length > 0 && path[path.length - 1] === numericValue) return
        const chain: number[] = []
        let node = byId.get(numericValue)
        const guard = new Set<number>()
        while (node && !guard.has(node.id)) {
            guard.add(node.id)
            chain.unshift(node.id)
            if (node.parent == null) break
            node = byId.get(node.parent)
        }
        setPath(chain)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, cats])

    const handleLevelChange = useCallback((levelIndex: number, idStr: string) => {
        const id = idStr ? Number(idStr) : null
        const next = path.slice(0, levelIndex)
        if (id != null) next.push(id)
        setPath(next)
        const deepest = next[next.length - 1] ?? null
        const cat = deepest != null ? byId.get(deepest) : undefined
        onChange(deepest, cat)
    }, [path, byId, onChange])

    const rows: { options: CategoryFlat[]; selectedId: number | null; level: number }[] = []
    rows.push({ options: roots, selectedId: path[0] ?? null, level: 1 })
    for (let i = 0; i < path.length; i++) {
        const parentId = path[i]
        const children = childrenOf.get(parentId) ?? []
        if (children.length === 0) break
        const nextLevel = (byId.get(parentId)?.level ?? i + 1) + 1
        if (nextLevel > 5) break
        rows.push({ options: children, selectedId: path[i + 1] ?? null, level: nextLevel })
    }

    const breadcrumb = path
        .map(id => byId.get(id))
        .filter((c): c is CategoryFlat => !!c)
    const deepestCat = breadcrumb[breadcrumb.length - 1]
    const lastRow = rows[rows.length - 1]
    const showNoChildrenHint = breadcrumb.length > 0 && (!lastRow || lastRow.selectedId !== null) &&
        (childrenOf.get(deepestCat?.id ?? -1) ?? []).length === 0 && (deepestCat?.level ?? 0) < 5

    const selectStyle: React.CSSProperties = {
        width: '100%', padding: '9px 12px',
        border: '1px solid var(--color-border-strong)', borderRadius: 8,
        background: 'var(--color-surface-raised)',
        color: 'var(--color-text-primary)',
        fontSize: 13, fontFamily: 'inherit', textAlign: 'right',
        boxSizing: 'border-box', outline: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
            {placeholder && cats.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>جاري تحميل التصنيفات...</div>
            )}
            <div className="cat-cascade-grid">
                {rows.map((row, idx) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                        <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                                width: 6, height: 6, borderRadius: '50%',
                                background: LEVEL_COLORS[row.level] ?? '#C8A84B',
                            }} />
                            {LEVEL_LABELS[row.level] ?? `المستوى ${row.level}`}
                        </label>
                        <select
                            disabled={disabled || row.options.length === 0}
                            value={row.selectedId ?? ''}
                            onChange={e => handleLevelChange(idx, e.target.value)}
                            style={selectStyle}
                        >
                            <option value="">— اختر —</option>
                            {row.options.map(o => (
                                <option key={o.id} value={o.id}>
                                    {o.name_ar || o.name_en || o.code}
                                    {o.code ? ` (${o.code})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                ))}
            </div>

            {showNoChildrenHint && (
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                    — لا توجد تصنيفات فرعية —
                </div>
            )}

            {breadcrumb.length > 0 && deepestCat && (
                <div style={{
                    fontSize: 12, color: 'var(--color-text-secondary)',
                    padding: '6px 10px', background: 'var(--color-surface-raised)',
                    borderRadius: 6, lineHeight: 1.5,
                }}>
                    <span style={{ color: 'var(--color-text-muted, var(--color-text-secondary))' }}>المسار: </span>
                    {breadcrumb.map((c, i) => (
                        <span key={c.id}>
                            {i > 0 && <span style={{ margin: '0 4px', opacity: 0.5 }}>{'>'}</span>}
                            <span style={{ color: 'var(--color-text-primary)' }}>{c.name_ar || c.name_en || c.code}</span>
                        </span>
                    ))}
                    <span style={{ marginRight: 6, fontFamily: 'var(--font-latin)', direction: 'ltr', display: 'inline-block', opacity: 0.7 }}>
                        ({deepestCat.code})
                    </span>
                </div>
            )}
        </div>
    )
}

export default CategoryCascadeSelect
