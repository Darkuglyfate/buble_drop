"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

type NavLinkButtonVariant = "primary" | "secondary" | "ghost" | "accent";
type NavLinkButtonSize = "sm" | "md" | "lg";

type NavLinkButtonProps = {
  children: ReactNode;
  href: string;
  variant?: NavLinkButtonVariant;
  size?: NavLinkButtonSize;
  fullWidth?: boolean;
  icon?: ReactNode;
  onClick?: () => void;
};

const SIZE_STYLES: Record<NavLinkButtonSize, CSSProperties> = {
  sm: { padding: "0.5rem 0.75rem", fontSize: "0.75rem", borderRadius: "0.5rem" },
  md: { padding: "0.625rem 1rem", fontSize: "0.8125rem", borderRadius: "0.75rem" },
  lg: { padding: "0.875rem 1.5rem", fontSize: "0.9375rem", borderRadius: "0.875rem" },
};

const VARIANT_STYLES: Record<NavLinkButtonVariant, CSSProperties> = {
  primary: {
    background: "linear-gradient(135deg, #a7efff 0%, #c0ccff 100%)",
    color: "#1f3561",
    border: "1px solid transparent",
    boxShadow: "0 6px 18px rgba(127, 161, 231, 0.3)",
  },
  secondary: {
    background: "rgba(255, 255, 255, 0.8)",
    color: "#425b8a",
    border: "1px solid #dce6ff",
  },
  ghost: {
    background: "transparent",
    color: "#48608f",
    border: "1px solid transparent",
  },
  accent: {
    background: "linear-gradient(135deg, #ffe38f 0%, #ffb5e7 100%)",
    color: "#6b3f00",
    border: "1px solid transparent",
    boxShadow: "0 6px 20px rgba(255, 208, 128, 0.5)",
  },
};

export function NavLinkButton({
  children,
  href,
  variant = "primary",
  size = "md",
  fullWidth = false,
  icon,
  onClick,
}: NavLinkButtonProps) {
  const style: CSSProperties = {
    ...SIZE_STYLES[size],
    ...VARIANT_STYLES[variant],
    fontWeight: 600,
    width: fullWidth ? "100%" : undefined,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.375rem",
    textDecoration: "none",
  };

  return (
    <Link href={href} style={style} onClick={onClick}>
      {icon}
      {children}
    </Link>
  );
}
