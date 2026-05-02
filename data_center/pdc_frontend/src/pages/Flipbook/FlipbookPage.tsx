import {
    useState,
    useRef,
    useCallback,
    useEffect,
    forwardRef,
    useMemo,
} from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import HTMLFlipBook from "react-pageflip";
import {
    ChevronLeft,
    ChevronRight,
    ChevronFirst,
    ChevronLast,
    Maximize2,
    Minimize2,
    Sun,
    Moon,
    ChevronDown,
    X,
    Home,
    Users,
    BookOpen,
    Phone,
    Mail,
    MapPin,
    Globe,
    Package,
    Share2,
    Languages,
    Star,
    TrendingUp,
    Shield,
    Warehouse,
    Award,
    Heart,
    Zap,
    Target,
    Volume2,
    VolumeX,
} from "lucide-react";
import { productsAPI } from "@/api/client";
import { useThemeStore } from "@/store/themeStore";
import { pickBilingual } from "@/i18n/bilingual";
import type { Product } from "@/types";
import { playPageFlipSound } from "./pageFlipSound";

const SOUND_PREF_KEY = "flipbook:soundEnabled";

/* Minimal category shape returned by /products/flipbook-manifest/.
   The flipbook page only needs id/name/slug/icon for navigation and
   chapter rendering, so we define a dedicated lightweight type rather
   than coercing into the heavier global `Category` (which carries
   is_active, subcategories, etc. that the manifest endpoint
   intentionally omits). */
interface FlipbookManifestCategory {
    id: number;
    name_ar: string;
    name_en: string;
    slug: string | null;
    icon: string;
}

const PRODUCTS_PER_PAGE = 4;

const COVER_BG = "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1400&q=85";

const CATEGORY_BACKGROUNDS: Record<string, string> = {
    default:    "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&q=80",
    cement:     "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=80",
    steel:      "https://images.unsplash.com/photo-1567789884554-0b844b597180?w=1200&q=80",
    wood:       "https://images.unsplash.com/photo-1558618047-f4b511cfe8da?w=1200&q=80",
    paint:      "https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=1200&q=80",
    tiles:      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80",
    electrical: "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=1200&q=80",
    plumbing:   "https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=1200&q=80",
    tools:      "https://images.unsplash.com/photo-1581147036324-c47a03a81d48?w=1200&q=80",
    insulation: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&q=80",
};

function getCategoryBackground(categoryName: string): string {
    const name = categoryName.toLowerCase();
    if (name.includes("اسمنت") || name.includes("cement") || name.includes("خرسان")) return CATEGORY_BACKGROUNDS.cement;
    if (name.includes("حديد") || name.includes("steel") || name.includes("معدن")) return CATEGORY_BACKGROUNDS.steel;
    if (name.includes("خشب") || name.includes("wood") || name.includes("ابواب")) return CATEGORY_BACKGROUNDS.wood;
    if (name.includes("دهان") || name.includes("paint") || name.includes("طلاء")) return CATEGORY_BACKGROUNDS.paint;
    if (name.includes("بلاط") || name.includes("سيراميك") || name.includes("tile") || name.includes("رخام")) return CATEGORY_BACKGROUNDS.tiles;
    if (name.includes("كهرب") || name.includes("electric")) return CATEGORY_BACKGROUNDS.electrical;
    if (name.includes("سباكة") || name.includes("صحي") || name.includes("plumb")) return CATEGORY_BACKGROUNDS.plumbing;
    if (name.includes("ادوات") || name.includes("عدد") || name.includes("tool")) return CATEGORY_BACKGROUNDS.tools;
    if (name.includes("عزل") || name.includes("insul")) return CATEGORY_BACKGROUNDS.insulation;
    return CATEGORY_BACKGROUNDS.default;
}

interface FlipbookPageEntry {
    type: "cover-front" | "cover-back" | "about-us-1" | "about-us-2"
        | "table-of-contents" | "category-chapter" | "products" | "empty";
    category?: FlipbookManifestCategory;
    chapterNumber?: number;
    productCount?: number;          // chapter divider: total products in this chapter
    categoryRef?: FlipbookManifestCategory;
    /* For "products" entries we don't carry actual Product objects on the
       page entry itself; we carry the absolute slice into the streamed
       loadedProducts array. The page renderer then either pulls real
       cards from that slice or shows skeleton placeholders if the slice
       is not yet loaded. This keeps the children array length and
       identity stable across streaming updates so react-pageflip
       preserves its current page index. */
    productSliceStart?: number;
    productSliceEnd?: number;
}

interface FlipBookRef {
    pageFlip: () => { flip: (n: number) => void; flipNext: () => void; flipPrev: () => void };
}

type Lang = "ar" | "en";

const T = {
    ar: {
        catalog: "الكتالوج",
        interactiveCatalog: "كتالوج تفاعلي",
        jumpTo: "انتقل إلى",
        cover: "الغلاف",
        aboutUs: "من نحن",
        toc: "فهرس المحتويات",
        backCover: "الغلاف الخلفي",
        prevPage: "الصفحة السابقة",
        nextPage: "الصفحة التالية",
        firstPage: "الصفحة الأولى",
        lastPage: "الصفحة الأخيرة",
        readingProgress: "تقدم القراءة",
        loading: "جارٍ تحميل الكتالوج…",
        noProducts: "لا توجد منتجات",
    },
    en: {
        catalog: "Catalog",
        interactiveCatalog: "Interactive Catalog",
        jumpTo: "Jump to",
        cover: "Cover",
        aboutUs: "About Us",
        toc: "Table of Contents",
        backCover: "Back Cover",
        prevPage: "Previous Page",
        nextPage: "Next Page",
        firstPage: "First Page",
        lastPage: "Last Page",
        readingProgress: "Reading Progress",
        loading: "Loading catalog…",
        noProducts: "No products",
    },
};

const PAPER_TEXTURE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E")`;

const PAPER_BG_LIGHT = "#FAF8F3";
const PAPER_BG_DARK = "var(--color-surface)";

const globalStyles = `
@keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
@keyframes fadeInUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
@keyframes spin { to { transform:rotate(360deg) } }
.flipbook-page { overflow:hidden !important; }
.flip-card { transition: transform 0.22s ease, box-shadow 0.22s ease; }
.flip-card:hover { transform:translateY(-3px); box-shadow:0 6px 18px rgba(0,0,0,0.16) !important; }
.flip-nav-btn { transition: all 0.18s ease; }
.flip-nav-btn:hover { transform:scale(1.08); background:rgba(200,168,75,0.12) !important; }
.flip-nav-btn:active { transform:scale(0.94); }
.toc-row { transition: background 0.15s ease; }
.toc-row:hover { background:rgba(200,168,75,0.06) !important; }
.modal-overlay {
    position:fixed; inset:0; background:rgba(0,0,0,0.82);
    z-index:1000; display:flex; align-items:center; justify-content:center;
    animation:fadeIn 0.2s ease; padding:16px;
}
.modal-content {
    background:var(--color-surface); border-radius:12px;
    max-width:680px; width:100%; max-height:90vh; overflow-y:auto;
    box-shadow:0 24px 80px rgba(0,0,0,0.5); animation:fadeInUp 0.25s ease;
    border:1px solid var(--color-border);
}
`;

const Page = forwardRef<HTMLDivElement, { children: React.ReactNode; style?: React.CSSProperties }>(
    ({ children, style }, ref) => (
        <div ref={ref} className="flipbook-page" style={{
            width: "100%", height: "100%", overflow: "hidden",
            borderRadius: 3, ...style,
        }}>{children}</div>
    ),
);
Page.displayName = "Page";

const paperPage = (isDark: boolean): React.CSSProperties => ({
    width: "100%", height: "100%",
    background: isDark ? PAPER_BG_DARK : PAPER_BG_LIGHT,
    backgroundImage: PAPER_TEXTURE,
    fontFamily: "'29LT Bukra', 'Tajawal', sans-serif",
    boxSizing: "border-box" as const,
    position: "relative" as const,
    overflow: "hidden",
    boxShadow: "inset 2px 0 8px rgba(0,0,0,0.06), inset -1px 0 4px rgba(0,0,0,0.03)",
});

const goldLine = (w: number | string = 48, h = 2) => (
    <div style={{ width: w, height: h, background: "#C8A84B", margin: "0 auto", borderRadius: 1 }} />
);

const cornerBrackets = (opacity = 0.45, size = 28, inset = 16) =>
    [{ top: inset, right: inset }, { top: inset, left: inset }, { bottom: inset, right: inset }, { bottom: inset, left: inset }].map((pos, i) => (
        <div key={i} style={{
            position: "absolute" as const, ...pos,
            width: size, height: size,
            borderTop: i < 2 ? `1.5px solid rgba(200,168,75,${opacity})` : "none",
            borderBottom: i >= 2 ? `1.5px solid rgba(200,168,75,${opacity})` : "none",
            borderRight: (i === 0 || i === 2) ? `1.5px solid rgba(200,168,75,${opacity})` : "none",
            borderLeft: (i === 1 || i === 3) ? `1.5px solid rgba(200,168,75,${opacity})` : "none",
        }} />
    ));

