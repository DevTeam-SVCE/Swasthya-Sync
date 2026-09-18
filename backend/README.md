# SwasthyaSync local API

Copy `.env.example` to `.env`, set `DATABASE_URL` and a private `JWT_SECRET`, then install and run:

```powershell
npm install
npm run seed
npm run dev
```

The API listens on `http://localhost:5000`. Development seed credentials:

- Admin: `admin@swasthyasync.com` / `admin123`
- Staff: `staff@swasthyasync.com` / `staff123`

These credentials are for local development only.
