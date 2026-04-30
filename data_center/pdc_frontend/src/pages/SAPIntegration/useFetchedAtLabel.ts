import { useEffect, useState } from 'react'

function formatRelative(fetchedAt: Date, now: Date): string {
    const diffSec = Math.max(0, Math.round((now.getTime() - fetchedAt.getTime()) / 1000))
    if (diffSec < 10) return 'الآن'
    if (diffSec < 60) return `منذ ${diffSec} ث`
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `منذ ${diffMin} د`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `منذ ${diffHr} س`
    const diffDay = Math.floor(diffHr / 24)
    return `منذ ${diffDay} ي`
}

function formatAbsolute(fetchedAt: Date): string {
    return fetchedAt.toLocaleTimeString('ar-SA', {
        hour: '2-digit',
        minute: '2-digit',
    })
}

function formatFullAbsolute(fetchedAt: Date): string {
    return fetchedAt.toLocaleString('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    })
}

/**
 * Returns an Arabic label describing when `fetchedAt` happened, refreshing
 * itself once a minute so phrases like "منذ 5 د" stay current without a refetch.
 *
 * The returned object includes:
 *  - `relative`: short relative phrase (e.g. "منذ 5 د")
 *  - `absolute`: short clock time (e.g. "12:43 م")
 *  - `tooltip`: full date+time for hover
 */
export function useFetchedAtLabel(fetchedAt: Date | null) {
    const [now, setNow] = useState(() => new Date())

    useEffect(() => {
        if (!fetchedAt) return
        const id = window.setInterval(() => setNow(new Date()), 30_000)
        return () => window.clearInterval(id)
    }, [fetchedAt])

    if (!fetchedAt) {
        return { relative: '', absolute: '', tooltip: '' }
    }

    return {
        relative: formatRelative(fetchedAt, now),
        absolute: formatAbsolute(fetchedAt),
        tooltip: formatFullAbsolute(fetchedAt),
    }
}
