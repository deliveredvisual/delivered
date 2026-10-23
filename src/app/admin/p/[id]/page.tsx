import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireProject, studioFor } from "@/lib/auth";
import { loadClientFolders } from "@/lib/chat";
import { ClientShell } from "@/app/p/[slug]/client-shell";
import { LandingForm } from "./landing-form";
import { InviteClient } from "./invite-client";
import { and, desc, eq, ne, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/env";
import { memberships, orgDeliveries, projects as projectsTable, studios as studiosTable, users } from "@/db/schema";
import { getProjectFull, picksFor } from "@/lib/queries";
import { HistoryPanel } from "@/components/history-panel";
import { TabRow } from "@/components/tab-scroll";
import { daysLeft, formatBytes, formatDate, formatTimecode, plural, timeAgo } from "@/lib/format";
import { fileUrl } from "@/lib/urls";
import {
  addFilm,
  addSet,
  deleteFilm,
  deleteProject,
  deleteSet,
  deleteVersion,
  extendProject,
  newLink,
  removeClientAccess,
  renameSet,
  setArchived,
  updateProject,
} from "../../actions";
import { ProjectForm } from "../../project-form";
import { PhotoUploader } from "./photo-uploader";
import { FilmUploader } from "./film-uploader";
import { PhotoManager } from "./photo-manager";
import { CopyLink } from "./copy-link";
import { ConfirmButton } from "../../confirm-button";

export const metadata: Metadata = { title: "Project" };

const TABS = [
  { id: "photos", label: "Photos" },
  { id: "films", label: "Films" },
  { id: "clients", label: "Clients" },
  { id: "landing", label: "Landing page" },
  { id: "history", label: "History" },
  { id: "settings", label: "Settings" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/**
 * One project, split into tabs so each part has its own page (and phones aren't faced with one endless scroll):
 * Photos, Films, Clients (who can see it), Landing page, History (every change by you or the client), Settings.
 */
export default async function ProjectAdminPage({ params, searchParams }: PageProps<"/admin/p/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = TABS.find((x) => x.id === sp.tab)?.id ?? "photos";
  const { s } = await requireProject(id);
  const full = await getProjectFull(id);
  if (!full) notFound();
  const { project: p, sets, photos, films } = full;
  const [picks, clientFolders, studio] = await Promise.all([picksFor(p.id), loadClientFolders(p.id), studioFor(p)]);

  // Client organisations with this delivery.
  const withAccess = await db()
    .select({
      id: studiosTable.id,
      name: studiosTable.name,
      addedBy: orgDeliveries.addedBy,
      openedAt: orgDeliveries.openedAt,
      people: sql<number>`(select count(*) from memberships m where m.studio_id = ${studiosTable.id})`,
    })
    .from(orgDeliveries)
    .innerJoin(studiosTable, eq(studiosTable.id, orgDeliveries.orgId))
    .where(eq(orgDeliveries.projectId, p.id))
    .orderBy(desc(orgDeliveries.savedAt));

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${h.get("host")}`;
  const link = `${origin}/p/${p.slug}`;
  const left = daysLeft(p.expiresAt);
  const expired = p.archived || left <= 0;

  const pickCount = new Map<string, number>();
  for (const k of picks) pickCount.set(k.photoId, (pickCount.get(k.photoId) ?? 0) + 1);
  const pickers = [...new Set(picks.map((k) => k.viewer))];
  const photoBytes = photos.reduce((sum, x) => sum + x.size + x.rawSize, 0);
  const rawCount = photos.filter((x) => x.rawKey).length;
  const counts: Partial<Record<Tab, number>> = { photos: photos.length, films: films.length, clients: withAccess.length };

  return (
    <ClientShell slug={p.slug} viewer={studio.name} isStudio newTabLinks>
    <main className="wrap stack" style={{ paddingTop: 32, gap: 28 }}>
      {/* Header */}
      <section className="stack" style={{ gap: 12 }}>
        <Link href="/admin" className="small muted back-link">← Projects</Link>
        <div className="eyebrow">{[p.clientName, p.category].filter(Boolean).join(" · ") || "No client set"}</div>
        <h1 className="h1">{p.title}</h1>
        <div className="meta">
          {p.shotDate ? <span>Shot {formatDate(p.shotDate)}</span> : null}
          <span>{plural(photos.length, "photo")} · {plural(films.length, "film")} · {formatBytes(photoBytes + films.reduce((sum, f) => sum + f.versions.reduce((a, v) => a + v.size, 0), 0))}</span>
          <span className={expired || left <= 30 ? "warn" : ""}>
            {expired ? "Archived: clients can't open it" : `Live until ${formatDate(p.expiresAt)} (${plural(left, "day")})`}
          </span>
          {p.nda ? <span className="badge">NDA</span> : null}
        </div>
        <div className="share-bar">
          <CopyLink url={link} />
          <a className="btn" href={`/p/${p.slug}`} target="_blank" rel="noreferrer">Open as client ↗</a>
        </div>
        <span className="small muted">{p.passwordHash ? "Password protected." : "No password: anyone with the link can open it."}</span>
      </section>

      <TabRow className="page-tabs" label="Project">
        {TABS.map((x) => (
          <Link key={x.id} href={x.id === "photos" ? `/admin/p/${p.id}` : `/admin/p/${p.id}?tab=${x.id}`} className="tab" aria-current={tab === x.id} scroll={false} replace>
            {x.label}
            {counts[x.id] ? <span className="count">{counts[x.id]}</span> : null}
          </Link>
        ))}
      </TabRow>

      {tab === "photos" ? (
        <section className="stack" style={{ gap: 20 }}>
          <div className="panel stack">
            <div className="row between">
              <h2 className="h3">Folders</h2>
              <span className="small muted">Clients see these as tabs, and as sections on the landing page.</span>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              {sets.map((x) => (
                <form key={x.id} action={renameSet.bind(null, p.id, x.id)} className="folder-row">
                  <input name="name" defaultValue={x.name} className="input input-small" aria-label={`Rename ${x.name}`} />
                  <button type="submit" className="btn btn-small">Rename</button>
                  <button type="submit" formAction={deleteSet.bind(null, p.id, x.id)} className="btn btn-small btn-danger" aria-label={`Delete folder ${x.name}`}>Delete</button>
                </form>
              ))}
              <form action={addSet.bind(null, p.id)} className="folder-row">
                <input name="name" className="input input-small" placeholder="New folder, e.g. Details" aria-label="New folder name" />
                <button type="submit" className="btn btn-small">Add folder</button>
              </form>
            </div>
          </div>

          <PhotoUploader projectId={p.id} sets={sets.map((x) => ({ id: x.id, name: x.name }))} />

          <p className="small muted" style={{ margin: 0 }}>
            {plural(photos.length, "photo")}{rawCount ? ` · ${rawCount} with RAW` : ""}
            {pickers.length ? ` · selects from ${pickers.join(", ")}` : ""}
          </p>

          <PhotoManager
            key={`${photos.length}-${photos.map((x) => x.setId ?? "").join("").length}-${photos.at(-1)?.id ?? ""}`}
            projectId={p.id}
            sets={sets.map((x) => ({ id: x.id, name: x.name }))}
            photos={photos.map((x) => ({
              id: x.id,
              filename: x.filename,
              setId: x.setId,
              thumbKey: x.thumbKey,
              rawKey: x.rawKey,
              originalKey: x.originalKey,
              size: x.size,
              rawSize: x.rawSize,
              picks: pickCount.get(x.id) ?? 0,
              createdAt: x.createdAt.getTime(),
            }))}
            clientFolders={clientFolders}
          />
          {clientFolders.length ? (
            <p className="small muted" style={{ margin: 0 }}>
              Your client has made {clientFolders.length === 1 ? "a folder" : `${clientFolders.length} folders`}: {clientFolders.map((f) => `${f.name} (${f.photoIds.length})`).join(", ")}. Use the filters above to see what&rsquo;s in them.
            </p>
          ) : null}
        </section>
      ) : null}

      {tab === "films" ? (
        <section className="stack" style={{ gap: 20 }}>
          {films.length === 0 ? <p className="muted small" style={{ margin: 0 }}>No films yet. Add one below, then upload the file. Each new upload becomes the next version (v1, v2…).</p> : null}
          {films.map((f) => (
            <div key={f.id} className="panel stack">
              <div className="film-head">
                <div className="film-thumb">
                  {f.current?.posterKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fileUrl(f.current.posterKey)} alt="" />
                  ) : null}
                </div>
                <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                  <strong style={{ fontWeight: 500, fontSize: 16 }}>{f.title}</strong>
                  <span className="small muted">
                    {f.aspect}
                    {f.current?.duration ? ` · ${formatTimecode(f.current.duration)}` : ""}
                    {f.current ? ` · v${f.current.version}` : " · no upload yet"}
                    {f.current?.approvedAt ? ` · approved by ${f.current.approvedBy}` : ""}
                    {f.openComments ? ` · ${plural(f.openComments, "open comment")}` : ""}
                  </span>
                  <div className="row" style={{ marginTop: 6 }}>
                    {f.current ? <a className="btn btn-small" href={`/p/${p.slug}/film/${f.id}`} target="_blank" rel="noreferrer">Review</a> : null}
                    <FilmUploader projectId={p.id} filmId={f.id} nextVersion={(f.versions.at(-1)?.version ?? 0) + 1} />
                  </div>
                </div>
              </div>
              {f.versions.length ? (
                <div className="stack" style={{ gap: 6 }}>
                  {f.versions.map((v) => (
                    <div key={v.id} className="row between small" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                        <strong>v{v.version}</strong> <span className="mono muted">{v.filename}</span> · {formatBytes(v.size)} · {formatDate(v.createdAt)}
                        {v.approvedAt ? <span className="good"> · approved</span> : null}
                      </span>
                      <form action={deleteVersion.bind(null, p.id, v.id)}>
                        <ConfirmButton message={`Delete v${v.version} and its comments?`}>Delete v{v.version}</ConfirmButton>
                      </form>
                    </div>
                  ))}
                </div>
              ) : null}
              <form action={deleteFilm.bind(null, p.id, f.id)}>
                <ConfirmButton message={`Delete "${f.title}", every version and all comments?`}>Delete film</ConfirmButton>
              </form>
            </div>
          ))}
          <form action={addFilm.bind(null, p.id)} className="panel add-film">
            <input name="title" className="input" placeholder="Film title, e.g. Launch film" aria-label="Film title" required />
            <select name="aspect" className="select" aria-label="Aspect ratio">
              <option>16:9</option>
              <option>9:16</option>
              <option>4:5</option>
              <option>1:1</option>
              <option>2.39:1</option>
            </select>
            <button type="submit" className="btn">Add film</button>
          </form>
        </section>
      ) : null}

      {tab === "clients" ? <ClientsTab projectId={p.id} studioId={p.studioId} hasPassword={!!p.passwordHash} withAccess={withAccess} /> : null}

      {tab === "landing" ? (
        <section className="stack" style={{ gap: 20 }}>
          <div className="row between" style={{ alignItems: "baseline" }}>
            <p className="muted small" style={{ margin: 0, maxWidth: 640 }}>
              The first thing your client sees when they open the link: the cover, your note, films pinned at the top, then every photo.
            </p>
            <a className="small" href={`/p/${p.slug}`} target="_blank" rel="noreferrer">Preview as client ↗</a>
          </div>
          <LandingForm
            projectId={p.id}
            settings={{ layout: p.landingLayout, bg: p.landingBg, coverId: p.landingCoverId, intro: p.landingIntro, spacing: p.landingSpacing, groupFolders: p.landingGroupFolders, titleOnCover: p.landingTitleOnCover, coverDim: p.landingCoverDim }}
            title={p.title}
            date={formatDate(p.shotDate ?? p.createdAt.toISOString().slice(0, 10))}
            photos={photos.filter((x) => x.thumbKey).map((x) => ({ id: x.id, filename: x.filename, thumbKey: x.thumbKey }))}
          />
        </section>
      ) : null}

      {tab === "history" ? (
        <section className="stack" style={{ gap: 12 }}>
          <p className="muted small" style={{ margin: 0, maxWidth: 640 }}>
            Everything that has happened on this delivery: what you and your team changed, and what your client did.
          </p>
          <HistoryPanel
            studioId={s.studio.id}
            projectId={p.id}
            base={`/admin/p/${p.id}?tab=history`}
            side={typeof sp.side === "string" ? sp.side : undefined}
            before={typeof sp.before === "string" ? sp.before : undefined}
          />
        </section>
      ) : null}

      {tab === "settings" ? (
        <>
          <section className="stack" style={{ gap: 20, maxWidth: 900 }}>
            <ProjectForm action={updateProject.bind(null, p.id)} project={p} submitLabel="Save changes" />
          </section>
          <section className="panel stack">
            <h2 className="h3">Delivery window</h2>
            <p className="small muted" style={{ margin: 0 }}>
              {expired ? "Archived: clients can't open it." : `Live until ${formatDate(p.expiresAt)}, then archived automatically.`}
            </p>
            <div className="row">
              <form action={extendProject.bind(null, p.id, 30)}><button type="submit" className="btn btn-small">Extend 30 days</button></form>
              <form action={extendProject.bind(null, p.id, 365)}><button type="submit" className="btn btn-small">Extend a year</button></form>
              <form action={setArchived.bind(null, p.id, !p.archived)}>
                <button type="submit" className="btn btn-small">{p.archived ? "Restore (live for 30 days)" : "Archive now"}</button>
              </form>
            </div>
          </section>
          <section className="panel stack">
            <h2 className="h3">Danger zone</h2>
            <div className="row">
              <form action={newLink.bind(null, p.id)}><ConfirmButton className="btn btn-small" message="Make a new link? The current link will stop working for your client.">Make a new link (old one stops working)</ConfirmButton></form>
              <form action={deleteProject.bind(null, p.id)}>
                <ConfirmButton message={`Delete "${p.title}" and every file in it? This can't be undone.`}>Delete project and all its files</ConfirmButton>
              </form>
            </div>
          </section>
        </>
      ) : null}
    </main>
    </ClientShell>
  );
}

