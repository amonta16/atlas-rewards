import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CLINIC_COOKIE } from "@/lib/remember";

/** Opening the app: back to your clinic if we know it, otherwise find one. */
export default function Start() {
  const slug = cookies().get(CLINIC_COOKIE)?.value;
  redirect(slug && /^[a-z0-9-]{2,60}$/.test(slug) ? `/${slug}` : "/find");
}