// ══════════════════════════════════════════════════════════════════════
// PAGE COMPONENTS
// ══════════════════════════════════════════════════════════════════════

function FrontCoverPage({ lang }: { lang: Lang }) {
    const isAr = lang === "ar";
    return (
        <div style={{
            width: "100%", height: "100%",
            position: "relative", overflow: "hidden",
            fontFamily: "'29LT Bukra', 'Tajawal', sans-serif",
        }}>
            {/* Full-bleed background */}
            <div style={{
                position: "absolute", inset: 0,
                backgroundImage: `url(${COVER_BG})`,
                backgroundSize: "cover", backgroundPosition: "center",
            }} />
            {/* Dark gradient overlay */}
            <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(160deg, rgba(10,22,40,0.92) 0%, rgba(11,26,46,0.85) 50%, rgba(10,22,40,0.92) 100%)",
            }} />
            {/* Vignette */}
            <div style={{
                position: "absolute", inset: 0,
                background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.35) 100%)",
            }} />

            {/* Gold frame border */}
            <div style={{
                position: "absolute", inset: 18,
                border: "2px solid rgba(200,168,75,0.45)",
                borderRadius: 2, pointerEvents: "none",
            }} />
            <div style={{
                position: "absolute", inset: 22,
                border: "0.5px solid rgba(200,168,75,0.15)",
                borderRadius: 1, pointerEvents: "none",
            }} />

            {/* Corner brackets */}
            {cornerBrackets(0.6, 32, 24)}

            {/* Content */}
            <div style={{
                position: "relative", zIndex: 2,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                height: "100%", padding: "32px 28px",
                boxSizing: "border-box",
            }}>
                {/* Logo — large and prominent */}
                <div style={{ marginBottom: 16, animation: "fadeInUp 0.6s ease 0.1s both" }}>
                    <img src="/logo.png" alt="Bayt Alebaa" style={{
                        width: 100, height: 100, objectFit: "contain",
                        filter: "drop-shadow(0 4px 20px rgba(200,168,75,0.35))",
                    }} />
                </div>

                {/* Gold ornamental line */}
                <div style={{
                    width: 70, height: 1,
                    background: "linear-gradient(90deg, transparent, #C8A84B, transparent)",
                    marginBottom: 14, animation: "fadeInUp 0.6s ease 0.2s both",
                }} />

                {/* Company name */}
                <h1 style={{
                    fontSize: 28, fontWeight: 800, color: "#F5F0E8",
                    margin: 0, marginBottom: 6, textAlign: "center",
                    lineHeight: 1.3, letterSpacing: 1,
                    animation: "fadeInUp 0.6s ease 0.3s both",
                    textShadow: "0 2px 16px rgba(0,0,0,0.5)",
                }}>
                    {isAr ? "بيت الإباء" : "Bayt Alebaa"}
                </h1>

                {/* Subtitle */}
                <p style={{
                    fontSize: 12, color: "#C8A84B", margin: "0 0 2px",
                    textAlign: "center", letterSpacing: 2.5, textTransform: "uppercase",
                    animation: "fadeInUp 0.6s ease 0.35s both",
                    fontWeight: 500,
                }}>
                    {isAr ? "للمواد البنائية والإنشائية" : "Building Materials & Construction Supplies"}
                </p>

                {/* Gold divider */}
                <div style={{
                    width: 90, height: 1, margin: "18px auto",
                    background: "linear-gradient(90deg, transparent, #C8A84B, transparent)",
                    animation: "fadeInUp 0.6s ease 0.4s both",
                }} />

                {/* Edition year */}
                <p style={{
                    fontSize: 11, color: "rgba(245,240,232,0.55)",
                    margin: 0, textAlign: "center", letterSpacing: 2.5,
                    animation: "fadeInUp 0.6s ease 0.5s both",
                    fontWeight: 500,
                }}>
                    {isAr
                        ? "كتالوج المنتجات ٢٠٢٥"
                        : "Product Catalog 2025"}
                </p>
                <p style={{
                    fontSize: 9, color: "rgba(245,240,232,0.3)",
                    margin: "3px 0 0", textAlign: "center", letterSpacing: 1.5,
                    animation: "fadeInUp 0.6s ease 0.55s both",
                }}>
                    {isAr ? "Product Catalog 2025" : "كتالوج المنتجات ٢٠٢٥"}
                </p>
            </div>

            {/* Bottom strip */}
            <div style={{
                position: "absolute", bottom: 26, left: 30, right: 30, zIndex: 2,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            }}>
                <div style={{ flex: 1, height: 0.5, background: "rgba(200,168,75,0.25)" }} />
                <span style={{ fontSize: 8, color: "rgba(200,168,75,0.45)", letterSpacing: 3, textTransform: "uppercase" }}>
                    {isAr ? "مركز بيانات المنتجات" : "Product Data Center"}
                </span>
                <div style={{ flex: 1, height: 0.5, background: "rgba(200,168,75,0.25)" }} />
            </div>
        </div>
    );
}

