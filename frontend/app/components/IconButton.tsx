"use client";

import type { CSSProperties, ReactNode } from "react";

type IconButtonVariant = "primary" | "secondary" | "ghost";
type IconButtonSize = "sm" | "md";

type IconButtonProps = {
  children: ReactNode;
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

const SIZE_STYLES: Record<IconButtonSize, CSSProperties> = {
  sm: { width: "2rem", height: "2rem", fontSize: "0.875rem" },
  md: { width: "2.5rem", height: "2.5rem", fontSize: "1rem" },
};

const VARIANT_STYLES: Record<IconButtonVariant, CSSProperties> = {
  primary: {
    background: "linear-gradient(135deg, #a7efff 0%, #c0ccff 100%)",
    color: "#1f3561",
    border: "1px solid transparent",
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
};

export function IconButton({
  children,
  label,
  variant = "secondary",
  size = "md",
  disabled = false,
  onClick,
}: IconButtonProps) {
  const style: CSSProperties = {
    ...SIZE_STYLES[size],
    ...VARIANT_STYLES[variant],
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "9999px",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    flexShrink: 0,
  };

  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} style={style}>
      {children}
    </button>
  );
}
