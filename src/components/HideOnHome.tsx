"use client";

import { usePathname } from "next/navigation";
import { PropsWithChildren } from "react";

export default function HideOnHome({ children }: PropsWithChildren) {
  const pathname = usePathname();
  if (!pathname) return <>{children}</>;
  // Hide auth links on the homepage and on the dedicated auth pages
  if (pathname === "/" || pathname === "/login" || pathname === "/signup") return null;
  return <>{children}</>;
}
