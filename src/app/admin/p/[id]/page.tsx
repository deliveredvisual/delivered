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
import { describeEvent, getProjectFull, picksFor, recentEvents } from "@/lib/queries";
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

export default async function ProjectAdminPage({ params }: PageProps<"/admin/p/[id]">) {
  const { id } = await params;
  await requireProject(id);
  const full = await getProjectFull(id);
  if (!full) notFound();
  const { project: p, sets, photos, films } = full;
  const [picks, activity, clientFolders, studio] = await Promise.all([picksFor(p.id), recentEvents(p.id), loadClientFolders(p.id), studioFor(p)]);

  // Client organisations with this delivery, and people at organisations this studio has delivered to before.
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
  const known = await db()
    .selectDistinct({ email: users.email, name: users.name, company: studiosTable.name })
    .from(orgDeliveries)
    .innerJoin(projectsTable, eq(projectsTable.id, orgDeliveries.projectId))
    .innerJoin(memberships, eq(memberships.studioId, orgDeliveries.orgId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(studiosTable, eq(studiosTable.id, orgDeliveries.orgId))
    .where(
      and(
        eq(projectsTable.studioId, p.studioId),
        ne(orgDeliveries.projectId, p.id),
        withAccess.length ? notInArray(orgDeliveries.orgId, withAccess.map((o) => o.id)) : undefined,
      ),
    )
    .limit(200);

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${h.get("host")}`;
  const link = `${origin}/p/${p.slug}`;
  const left = daysLeft(p.expiresAt);
  const expired = p.archived || left <= 0;

  const pickCount = new Map<string, number>();
  for (const k of picks) pickCount.set(k.photoId, (pickCount.get(k.photoId) ?? 0) + 1);
  const pickers = [...new Set(picks.map((k) => k.viewer))];
  const photoBytes = photos.reduce((s, x) => s + x.size + x.rawSize, 0);
  const rawCount = photos.filter((x) => x.rawKey).length;

  return (
    <ClientShell slug={p.slug} viewer={studio.name} isStudio newTabLinks>
    <main className="wrap stack" style={{ paddingTop: 40, gap: 48 }}>
      {/* Header */}
      <section className="stack" style={{ gap: 14 }}>
        <Link href="/admin" className="small muted" style={{ textDecoration: "none" }}>← Projects</Link>
        <div className="eyebrow">{[p.clientName, p.category].filter(Boolean).join(" · ") || "No client set"}</div>
        <h1 className="h1">{p.title}</h1>
        <div className="meta">
          {p.shotDate ? <span>Shot {formatDate(p.shotDate)}</span> : null}
          <span>{plural(photos.length, "photo")} · {plural(films.length, "film")}</span>
          <span>{formatBytes(photoBytes + films.reduce((s, f) => s + f.versions.reduce((a, v) => a + v.size, 0), 0))}</span>
          <span className={expired ? "warn" : left <= 30 ? "warn" : ""}>
            {expired ? "Archived — clients can't open it" : `Live until ${formatDate(p.expiresAt)} (${plural(left, "day")})`}
          </span>
          {p.nda ? <span className="badge">NDA</span> : null}
        </div>
      </section>

      {/* Share */}
      <section className="panel stack">
        <div className="row between">
          <h2 className="h3">Client link</h2>
          <div className="row small">
            <span className={p.passwordHash ? "" : "muted"}>{p.passwordHash ? "Password protected" : "No password — the link alone opens it"}</span>
          </div>
        </div>
        <CopyLink url={link} />
        <div className="row">
          <a className="btn btn-small" href={`/p/${p.slug}`} target="_blank" rel="noreferrer">Open as client</a>
        </div>
      </section>

      {/* Clients with accounts */}
      <section className="panel stack">
        <div className="row between">
          <h2 className="h3">Clients</h2>
          <span className="small muted">Everyone at an added organisation sees it on their dashboard, without the link or password.</span>
        </div>
        {withAccess.length ? (
          <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 0 }}>
            {withAccess.map((o) => (
              <li key={o.id} className="row between" style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
                <span className="stack" style={{ gap: 2 }}>
                  <span style={{ fontWeight: 500 }}>
                    {o.name} <span className="muted" style={{ fontWeight: 400 }}>· {plural(Number(o.people), "person", "people")}</span>
                  </span>
                  <span className="small muted">
                    {o.addedBy ? `added by ${o.addedBy}` : "saved it from the link"}
                    {" · "}
                    {o.openedAt ? `last opened ${timeAgo(o.openedAt)}` : "not opened yet"}
                  </span>
                </span>
                <form action={removeClientAccess.bind(null, p.id, o.id)}>
                  <ConfirmButton message={`Remove ${o.name}? It comes off their dashboard.${p.passwordHash ? "" : " The link itself still opens it, since this delivery has no password."}`}>Remove</ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
        <InviteClient projectId={p.id} known={known} />
      </section>

      {/* Photos */}
      <section className="stack" style={{ gap: 20 }}>
        <div className="row between">
          <h2 className="h2">Photos</h2>
          <span className="small muted">
            {plural(photos.length, "photo")}{rawCount ? ` · ${rawCount} with RAW` : ""}
            {pickers.length ? ` · picks from ${pickers.join(", ")}` : ""}
          </span>
        </div>

        <div className="panel stack">
          <div className="row between">
            <h3 className="h3">Folders</h3>
            <span className="small muted">Clients see these as tabs, and as sections on the landing page.</span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {sets.map((s) => (
              <form key={s.id} action={renameSet.bind(null, p.id, s.id)} className="row" style={{ gap: 4 }}>
                <input name="name" defaultValue={s.name} className="input" style={{ width: 170, minHeight: 34, padding: "4px 8px" }} aria-label={`Rename ${s.name}`} />
                <button type="submit" className="btn btn-small">Rename</button>
                <button type="submit" formAction={deleteSet.bind(null, p.id, s.id)} className="btn btn-small btn-danger" aria-label={`Delete folder ${s.name}`}>×</button>
              </form>
            ))}
          </div>
          <form action={addSet.bind(null, p.id)} className="row" style={{ gap: 6 }}>
            <input name="name" className="input" placeholder="New folder, e.g. Details" style={{ width: 240, minHeight: 34, padding: "4px 8px" }} aria-label="New folder name" />
            <button type="submit" className="btn btn-small">Add folder</button>
          </form>
        </div>

        <PhotoUploader projectId={p.id} sets={sets.map((s) => ({ id: s.id, name: s.name }))} />

        <PhotoManager
          key={`${photos.length}-${photos.map((x) => x.setId ?? "").join("").length}-${photos.at(-1)?.id ?? ""}`}
          projectId={p.id}
          sets={sets.map((s) => ({ id: s.id, name: s.name }))}
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

      {/* Films */}
      <section className="stack" style={{ gap: 20 }}>
        <h2 className="h2">Films</h2>
        {films.map((f) => (
          <div key={f.id} className="panel stack">
            <div className="row between">
              <div className="row" style={{ gap: 16 }}>
                <div className="film-thumb" style={{ width: 120 }}>
                  {f.current?.posterKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fileUrl(f.current.posterKey)} alt="" />
                  ) : null}
                </div>
                <div className="stack" style={{ gap: 4 }}>
                  <strong style={{ fontWeight: 500, fontSize: 16 }}>{f.title}</strong>
                  <span className="small muted">
                    {f.aspect}
                    {f.current?.duration ? ` · ${formatTimecode(f.current.duration)}` : ""}
                    {f.current ? ` · v${f.current.version}` : " · no upload yet"}
                    {f.current?.approvedAt ? ` · approved by ${f.current.approvedBy}` : ""}
                    {f.openComments ? ` · ${plural(f.openComments, "open comment")}` : ""}
                  </span>
                </div>
              </div>
              <div className="row">
                {f.current ? <a className="btn btn-small" href={`/p/${p.slug}/film/${f.id}`} target="_blank" rel="noreferrer">Review</a> : null}
                <FilmUploader projectId={p.id} filmId={f.id} nextVersion={(f.versions.at(-1)?.version ?? 0) + 1} />
              </div>
            </div>
            {f.versions.length ? (
              <div className="stack" style={{ gap: 6 }}>
                {f.versions.map((v) => (
                  <div key={v.id} className="row between small" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                    <span>
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
        <form action={addFilm.bind(null, p.id)} className="row panel">
          <input name="title" className="input" placeholder="Film title, e.g. Launch film" style={{ width: 280 }} aria-label="Film title" required />
          <select name="aspect" className="select" style={{ width: "auto" }} aria-label="Aspect ratio">
            <option>16:9</option>
            <option>9:16</option>
            <option>4:5</option>
            <option>1:1</option>
            <option>2.39:1</option>
          </select>
          <button type="submit" className="btn">Add film</button>
        </form>
      </section>

      {/* Landing page */}
      <section className="stack" style={{ gap: 20 }}>
        <div className="row between" style={{ alignItems: "baseline" }}>
          <h2 className="h2">Landing page</h2>
          <a className="small" href={`/p/${p.slug}`} target="_blank" rel="noreferrer">Preview as client ↗</a>
        </div>
        <p className="muted small" style={{ margin: 0, maxWidth: 640 }}>
          The first thing your client sees when they open the link: the cover, your note, films pinned at the top, then every photo.
        </p>
        <LandingForm
          projectId={p.id}
          settings={{ layout: p.landingLayout, bg: p.landingBg, coverId: p.landingCoverId, intro: p.landingIntro, spacing: p.landingSpacing, groupFolders: p.landingGroupFolders, titleOnCover: p.landingTitleOnCover, coverDim: p.landingCoverDim }}
          title={p.title}
          date={formatDate(p.shotDate ?? p.createdAt.toISOString().slice(0, 10))}
          photos={photos.filter((x) => x.thumbKey).map((x) => ({ id: x.id, filename: x.filename, thumbKey: x.thumbKey }))}
        />
      </section>

      {/* Activity */}
      <section className="stack">
        <h2 className="h2">Activity</h2>
        {activity.length ? (
          <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 8 }}>
            {activity.map((e) => (
              <li key={e.id} className="row between small" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                <span>{describeEvent(e)}</span>
                <span className="muted">{timeAgo(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">Nothing yet. You’ll see views, picks, comments and downloads here.</p>
        )}
      </section>

      {/* Settings */}
      <section className="stack" style={{ gap: 20, maxWidth: 900 }}>
        <h2 className="h2">Settings</h2>
        <ProjectForm action={updateProject.bind(null, p.id)} project={p} submitLabel="Save changes" />
      </section>

      {/* Lifecycle */}
      <section className="panel stack">
        <h2 className="h3">Delivery window</h2>
        <div className="row">
          <form action={extendProject.bind(null, p.id, 30)}><button type="submit" className="btn btn-small">Extend 30 days</button></form>
          <form action={extendProject.bind(null, p.id, 365)}><button type="submit" className="btn btn-small">Extend a year</button></form>
          <form action={setArchived.bind(null, p.id, !p.archived)}>
            <button type="submit" className="btn btn-small">{p.archived ? "Restore (live for 30 days)" : "Archive now"}</button>
          </form>
          <form action={newLink.bind(null, p.id)}><ConfirmButton className="btn btn-small" message="Make a new link? The current link will stop working for your client.">Make a new link (old one stops working)</ConfirmButton></form>
        </div>
        <form action={deleteProject.bind(null, p.id)}>
          <ConfirmButton message={`Delete "${p.title}" and every file in it? This can't be undone.`}>Delete project and all its files</ConfirmButton>
        </form>
      </section>
    </main>
    </ClientShell>
  );
}
