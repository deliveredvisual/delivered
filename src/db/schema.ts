import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

/** A delivery: one shoot for one client. Clients reach it through its private `slug` link. */
/**
 * An organisation: a creative studio, a client company like McLaren, or both. Everyone with a sign-in belongs to
 * one, with their colleagues. (Called "studios" in the code for history's sake.)
 *  - creative: can make and send deliveries. Needs the site owner's approval (`status`) before it can upload.
 *  - client: has a dashboard of deliveries sent to the organisation.
 */
export const studios = sqliteTable("studios", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().default(""), // shown to clients as the contact address
  status: text("status", { enum: ["active", "pending"] }).notNull().default("pending"), // approval of the creative side
  creative: integer("creative", { mode: "boolean" }).notNull().default(true),
  client: integer("client", { mode: "boolean" }).notNull().default(false),
  primaryView: text("primary_view", { enum: ["creative", "client"] }).notNull().default("creative"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** Anyone with a sign-in. `kind` is only which way they signed up; what they can do comes from their organisation. */
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(), // stored lower-case
    name: text("name").notNull(),
    company: text("company").notNull().default(""),
    kind: text("kind", { enum: ["creative", "client"] }).notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("users_email").on(t.email)],
);

/** Who is in which organisation. The owner manages the team and settings; members do everything else. */
export const memberships = sqliteTable(
  "memberships",
  {
    studioId: text("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("memberships_unique").on(t.studioId, t.userId), index("memberships_user").on(t.userId)],
);

/** One-off links anyone in an organisation can send to bring a colleague in. */
export const invites = sqliteTable(
  "invites",
  {
    token: text("token").primaryKey(),
    studioId: text("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    usedBy: text("used_by"),
  },
  (t) => [index("invites_studio").on(t.studioId)],
);

/** Deliveries shared with an organisation's client dashboard: everyone in it sees them, including later joiners. */
export const orgDeliveries = sqliteTable(
  "org_deliveries",
  {
    orgId: text("org_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    addedBy: text("added_by"), // who at the sending studio added them; null when they saved it from the link
    savedAt: integer("saved_at", { mode: "timestamp_ms" }).notNull(),
    openedAt: integer("opened_at", { mode: "timestamp_ms" }), // last time anyone in the organisation opened it
  },
  (t) => [uniqueIndex("org_deliveries_unique").on(t.orgId, t.projectId), index("org_deliveries_project").on(t.projectId)],
);

/** Failed sign-ins, to slow down password guessing. */
export const signinFailures = sqliteTable(
  "signin_failures",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    at: integer("at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("signin_failures_email").on(t.email, t.at)],
);

export const DEFAULT_STUDIO_ID = "studio_default";

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    studioId: text("studio_id").notNull().default(DEFAULT_STUDIO_ID),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    clientName: text("client_name").notNull().default(""),
    category: text("category").notNull().default(""),
    shotDate: text("shot_date"), // ISO date (YYYY-MM-DD)
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    passwordHash: text("password_hash"), // null = link alone opens it
    nda: integer("nda", { mode: "boolean" }).notNull().default(false),
    rawEnabled: integer("raw_enabled", { mode: "boolean" }).notNull().default(false),
    licenceUsage: text("licence_usage").notNull().default(""),
    licenceTerritory: text("licence_territory").notNull().default(""),
    licenceTerm: text("licence_term").notNull().default(""),
    licenceCredit: text("licence_credit").notNull().default(""),
    licenceTerms: text("licence_terms").notNull().default(""),
    // Landing page (what the client sees first)
    landingLayout: text("landing_layout", { enum: ["collage", "masonry", "grid", "large"] }).notNull().default("collage"),
    landingBg: text("landing_bg").notNull().default("#ffffff"),
    landingCoverId: text("landing_cover_id"), // a photo id; null = first photo
    landingIntro: text("landing_intro").notNull().default(""),
    landingSpacing: text("landing_spacing", { enum: ["tight", "normal", "airy"] }).notNull().default("normal"),
    landingGroupFolders: integer("landing_group_folders", { mode: "boolean" }).notNull().default(true),
    landingTitleOnCover: integer("landing_title_on_cover", { mode: "boolean" }).notNull().default(false),
    landingCoverDim: integer("landing_cover_dim").notNull().default(35), // percent of darkening when the title is on the cover
  },
  (t) => [uniqueIndex("projects_slug").on(t.slug), index("projects_studio").on(t.studioId)],
);

/** The studio's folders inside a project, e.g. Track, Static, Details. (Called "sets" in the code, "Folders" on screen.) */
export const sets = sqliteTable(
  "sets",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("sets_project").on(t.projectId)],
);

/** One delivered photo. Keys point at objects in the R2 bucket. */
export const photos = sqliteTable(
  "photos",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    setId: text("set_id").references(() => sets.id, { onDelete: "set null" }),
    filename: text("filename").notNull(), // e.g. AP_0412.jpg
    width: integer("width"),
    height: integer("height"),
    size: integer("size").notNull().default(0),
    originalKey: text("original_key"), // full-resolution JPEG/TIFF
    previewKey: text("preview_key"), // 2560px long edge, for the lightbox and "Web" downloads
    thumbKey: text("thumb_key"), // 800px long edge, for the grid
    rawKey: text("raw_key"), // camera RAW, paired by file name
    rawSize: integer("raw_size").notNull().default(0),
    sort: integer("sort").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("photos_project").on(t.projectId), index("photos_set").on(t.setId)],
);

/** A film (e.g. "Launch film", "Social cutdown"); each upload is a new version. */
export const films = sqliteTable(
  "films",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    aspect: text("aspect").notNull().default("16:9"),
    sort: integer("sort").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("films_project").on(t.projectId)],
);

