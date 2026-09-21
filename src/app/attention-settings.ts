"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentActor } from "@/shared/actor/current-actor";

export async function saveAttentionDays(form: FormData) {
  const days = Number(form.get("days"));
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return { error: "请输入 1–365 之间的整数天数。" };
  }
  const actor = await getCurrentActor();
  (await cookies()).set(`attention-days-${encodeURIComponent(actor.userId)}`, String(days), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 31536000,
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/");
  return { error: null };
}
