"use client";

import { Suspense } from "react";
import { AuthLayout } from "@/components/auth-layout";

function LoginInner() {
  return <AuthLayout mode="login" />;
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
