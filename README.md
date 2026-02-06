# mindrepcrm

## Setup

1. Create a Supabase project.
2. Get your anon key:
   - Supabase Dashboard → Project Settings → API → `anon` public key.
3. Create a `.env` file:

```env
VITE_SUPABASE_URL=https://yhpmyvhaxjbfsxuahdqd.supabase.co
VITE_SUPABASE_ANON_KEY=PASTE_YOUR_ANON_KEY
```

4. Apply migrations in `supabase/migrations` to your Supabase project.

Notes:
- This app uses a simple local password and does not use Supabase Auth.
- The latest migration disables RLS on `leads` and `lead_fields` to allow anon access.
