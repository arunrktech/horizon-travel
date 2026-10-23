import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import type { Role } from "@/api/types";
import { useAuth } from "./AuthProvider";

export function RequireAuth({ role, children }: { role?: Role; children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?next=${next}${role === "staff" ? "&as=staff" : ""}`} replace />;
  }
  if (role === "staff" && user.role !== "staff") return <Navigate to="/" replace />;
  return <>{children}</>;
}
