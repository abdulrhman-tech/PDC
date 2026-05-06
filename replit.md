# Bayt Alebaa — Product Data Center (PDC)

A full-stack web application for managing building material product data, images, and catalogs.

## Run & Operate

**Required Environment Variables:**
- `DATABASE_URL` / `NEON_DATABASE_URL`
- `DJANGO_SETTINGS_MODULE`
- `SECRET_KEY`
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT_URL`, `R2_TOKEN`
- `REMOVEBG_API_KEY`
- `OPENAI_API_KEY`
- `KIE_AI_API_KEY`
- `REDIS_URL`
- `SAP_USERNAME`, `SAP_PASSWORD`, `SAP_ACTIVE_ENV`, `SAP_PROXY_URL`, `SAP_PROXY_SECRET`

**Commands:**
- **Run Frontend**: `npm run dev` (Vite, port 5000)
- **Run Backend**: `python manage.py runserver` (Django, port 8000)
- **Build Frontend**: `npm install && npm run build`
- **Run Migrations**: `python manage.py migrate`
- **Collect Static Files**: `python manage.py collectstatic`

## Stack

- **Frontend**: React 18, TypeScript, Vite
- **Backend**: Django 5.0.4, Django REST Framework, Celery, Redis
- **Database**: PostgreSQL (Neon)
- **Storage**: Cloudflare R2
- **AI**: OpenAI GPT-4o-mini, Kie.ai Nano Banana Pro
- **Image Processing**: Remove.bg API
- **State Management**: Zustand
- **Build Tool**: Vite

## Where things live

- **Django Backend**: `data_center/pdc_backend/`
    - Apps: `apps/users/`, `apps/products/`, `apps/categories/`, `apps/images/`, `apps/analytics/`, `apps/approvals/`, `apps/logs/`, `apps/integrations/`
    - Settings: `pdc_backend/settings/`
- **React Frontend**: `data_center/pdc_frontend/src/`
    - Pages: `pages/`
    - Components: `components/`
    - State: `store/`
    - API Calls: `api/`
- **Database Schema**: Managed by Django models (source of truth is the models themselves)
- **API Contracts**: Defined by Django REST Framework serializers and views
- **Theme Files**: `data_center/pdc_frontend/src/index.css` (CSS variables for themes)
- **Fonts**: `data_center/pdc_frontend/src/fonts/`
- **SAP Integration Logic**: `apps/integrations/sap_service.py`, `sap_views.py`, `sap_urls.py`

## Architecture decisions

- **Dual-stack approach (React + Django)**: Decoupled frontend for rich UI/UX with Django serving as a robust API backend and static file server for the built React app.
- **Microservice-like apps within Django**: Logical separation of concerns into distinct Django apps (e.g., `users`, `products`, `images`) for modularity and maintainability.
- **Cloud-native services**: Leveraging Neon for PostgreSQL, Cloudflare R2 for object storage, and Render for deployment to ensure scalability and reduce operational overhead.
- **AI-driven features**: Integration of OpenAI and Kie.ai for advanced functionalities like product descriptions, vision analysis, and decorative image generation, embedding AI directly into core workflows.
- **Multi-layered caching strategy**: Redis/LocMemCache for category data and `psycopg3` connection pooling with `conn_max_age` for database performance, crucial for high-traffic scenarios.

## Product

- Role-based access for super admins, department managers, and data entry personnel.
- Comprehensive product catalog management with dynamic attribute schemas and hierarchical categories.
- Advanced image management including upload, background removal, and AI-powered decorative image generation (single, multi-product scenes, dual-product mixing).
- Product approval workflow and detailed audit logging.
- Interactive Flipbook catalog for public product browsing.
- Bulk operations: image upload by SKU, SAP-format Excel product import with intelligent attribute mapping, and bulk attribute schema translation.
- Fully responsive design with dark/light theme support.
- Cinematic onboarding experience for new users.
- "Our Projects" module for managing projects and associating products.

## User preferences

- _Populate as you build_

## Gotchas

- When importing SAP files, ensure `Material_No.Material Group No` values precisely match `Category.code` for proper category linking; unmatched rows will be rejected.
- The `CompletenessReportViewSet.live` endpoint scans all products by default (active + draft). To filter by status, explicitly use the `?status=` query parameter.
- `GEMINI_API_KEY` is not yet configured. Translation falls back to OpenAI if Gemini is unavailable or errors out.
- For `Dual same-category mixing`, a soft warning is shown if products from different categories are selected but does not block generation.

## Pointers

- **Django Documentation**: `https://docs.djangoproject.com/`
- **React Documentation**: `https://react.dev/docs`
- **Django REST Framework**: `https://www.django-rest-framework.org/`
- **Vite Documentation**: `https://vitejs.dev/guide/`
- **Zustand Documentation**: `https://docs.pmnd.rs/zustand/getting-started/introduction`
- **Celery Documentation**: `https://docs.celeryq.dev/en/stable/`
- **PostgreSQL Documentation**: `https://www.postgresql.org/docs/`
- **Cloudflare R2 Documentation**: `https://developers.cloudflare.com/r2/`
- **OpenAI API Documentation**: `https://platform.openai.com/docs/`
- **Render Deployment Documentation**: `https://render.com/docs/`
- **GitHub Repository**: `github.com/abbodebaz/datacenter.git`