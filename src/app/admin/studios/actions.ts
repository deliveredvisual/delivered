"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { isSiteOwner } from "@/lib/auth";
import { db } from "@/lib/env";
import { DEFAULT_STUDIO_ID, studios } from "@/db/schema";

export async function setStudioStatus(studioId: string, status: "active" | "pending") {
  if (!(await isSiteOwner())) notFound();
  await db()
    .update(studios)
    .set({ status })
    .where(and(eq(studios.id, studioId), ne(studios.id, DEFAULT_STUDIO_ID)));
  revalidatePath("/admin/studios");
}
