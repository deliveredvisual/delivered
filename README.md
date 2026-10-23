# Delivered Visual

Private photo and film delivery for B2B clients. Each shoot gets a private link where the client can browse
photos by set, tick their selects, download in the size they need, and review films with timecoded comments.

Runs entirely on Cloudflare: the app on Workers, the database on D1, files on R2.

## What it does

**For clients** (`/p/<link>`)
- The link opens a landing page: cover photo, your note, films pinned at the top, then every photo in high
  resolution. Per project you choose the layout (collage, masonry, grid, large), background colour, spacing, cover
  whether photos are split into sections by folder, and whether the
  title and date sit over a darkened cover
- "Select & download" leads to the working gallery (`/p/<link>/gallery`), which switches between a picture grid and a plain
  file list (thumbnail, name, folder, size, per-file downloads)
- Messages: one chat per project shared by the studio and everyone on the client side, on every client page and on
  your project page. Photos, and films at an exact moment, can be pinned into messages; clicking a pin opens it
- Clients can make their own folders to sort photos (a photo can be in several); you see them on your project page
- Add a client organisation to a delivery by anyone's email there (project page → Clients). Past clients are
  suggested as you type
- Optional password per delivery; archived automatically after 365 days
- Photos grouped into your folders, lightbox with keyboard controls (← → P Esc)
- Personal selects for every person on the client side, plus a "Team selects" view
- Downloads as ZIP: full resolution, web (2560px), RAW originals
- Usage licence shown on every delivery
- Films with versions (v1, v2…), comments pinned to a timecode, resolve, approve
- NDA mode: confidential notice, right-click saving disabled

**Accounts and organisations** (`/signup`, `/login`, `/team`)
- Every account belongs to an organisation (a studio, or a client company like McLaren) with a team. Anyone in it
  can invite colleagues with a one-use link (14 days); the owner manages the team and settings.
- Each organisation can have two dashboards, switched at the top of every page:
  - **Creative** (`/admin`): make and send deliveries. Turning it on waits for the site owner's approval at
    `/admin/studios` (Approvals), so nobody uploads to your storage without your say-so.
  - **Client** (`/me`): deliveries shared with the organisation. Turns on instantly.
  The one chosen at sign-up is on to begin with; the other is turned on from the Team page. The switch only
  appears once both are on.
- Deliveries are shared with whole organisations: add anyone's email on a project (Clients box) and everyone there,
  including later joiners, sees it without the link or password. A delivery opened while signed in is saved too.
  Plain links keep working without an account.
- Someone alone in their own organisation who accepts an invite moves across with their deliveries.
- Each organisation sees only its own projects, uploads and files.
- The original `ADMIN_PASSWORD` still signs you into the main studio as a backup.
- Not built yet: email verification and "forgot password" (both need an email-sending service).

**For you** (`/admin`)
- Projects list with time left and latest client activity
- Drag-and-drop upload of JPEGs and RAWs; RAWs pair with their JPEG by file name
- Files of any size: uploads go up in 32 MB chunks; previews and thumbnails are made in your browser
- Drag photos into order (or sort by file name / upload order, or move a selection to the start or end);
  clients see that order everywhere
- Each project page has tabs: Photos, Films, Clients, Landing page, History, Settings
- Folders for photos (create one while moving photos), see what each client picked and how they sorted them
- History (`/admin/history`, and per project): every change by the studio (uploads, moves, folders, settings,
  landing page, films, extending, new links) and everything clients do (views, selects, folders, comments,
  approvals, messages, downloads), filterable by Clients / Studio. Quick repeats merge into one line
- Landing page settings per project, with a preview link
- Extend, archive, restore, or change the link

## Deploying (no terminal needed)

You'll do these once in the Cloudflare dashboard.

1. **Workers plan.** Workers & Pages → Plans → choose **Workers Paid** ($5/month). The free plan's CPU limit is too
   tight for the app.
2. **Database.** Storage & Databases → D1 → **Create database** → name it `delivered-visual`. Copy the
   **Database ID** and send it to Claude, who puts it into `wrangler.jsonc` and pushes.
3. **File storage.** R2 → **Create bucket** → name it `delivered-visual-files`, location Automatic.
   (R2 needs a payment method on the account; storage is $0.015 per GB-month and downloads are free.)
4. **Connect the code.** Workers & Pages → Create → **Import a repository** → GitHub → `deliveredvisual/delivered`.
   - Project name: `delivered-visual`
   - Build command: `npx opennextjs-cloudflare build`
   - Deploy command: `npx wrangler d1 migrations apply DB --remote && npx opennextjs-cloudflare deploy`
5. **Secrets.** In the new Worker → Settings → Variables and Secrets → add two **Secrets**:
   - `ADMIN_PASSWORD`: the password you'll sign in with
   - `SESSION_SECRET`: a long random string, 40+ characters (generate one in your password manager)
6. **Domain.** Worker → Settings → Domains & Routes → Add → Custom domain → `deliveredvisual.com`.

Every push to `main` then deploys automatically. Sign in at `https://deliveredvisual.com/login`.

To change the studio name or contact email shown to clients, sign in and go to **Team**.

## Running it locally

```bash
npm install
cp .dev.vars.example .dev.vars     # set ADMIN_PASSWORD and SESSION_SECRET
npm run db:migrate:local
npm run dev                         # http://localhost:3000
npm run preview                     # the production build in the Workers runtime, http://localhost:8787
```

## How it's put together

| Part | Where |
| --- | --- |
| Database schema | `src/db/schema.ts`, migrations in `drizzle/` (`npm run db:generate` after schema changes) |
| Accounts, studios, sign-in, client access | `src/lib/auth.ts` |
| Sign-up, sign-in, client dashboard, team, approvals, header switch | `src/app/signup/`, `src/app/login/`, `src/app/me/`, `src/app/team/`, `src/app/admin/studios/`, `src/components/app-header.tsx` |
| File serving with access checks and video seeking | `src/app/api/file/route.ts` |
| Chunked uploads into R2 | `src/app/api/admin/upload/route.ts`, browser side in `src/lib/upload-client.ts` |
| Browser-side ZIPs | `src/lib/zip-client.ts` |
| Admin screens | `src/app/admin/` |
| History log and its page | `src/lib/history.ts`, `src/components/history-panel.tsx`, `src/app/admin/history/` |
| Client landing page, gallery and film review | `src/app/p/[slug]/` (`page.tsx` landing, `gallery/`, `film/`) |
| Chat panel, pins, client folders | `src/app/p/[slug]/client-shell.tsx`, `src/lib/chat.ts`, `src/app/api/p/[slug]/` |

Files in R2 live under `p/<projectId>/…`, which is how every request is checked against its project.

## Not built yet

- Moving archived projects to cheaper storage and offering a single archive ZIP on request
- Watermarked previews burned into the image (NDA mode currently uses a notice and blocks right-click)
- Embedding the licence and credit in each file's metadata
- Email notifications when a client picks, comments or approves
- Accounts for other photographers (needed before selling it as a product)
