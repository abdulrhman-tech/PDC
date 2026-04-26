/**
 * Smart bilingual name picker.
 *
 * Some categories in the database have their language fields swapped
 * (e.g. name_ar holds the SAP code "DC0000000" while name_en holds the
 * Arabic word "ديكور"). A naive `isAr ? name_ar : name_en` then shows
 * Arabic text in the English UI and vice-versa.
 *
 * These helpers pick whichever of the two fields actually contains text
 * in the requested script, so the UI stays correct even when the
 * underlying data is messy.
 */

const ARABIC_RX = /[\u0600-\u06FF]/
const LATIN_RX = /[A-Za-z]/
// SAP-style codes that some categories carry in their name fields, e.g.
// "DC0000000", "CR1200000". They have Latin letters but are not a real
// translation, so the picker treats them as "no useful English content".
const SAP_CODE_RX = /^[A-Za-z]{1,5}\d{2,}[A-Za-z0-9]*$/

const isSapCode = (s: string): boolean => SAP_CODE_RX.test(s.trim())

export const hasArabicLetters = (s?: string | null): boolean =>
    !!s && ARABIC_RX.test(s)

export const hasLatinLetters = (s?: string | null): boolean =>
    !!s && LATIN_RX.test(s)

const hasMeaningfulLatin = (s: string): boolean =>
    LATIN_RX.test(s) && !isSapCode(s)

/**
 * Pick the best display value between an Arabic field and an English field,
 * given the active language. Falls back to the other field if the preferred
 * one doesn't actually contain letters in the expected script, and skips
 * SAP-style codes so they don't masquerade as an English translation.
 */
export function pickBilingual(
    nameAr: string | null | undefined,
    nameEn: string | null | undefined,
    isAr: boolean,
): string {
    const ar = (nameAr ?? '').toString()
    const en = (nameEn ?? '').toString()

    if (isAr) {
        if (hasArabicLetters(ar)) return ar
        if (hasArabicLetters(en)) return en
        // No Arabic anywhere — show whichever side has a real word, not a code.
        if (hasMeaningfulLatin(en)) return en
        if (hasMeaningfulLatin(ar)) return ar
        return ar || en
    }
    if (hasMeaningfulLatin(en)) return en
    if (hasMeaningfulLatin(ar)) return ar
    // No real English available — show the Arabic word so the user still
    // sees something meaningful instead of a raw SAP code.
    if (hasArabicLetters(en)) return en
    if (hasArabicLetters(ar)) return ar
    return en || ar
}
