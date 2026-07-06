// src/app/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import LuminaMain from "@/app/components/lumina-main";

export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div style={{
        height: "100vh", width: "100%", display: "flex",
        alignItems: "center", justifyContent: "center",
        background: "var(--forest)",
      }}>
      </div>
    );
  }

  return <LuminaMain />;
}