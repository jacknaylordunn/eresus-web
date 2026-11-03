import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Medical semantic tokens
        "medical-danger": {
          DEFAULT: "hsl(var(--medical-danger))",
          foreground: "hsl(var(--medical-danger-foreground))",
        },
        "medical-warning": {
          DEFAULT: "hsl(var(--medical-warning))",
          foreground: "hsl(var(--medical-warning-foreground))",
        },
        "medical-success": {
          DEFAULT: "hsl(var(--medical-success))",
          foreground: "hsl(var(--medical-success-foreground))",
        },
        "medical-info": {
          DEFAULT: "hsl(var(--medical-info))",
          foreground: "hsl(var(--medical-info-foreground))",
        },
        "drug-adrenaline": "hsl(var(--drug-adrenaline))",
        "drug-amiodarone": "hsl(var(--drug-amiodarone))",
        "drug-lidocaine": "hsl(var(--drug-lidocaine))",
        "drug-shock": "hsl(var(--drug-shock))",
        "state-active": "hsl(var(--state-active))",
        "state-rosc": "hsl(var(--state-rosc))",
        "state-ended": "hsl(var(--state-ended))",
        "state-paused": "hsl(var(--state-paused))",
        "state-pending": "hsl(var(--state-pending))",
        "surface-primary": "hsl(var(--surface-primary))",
        "surface-secondary": "hsl(var(--surface-secondary))",
        "surface-elevated": "hsl(var(--surface-elevated))",
        tone: {
          tint: "rgb(var(--tone-tint) / <alpha-value>)",
          "on-tint": "rgb(var(--tone-on-tint) / <alpha-value>)",
          accent: "rgb(var(--tone-accent) / <alpha-value>)",
          "on-accent": "rgb(var(--tone-on-accent) / <alpha-value>)",
          alert: "rgb(var(--tone-alert) / <alpha-value>)",
          "on-alert": "rgb(var(--tone-on-alert) / <alpha-value>)",
          danger: "rgb(var(--tone-danger) / <alpha-value>)",
          "on-danger": "rgb(var(--tone-on-danger) / <alpha-value>)",
          "danger-tint": "rgb(var(--tone-danger-tint) / <alpha-value>)",
          "on-danger-tint": "rgb(var(--tone-on-danger-tint) / <alpha-value>)",
          positive: "rgb(var(--tone-positive) / <alpha-value>)",
          "on-positive": "rgb(var(--tone-on-positive) / <alpha-value>)",
          slate: "rgb(var(--tone-slate) / <alpha-value>)",
          "on-slate": "rgb(var(--tone-on-slate) / <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // Push-to-talk on the CPR ring: the red ring draws round, ripples while listening,
        // and the halo bumps as each word is recognised.
        "ptt-draw": {
          from: { strokeDashoffset: "326.7" },
          to: { strokeDashoffset: "0" },
        },
        "ptt-ripple": {
          from: { transform: "scale(1)", opacity: "0.35" },
          to: { transform: "scale(1.18)", opacity: "0" },
        },
        "ptt-bump": {
          from: { transform: "scale(1.08)", opacity: "0.45" },
          to: { transform: "scale(1)", opacity: "0.2" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "ptt-draw": "ptt-draw 0.35s ease-out both",
        "ptt-ripple": "ptt-ripple 1.4s ease-out infinite",
        "ptt-bump": "ptt-bump 0.3s ease-out both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