function AboutUs1Page({ lang, isDark }: { lang: Lang; isDark: boolean }) {
    const isAr = lang === "ar";
    const dir = isAr ? "rtl" : "ltr";
    return (
        <div style={{ ...paperPage(isDark), direction: dir, display: "flex", flexDirection: "column", padding: "28px 26px 22px" }}>
            {/* Double-line border */}
            <div style={{ position: "absolute", inset: 10, border: "1px solid rgba(200,168,75,0.18)", borderRadius: 1, pointerEvents: "none" }} />
            <div style={{ position: "absolute", inset: 14, border: "0.5px solid rgba(200,168,75,0.08)", borderRadius: 1, pointerEvents: "none" }} />

            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: 14 }}>
                <p style={{ fontSize: 9, color: "#C8A84B", margin: "0 0 5px", letterSpacing: 3.5, textTransform: "uppercase", fontWeight: 500 }}>
                    {isAr ? "التعريف بالشركة" : "Company Profile"}
                </p>
                <h2 style={{ fontSize: 21, fontWeight: 800, margin: "0 0 8px", color: isDark ? "#F5F0E8" : "#1A1A2E", letterSpacing: -0.3 }}>
                    {isAr ? "من نحن" : "About Us"}
                </h2>
                {goldLine(48, 2)}
            </div>

            {/* Body text — print-quality */}
            <p style={{
                fontSize: 12.5, lineHeight: 1.9, color: isDark ? "#9CA3AF" : "#6B7280",
                margin: "0 0 12px", textAlign: isAr ? "right" : "left",
            }}>
                {isAr
                    ? "بيت الإباء من الشركات الرائدة في توريد مواد البناء والإنشاء في المملكة العربية السعودية. تأسست بهدف تلبية احتياجات قطاع البناء بأعلى معايير الجودة والموثوقية، وتخدم اليوم المقاولين والمطورين والمشاريع الكبرى في مختلف مناطق المملكة."
                    : "Bayt Alebaa is a leading building materials supplier in Saudi Arabia, established to serve the construction sector with the highest quality standards. We serve contractors, developers, and major projects across the Kingdom."}
            </p>
            <p style={{
                fontSize: 12, lineHeight: 1.85, color: isDark ? "#9CA3AF" : "#6B7280",
                margin: "0 0 16px", textAlign: isAr ? "right" : "left",
            }}>
                {isAr
                    ? "نوفر تشكيلة واسعة من المنتجات تشمل السيراميك والرخام والأثاث والدهانات والإنارة والأدوات الصحية، مع شبكة مستودعات تغطي المدن الرئيسية في المملكة لضمان التوفر الدائم وسرعة التسليم."
                    : "We offer a wide range of products including ceramics, marble, furniture, paints, lighting, and plumbing, with a warehouse network covering major Saudi cities ensuring constant availability and swift delivery."}
            </p>

            {/* Stats row — large numbers with dividers */}
            <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                marginTop: "auto", paddingTop: 10,
                borderTop: "1px solid rgba(200,168,75,0.18)",
            }}>
                {[
                    { num: isAr ? "٢٠+" : "20+", label: isAr ? "عاماً خبرة" : "Years Experience" },
                    { num: isAr ? "٥٠٠٠+" : "5000+", label: isAr ? "منتج" : "Products" },
                    { num: isAr ? "٥٠٠+" : "500+", label: isAr ? "عميل نشط" : "Active Clients" },
                    { num: isAr ? "١٠+" : "10+", label: isAr ? "مستودعات" : "Warehouses" },
                ].map((s, i, arr) => (
                    <div key={i} style={{ display: "flex", alignItems: "center" }}>
                        <div style={{ textAlign: "center", padding: "6px 10px" }}>
                            <div style={{ fontSize: 22, fontWeight: 800, color: "#C8A84B", lineHeight: 1 }}>{s.num}</div>
                            <div style={{ fontSize: 8.5, color: isDark ? "#6B7280" : "#9CA3AF", marginTop: 3, letterSpacing: 0.3 }}>{s.label}</div>
                        </div>
                        {i < arr.length - 1 && (
                            <div style={{ width: 1, height: 28, background: "rgba(200,168,75,0.2)", margin: "0 4px" }} />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

function AboutUs2Page({ lang, isDark }: { lang: Lang; isDark: boolean }) {
    const isAr = lang === "ar";
    const dir = isAr ? "rtl" : "ltr";
    const textColor = isDark ? "#9CA3AF" : "#6B7280";
    const headColor = isDark ? "#F5F0E8" : "#1A1A2E";

    return (
        <div style={{ ...paperPage(isDark), direction: dir, display: "flex", flexDirection: "column", padding: "28px 26px 22px" }}>
            <div style={{ position: "absolute", inset: 10, border: "1px solid rgba(200,168,75,0.18)", borderRadius: 1, pointerEvents: "none" }} />

            {/* Vision */}
            <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <Star size={12} color="#C8A84B" fill="#C8A84B" />
                    <span style={{ fontSize: 9.5, letterSpacing: 2.5, textTransform: "uppercase", color: "#C8A84B", fontWeight: 600 }}>
                        {isAr ? "رؤيتنا" : "Our Vision"}
                    </span>
                </div>
                <p style={{ fontSize: 12, lineHeight: 1.85, color: textColor, margin: 0 }}>
                    {isAr
                        ? "أن نكون الشريك الأول والخيار الأمثل في توريد مواد البناء بالمملكة العربية السعودية."
                        : "To be the first choice and optimal partner in building materials supply across Saudi Arabia."}
                </p>
            </div>

            <div style={{ height: 1, background: "rgba(200,168,75,0.15)", marginBottom: 12 }} />

            {/* Mission */}
            <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <Target size={12} color="#C8A84B" />
                    <span style={{ fontSize: 9.5, letterSpacing: 2.5, textTransform: "uppercase", color: "#C8A84B", fontWeight: 600 }}>
                        {isAr ? "رسالتنا" : "Our Mission"}
                    </span>
                </div>
                <p style={{ fontSize: 12, lineHeight: 1.85, color: textColor, margin: 0 }}>
                    {isAr
                        ? "تقديم منتجات بناء عالية الجودة بأسعار تنافسية مع ضمان سلسلة إمداد موثوقة وخدمة عملاء متميزة."
                        : "Delivering high-quality building products at competitive prices with a reliable supply chain and exceptional customer service."}
                </p>
            </div>

            <div style={{ height: 1, background: "rgba(200,168,75,0.15)", marginBottom: 12 }} />

            {/* Values */}
            <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 9.5, letterSpacing: 2.5, textTransform: "uppercase", color: "#C8A84B", margin: "0 0 8px", fontWeight: 600 }}>
                    {isAr ? "قيمنا" : "Our Values"}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {(isAr
                        ? [{ icon: <Award size={11} />, v: "الجودة" }, { icon: <Shield size={11} />, v: "الأمانة" }, { icon: <Zap size={11} />, v: "الابتكار" }, { icon: <TrendingUp size={11} />, v: "الموثوقية" }, { icon: <Heart size={11} />, v: "خدمة العملاء" }]
                        : [{ icon: <Award size={11} />, v: "Quality" }, { icon: <Shield size={11} />, v: "Integrity" }, { icon: <Zap size={11} />, v: "Innovation" }, { icon: <TrendingUp size={11} />, v: "Reliability" }, { icon: <Heart size={11} />, v: "Customer Service" }]
                    ).map((item, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: "#C8A84B", flexShrink: 0 }}>{item.icon}</span>
                            <span style={{ fontSize: 11, color: headColor, fontWeight: 500 }}>{item.v}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ height: 1, background: "rgba(200,168,75,0.15)", marginBottom: 12 }} />

            {/* Why Us */}
            <div>
                <p style={{ fontSize: 9.5, letterSpacing: 2.5, textTransform: "uppercase", color: "#C8A84B", margin: "0 0 8px", fontWeight: 600 }}>
                    {isAr ? "لماذا بيت الإباء؟" : "Why Bayt Alebaa?"}
                </p>
                {(isAr
                    ? ["تشكيلة واسعة تغطي جميع احتياجات البناء والتشطيب", "مستودعات متعددة لضمان التوافر الدائم والتسليم السريع", "فريق متخصص لخدمة العملاء والمشاريع الكبرى", "شراكات استراتيجية مع كبرى المصانع العالمية"]
                    : ["Wide range covering all construction and finishing needs", "Multiple warehouses ensuring constant availability and fast delivery", "Specialized team for clients and major projects", "Strategic partnerships with leading global manufacturers"]
                ).map((item, i) => (
                    <div key={i} style={{ display: "flex", gap: 7, marginBottom: 5, alignItems: "flex-start" }}>
                        <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#C8A84B", marginTop: 5, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, lineHeight: 1.65, color: textColor }}>{item}</span>
                    </div>
                ))}
            </div>

            {/* Corner logo */}
            <div style={{ position: "absolute", bottom: 16, [isAr ? "left" : "right"]: 20, opacity: 0.08 }}>
                <img src="/logo.png" alt="" style={{ width: 24, height: 24, objectFit: "contain" }} />
            </div>
        </div>
    );
}

function TocPage({
    categories, categoryPageMap, onNavigate, lang, isDark,
}: {
    categories: FlipbookManifestCategory[]; categoryPageMap: Record<string, number>;
    onNavigate: (n: number) => void; lang: Lang; isDark: boolean;
}) {
    const isAr = lang === "ar";
    const dir = isAr ? "rtl" : "ltr";
    const catName = (c: FlipbookManifestCategory) => pickBilingual(c.name_ar, c.name_en, isAr);

    return (
        <div style={{ ...paperPage(isDark), direction: dir, display: "flex", flexDirection: "column", padding: "28px 24px 20px" }}>
            <div style={{ position: "absolute", inset: 10, border: "1px solid rgba(200,168,75,0.18)", borderRadius: 1, pointerEvents: "none" }} />

            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: 18 }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px", color: isDark ? "#F5F0E8" : "#1A1A2E", letterSpacing: -0.2 }}>
                    {isAr ? "فهرس المحتويات" : "Table of Contents"}
                </h2>
                <p style={{ fontSize: 9, color: isDark ? "#6B7280" : "#9CA3AF", margin: "0 0 8px", letterSpacing: 2 }}>
                    {isAr ? "Table of Contents" : "فهرس المحتويات"}
                </p>
                {goldLine(40, 1.5)}
            </div>

            {/* Special pages */}
            {[
                { label: isAr ? "الغلاف" : "Cover", page: 0 },
                { label: isAr ? "من نحن" : "About Us", page: 1 },
            ].map((s, i) => (
                <button key={i} className="toc-row" onClick={() => onNavigate(s.page)}
                    style={{
                        display: "flex", alignItems: "center", width: "100%",
                        background: "none", border: "none", padding: "5px 4px",
                        cursor: "pointer", fontFamily: "inherit", borderRadius: 4,
                        gap: 4, direction: dir,
                    }}
                >
                    <span style={{ fontSize: 11, color: isDark ? "#E5E1D8" : "#1A1A2E", fontWeight: 600 }}>{s.label}</span>
                    <span style={{ flex: 1, borderBottom: "1px dotted rgba(200,168,75,0.3)", marginTop: -3, marginInline: 6 }} />
                    <span style={{ fontSize: 10.5, color: "#C8A84B", fontWeight: 700, fontFamily: "monospace" }}>{s.page + 1}</span>
                </button>
            ))}

            <div style={{ height: 1, background: "rgba(200,168,75,0.12)", margin: "8px 0" }} />

            {/* Categories */}
            <div style={{ flex: 1, overflowY: "auto" }}>
                {categories.filter(c => categoryPageMap[String(c.id)] !== undefined).map((cat, i) => {
                    const pg = categoryPageMap[String(cat.id)];
                    return (
                        <button key={cat.id} className="toc-row" onClick={() => onNavigate(pg)}
                            style={{
                                display: "flex", alignItems: "center", width: "100%",
                                background: "none", border: "none", padding: "6px 4px",
                                cursor: "pointer", fontFamily: "inherit", borderRadius: 4,
                                gap: 6, direction: dir,
                            }}
                        >
                            <span style={{
                                fontSize: 9, minWidth: 18, height: 18,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                border: "1px solid rgba(200,168,75,0.5)", borderRadius: "50%",
                                color: "#C8A84B", fontWeight: 700, flexShrink: 0,
                            }}>{i + 1}</span>
                            {cat.icon && <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>{cat.icon}</span>}
                            <span style={{ fontSize: 11, color: isDark ? "#E5E1D8" : "#1A1A2E", textAlign: isAr ? "right" : "left", fontWeight: 500 }}>
                                {catName(cat)}
                            </span>
                            <span style={{ flex: 1, borderBottom: "1px dotted rgba(200,168,75,0.25)", marginTop: -3, marginInline: 4, minWidth: 16 }} />
                            <span style={{ fontSize: 10.5, color: "#C8A84B", fontWeight: 700, flexShrink: 0, fontFamily: "monospace" }}>
                                {pg + 1}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Footer ornament */}
            <div style={{ textAlign: "center", marginTop: 10, opacity: 0.35 }}>
                <span style={{ fontSize: 9, color: "#C8A84B", letterSpacing: 4 }}>◆ ◆ ◆</span>
            </div>
        </div>
    );
}

function CategoryChapterPage({ category, count, chapterNumber, lang }: { category: FlipbookManifestCategory; count: number; chapterNumber: number; lang: Lang }) {
    const isAr = lang === "ar";
    const bgUrl = getCategoryBackground(category.name_ar || "");
    const nameAr = category.name_ar || "";
    const nameEn = category.name_en || "";

    return (
        <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", fontFamily: "'29LT Bukra', 'Tajawal', sans-serif" }}>
            <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${bgUrl})`, backgroundSize: "cover", backgroundPosition: "center" }} />
            {/* Sophisticated overlay */}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, rgba(10,22,40,0.88) 0%, rgba(10,22,40,0.72) 50%, rgba(10,22,40,0.88) 100%)" }} />
            {/* Vignette */}
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.4) 100%)" }} />

            {cornerBrackets(0.4, 24, 16)}

            <div style={{
                position: "relative", zIndex: 2,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                height: "100%", padding: "28px 24px", boxSizing: "border-box",
                direction: isAr ? "rtl" : "ltr",
            }}>
                {/* Chapter badge — refined gold circle outline */}
                <div style={{
                    width: 44, height: 44, borderRadius: "50%",
                    border: "1.5px solid #C8A84B",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginBottom: 14,
                }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: "#C8A84B" }}>{chapterNumber}</span>
                </div>

                {/* Category icon */}
                {category.icon && (
                    <div style={{ fontSize: 36, marginBottom: 8, filter: "drop-shadow(0 2px 8px rgba(200,168,75,0.35))" }}>
                        {category.icon}
                    </div>
                )}

                {/* Gold thin line */}
                <div style={{ width: 50, height: 1, background: "rgba(200,168,75,0.55)", marginBottom: 14 }} />

                {/* Category name Arabic */}
                <h2 style={{
                    fontSize: 24, fontWeight: 800, color: "#F5F0E8",
                    margin: 0, marginBottom: 4, textAlign: "center",
                    textShadow: "0 2px 16px rgba(0,0,0,0.5)",
                    letterSpacing: 0.5,
                }}>
                    {isAr ? nameAr : (nameEn || nameAr)}
                </h2>
                {/* English subtitle */}
                {nameEn && (
                    <p style={{
                        fontSize: 11, color: "rgba(245,240,232,0.45)",
                        margin: "0 0 8px", textAlign: "center", letterSpacing: 1.5,
                        fontWeight: 400,
                    }}>
                        {isAr ? nameEn : nameAr}
                    </p>
                )}

                {/* Product count — plain text */}
                <p style={{ fontSize: 10, color: "rgba(200,168,75,0.7)", margin: "10px 0 0", letterSpacing: 1 }}>
                    {count} {isAr ? "منتج" : "Products"}
                </p>
            </div>
        </div>
    );
}

function ProductGridPage({
    products, placeholderCount, pageIndex, totalPages, onProductClick, lang, isDark, categoryRef,
}: {
    products: Product[];
    /* Number of slots on this page that don't yet have a streamed product
       — the renderer fills these with skeleton cards (and a small spinner
       on the first one) so the spread looks complete and the reader gets
       immediate visual feedback while the network catches up. */
    placeholderCount: number;
    pageIndex: number; totalPages: number;
    onProductClick: (p: Product) => void; lang: Lang; isDark: boolean; categoryRef?: FlipbookManifestCategory;
}) {
    const isAr = lang === "ar";
    const dir = isAr ? "rtl" : "ltr";
    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const cardBg = isDark ? "var(--color-bg)" : "#FFFFFF";
    const cardBorder = isDark ? "var(--color-border)" : "rgba(0,0,0,0.08)";

    const catLabel = categoryRef
        ? (isAr ? categoryRef.name_ar : (categoryRef.name_en || categoryRef.name_ar))
        : "";

    const totalSlots = products.length + placeholderCount;
    const skeletonBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
    const skeletonBgStrong = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)";

    return (
        <div style={{ ...paperPage(isDark), direction: dir, display: "flex", flexDirection: "column", padding: "12px 12px 8px" }}>
            {/* Gold line at top */}
            <div style={{ height: 1.5, background: "linear-gradient(90deg, transparent, #C8A84B, transparent)", marginBottom: 6 }} />

            {/* Running header — category name */}
            {catLabel && (
                <div style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    marginBottom: 8,
                }}>
                    {categoryRef?.icon && <span style={{ fontSize: 11, lineHeight: 1 }}>{categoryRef.icon}</span>}
                    <span style={{ fontSize: 9, color: "#C8A84B", letterSpacing: 2, textTransform: "uppercase", fontWeight: 600 }}>{catLabel}</span>
                </div>
            )}

            {/* Products 2×2 grid */}
            <div style={{
                display: "grid",
                gridTemplateColumns: totalSlots === 1 ? "1fr" : "1fr 1fr",
                gap: 8, flex: 1,
            }}>
                {products.map(p => {
                    const imgSrc = p.main_image_url || (Array.isArray(p.images) && p.images.length > 0 ? p.images[0]?.url : undefined);
                    const isNew = p.created_at ? new Date(p.created_at).getTime() > sevenDaysAgo : false;
                    const nameAr = p.product_name_ar || p.product_name_en || "";
                    const nameEn = p.product_name_en || p.product_name_ar || "";

                    return (
                        <div key={p.id} className="flip-card" role="button" tabIndex={0}
                            onClick={() => onProductClick(p)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onProductClick(p); } }}
                            aria-label={isAr ? nameAr : nameEn}
                            style={{
                            border: `1px solid ${cardBorder}`, borderRadius: 6, overflow: "hidden",
                            cursor: "pointer", position: "relative",
                            display: "flex", flexDirection: "column",
                            background: cardBg,
                        }}>
                            {/* Image — 60% height */}
                            <div style={{ flex: "0 0 58%", position: "relative", background: isDark ? "rgba(200,168,75,0.03)" : "#F7F5F0", overflow: "hidden" }}>
                                {isNew && (
                                    <span style={{
                                        position: "absolute", top: 4, [isAr ? "right" : "left"]: 4,
                                        fontSize: 7, padding: "2px 6px",
                                        background: "#C8A84B", color: "#0B1A2E",
                                        borderRadius: 8, fontWeight: 700, zIndex: 2, letterSpacing: 0.5,
                                    }}>
                                        {isAr ? "جديد" : "New"}
                                    </span>
                                )}
                                {imgSrc ? (
                                    <img src={imgSrc} alt={nameAr} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                                ) : (
                                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 60 }}>
                                        <Package size={22} color="rgba(200,168,75,0.25)" />
                                    </div>
                                )}
                            </div>

                            {/* Info */}
                            <div style={{ flex: 1, padding: "6px 7px", display: "flex", flexDirection: "column", gap: 1 }}>
                                <p style={{
                                    fontSize: 10, fontWeight: 600, color: isDark ? "#E5E1D8" : "#1A1A2E",
                                    margin: 0, lineHeight: 1.3,
                                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                                }}>{isAr ? nameAr : nameEn}</p>
                                {p.sku && (
                                    <p style={{ fontSize: 7.5, color: isDark ? "#6B7280" : "#9CA3AF", margin: 0, fontFamily: "'Courier New', monospace", letterSpacing: 0.5 }}>
                                        {p.sku}
                                    </p>
                                )}
                                {p.price_sar && (
                                    <p style={{ fontSize: 10.5, fontWeight: 700, color: "#C8A84B", margin: "2px 0 0" }}>
                                        {Number(p.price_sar).toLocaleString(isAr ? "ar-SA" : "en")} {isAr ? "ر.س" : "SAR"}
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })}

                {/* Skeleton placeholders for slots whose products are not yet
                    streamed in. We render the same card shape (image area
                    + 3 lines of text bars) with a subtle shimmer so the
                    spread looks complete while data loads. The first
                    placeholder also shows a small spinner so the user
                    understands content is on its way. */}
                {Array.from({ length: placeholderCount }).map((_, idx) => (
                    <div key={`ph-${idx}`} style={{
                        border: `1px solid ${cardBorder}`, borderRadius: 6, overflow: "hidden",
                        position: "relative", display: "flex", flexDirection: "column",
                        background: cardBg,
                    }} aria-hidden="true">
                        <div style={{ flex: "0 0 58%", position: "relative", background: skeletonBgStrong, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {idx === 0 && (
                                <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid rgba(200,168,75,0.25)", borderTopColor: "#C8A84B", animation: "spin 0.9s linear infinite" }} />
                            )}
                        </div>
                        <div style={{ flex: 1, padding: "6px 7px", display: "flex", flexDirection: "column", gap: 4 }}>
                            <div style={{ height: 9, width: "85%", background: skeletonBgStrong, borderRadius: 2 }} />
                            <div style={{ height: 9, width: "55%", background: skeletonBg, borderRadius: 2 }} />
                            <div style={{ height: 10, width: "40%", background: skeletonBg, borderRadius: 2, marginTop: 4 }} />
                        </div>
                    </div>
                ))}
            </div>

            {/* Classic book page number */}
            <div style={{
                textAlign: "center", paddingTop: 5, marginTop: 4,
                borderTop: "0.5px solid rgba(200,168,75,0.1)",
            }}>
                <span style={{ fontSize: 9, color: isDark ? "rgba(200,168,75,0.4)" : "rgba(139,114,48,0.4)", letterSpacing: 3, fontFamily: "'Courier New', monospace" }}>
                    — {pageIndex + 1} —
                </span>
            </div>
        </div>
    );
}

function BackCoverPage({ lang }: { lang: Lang }) {
    const isAr = lang === "ar";
    return (
        <div style={{
            width: "100%", height: "100%",
            position: "relative", overflow: "hidden",
            fontFamily: "'29LT Bukra', 'Tajawal', sans-serif",
        }}>
            {/* Same style as front cover */}
            <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${COVER_BG})`, backgroundSize: "cover", backgroundPosition: "center" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, rgba(10,22,40,0.93) 0%, rgba(11,26,46,0.88) 50%, rgba(10,22,40,0.93) 100%)" }} />
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.3) 100%)" }} />
            <div style={{ position: "absolute", inset: 16, border: "1.5px solid rgba(200,168,75,0.35)", borderRadius: 2, pointerEvents: "none" }} />

            <div style={{
                position: "relative", zIndex: 2,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                height: "100%", padding: "28px 24px", boxSizing: "border-box",
                direction: isAr ? "rtl" : "ltr",
            }}>
                <img src="/logo.png" alt="" style={{ width: 64, height: 64, objectFit: "contain", marginBottom: 12, opacity: 0.9 }} />
                <div style={{ width: 50, height: 1, background: "rgba(200,168,75,0.5)", marginBottom: 14 }} />

                <h3 style={{ fontSize: 16, fontWeight: 800, color: "#F5F0E8", margin: "0 0 4px", textAlign: "center" }}>
                    {isAr ? "بيت الإباء" : "Bayt Alebaa"}
                </h3>
                <p style={{ fontSize: 9.5, color: "#C8A84B", margin: "0 0 20px", letterSpacing: 2, textTransform: "uppercase", textAlign: "center" }}>
                    {isAr ? "للمواد البنائية والإنشائية" : "Building Materials & Construction"}
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 7, width: "100%", maxWidth: 210, marginBottom: 16 }}>
                    {[
                        { icon: <Phone size={11} />, text: "+966 5X XXX XXXX" },
                        { icon: <Mail size={11} />, text: "info@baytalebaa.com" },
                        { icon: <Globe size={11} />, text: "www.baytalebaa.com" },
                        { icon: <MapPin size={11} />, text: isAr ? "المملكة العربية السعودية" : "Kingdom of Saudi Arabia" },
                    ].map((c, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{ color: "#C8A84B", flexShrink: 0 }}>{c.icon}</span>
                            <span style={{ fontSize: 10, color: "rgba(245,240,232,0.6)" }}>{c.text}</span>
                        </div>
                    ))}
                </div>

                {/* QR placeholder */}
                <div style={{
                    width: 48, height: 48, border: "1px dashed rgba(200,168,75,0.3)",
                    borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(200,168,75,0.03)",
                }}>
                    <span style={{ fontSize: 7, color: "rgba(200,168,75,0.35)", textAlign: "center", lineHeight: 1.3 }}>QR<br/>Code</span>
                </div>
            </div>

            <div style={{
                position: "absolute", bottom: 22, fontSize: 8,
                color: "rgba(245,240,232,0.25)", textAlign: "center",
                width: "100%", letterSpacing: 0.5, zIndex: 2,
            }}>
                {isAr ? "جميع الحقوق محفوظة © ٢٠٢٥ بيت الإباء" : "© 2025 Bayt Alebaa. All Rights Reserved."}
            </div>
        </div>
    );
}

