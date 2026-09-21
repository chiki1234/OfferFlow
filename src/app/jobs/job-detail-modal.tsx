"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { OperationModal } from "@/components/operation-modal";

export function JobDetailModal({ children, intercepted = false }: { children: React.ReactNode; intercepted?: boolean }) {
  const router = useRouter();
  const close = useCallback(() => {
    if (intercepted) router.back();
    else router.replace("/jobs");
  }, [intercepted, router]);
  useEffect(() => {
    const target = decodeURIComponent(window.location.hash.slice(1));
    if (target) document.getElementById(target)?.scrollIntoView({ block: "nearest" });
  }, [children]);
  return <OperationModal title="岗位详情" size="wide" onClose={close}>{children}</OperationModal>;
}
