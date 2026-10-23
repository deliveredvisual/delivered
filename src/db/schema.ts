import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

/** A delivery: one shoot for one client. Clients reach it through its private `slug` link. */
/** A creative's business (photographer, filmmaker…). Every project belongs to one studio; team members share it. */
export const studios = sqliteTable("studios", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().default(""), // shown to clients as the contact address
  status: text("status", { enum: ["active", "pending"] }).notNull().default("pending"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** Anyone with a sign-in: creatives (and their team) or clients. */
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

/** Who works in which studio. The owner manages the team; members do everything else. */
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

/** One-off links a studio owner sends to add someone to the team. */
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

/** Deliveries a signed-in client has opened, so they show up on their home page. */
export const savedDeliveries = sqliteTable(
  "saved_deliveries",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    savedAt: integer("saved_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("saved_unique").on(t.userId, t.projectId)],
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
    invoicePaid: integer("invoice_paid", { mode: "boolean" }).notNull().default(false),
    holdUntilPaid: integer("hold_until_paid", { mode: "boolean" }).notNull().default(false),
    rawEnabled: integer("raw_enabled", { mode: "boolean" }).notNull().default(false),
    licenceUsage: text("licence_usage").notNull().default(""),
    licenceTerritory: text("licence_territory").notNull().default(""),
    licenceTerm: text("licence_term").notNull().default(""),
    licenceCredit: text("licence_credit").notNull().default(""),
    licenceTerms: text("licence_terms").notNull().default(""),
  },
  (t) => [uniqueIndex("projects_slug").on(t.slug), index("projects_studio").on(t.studioId)],
);

/** Groups of photos inside a project, e.g. Track, Static, Details. */
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

/** Activity log: who viewed, picked, commented, downloaded. */
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    viewer: text("viewer").notNull().default(""),
    action: text("action").notNull(),
    detail: text("detail").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("events_project").on(t.projectId, t.createdAt)],
);

export type Project = typeof projects.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type SetRow = typeof sets.$inferSelect;
export type Film = typeof films.$inferSelect;
export type FilmVersion = typeof filmVersions.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Studio = typeof studios.$inferSelect;
export type User = typeof users.$inferSelect;