function ProductModal({ product, onClose, lang }: { product: Product; onClose: () => void; lang: Lang }) {
    const isAr = lang === "ar";
    const [selectedImg, setSelectedImg] = useState(0);

    const images: string[] = [];
    if (product.main_image_url) images.push(product.main_image_url);
    if (Array.isArray(product.images)) {
        product.images.forEach((img) => {
            if (img?.url && img.url !== product.main_image_url) images.push(img.url);
        });
    }

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div className="modal-overlay" onClick={onClose} style={{ direction: isAr ? "rtl" : "ltr" }}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "'29LT Bukra','Tajawal',sans-serif" }}>
                        {isAr ? (product.product_name_ar || product.product_name_en) : (product.product_name_en || product.product_name_ar)}
                    </h3>
                    <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", padding: 4 }}>
                        <X size={18} />
                    </button>
                </div>
                <div style={{ padding: "14px 18px", display: "flex", gap: 14, flexWrap: "wrap" }}>
                    {images.length > 0 && (
                        <div style={{ flexShrink: 0 }}>
                            <div style={{ width: 200, height: 180, border: "1px solid var(--color-border)", borderRadius: 8, overflow: "hidden", background: "var(--color-bg)" }}>
                                <img src={images[selectedImg]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            </div>
                            {images.length > 1 && (
                                <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap", maxWidth: 200 }}>
                                    {images.map((img, i) => (
                                        <img key={i} src={img} alt="" onClick={() => setSelectedImg(i)} style={{
                                            width: 36, height: 36, objectFit: "cover", borderRadius: 5, cursor: "pointer",
                                            border: `2px solid ${i === selectedImg ? "#C8A84B" : "var(--color-border)"}`,
                                        }} />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    <div style={{ flex: 1, minWidth: 160 }}>
                        {product.sku && <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "0 0 8px", fontFamily: "monospace" }}>SKU: {product.sku}</p>}
                        {product.price_sar && (
                            <p style={{ fontSize: 18, fontWeight: 700, color: "#C8A84B", margin: "0 0 10px", fontFamily: "'29LT Bukra','Tajawal',sans-serif" }}>
                                {Number(product.price_sar).toLocaleString(isAr ? "ar-SA" : "en")} {isAr ? "ر.س" : "SAR"}
                            </p>
                        )}
                        {(isAr ? product.description_ar : product.description_en) && (
                            <p style={{ fontSize: 12, lineHeight: 1.7, color: "var(--color-text-secondary)", margin: "0 0 10px" }}>
                                {isAr ? product.description_ar : product.description_en}
                            </p>
                        )}
                        {product.attributes && (() => {
                            const baseKeys = Array.from(new Set(
                                Object.keys(product.attributes).map(k => k.endsWith('_en') ? k.slice(0, -3) : k)
                            ))
                            const entries = baseKeys.map(bk => {
                                const ar = product.attributes[bk] ? String(product.attributes[bk]) : ''
                                const en = product.attributes[bk + '_en'] ? String(product.attributes[bk + '_en']) : ''
                                const v = isAr ? (ar || en) : (en || ar)
                                return [bk, v] as [string, string]
                            }).filter(([, v]) => v !== '')
                            if (entries.length === 0) return null
                            return (
                                <div style={{ marginTop: 8 }}>
                                    {entries.slice(0, 6).map(([key, val], i) => (
                                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "4px 0", borderBottom: "1px solid var(--color-border)", fontSize: 11 }}>
                                            <span style={{ color: "var(--color-text-muted)", minWidth: 80 }}>{key}</span>
                                            <span style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>{val}</span>
                                        </div>
                                    ))}
                                </div>
                            )
                        })()}
                    </div>
                </div>
            </div>
        </div>
    );
}

function ProgressBar({ currentPage, totalPages }: { currentPage: number; totalPages: number }) {
    const pct = totalPages > 1 ? (currentPage / (totalPages - 1)) * 100 : 0;
    return (
        <div style={{ width: "100%", height: 2, background: "var(--color-border)", marginBottom: 10, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, #C8A84B, #D4A84B)", transition: "width 0.4s ease", borderRadius: 2 }} />
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════
export default function FlipbookPage() {
    const navigate = useNavigate();
    const { theme, toggleTheme } = useThemeStore();
    const bookRef = useRef<FlipBookRef>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [currentPage, setCurrentPage] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showCatDropdown, setShowCatDropdown] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [screenWidth, setScreenWidth] = useState(window.innerWidth);
    const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("pdc-lang") as Lang) || "ar");

    const t = T[lang];
    const isAr = lang === "ar";
    const dir = isAr ? "rtl" : "ltr";
    const isDark = theme === "dark";

    const toggleLang = useCallback(() => {
        setLang(prev => { const n: Lang = prev === "ar" ? "en" : "ar"; localStorage.setItem("pdc-lang", n); return n; });
    }, []);

    useEffect(() => {
        const fn = () => setScreenWidth(window.innerWidth);
        window.addEventListener("resize", fn);
        return () => window.removeEventListener("resize", fn);
    }, []);

    /* ── Lazy / streaming data fetch ───────────────────────────────
       The flipbook used to download the entire ~1.6k-product catalog
       up front (page_size=5000) before rendering anything, leaving the
       reader staring at a spinner for many seconds. We now do two
       separate things:

       1. Manifest — a tiny payload of [{category, product_count}],
          ordered the same way as the streaming endpoint. This lets us
          build the entire page sequence (cover → about → TOC →
          chapters → back cover) with placeholder product pages BEFORE
          loading any product detail. Total page count, TOC entries,
          and the category jump dropdown are all accurate from the
          first paint, so they never shift as data streams in.

       2. Streaming infinite query — products are pulled in batches of
          PRODUCT_BATCH_SIZE (~30) ordered identically to the manifest.
          Because the orderings match, the i-th streamed product
          always belongs to the i-th product slot in our placeholder
          layout — no client-side sorting or grouping required.
       */
    const PRODUCT_BATCH_SIZE = 30;

    const { data: manifestData, isLoading: loadingManifest } = useQuery({
        queryKey: ["flipbook-manifest"],
        queryFn: () => productsAPI.flipbookManifest().then(r => r.data),
        staleTime: 5 * 60 * 1000,
    });

    const manifest = useMemo(() => (
        (manifestData?.categories ?? []) as Array<{
            id: number; name_ar: string; name_en: string;
            slug: string | null; icon: string; product_count: number;
        }>
    ), [manifestData]);
    const totalProducts: number = manifestData?.total_products ?? 0;

    type StreamPage = { next: string | null; results: Product[] };

    const {
        data: streamData,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useInfiniteQuery<StreamPage, Error>({
        queryKey: ["flipbook-products-stream", PRODUCT_BATCH_SIZE],
        queryFn: ({ pageParam }) =>
            productsAPI.flipbookProducts({ page: pageParam, page_size: PRODUCT_BATCH_SIZE })
                .then(r => r.data as StreamPage),
        initialPageParam: 1,
        /* Derive the next page number by parsing the `next` URL the
           backend already returns, rather than incrementing
           `allPages.length`. This stays correct even if the backend
           ever skips, retries, or renumbers pages, and avoids a
           silent double-fetch / stall mismatch. Falls back to the
           length-based counter only if `next` exists but lacks a
           parseable `page` query param. */
        getNextPageParam: (lastPage, allPages) => {
            if (!lastPage?.next) return undefined;
            try {
                const url = new URL(lastPage.next, window.location.origin);
                const p = url.searchParams.get("page");
                const n = p ? parseInt(p, 10) : NaN;
                if (Number.isFinite(n) && n > 0) return n;
            } catch { /* ignore parse errors */ }
            return allPages.length + 1;
        },
        enabled: !loadingManifest && totalProducts > 0,
        staleTime: 5 * 60 * 1000,
    });

    const loadedProducts: Product[] = useMemo(() => {
        if (!streamData?.pages) return [];
        return streamData.pages.flatMap(p => p?.results ?? []);
    }, [streamData]);
    const loadedCount = loadedProducts.length;
    const isStreamComplete = totalProducts > 0 && loadedCount >= totalProducts;

    /* The category dropdown / pills used to need a separate fetch from
       /categories/. The manifest already returns every category that
       has at least one displayable product, in the right order, with
       the fields we need (name_ar/en, icon). So we derive `categories`
       directly — one network round-trip saved. */
    const categories: FlipbookManifestCategory[] = useMemo(() => manifest.map(m => ({
        id: m.id,
        name_ar: m.name_ar,
        name_en: m.name_en,
        slug: m.slug,
        icon: m.icon,
    })), [manifest]);

    /* Build the page sequence from the manifest alone — STABLE in
       length and identity from first paint. Each "products" entry
       carries an absolute slice [start, end) into loadedProducts; the
       renderer fills in real cards or skeleton placeholders depending
       on how much of the slice has streamed in. We deliberately do not
       store Product objects on the page entry, otherwise the children
       array passed to react-pageflip would change identity on every
       streamed batch and the library could reset the current page. */
    const { pages, categoryPageMap, totalPages, tocPageIndex } = useMemo(() => {
        const allPages: FlipbookPageEntry[] = [];
        allPages.push({ type: "cover-front" });
        allPages.push({ type: "about-us-1" });
        allPages.push({ type: "about-us-2" });
        const tocIndex = allPages.length;
        allPages.push({ type: "table-of-contents" });

        const catMap: Record<string, number> = {};
        let chapterNum = 1;
        let runningOffset = 0;

        for (const cat of manifest) {
            const count = cat.product_count;
            if (count <= 0) continue;
            const catObj: FlipbookManifestCategory = {
                id: cat.id, name_ar: cat.name_ar, name_en: cat.name_en,
                slug: cat.slug, icon: cat.icon,
            };
            catMap[String(cat.id)] = allPages.length;
            allPages.push({
                type: "category-chapter", category: catObj,
                chapterNumber: chapterNum, productCount: count,
            });
            chapterNum++;

            const numPages = Math.ceil(count / PRODUCTS_PER_PAGE);
            for (let i = 0; i < numPages; i++) {
                const sliceStart = runningOffset + i * PRODUCTS_PER_PAGE;
                const sliceEnd = Math.min(runningOffset + count, sliceStart + PRODUCTS_PER_PAGE);
                allPages.push({
                    type: "products", categoryRef: catObj,
                    productSliceStart: sliceStart, productSliceEnd: sliceEnd,
                });
            }
            runningOffset += count;
        }

        if (manifest.length === 0) allPages.push({ type: "empty" });
        allPages.push({ type: "cover-back" });

        return { pages: allPages, categoryPageMap: catMap, totalPages: allPages.length, tocPageIndex: tocIndex };
    }, [manifest]);

    /* When the reader jumps far ahead (category pill, dropdown, End
       key) we record how far they want to read so the prefetch effect
       below pulls enough batches to cover that target. Setting this is
       cheap; the effect picks it up and chains fetchNextPage calls. */
    const [targetLoadedEnd, setTargetLoadedEnd] = useState(0);

    /* Single effect that fires fetchNextPage when EITHER:
       - the reader is within ~3 spreads of the first unloaded page, OR
       - a jump declared a target product index beyond loadedCount.
       The infinite-query machinery already guards against double
       fetches via isFetchingNextPage. The effect re-runs whenever
       loadedCount grows, naturally chaining batches until the
       requirement is satisfied. */
    useEffect(() => {
        if (!hasNextPage || isFetchingNextPage) return;
        if (loadedCount < targetLoadedEnd) {
            fetchNextPage();
            return;
        }
        const PREFETCH_THRESHOLD_SPREADS = 3;
        let firstUnloadedPageIndex = -1;
        for (let i = 0; i < pages.length; i++) {
            const pg = pages[i];
            if (pg.type === "products" && (pg.productSliceStart ?? 0) >= loadedCount) {
                firstUnloadedPageIndex = i;
                break;
            }
        }
        if (firstUnloadedPageIndex === -1) return;
        const spreadsAway = Math.floor((firstUnloadedPageIndex - currentPage) / 2);
        if (spreadsAway <= PREFETCH_THRESHOLD_SPREADS) {
            fetchNextPage();
        }
    }, [currentPage, loadedCount, targetLoadedEnd, hasNextPage, isFetchingNextPage, pages, fetchNextPage]);

    /* Page-flip sound preference: persisted across sessions in
       localStorage, defaults to ON (the user explicitly asked for the
       sound). Wrapped in try/catch because Safari private mode and a
       few enterprise environments throw on localStorage access. */
    const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
        try {
            const v = localStorage.getItem(SOUND_PREF_KEY);
            return v === null ? true : v === "1";
        } catch { return true; }
    });
    const toggleSound = useCallback(() => {
        setSoundEnabled(prev => {
            const next = !prev;
            try { localStorage.setItem(SOUND_PREF_KEY, next ? "1" : "0"); } catch { /* ignore */ }
            return next;
        });
    }, []);
    const soundEnabledRef = useRef(soundEnabled);
    useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

    /* react-pageflip fires `onFlip` on every page change. We read the
       latest preference through a ref so the handler identity stays
       stable — otherwise re-binding it on every toggle could disturb
       the library's internal listeners. */
    const onFlip = useCallback((e: { data: number }) => {
        setCurrentPage(e.data);
        if (soundEnabledRef.current) playPageFlipSound();
    }, []);
    const prevPage = useCallback(() => { bookRef.current?.pageFlip().flipPrev(); }, []);
    const nextPage = useCallback(() => { bookRef.current?.pageFlip().flipNext(); }, []);

    /* Centralized navigation: any time we flip to a specific page we
       also raise targetLoadedEnd so the prefetch effect pulls the
       needed batches. We flip immediately — the destination spread
       shows skeleton placeholders for any not-yet-loaded slots, which
       fade into real cards once their batch arrives (~1 sec typical).

       When the user jumps to a chapter divider (from the dropdown,
       pill bar, or TOC) we look one page ahead for the first products
       page in that chapter and raise targetLoadedEnd to the end of
       its slice. Without this, chapter jumps would only get prefetched
       opportunistically once the reader was within 3 spreads, leaving
       "load on demand" feeling sluggish on the very first jump. */
    const flipTo = useCallback((n: number) => {
        const target = pages[n];
        let neededEnd = 0;
        if (target?.type === "products" && target.productSliceEnd !== undefined) {
            neededEnd = target.productSliceEnd;
        } else if (target?.type === "category-chapter") {
            for (let i = n + 1; i < pages.length; i++) {
                const next = pages[i];
                if (next.type === "products" && next.productSliceEnd !== undefined) {
                    neededEnd = next.productSliceEnd;
                    break;
                }
                if (next.type === "category-chapter") break; // empty chapter — shouldn't happen
            }
        }
        if (neededEnd > 0) {
            setTargetLoadedEnd(prev => Math.max(prev, neededEnd));
        }
        bookRef.current?.pageFlip().flip(n);
    }, [pages]);
    const goToFirst = useCallback(() => flipTo(0), [flipTo]);
    const goToLast = useCallback(() => {
        // Last page is the back cover; the last products page sits just
        // before it. Loading the entire catalog on End-key press is the
        // user's explicit signal that they want to skim to the end.
        setTargetLoadedEnd(totalProducts);
        flipTo(pages.length - 1);
    }, [flipTo, pages.length, totalProducts]);

    const toggleFullscreen = useCallback(() => {
        if (!containerRef.current) return;
        if (!document.fullscreenElement) containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
        else document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }, []);

    useEffect(() => {
        const fn = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", fn);
        return () => document.removeEventListener("fullscreenchange", fn);
    }, []);

    useEffect(() => {
        const fn = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft") nextPage();
            else if (e.key === "ArrowRight") prevPage();
            else if (e.key === "Home") goToFirst();
            else if (e.key === "End") goToLast();
        };
        window.addEventListener("keydown", fn);
        return () => window.removeEventListener("keydown", fn);
    }, [nextPage, prevPage, goToFirst, goToLast]);

    const isMobile = screenWidth <= 768;
    const bookWidth = isMobile ? Math.min(screenWidth - 24, 360) : 480;
    const bookHeight = Math.round(bookWidth * 1.38);
    /* The book renders as soon as the (tiny) manifest arrives. Product
       data continues to stream in the background; placeholder pages
       keep the layout stable in the meantime. */
    const isLoading = loadingManifest;

    const navBtn = (label: string, onClick: () => void, icon: React.ReactNode) => (
        <button className="flip-nav-btn" title={label} onClick={onClick} style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 32, height: 32, background: "var(--color-surface)",
            border: "1px solid var(--color-border)", borderRadius: 6,
            cursor: "pointer", color: "var(--color-text-secondary)",
        }}>{icon}</button>
    );

    return (
        <div ref={containerRef} style={{
            minHeight: "100vh", background: "var(--color-bg)", direction: dir,
            fontFamily: "'29LT Bukra', 'Tajawal', sans-serif",
            display: "flex", flexDirection: "column",
        }}>
            <style>{globalStyles}</style>

            {selectedProduct && <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} lang={lang} />}

            {/* ── HEADER ── */}
            <header style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: isMobile ? "8px 12px" : "10px 20px",
                borderBottom: "1px solid var(--color-border)",
                background: "var(--color-surface)", gap: 8, flexWrap: "wrap", flexShrink: 0,
                boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button onClick={() => navigate("/catalog")} style={{
                        display: "flex", alignItems: "center", gap: 4, background: "none", border: "none",
                        color: "var(--color-text-secondary)", cursor: "pointer", fontSize: 12, fontFamily: "inherit", padding: "4px 6px", borderRadius: 5,
                    }}>
                        {isAr ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
                        {!isMobile && t.catalog}
                    </button>
                    <div style={{ width: 1, height: 18, background: "var(--color-border)" }} />
                    <img src="/logo.png" alt="Bayt Alebaa" style={{ width: 24, height: 24, objectFit: "contain", filter: "var(--logo-filter)" }} />
                    {!isMobile && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>{t.interactiveCatalog}</span>}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {/* Category jump */}
                    <div style={{ position: "relative" }}>
                        <button onClick={() => setShowCatDropdown(v => !v)} style={{
                            display: "flex", alignItems: "center", gap: 4, padding: "5px 10px",
                            background: "var(--color-surface-raised)", border: "1px solid var(--color-border)",
                            borderRadius: 5, color: "var(--color-text-primary)", fontSize: 11, fontFamily: "inherit", cursor: "pointer",
                        }}>
                            <BookOpen size={13} />{!isMobile && t.jumpTo}<ChevronDown size={12} />
                        </button>
                        {showCatDropdown && (
                            <>
                                <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setShowCatDropdown(false)} />
                                <div style={{
                                    position: "absolute", top: "100%", [isAr ? "right" : "left"]: 0,
                                    marginTop: 4, background: "var(--color-surface)", border: "1px solid var(--color-border)",
                                    borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", zIndex: 100,
                                    minWidth: 180, overflow: "hidden", maxHeight: 280, overflowY: "auto", direction: dir,
                                }}>
                                    {[
                                        { label: isAr ? "الغلاف" : "Cover", page: 0, icon: <Home size={13} /> },
                                        { label: isAr ? "من نحن" : "About Us", page: 1, icon: <Users size={13} /> },
                                        { label: isAr ? "الفهرس" : "Contents", page: tocPageIndex, icon: <BookOpen size={13} /> },
                                    ].map(item => (
                                        <button key={item.page} onClick={() => { setShowCatDropdown(false); flipTo(item.page); }}
                                            style={{
                                                display: "flex", alignItems: "center", gap: 8, width: "100%",
                                                padding: "8px 12px", background: "transparent", border: "none",
                                                textAlign: isAr ? "right" : "left", fontFamily: "inherit",
                                                fontSize: 11, color: "var(--color-text-primary)", cursor: "pointer",
                                            }}
                                        >{item.icon}{item.label}</button>
                                    ))}
                                    {categories.filter(c => categoryPageMap[String(c.id)] !== undefined).map(cat => (
                                        <button key={cat.id} onClick={() => { setShowCatDropdown(false); flipTo(categoryPageMap[String(cat.id)]); }}
                                            style={{
                                                display: "flex", alignItems: "center", gap: 8, width: "100%",
                                                padding: "8px 12px", background: "transparent", border: "none",
                                                borderTop: "1px solid var(--color-border)",
                                                textAlign: isAr ? "right" : "left", fontFamily: "inherit",
                                                fontSize: 11, color: "var(--color-text-primary)", cursor: "pointer",
                                            }}
                                        >
                                            {cat.icon && <span>{cat.icon}</span>}
                                            {isAr ? cat.name_ar : (cat.name_en || cat.name_ar)}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Language toggle */}
                    <button onClick={toggleLang} title={isAr ? "English" : "عربي"} style={{
                        display: "flex", alignItems: "center", gap: 4, padding: "5px 8px",
                        background: "var(--color-surface-raised)", border: "1px solid var(--color-border)",
                        borderRadius: 5, color: "var(--color-text-secondary)", fontSize: 11, fontFamily: "inherit", cursor: "pointer",
                    }}>
                        <Languages size={13} />{isAr ? "EN" : "عربي"}
                    </button>

                    <button onClick={toggleTheme} title={isDark ? "Light" : "Dark"} style={{
                        display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30,
                        background: "var(--color-surface-raised)", border: "1px solid var(--color-border)",
                        borderRadius: 5, cursor: "pointer", color: "var(--color-text-secondary)",
                    }}>
                        {isDark ? <Sun size={14} /> : <Moon size={14} />}
                    </button>

                    <button
                        onClick={toggleSound}
                        title={soundEnabled
                            ? (isAr ? "كتم صوت قلب الصفحة" : "Mute page-flip sound")
                            : (isAr ? "تشغيل صوت قلب الصفحة" : "Enable page-flip sound")}
                        aria-label={soundEnabled
                            ? (isAr ? "كتم صوت قلب الصفحة" : "Mute page-flip sound")
                            : (isAr ? "تشغيل صوت قلب الصفحة" : "Enable page-flip sound")}
                        aria-pressed={soundEnabled}
                        style={{
                            display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30,
                            background: "var(--color-surface-raised)", border: "1px solid var(--color-border)",
                            borderRadius: 5, cursor: "pointer",
                            color: soundEnabled ? "#C8A84B" : "var(--color-text-secondary)",
                        }}>
                        {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    </button>

                    <button onClick={() => { try { navigator.share({ url: location.href }); } catch { navigator.clipboard.writeText(location.href); } }}
                        title={isAr ? "مشاركة" : "Share"} style={{
                            display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30,
                            background: "var(--color-surface-raised)", border: "1px solid var(--color-border)",
                            borderRadius: 5, cursor: "pointer", color: "var(--color-text-secondary)",
                        }}>
                        <Share2 size={14} />
                    </button>

                    <button onClick={toggleFullscreen} title={isFullscreen ? (isAr ? "تصغير" : "Exit") : (isAr ? "ملء الشاشة" : "Fullscreen")} style={{
                        display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30,
                        background: "var(--color-surface-raised)", border: "1px solid var(--color-border)",
                        borderRadius: 5, cursor: "pointer", color: "var(--color-text-secondary)",
                    }}>
                        {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                </div>
            </header>

            {/* ── BODY ── */}
            <div style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "flex-start",
                padding: isMobile ? "16px 8px 24px" : "24px 16px 32px",
            }}>
                {isLoading ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 16, color: "var(--color-text-muted)" }}>
                        <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid var(--color-border)", borderTopColor: "#C8A84B", animation: "spin 0.9s linear infinite" }} />
                        <span style={{ fontSize: 13 }}>{t.loading}</span>
                    </div>
                ) : (
                    <>
                        <div style={{ width: bookWidth, marginBottom: 10 }}>
                            <ProgressBar currentPage={currentPage} totalPages={pages.length} />
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 9, color: "var(--color-text-muted)", gap: 8 }}>
                                <span>{t.readingProgress}</span>
                                {/* Background-loading status — shown only while
                                    a batch fetch is actively in flight, or
                                    before any batch has loaded. Once a batch
                                    settles and we're idle the badge hides
                                    until the next prefetch fires, giving a
                                    calmer reading experience during the long
                                    idle gaps between user-driven prefetches.
                                    Anchored next to the reading-progress
                                    label so it sits inside the existing book
                                    frame area without overlapping content. */}
                                {!isStreamComplete && totalProducts > 0 && (loadedCount === 0 || isFetchingNextPage) && (
                                    <span style={{
                                        display: "inline-flex", alignItems: "center", gap: 5,
                                        padding: "2px 7px",
                                        background: "var(--color-surface-raised)",
                                        border: "1px solid var(--color-border)",
                                        borderRadius: 10, color: "var(--color-text-muted)",
                                        fontSize: 9, whiteSpace: "nowrap",
                                    }} aria-live="polite">
                                        <span style={{
                                            width: 6, height: 6, borderRadius: "50%",
                                            background: "#C8A84B", display: "inline-block",
                                            animation: "spin 1.4s linear infinite",
                                            boxShadow: "0 0 4px rgba(200,168,75,0.5)",
                                        }} />
                                        {isAr
                                            ? `تم تحميل ${loadedCount.toLocaleString("ar-SA")} من ${totalProducts.toLocaleString("ar-SA")} منتج`
                                            : `Loaded ${loadedCount.toLocaleString("en")} of ${totalProducts.toLocaleString("en")} products`}
                                    </span>
                                )}
                                <span>{currentPage + 1} / {pages.length}</span>
                            </div>
                        </div>

                        {/* Book container — desk-sitting perspective */}
                        <div style={{
                            boxShadow: "0 8px 40px rgba(0,0,0,0.35), 0 2px 12px rgba(0,0,0,0.2)",
                            borderRadius: 3,
                            perspective: "1200px",
                        }}>
                            <HTMLFlipBook
                                ref={bookRef as React.RefObject<FlipBookRef> & React.Ref<HTMLDivElement>}
                                width={bookWidth}
                                height={bookHeight}
                                size="fixed"
                                minWidth={280}
                                maxWidth={600}
                                minHeight={380}
                                maxHeight={830}
                                showCover={true}
                                usePortrait={isMobile}
                                startPage={0}
                                drawShadow={true}
                                flippingTime={650}
                                maxShadowOpacity={0.5}
                                mobileScrollSupport={true}
                                clickEventForward={true}
                                useMouseEvents={true}
                                swipeDistance={30}
                                showPageCorners={true}
                                disableFlipByClick={false}
                                startZIndex={0}
                                autoSize={false}
                                onFlip={onFlip}
                                className="flipbook"
                                style={{}}
                            >
                                {pages.map((pg, i) => {
                                    if (pg.type === "cover-front")
                                        return <Page key="cover-f" style={{ background: "#0B1A2E" }}><FrontCoverPage lang={lang} /></Page>;
                                    if (pg.type === "about-us-1")
                                        return <Page key="about-1"><AboutUs1Page lang={lang} isDark={isDark} /></Page>;
                                    if (pg.type === "about-us-2")
                                        return <Page key="about-2"><AboutUs2Page lang={lang} isDark={isDark} /></Page>;
                                    if (pg.type === "table-of-contents")
                                        return <Page key="toc"><TocPage categories={categories} categoryPageMap={categoryPageMap} onNavigate={flipTo} lang={lang} isDark={isDark} /></Page>;
                                    if (pg.type === "category-chapter" && pg.category)
                                        return <Page key={`chap-${pg.category.id}`} style={{ background: "#0B1A2E" }}><CategoryChapterPage category={pg.category} count={pg.productCount || 0} chapterNumber={pg.chapterNumber || 1} lang={lang} /></Page>;
                                    if (pg.type === "products") {
                                        // Slot real cards from the streamed buffer; any
                                        // not-yet-loaded positions render as skeletons.
                                        const start = pg.productSliceStart ?? 0;
                                        const end = pg.productSliceEnd ?? start;
                                        const expected = Math.max(0, end - start);
                                        const sliceEnd = Math.min(end, loadedCount);
                                        const slice = sliceEnd > start ? loadedProducts.slice(start, sliceEnd) : [];
                                        const placeholderCount = Math.max(0, expected - slice.length);
                                        return <Page key={`prod-${i}`}><ProductGridPage products={slice} placeholderCount={placeholderCount} pageIndex={i} totalPages={totalPages} onProductClick={setSelectedProduct} lang={lang} isDark={isDark} categoryRef={pg.categoryRef} /></Page>;
                                    }
                                    if (pg.type === "cover-back")
                                        return <Page key="cover-b" style={{ background: "#0B1A2E" }}><BackCoverPage lang={lang} /></Page>;
                                    return (
                                        <Page key={`empty-${i}`}>
                                            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-muted)", fontSize: 13, fontFamily: "inherit" }}>
                                                {t.noProducts}
                                            </div>
                                        </Page>
                                    );
                                })}
                            </HTMLFlipBook>
                        </div>

                        {/* Nav controls */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, direction: "ltr" }}>
                            {navBtn(t.firstPage, goToFirst, <ChevronFirst size={14} />)}
                            {navBtn(t.prevPage, prevPage, <ChevronLeft size={14} />)}
                            <div style={{
                                padding: "4px 14px", background: "var(--color-surface)",
                                border: "1px solid var(--color-border)", borderRadius: 5,
                                fontSize: 11, color: "var(--color-text-secondary)", minWidth: 80, textAlign: "center",
                            }}>
                                {currentPage + 1} / {pages.length}
                            </div>
                            {navBtn(t.nextPage, nextPage, <ChevronRight size={14} />)}
                            {navBtn(t.lastPage, goToLast, <ChevronLast size={14} />)}
                        </div>

                        {/* Category pills */}
                        {categories.filter(c => categoryPageMap[String(c.id)] !== undefined).length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 10, justifyContent: "center", maxWidth: bookWidth }}>
                                {categories.filter(c => categoryPageMap[String(c.id)] !== undefined).map(cat => {
                                    const pg = categoryPageMap[String(cat.id)];
                                    const isActive = currentPage === pg;
                                    return (
                                        <button key={cat.id} onClick={() => flipTo(pg)}
                                            title={isAr ? cat.name_ar : (cat.name_en || cat.name_ar)}
                                            style={{
                                                padding: "3px 8px",
                                                background: isActive ? "rgba(200,168,75,0.12)" : "transparent",
                                                border: `1px solid ${isActive ? "#C8A84B" : "var(--color-border)"}`,
                                                borderRadius: 12, fontSize: 9,
                                                color: isActive ? "#C8A84B" : "var(--color-text-muted)",
                                                cursor: "pointer", fontFamily: "inherit", transition: "all 0.18s",
                                            }}
                                        >
                                            {cat.icon && <span style={{ marginInlineEnd: 3 }}>{cat.icon}</span>}
                                            {isAr ? cat.name_ar : (cat.name_en || cat.name_ar)}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