/** Who can see this delivery: client organisations added by email, plus suggestions from past deliveries. */
async function ClientsTab({
  projectId,
  studioId,
  hasPassword,
  withAccess,
}: {
  projectId: string;
  studioId: string;
  hasPassword: boolean;
  withAccess: { id: string; name: string; addedBy: string | null; openedAt: Date | null; people: number }[];
}) {
  const known = await db()
    .selectDistinct({ email: users.email, name: users.name, company: studiosTable.name })
    .from(orgDeliveries)
    .innerJoin(projectsTable, eq(projectsTable.id, orgDeliveries.projectId))
    .innerJoin(memberships, eq(memberships.studioId, orgDeliveries.orgId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(studiosTable, eq(studiosTable.id, orgDeliveries.orgId))
    .where(
      and(
        eq(projectsTable.studioId, studioId),
        ne(orgDeliveries.projectId, projectId),
        withAccess.length ? notInArray(orgDeliveries.orgId, withAccess.map((o) => o.id)) : undefined,
      ),
    )
    .limit(200);
  return (
    <section className="stack" style={{ gap: 20 }}>
      <p className="muted small" style={{ margin: 0, maxWidth: 640 }}>
        Add a client by email and everyone at their organisation sees this delivery on their dashboard, without the link or password.
        You can also just send them the link above.
      </p>
      <div className="panel stack">
        {withAccess.length ? (
          <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 0 }}>
            {withAccess.map((o) => (
              <li key={o.id} className="row between" style={{ borderBottom: "1px solid var(--line)", padding: "10px 0" }}>
                <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                  <span style={{ fontWeight: 500 }}>
                    {o.name} <span className="muted" style={{ fontWeight: 400 }}>· {plural(Number(o.people), "person", "people")}</span>
                  </span>
                  <span className="small muted">
                    {o.addedBy ? `added by ${o.addedBy}` : "saved it from the link"}
                    {" · "}
                    {o.openedAt ? `last opened ${timeAgo(o.openedAt)}` : "not opened yet"}
                  </span>
                </span>
                <form action={removeClientAccess.bind(null, projectId, o.id)}>
                  <ConfirmButton message={`Remove ${o.name}? It comes off their dashboard.${hasPassword ? "" : " The link itself still opens it, since this delivery has no password."}`}>Remove</ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>No client organisations added yet.</p>
        )}
        <InviteClient projectId={projectId} known={known} />
      </div>
    </section>
  );
}
