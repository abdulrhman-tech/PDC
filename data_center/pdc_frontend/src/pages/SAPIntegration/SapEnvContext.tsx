import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { SapEnv } from '@/api/client'

const STORAGE_KEY = 'sap_selected_env'
const DEFAULT_ENV: SapEnv = 'PRD'

function readStoredEnv(): SapEnv {
    if (typeof window === 'undefined') return DEFAULT_ENV
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw === 'DEV' || raw === 'PRD' ? raw : DEFAULT_ENV
}

interface SapEnvContextValue {
    env: SapEnv
    setEnv: (env: SapEnv) => void
}

const SapEnvContext = createContext<SapEnvContextValue | null>(null)

export function SapEnvProvider({ children }: { children: ReactNode }) {
    const [env, setEnvState] = useState<SapEnv>(() => readStoredEnv())

    useEffect(() => {
        try {
            window.localStorage.setItem(STORAGE_KEY, env)
        } catch {
            /* ignore quota / privacy errors */
        }
    }, [env])

    const setEnv = useCallback((next: SapEnv) => setEnvState(next), [])

    const value = useMemo<SapEnvContextValue>(() => ({ env, setEnv }), [env, setEnv])
    return <SapEnvContext.Provider value={value}>{children}</SapEnvContext.Provider>
}

export function useSapEnv(): SapEnvContextValue {
    const ctx = useContext(SapEnvContext)
    if (!ctx) {
        throw new Error('useSapEnv must be used inside <SapEnvProvider>')
    }
    return ctx
}
