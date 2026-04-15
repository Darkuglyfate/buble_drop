"use client";

import type { CSSProperties, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

const SIZE_STYLES: Record<ButtonSize, CSSProperties> = {
  sm: {
    padding: "0.5rem 0.75rem",
    fontSize: "0.75rem",
    borderRadius: "0.5rem",
  },
  md: {
    padding: "0.625rem 1rem",
    fontSize: "0.8125rem",
    borderRadius: "0.75rem",
  },
  lg: {
    padding: "0.875rem 1.5rem",
    fontSize: "0.9375rem",
    borderRadius: "0.875rem",
  },
};

const VARIANT_STYLES: Record<ButtonVariant, CSSProperties> = {
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
  danger: {
    background: "#fff2f7",
    color: "#7f3a53",
    border: "1px solid #ffd7e5",
  },
  accent: {
    background: "linear-gradient(135deg, #ffe38f 0%, #ffb5e7 100%)",
    color: "#6b3f00",
    border: "1px solid transparent",
    boxShadow: "0 6px 20px rgba(255, 208, 128, 0.5)",
  },
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  disabled = false,
  type = "button",
  onClick,
}: ButtonProps) {
  const style: CSSProperties = {
    ...SIZE_STYLES[size],
    ...VARIANT_STYLES[variant],
    fontWeight: 600,
    width: fullWidth ? "100%" : undefined,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    transition: "transform 0.15s ease, opacity 0.15s ease",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.375rem",
  };

  return (
    <button type={type} disabled={disabled} onClick={onClick} style={style}>
      {children}
    </button>
  );
}
