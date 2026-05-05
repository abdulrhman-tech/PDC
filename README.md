# مركز بيانات المنتجات — Bayt Alebaa PDC

نظام إدارة بيانات المنتجات لشركة بيت الإباء.  
Django REST API + React/Vite Frontend + Neon PostgreSQL + Cloudflare R2.

---

## المتطلبات

| الأداة | الإصدار |
|--------|---------|
| Python | 3.12+ |
| Node.js | 20+ |
| PostgreSQL | 16+ (Neon مُوصى به) |
| Redis | 7+ (Upstash مُوصى به) |

---

## الإعداد المحلي (Development)

### 1. استنساخ المشروع
```bash
git clone https://github.com/abbodebaz/datacenter.git
cd datacenter
```

### 2. إعداد متغيرات البيئة
```bash
cp data_center/pdc_backend/.env.example data_center/pdc_backend/.env
# افتح الملف وضع القيم الحقيقية
```

### 3. تثبيت المكتبات
```bash
# Backend
cd data_center/pdc_backend
pip install -r requirements.txt

# Frontend
cd ../pdc_frontend
npm install
```

### 4. تهيئة قاعدة البيانات
```bash
cd data_center/pdc_backend
python manage.py migrate
python manage.py createsuperuser
```

### 5. تشغيل المشروع
```bash
# Backend (terminal 1)
cd data_center/pdc_backend
DJANGO_SETTINGS_MODULE=pdc_backend.settings.development python manage.py runserver 0.0.0.0:8000

# Frontend (terminal 2)
cd data_center/pdc_frontend
npm run dev
```

---

## النشر على الإنتاج (Production)

### متغيرات البيئة المطلوبة

ضع هذه المتغيرات في منصة الاستضافة (Railway / Render / إلخ):

```
DJANGO_SETTINGS_MODULE=pdc_backend.settings.production
SECRET_KEY=<مفتاح عشوائي 50 حرف+>
DEBUG=False
ALLOWED_HOSTS=*

NEON_DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require
REDIS_URL=rediss://default:pass@host.upstash.io:6379

R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
R2_ENDPOINT_URL=https://xxx.r2.cloudflarestorage.com
R2_PUBLIC_URL=https://your-r2-domain.com

OPENAI_API_KEY_PDC=sk-proj-...
GEMINI_API_KEY=...
REMOVEBG_API_KEY=...

SAP_USERNAME=...
SAP_PASSWORD=...
SAP_PROXY_URL=...
SAP_PROXY_SECRET=...
```

> راجع `data_center/pdc_backend/.env.example` للقائمة الكاملة.

### أوامر البناء

```bash
# بناء الـ Frontend
cd data_center/pdc_frontend && npm install && npm run build

# جمع الملفات الثابتة (Django)
cd data_center/pdc_backend
DJANGO_SETTINGS_MODULE=pdc_backend.settings.production python manage.py collectstatic --noinput
python manage.py migrate --noinput
```

### تشغيل الإنتاج
```bash
cd data_center/pdc_backend
gunicorn pdc_backend.wsgi:application --bind 0.0.0.0:$PORT --workers 2 --timeout 120
```

---

## هيكل المشروع

```
datacenter/
├── data_center/
│   ├── pdc_backend/          # Django REST API
│   │   ├── apps/
│   │   │   ├── analytics/    # تقارير الاكتمال
│   │   │   ├── approvals/    # نظام الموافقات
│   │   │   ├── categories/   # إدارة التصنيفات
│   │   │   ├── images/       # إدارة الصور
│   │   │   ├── integrations/ # SAP + R2
│   │   │   ├── logs/         # سجل العمليات
│   │   │   ├── products/     # إدارة المنتجات
│   │   │   ├── projects/     # مشاريعنا
│   │   │   ├── settings_app/ # إعدادات النظام
│   │   │   └── users/        # إدارة المستخدمين
│   │   └── pdc_backend/
│   │       └── settings/
│   │           ├── base.py
│   │           ├── development.py
│   │           └── production.py
│   └── pdc_frontend/         # React + Vite
│       └── src/
│           ├── api/
│           ├── pages/
│           └── components/
├── Procfile                  # إعداد Heroku/Railway
├── nixpacks.toml             # إعداد Nixpacks
└── build.sh                  # سكريبت البناء
```

---

## ملاحظات مهمة

- **قاعدة البيانات**: يستخدم النظام Neon PostgreSQL — اضبط `NEON_DATABASE_URL` كمتغير بيئة في منصة الاستضافة.
- **الكاش**: Upstash Redis مُوصى به للـ serverless — اضبط `REDIS_URL`.
- **الصور**: مخزنة على Cloudflare R2 — اضبط متغيرات `R2_*`.
- **الإعدادات**: تأكد دائماً من ضبط `DJANGO_SETTINGS_MODULE=pdc_backend.settings.production` في الإنتاج.
