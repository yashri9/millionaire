"use client";

import { Suspense } from "react";
import { AuthLayout } from "@/components/auth-layout";

function SignupInner() {
  return <AuthLayout mode="signup" />;
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <SignupInner />
    </Suspense>
  );
}
