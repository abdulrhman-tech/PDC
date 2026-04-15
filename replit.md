# Bayt Alebaa — Product Data Center (PDC)

## Project Overview
Full-stack web application for managing product data, images, and catalogs for building materials (ceramics, marble, furniture, paints, lighting, plumbing).

## Architecture
- **Frontend**: React 18 + TypeScript + Vite (port 5000)
- **Backend**: Django 5.0.4 + Django REST Framework (port 8000)
- **Database**: PostgreSQL on Neon (cloud)
- **Storage**: Cloudflare R2 (S3-compatible)
- **AI**: OpenAI GPT-4o-mini (descriptions + vision analysis), Kie.ai Nano Banana Pro (image generation)
- **Background Removal**: Remove.bg API (rembg optional)
- **Task Queue**: Celery + Redis

## Project Structure
```
data_center/
├── pdc_backend/          # Django backend
│   ├── apps/
│   │   ├── users/        # Auth, roles (super_admin, dept_manager, data_entry)
│   │   ├── products/     # Product catalog management
│   │   ├── categories/   # Hierarchical categories (up to 5 levels, self-referencing) + dynamic attribute schemas
│   │   ├── images/       # Product image management, background removal, decorative generation
│   │   ├── analytics/    # Completeness reports
│   │   ├── approvals/    # Product approval workflow
│   │   ├── logs/         # Audit log
│   │   └── integrations/ # OpenAI, Kie.ai, Cloudflare R2
│   ├── pdc_backend/      # Django settings, urls, wsgi, celery
│   ├── manage.py
│   └── requirements.txt
└── pdc_frontend/         # React frontend
    └── src/
        ├── pages/        # Login, Dashboard, Catalog, Products, Users, Reports, Approvals, AuditLog, Flipbook, DecorativeGenerator
        ├── components/   # Layout, shared components
        ├── store/        # Zustand state (auth, etc.)
        └── api/          # Axios API calls
```

## Running Workflows
- **Start application** — Frontend (Vite) on port 5000
- **Backend API** — Django dev server on port 8000

## Deployment (Render)
- **URL**: `bayt-alebaa-pdc.onrender.com`
- **Config**: `render.yaml` (blueprint)
- **Runtime**: Python 3.14 (Render default) + Node.js (for frontend build)
- **Database driver**: `psycopg[binary]>=3.2.0` (psycopg3 — supports Python 3.14)
- **Build**: `pip install requirements.txt` → `npm install && npm run build` (React SPA)
- **Start**: `migrate` → `collectstatic` → `gunicorn` on `$PORT`
- **Django serves React SPA** via WhiteNoise (`WHITENOISE_ROOT` points to `pdc_frontend/dist`)
- **Database reads `DATABASE_URL`** (Render standard) with `NEON_DATABASE_URL` fallback (Replit)

