import { AxiosError } from 'axios'

export interface ApiErrorBody {
    detail?: string
    [field: string]: unknown
}

export function getApiErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof AxiosError) {
        const data = err.response?.data as ApiErrorBody | undefined
        if (data) {
            if (typeof data.detail === 'string' && data.detail) return data.detail
            for (const v of Object.values(data)) {
                if (typeof v === 'string' && v) return v
                if (Array.isArray(v) && typeof v[0] === 'string' && v[0]) return v[0]
            }
        }
        if (err.message) return err.message
    }
    if (err instanceof Error && err.message) return err.message
    return fallback
}
