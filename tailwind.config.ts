import type { Config } from "tailwindcss";

/**
 * Design System — Azul / Branco / Preto.
 * Toda cor aqui resolve para uma CSS var declarada em src/index.css (`:root` e `.dark`).
 * Nunca adicionar valor literal (hex/rgb) neste arquivo — o tema não conseguiria trocá-lo.
 * Referência: docs/redesign/01-DESIGN-SYSTEM.md
 */
export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        display: ["Space Grotesk", "sans-serif"],
      },
      colors: {
        border: {
          DEFAULT: "hsl(var(--border))",
          strong: "hsl(var(--border-strong))",
        },
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: {
          DEFAULT: "hsl(var(--background))",
          subtle: "hsl(var(--background-subtle))",
        },
        foreground: "hsl(var(--foreground))",

        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          strong: "hsl(var(--primary-strong))",
          "strong-foreground": "hsl(var(--primary-strong-foreground))",
          hover: "hsl(var(--primary-hover))",
          active: "hsl(var(--primary-active))",
          ink: "hsl(var(--primary-ink))",
          soft: "hsl(var(--primary-soft))",
          "soft-foreground": "hsl(var(--primary-soft-foreground))",
          border: "hsl(var(--primary-border))",
        },
        /** Card de destaque (Redesign V2) — `icon`/`arc`/`divider` já são cores completas com alfa. */
        highlight: {
          DEFAULT: "hsl(var(--highlight))",
          foreground: "hsl(var(--highlight-foreground))",
          muted: "hsl(var(--highlight-muted))",
          icon: "var(--highlight-icon)",
          arc: "var(--highlight-arc)",
          divider: "var(--highlight-divider)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          soft: "hsl(var(--destructive-soft))",
          border: "hsl(var(--destructive-border))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger))",
          foreground: "hsl(var(--danger-foreground))",
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
          hover: "hsl(var(--card-hover))",
        },
        surface: {
          DEFAULT: "hsl(var(--surface))",
          hover: "hsl(var(--surface-hover))",
          active: "hsl(var(--surface-active))",
          elevated: "hsl(var(--surface-elevated))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          soft: "hsl(var(--success-soft))",
          border: "hsl(var(--success-border))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          soft: "hsl(var(--warning-soft))",
          border: "hsl(var(--warning-border))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
          soft: "hsl(var(--info-soft))",
          border: "hsl(var(--info-border))",
        },
        neutral: {
          DEFAULT: "hsl(var(--neutral))",
          soft: "hsl(var(--neutral-soft))",
          border: "hsl(var(--neutral-border))",
        },
        /** Escala de texto — `text-ink` (primário) → `text-ink-secondary` → `text-ink-muted`. */
        ink: {
          DEFAULT: "hsl(var(--text-primary))",
          secondary: "hsl(var(--text-secondary))",
          muted: "hsl(var(--text-muted))",
          onbrand: "hsl(var(--text-onbrand))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
          hover: "hsl(var(--sidebar-hover))",
          "hover-foreground": "hsl(var(--sidebar-hover-foreground))",
          active: "hsl(var(--sidebar-active))",
          "active-foreground": "hsl(var(--sidebar-active-foreground))",
          "active-marker": "hsl(var(--sidebar-active-marker))",
          section: "hsl(var(--sidebar-section))",
        },
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
          6: "hsl(var(--chart-6))",
          7: "hsl(var(--chart-7))",
          8: "hsl(var(--chart-8))",
          positive: "hsl(var(--chart-positive))",
          negative: "hsl(var(--chart-negative))",
          neutral: "hsl(var(--chart-neutral))",
          projected: "hsl(var(--chart-projected))",
          grid: "hsl(var(--chart-grid))",
          axis: "hsl(var(--chart-axis))",
          label: "hsl(var(--chart-label))",
          cursor: "hsl(var(--chart-cursor))",
          tooltip: "hsl(var(--chart-tooltip))",
          "tooltip-foreground": "hsl(var(--chart-tooltip-foreground))",
          "tooltip-border": "hsl(var(--chart-tooltip-border))",
        },
        "surface-elevated": "hsl(var(--surface-elevated))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        summary: "var(--radius-summary)",
      },
      backgroundImage: {
        "gradient-highlight": "var(--gradient-highlight)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        card: "var(--shadow-card)",
        glow: "var(--shadow-glow)",
        focus: "var(--shadow-focus)",
        highlight: "var(--shadow-highlight)",
      },
      transitionDuration: {
        fast: "150ms",
        DEFAULT: "200ms",
        slow: "250ms",
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
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- plugin Tailwind CJS sem esModuleInterop neste projeto
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