## Environment Variables (configured)
- `DATABASE_URL` / `NEON_DATABASE_URL` — Neon PostgreSQL connection string (Django reads DATABASE_URL first, falls back to NEON_DATABASE_URL)
- `DJANGO_SETTINGS_MODULE` — pdc_backend.settings.development (local) / pdc_backend.settings.production (Render)
- `SECRET_KEY` — Django secret key
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT_URL`, `R2_TOKEN`
- `REMOVEBG_API_KEY` — Remove.bg API key
- `OPENAI_API_KEY` — OpenAI API key (GPT-4o-mini for descriptions + vision)
- `KIE_AI_API_KEY` — Kie.ai API key (Nano Banana Pro for decorative image generation)
- `REDIS_URL` — Redis (defaults to localhost)

## Default Admin Credentials
- **Email**: admin@baytalebaa.com
- **Password**: PDC@2025Admin!

## Key Features
- Role-based access (super_admin, dept_manager, data_entry)
- 6 product categories with dynamic attribute schemas
- Product image upload + background removal (Remove.bg API fallback)
- Product approval workflow
- Gemini AI for product descriptions
- Audit logging
- Interactive Flipbook catalog (`/flipbook`) — public page with react-pageflip, category dividers, product pages (4 per page), navigation controls, fullscreen mode
- Decorative image generation (`/decorative-generator`) — admin-only wizard with 3 generation modes auto-detected by AI: **Surface mode** (tiles/parquet/wallpaper → composited on floor/wall), **Product mode** (faucets/showers/furniture → placed in realistic scene), **Showcase mode** (adhesive/grout/profiles → professional studio photography). Flow: upload image → OpenAI vision analysis (type/color/pattern/surface + auto-detects mode & placement) → mode-specific settings with room templates → Kie.ai generates → download result
- **Multi-product scene generation** — combine 2–4 products into one cohesive decorative scene. Each product has a role (floor/wall/focal/accent). Flow: add slots → upload/pick images per slot → batch OpenAI analysis → unified Kie.ai generation with multiple reference images. Endpoints: `analyze-multi/`, `generate-multi/`. Model fields: `is_multi_product`, `multi_product_data` (JSONField with per-slot role/image/analysis). Frontend: `MultiProductGenerator.tsx` component accessible via "مشهد متعدد المنتجات" button on decorative generator page.
- Fully responsive UI (mobile drawer sidebar, adaptive grids, responsive typography)

## Responsive Design
- **Layout**: `useIsMobile()` hook (breakpoint 1024px). Desktop: collapsible sidebar 260px/64px. Mobile: hamburger drawer with overlay
- **CSS Utility Classes**: `resp-kpi-grid`, `resp-2col`, `resp-2col-reverse`, `resp-grid-auto`, `resp-grid-sidebar`, `resp-quick-actions`, `resp-filters-bar`
- **Breakpoints**: 1024px (tablet — sidebar hides, grids collapse), 640px (mobile — single column, smaller type/padding), 480px (ultra-narrow — abbreviated labels)
- **Data tables**: horizontal scroll via `overflow-x: auto` on wrapper
- **Catalog page mobile**: Header shrinks (shorter buttons, hidden subtitle), search/tabs/filters padding tightens, view mode switcher hidden on ≤480px, product overlay always visible on mobile (no hover needed), category tabs use smaller font/padding
- **View mode switcher**: 2/3/4/5 column toggle, localStorage persisted, responsive capping (≤480→1col, ≤640→2col, ≤1024→3col). Disabled options hidden on mobile
- **Product management**: Header wraps on narrow screens, filter bar uses flex-wrap

## Typography
- **Primary font**: 29LT Bukra (Arabic commercial font) — Light (300), Regular (400), Bold (700), Bold Italic
- **Font files**: `src/fonts/29LTBukra-*.ttf` loaded via `@font-face` in `index.css`
- **Fallback**: Readex Pro (Google Fonts) → sans-serif
- **Monospace**: JetBrains Mono (Google Fonts)
- **CSS variables**: `--font-arabic`, `--font-latin`, `--font-display` all use 29LT Bukra primary

## Dark/Light Theme
- **Theme toggle** via `useThemeStore` (Zustand, localStorage persisted as `pdc-theme`). Applied as `data-theme` attribute on `<html>`
- **Dark theme (default)**: `--color-bg: #0d1520`, `--color-surface: #161f2a`, `--color-surface-raised: #1a2636`, `--color-surface-hover: #1e2d3d`
- **Light theme** (`[data-theme="light"]`): `--color-bg: #F5F1EB`, `--color-surface: #FFFFFF`, `--color-surface-raised: #FAF8F4`, `--color-surface-hover: #F0EDE6`
- **Text tokens**: `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`, `--color-text-inverse`
- **Borders**: `--color-border`, `--color-border-strong`
- **Brand accent**: `--color-gold` (dark: `#C8A84B`, light: `#B8952F`), `--color-gold-light`, `--color-gold-hover`
- **Logo filter**: `--logo-filter` (dark: `brightness(0) invert(1)`, light: `none`)
- **Semantic colors**: `--color-blue`, `--color-green`, `--color-orange`, `--color-red`, `--color-purple`, `--color-yellow`
- **Shadow**: `--shadow-lg` varies by theme
- **Sidebar stays dark** in both modes for brand consistency
- **Theme-unified pages**: ProductCatalog, ProductDetail, Dashboard, Reports, ProductSubmissions, UserManagement, ProductManagement, Login, CatalogGenerator, Categories, Approvals, Settings — all use CSS variables
- **Theme-unified components**: Layout, ImageManager, ProductLogsModal — all use CSS variables
- No hardcoded `rgba(255,255,255,...)`, `#fff`, `#C8A84B`, or dark hex backgrounds remain except decorative gradients on login brand panel and catalog PDF preview themes

## Onboarding Experience
- **Cinematic onboarding** shown once on first visit to `/catalog` (localStorage key: `baytalebaa_onboarding_seen`)
- **3 stages**: Splash (navy gradient + floating bubbles + white logo + tagline + CTA) → Cinematic Tour (3 fullscreen videos with Arabic overlays + white flash transitions) → Welcome (warm beige + original logo + "ابدأ الجولة")
- **Components**: `src/components/onboarding/` — OnboardingFlow, SplashScreen, CinematicTour, WelcomeTransition, SkipButton
- **Videos**: `public/videos/ceramic.mp4`, `sanitary.mp4`, `decorative.mp4`
- **Animation library**: framer-motion (AnimatePresence for stage transitions)
- **Reset button**: Hidden at bottom of catalog page ("إعادة عرض الترحيب") — clears localStorage and reloads
- **Brand colors**: Navy #1B3D4F, Navy Dark #0F2530, Teal-light #2A5A75, Warm Beige #F5F1EA

## Notes
- `rembg` is optional — not in requirements.txt. Uses Remove.bg API as fallback.
- `apps.catalog_gen` module referenced in original code but not yet implemented — removed from INSTALLED_APPS and URLs.
- `GEMINI_API_KEY` not yet configured — needs a real Google AI key.
- **GitHub repo**: `github.com/abbodebaz/datacenter.git` — clean history (no secrets in commits)
- **Services page**: `/catalog/services` — 6 cards (PDF catalog, AI descriptions, background removal, decorative generator, branches, contact)
- **Branches page**: `/branches` — 12 branches with region filter
- **Contact page**: `/contact` — phone/WhatsApp/email + social media
- **SAP Integration page**: `/sap-integration` — admin-only page for connecting to SAP OData APIs. Phase 1: hierarchy tree view (fetch, display, search/filter, sync to local DB). Backend: `apps/integrations/sap_service.py` + `sap_views.py` + `sap_urls.py`. Endpoints: `GET /api/v1/sap/test-connection/`, `GET /api/v1/sap/diagnose/`, `GET /api/v1/sap/hierarchy/`, `POST /api/v1/sap/hierarchy/sync/`. Env vars: `SAP_USERNAME`, `SAP_PASSWORD`, `SAP_ACTIVE_ENV` (DEV/PRD), `SAP_PROXY_URL` (optional Cloudflare Worker proxy), `SAP_PROXY_SECRET` (shared secret for proxy auth). Cloudflare Worker reference: `apps/integrations/cloudflare-worker.js`. Product endpoints: `get_product()`, `get_products_by_date()` (prepared for Phase 2)