export const filmVersions = sqliteTable(
  "film_versions",
  {
    id: text("id").primaryKey(),
    filmId: text("film_id").notNull().references(() => films.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    fileKey: text("file_key"),
    posterKey: text("poster_key"),
    filename: text("filename").notNull().default(""),
    size: integer("size").notNull().default(0),
    duration: integer("duration"), // seconds
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    approvedAt: integer("approved_at", { mode: "timestamp_ms" }),
    approvedBy: text("approved_by"),
  },
  (t) => [index("versions_film").on(t.filmId)],
);

/** Timecode comments on a film version, from the client or from Alec. */
export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    versionId: text("version_id").notNull().references(() => filmVersions.id, { onDelete: "cascade" }),
    author: text("author").notNull(),
    org: text("org").notNull().default(""),
    timecode: integer("timecode").notNull(), // seconds
    body: text("body").notNull(),
    resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("comments_version").on(t.versionId)],
);

/** A viewer's pick. Each person on the client side keeps their own selects. */
export const picks = sqliteTable(
  "picks",
  {
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    photoId: text("photo_id").notNull().references(() => photos.id, { onDelete: "cascade" }),
    viewer: text("viewer").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("picks_unique").on(t.projectId, t.photoId, t.viewer)],
);

/**
 * History: everything that happens on a delivery, by the client side (viewed, picked, commented, downloaded…) and by
 * the studio (uploaded, moved, changed settings…). `count` > 1 when several quick actions of one kind were merged
 * into one line, e.g. "picked 12 photos".
 */
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    viewer: text("viewer").notNull().default(""),
    side: text("side", { enum: ["client", "studio"] }).notNull().default("client"),
    action: text("action").notNull(),
    detail: text("detail").notNull().default(""),
    count: integer("count").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("events_project").on(t.projectId, t.createdAt)],
);

/** A thing pinned to a chat message: a photo, or a film (optionally a version and a moment in it). */
export type Pin = { type: "photo"; id: string } | { type: "film"; id: string; versionId?: string; timecode?: number };

/** The project chat: one thread shared by the studio and everyone on the client side. */
export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    author: text("author").notNull(),
    fromStudio: integer("from_studio", { mode: "boolean" }).notNull().default(false),
    body: text("body").notNull().default(""),
    pins: text("pins", { mode: "json" }).$type<Pin[]>().notNull().default([]),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("messages_project").on(t.projectId, t.createdAt)],
);

