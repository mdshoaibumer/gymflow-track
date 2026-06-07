import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-inter)", "system-ui", "sans-serif"],
      },
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
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        "accent-warm": {
          DEFAULT: "hsl(var(--accent-warm))",
          foreground: "hsl(var(--accent-warm-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
        },
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
        // Fluid typography for headings
        "fluid-4xl": ["clamp(2rem, 4vw + 0.5rem, 3.5rem)", { lineHeight: "1.1" }],
        "fluid-3xl": ["clamp(1.75rem, 3vw + 0.5rem, 2.5rem)", { lineHeight: "1.15" }],
        "fluid-2xl": ["clamp(1.5rem, 2vw + 0.5rem, 2rem)", { lineHeight: "1.2" }],
      },
      boxShadow: {
        "soft": "0 2px 8px -2px rgba(0, 0, 0, 0.05), 0 4px 12px -4px rgba(0, 0, 0, 0.04)",
        "soft-md": "0 4px 16px -4px rgba(0, 0, 0, 0.08), 0 2px 8px -2px rgba(0, 0, 0, 0.04)",
        "soft-lg": "0 8px 32px -8px rgba(0, 0, 0, 0.12), 0 4px 16px -4px rgba(0, 0, 0, 0.06)",
        "soft-xl": "0 16px 48px -12px rgba(0, 0, 0, 0.15), 0 8px 24px -8px rgba(0, 0, 0, 0.08)",
        "glow": "0 0 20px -4px hsl(var(--primary) / 0.18), 0 0 8px -2px hsl(var(--primary) / 0.1)",
        "glow-warm": "0 0 20px -4px hsl(var(--accent-warm) / 0.2)",
        "glow-lg": "0 0 40px -8px hsl(var(--primary) / 0.2), 0 0 16px -4px hsl(var(--primary) / 0.1)",
        // Dark mode enhanced shadows with stronger depth
        "dark-soft": "0 2px 10px -2px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.2), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)",
        "dark-soft-md": "0 4px 20px -4px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3), inset 0 1px 0 0 rgba(255, 255, 255, 0.06)",
        "dark-soft-lg": "0 8px 32px -8px rgba(0, 0, 0, 0.6), 0 4px 12px rgba(0, 0, 0, 0.4), inset 0 1px 0 0 rgba(255, 255, 255, 0.07)",
        "dark-glow": "0 0 24px -4px hsl(var(--primary) / 0.25), inset 0 1px 0 0 rgba(255, 255, 255, 0.06)",
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
        "slide-in-right": {
          from: { transform: "translateX(100%)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "content-show": {
          from: { opacity: "0", transform: "scale(0.96) translateY(4px)" },
          to: { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        "fade-in-scale": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        "gradient-x": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "slide-up-fade": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "chart-grow": {
          from: { transform: "scaleY(0)", transformOrigin: "bottom" },
          to: { transform: "scaleY(1)", transformOrigin: "bottom" },
        },
        "orbit": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "25%": { transform: "translate(10px, -15px) scale(1.05)" },
          "50%": { transform: "translate(-5px, 10px) scale(0.95)" },
          "75%": { transform: "translate(-10px, -5px) scale(1.02)" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 20px -4px hsl(var(--primary) / 0.15)" },
          "50%": { boxShadow: "0 0 30px -2px hsl(var(--primary) / 0.25)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.92)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-down-fade": {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "breathe": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.8" },
          "50%": { transform: "scale(1.05)", opacity: "1" },
        },
        "border-flow": {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        "ring-pulse": {
          "0%": { transform: "scale(1)", opacity: "0.6" },
          "100%": { transform: "scale(1.4)", opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.2s ease-out",
        shimmer: "shimmer 1.5s ease-in-out infinite",
        "content-show": "content-show 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in-scale": "fade-in-scale 0.15s ease-out",
        "float": "float 3s ease-in-out infinite",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        "gradient-x": "gradient-x 3s ease infinite",
        "slide-up-fade": "slide-up-fade 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        "chart-grow": "chart-grow 0.45s cubic-bezier(0.16, 1, 0.3, 1)",
        "orbit-slow": "orbit 12s ease-in-out infinite",
        "orbit-medium": "orbit 8s ease-in-out infinite reverse",
        "orbit-fast": "orbit 6s ease-in-out infinite",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
        "scale-in": "scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-down-fade": "slide-down-fade 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        "breathe": "breathe 3s ease-in-out infinite",
        "border-flow": "border-flow 4s ease infinite",
        "ring-pulse": "ring-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      transitionTimingFunction: {
        "ease-spring": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
