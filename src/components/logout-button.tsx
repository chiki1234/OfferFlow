"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { authClient } from "@/auth-client";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      aria-label="退出登录"
      className={compact ? "mobile-logout" : "sidebar-logout"}
      disabled={pending}
      onClick={signOut}
      type="button"
    >
      <LogOut size={compact ? 19 : 16} />
      <span>{pending ? "正在退出" : "退出登录"}</span>
    </button>
  );
}