/** Folders the client side makes to sort photos. A photo can be in several. */
export const clientFolders = sqliteTable(
  "client_folders",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdBy: text("created_by").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("client_folders_project").on(t.projectId)],
);

export const clientFolderPhotos = sqliteTable(
  "client_folder_photos",
  {
    folderId: text("folder_id").notNull().references(() => clientFolders.id, { onDelete: "cascade" }),
    photoId: text("photo_id").notNull().references(() => photos.id, { onDelete: "cascade" }),
    addedAt: integer("added_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("client_folder_photos_unique").on(t.folderId, t.photoId)],
);

export type Project = typeof projects.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type ClientFolder = typeof clientFolders.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type SetRow = typeof sets.$inferSelect;
export type Film = typeof films.$inferSelect;
export type FilmVersion = typeof filmVersions.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Studio = typeof studios.$inferSelect;
export type User = typeof users.$inferSelect;

// ---------- Copies to Dropbox and Google Drive ----------

export type CloudProvider = "dropbox" | "gdrive";

/** A studio's connection to Dropbox or Google Drive. Every upload to its projects is copied there (one way). */
export const cloudLinks = sqliteTable(
  "cloud_links",
  {
    studioId: text("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["dropbox", "gdrive"] }).notNull(),
    account: text("account").notNull().default(""), // the account's name or email, shown on the Team page
    refreshToken: text("refresh_token").notNull(), // encrypted
    accessToken: text("access_token"), // encrypted, short-lived
    accessExpires: integer("access_expires", { mode: "timestamp_ms" }),
    rootId: text("root_id"), // Google Drive: the "Delivered Visual" folder's id
    connectedBy: text("connected_by").notNull().default(""),
    error: text("error"), // set when the connection stopped working (e.g. access was removed); copying pauses
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("cloud_links_unique").on(t.studioId, t.provider)],
);

/** Folders made on Dropbox / Google Drive, so each is made once: a project's folder and the folders inside it. */
export const cloudFolders = sqliteTable(
  "cloud_folders",
  {
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["dropbox", "gdrive"] }).notNull(),
    path: text("path").notNull(), // "" for the project folder, else e.g. "Track"
    remote: text("remote").notNull(), // Dropbox: the full path; Google Drive: the folder id
  },
  (t) => [uniqueIndex("cloud_folders_unique").on(t.projectId, t.provider, t.path)],
);

/**
 * One file (or the project folder) to copy. Big files go across in pieces, a few at a time, so `offset` and
 * `session` remember how far it got.
 */
export const cloudJobs = sqliteTable(
  "cloud_jobs",
  {
    id: text("id").primaryKey(),
    studioId: text("studio_id").notNull(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["dropbox", "gdrive"] }).notNull(),
    kind: text("kind", { enum: ["folder", "file"] }).notNull().default("file"),
    r2Key: text("r2_key").notNull().default(""),
    folder: text("folder").notNull().default(""), // folder inside the project, e.g. "Track" or "Videos"
    name: text("name").notNull().default(""), // file name on the other side
    size: integer("size").notNull().default(0),
    offset: integer("offset").notNull().default(0),
    session: text("session"),
    status: text("status", { enum: ["waiting", "done", "failed"] }).notNull().default("waiting"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    nextAt: integer("next_at", { mode: "timestamp_ms" }).notNull(), // not before (retries back off)
    leaseUntil: integer("lease_until", { mode: "timestamp_ms" }), // being worked on until then
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    doneAt: integer("done_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    uniqueIndex("cloud_jobs_unique").on(t.provider, t.projectId, t.kind, t.r2Key),
    index("cloud_jobs_waiting").on(t.status, t.nextAt),
    index("cloud_jobs_project").on(t.projectId, t.provider, t.status),
  ],
);

export type CloudLink = typeof cloudLinks.$inferSelect;
export type CloudJob = typeof cloudJobs.$inferSelect;
