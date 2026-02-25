# Water Landing Page — Setup Guide

Personalized water quality landing pages that are auto-generated when a job is scheduled in your CRM.

## How It Works

```
CRM Job Scheduled
    ↓
Zapier fires webhook → POST /api/create-report
    ↓
Supabase stores client record, returns unique URL
    ↓
Zapier sends SMS: "Hi Sarah, here's your water report: yourdomain.com/report?id=a1b2c3d4"
    ↓
Client clicks link → page loads their name, address, map, contaminants
```

---

## Step 1: Set Up Supabase (5 min)

1. Go to [supabase.com](https://supabase.com) and create a free project
2. Open the **SQL Editor** and run this to create your tables:

```sql
-- Table for personalized reports (created by Zapier)
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  phone TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  viewed BOOLEAN DEFAULT FALSE
);

-- Table for your existing customers (import from spreadsheet)
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  city TEXT,
  install_date DATE
);

-- Allow public read access to reports (for the landing page)
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON reports FOR SELECT USING (true);

-- Allow public read access to customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON customers FOR SELECT USING (true);
```

3. Go to **Settings > API** and copy:
   - `Project URL` → this is your `NEXT_PUBLIC_SUPABASE_URL`
   - `anon / public key` → this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role key` → this is your `SUPABASE_SERVICE_ROLE_KEY`

## Step 2: Import Your Customer Spreadsheet

Your existing customer addresses need lat/lng coordinates for the map. Here's how:

1. **Geocode your addresses** (convert addresses to lat/lng):
   - Easiest: Use [geocod.io](https://geocod.io) — upload CSV, costs about $0.50/1000 addresses
   - Free: Use a Google Sheets geocoding add-on
   - Your CSV should end up with columns: `lat`, `lng`, `city`, `install_date`

2. **Import into Supabase**:
   - Go to **Table Editor > customers > Import Data**
   - Upload your CSV
   - Map columns to match

## Step 3: Get a Mapbox Token (2 min)

1. Go to [mapbox.com](https://www.mapbox.com) and create a free account
2. Copy your **default public token** from the dashboard
3. This is your `NEXT_PUBLIC_MAPBOX_TOKEN`

(The page works without Mapbox too — it shows an animated CSS fallback map)

## Step 4: Deploy to Vercel (5 min)

1. Push this project to a GitHub repo
2. Go to [vercel.com](https://vercel.com) > **New Project** > Import your repo
3. In **Environment Variables**, add all the values from `.env.local.example`
4. Click **Deploy**
5. Your site is now live at `your-project.vercel.app`

## Step 5: Set Up the Zapier Workflow

### Trigger: Job Scheduled in CRM
Choose your CRM as the trigger app, event = "New Job Scheduled" (or equivalent)

### Action 1: Webhooks by Zapier > POST
- **URL**: `https://your-vercel-domain.com/api/create-report`
- **Headers**:
  - `Authorization`: `Bearer YOUR_API_SECRET`
  - `Content-Type`: `application/json`
- **Data** (map from CRM fields):
  - `client_name`, `address`, `city`, `state`, `zip`, `phone` (optional), `lat`/`lng` (optional)

### Action 2: Send SMS via Your Texting App
- **To**: Client phone from CRM
- **Message**: Include the `url` from the webhook response in Action 1

---

## Connecting Your Water API

Open `lib/water-api.ts` and uncomment the real API section. Map your API's response fields to the `ContaminantData` interface.

---

## File Structure

```
water-landing/
├── app/
│   ├── layout.tsx          ← Root layout with fonts
│   ├── page.tsx            ← Homepage (generic message)
│   ├── globals.css         ← All styles
│   ├── report/page.tsx     ← The personalized landing page
│   └── api/create-report/route.ts  ← API endpoint Zapier calls
├── components/
│   └── MapSection.tsx      ← Interactive map (Mapbox + CSS fallback)
├── lib/
│   ├── supabase.ts         ← Database client
│   ├── water-api.ts        ← Your water contaminant API (edit this)
│   └── customers.ts        ← Nearby customer lookup
├── .env.local.example      ← Copy to .env.local and fill in
└── package.json
```

## Customization

- **Your company name**: Search for "Pure Water Solutions" and replace
- **CTA link**: Update the `href` on the CTA button in `app/report/page.tsx`
- **Testimonials**: Replace the mock testimonials with real ones
- **Colors**: Edit CSS variables at the top of `globals.css`
- **Map radius**: Change `radiusMiles` in `lib/customers.ts` (default: 3 miles)
