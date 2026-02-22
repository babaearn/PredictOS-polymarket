# PredictOS UI Design System — Reusable Prompt

Paste the prompt below into any new session to recreate this exact design language.

---

## THE PROMPT

```
Build a Next.js 14 App Router app using Tailwind CSS with the following design system:

### THEME: "Cyber Terminal / Neon Command Center"
Dark, futuristic trading terminal aesthetic — retro terminal meets modern crypto UI.

---

### COLOR PALETTE (CSS variables in globals.css)
--background:         hsl(200 20% 6%)    /* near-black blue-gray */
--foreground:         hsl(180 100% 95%)  /* near-white cyan tint */
--primary:            hsl(174 100% 41%)  /* bright cyan (main accent) */
--primary-foreground: hsl(200 20% 6%)
--secondary:          hsl(200 20% 12%)
--secondary-foreground: hsl(180 100% 90%)
--card:               hsl(200 25% 8%)
--muted:              hsl(200 15% 15%)
--muted-foreground:   hsl(200 10% 55%)
--border:             hsl(174 40% 20%)   /* muted cyan border */
--input:              hsl(200 20% 10%)
--ring:               hsl(174 100% 41%)

/* Semantic colors */
--success:    hsl(142 76% 36%)   /* green — bullish/YES */
--destructive: hsl(0 84% 60%)   /* red   — bearish/NO  */
--warning:    hsl(38 92% 50%)    /* amber — neutral     */

/* Extended palette for multi-agent flows */
--violet:  hsl(280 70% 50%)   /* aggregator streams */
--amber:   hsl(38 92% 50%)    /* external integrations */

border-radius: 0.5rem

---

### TYPOGRAPHY
Font stack (import from Google Fonts):
- Orbitron        → display/headings (futuristic)
- Space Grotesk   → body/UI labels (clean, technical)
- JetBrains Mono  → code, prices, ticker symbols, terminal output

CSS utilities:
.font-display { font-family: 'Orbitron', sans-serif; }
.font-mono    { font-family: 'JetBrains Mono', monospace; }
Body default  → Space Grotesk

Rendering: antialiased, font-feature-settings: "rlig 1, calt 1"

---

### LAYOUT
Page structure:
  <div class="flex h-screen overflow-hidden">
    <Sidebar />           /* collapsible: w-16 collapsed, w-72 expanded */
    <main class="flex-1 overflow-y-auto overflow-x-hidden">
      {children}
    </main>
  </div>

Background layers (fixed, pointer-events-none):
  1. gradient: bg-gradient-to-br from-background via-background to-primary/5
  2. grid pattern: repeating lines at 3-5% opacity (named .grid-bg)

Sidebar:
  - transition-all duration-300 ease-in-out
  - Dark bg: hsl(200 20% 7%)
  - Collapse toggle button at top
  - Nav items: icon + label, active = bg-primary/10 + cyan glow border
  - "Coming soon" items: opacity-40 cursor-not-allowed
  - Logo section with Orbitron font + version badge

---

### COMPONENT PATTERNS

#### Terminal Output Card
  - Background: bg-card
  - Border: border border-primary/30
  - Box shadow: 0 0 20px hsl(174 100% 41% / 0.15), inset 0 0 20px hsl(174 100% 41% / 0.05)
  - Font: JetBrains Mono
  - Animate lines one-by-one: 50ms delay per line using useEffect + setInterval
  - Dividers: ─────────────── in muted-foreground
  - Section labels: uppercase, text-primary, font-bold
  - Verdict: large text with colored glow (green=BUY, red=SELL, amber=HOLD)

#### Glow Utilities (add to globals.css)
.terminal-border     { border: 1px solid hsl(174 100% 41% / 0.3); box-shadow: 0 0 15px hsl(174 100% 41% / 0.1), inset 0 0 15px hsl(174 100% 41% / 0.05); }
.glow-text           { text-shadow: 0 0 10px hsl(174 100% 41% / 0.8), 0 0 20px hsl(174 100% 41% / 0.4); }
.glow-text-success   { text-shadow: 0 0 10px hsl(142 76% 36% / 0.8), 0 0 20px hsl(142 76% 36% / 0.4); }
.glow-text-danger    { text-shadow: 0 0 10px hsl(0 84% 60% / 0.8), 0 0 20px hsl(0 84% 60% / 0.4); }
.glow-box            { box-shadow: 0 0 30px hsl(174 100% 41% / 0.2), inset 0 0 30px hsl(174 100% 41% / 0.05); }

#### Buttons
Primary:   bg-primary text-primary-foreground hover:brightness-110 transition-all
Secondary: bg-secondary border border-border hover:bg-secondary/50

#### Status Badges
Success:     bg-success/20 border border-success text-success rounded-full px-3 py-1 text-xs
Destructive: bg-destructive/30 border border-destructive text-destructive rounded-full px-3 py-1 text-xs
Neutral:     bg-muted border border-border text-muted-foreground rounded-full px-3 py-1 text-xs

#### Data Flow Lines (multi-agent visualization)
.data-flow-line {
  width: 2px;
  background: linear-gradient(to bottom, transparent, hsl(174 100% 41%), transparent);
  position: relative;
  overflow: hidden;
}
.data-flow-line::after {
  content: '';
  position: absolute;
  width: 100%;
  height: 20px;
  background: white;
  animation: data-pulse 2s linear infinite;
}
@keyframes data-pulse {
  from { top: -20px; } to { top: 100%; }
}

---

### ANIMATIONS (add to tailwind.config keyframes)
fade-in:       opacity 0→1 over 0.6s ease-out
fade-in-up:    opacity 0→1 + translateY(10px→0) over 0.6s ease-out
slide-up:      translateY(20px→0) + opacity over 0.5s ease-out
pulse-live:    opacity 1→0.5→1 over 2s infinite (for live status dots)
pulse-glow:    box-shadow intensity oscillation over 2s infinite
terminal-flicker: opacity 0.98→1.0→0.98 over 0.15s (subtle CRT effect)
shimmer:       background-position sweep for loading skeletons over 1.5s

---

### GLOBAL EFFECTS
/* Scanlines overlay */
.scanlines::before {
  content: '';
  position: fixed;
  inset: 0;
  background: repeating-linear-gradient(
    0deg, transparent, transparent 2px,
    rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px
  );
  pointer-events: none;
}

/* Grid background */
.grid-bg {
  background-image:
    linear-gradient(hsl(174 100% 41% / 0.05) 1px, transparent 1px),
    linear-gradient(90deg, hsl(174 100% 41% / 0.05) 1px, transparent 1px);
  background-size: 40px 40px;
}

---

### COLOR SEMANTICS (always follow)
Cyan    (#00D4B8 approx) = active, primary action, live, selected
Green                   = bullish, YES, buy, success, profit
Red                     = bearish, NO, sell, error, loss
Amber                   = neutral, caution, pending, hold
Violet                  = aggregated/multi-source data
White                   = primary content text
Muted gray              = secondary/disabled content

---

### TECH STACK
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui (base components, then override with this theme)
- Google Fonts: Orbitron, Space Grotesk, JetBrains Mono

### INSTALL COMMANDS
npx create-next-app@latest --typescript --tailwind --app
npx shadcn@latest init
# Set theme to "dark", primary color to hsl(174 100% 41%)
```

---

## Quick Reference Card

| Property | Value |
|---|---|
| Primary color | `hsl(174 100% 41%)` — bright cyan |
| Background | `hsl(200 20% 6%)` — near-black |
| Display font | Orbitron |
| Body font | Space Grotesk |
| Code font | JetBrains Mono |
| Border radius | 0.5rem |
| Sidebar width | 64px / 288px (collapsed/expanded) |
| Glow shadow | `0 0 20px hsl(174 100% 41% / 0.4)` |
| Animation duration | 0.3s transitions, 0.6s entrances, 2s loops |
| Green (bullish) | `hsl(142 76% 36%)` |
| Red (bearish) | `hsl(0 84% 60%)` |
| Amber (neutral) | `hsl(38 92% 50%)` |
