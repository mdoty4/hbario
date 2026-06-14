"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isLoggedIn, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const redirectAttempted = useRef(false);

  useEffect(() => {
    if (!loading && !isLoggedIn && !redirectAttempted.current) {
      redirectAttempted.current = true;
      router.push(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
    }
  }, [loading, isLoggedIn, pathname, router]);

  // While checking session, show a loading state
  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  // If not logged in, don't render children (redirect is in progress)
  if (!isLoggedIn) {
    return null;
  }

  return <>{children}</>;
}