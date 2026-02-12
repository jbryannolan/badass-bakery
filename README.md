# Badass Bakery 🫏 — Version 5.1 (Email Fix)

Fixed the email CORS issue by using a Vercel serverless function.

---

## ⚠️ IMPORTANT: Update Environment Variable Names

In Vercel, you need to **rename** your environment variables (remove the `VITE_` prefix):

**Old (delete these):**
- `VITE_RESEND_API_KEY`
- `VITE_THERESA_EMAIL`

**New (add these):**
- `RESEND_API_KEY`
- `THERESA_EMAIL`

The serverless function runs on the server side, so it doesn't need the `VITE_` prefix.

---

## Steps

1. Go to **Vercel → Settings → Environment Variables**
2. Delete `VITE_RESEND_API_KEY` and `VITE_THERESA_EMAIL`
3. Add `RESEND_API_KEY` with your Resend API key
4. Add `THERESA_EMAIL` with Theresa's email
5. Upload all files from this zip to GitHub
6. Vercel will auto-redeploy

---

## What Changed

Added an `/api/send-email.js` file — this is a Vercel "serverless function" that runs on the server (not in the browser), so it can call Resend's API without CORS issues.

The frontend now calls `/api/send-email` instead of calling Resend directly.

---

## Database SQL (if not already done)

```sql
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS is_fulfilled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false;
```

---

## Admin Access

- Click "Admin" in top right
- Password: `theresa`
