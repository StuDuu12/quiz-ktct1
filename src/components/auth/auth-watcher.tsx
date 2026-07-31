"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/src/lib/supabase/browser";
import { isE2EBrowserMode } from "@/src/e2e/browser";

export function AuthWatcher() {
  const router = useRouter();

  useEffect(() => {
    if (isE2EBrowserMode()) return;
    const supabase = createBrowserSupabaseClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        router.replace("/login");
        router.refresh();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  return null;
}

