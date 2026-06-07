"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import {
  ArrowRight,
  Users,
  CreditCard,
  CalendarCheck,
  Bell,
  BarChart3,
  Wrench,
  Shield,
  Zap,
  CheckCircle2,
  Star,
  ChevronDown,
  IndianRupee,
  Menu,
  X,
  Sparkles,
  TrendingUp,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollReveal, StaggerContainer, staggerItemVariants } from "@/components/scroll-reveal";
import { AnimatedCounter } from "@/components/animated-counter";
import { FloatingOrbs } from "@/components/floating-orbs";

const features = [
  { icon: Users, title: "Member Management", desc: "Add, search, and manage all your gym members. Track plans, status, and history in one place.", span: "sm:col-span-2 sm:row-span-2" },
  { icon: CreditCard, title: "Payments & Revenue", desc: "Record cash, UPI, and card payments. Track dues, generate invoices, and export CSV reports.", span: "" },
  { icon: CalendarCheck, title: "Attendance Tracking", desc: "QR code check-in, manual entry, and live attendance dashboard with daily/weekly trends.", span: "" },
  { icon: Bell, title: "WhatsApp Reminders", desc: "Automated expiry reminders, renewal notifications, and payment overdue alerts via WhatsApp.", span: "" },
  { icon: BarChart3, title: "Analytics Dashboard", desc: "Revenue trends, membership distribution, KPIs, and growth metrics — all in real-time.", span: "sm:col-span-2" },
  { icon: Wrench, title: "Equipment Management", desc: "Track gym equipment, maintenance schedules, and asset lifecycle from purchase to retirement.", span: "" },
];

const heroStats = [
  { value: "500+", label: "Active Gyms" },
  { value: "50K+", label: "Members Managed" },
  { value: "99.9%", label: "Uptime" },
  { value: "₹2Cr+", label: "Revenue Tracked" },
];

const plans = [
  {
    name: "Starter",
    price: "₹999",
    period: "/month",
    description: "Perfect for small gyms getting started",
    features: ["Up to 100 active members", "2 staff accounts", "Member management", "Payment tracking", "WhatsApp reminders", "Basic dashboard"],
    popular: false,
  },
  {
    name: "Pro",
    price: "₹1,999",
    period: "/month",
    description: "For growing gyms that need more power",
    features: ["Up to 500 active members", "5 staff accounts", "QR attendance", "Advanced analytics", "Revenue insights", "Export reports"],
    popular: true,
  },
  {
    name: "Elite",
    price: "₹2,999",
    period: "/month",
    description: "Unlimited power for serious gyms",
    features: ["Unlimited members", "Unlimited staff", "Automated WhatsApp", "Multi-branch ready", "Dedicated support", "Advanced business insights"],
    popular: false,
  },
];

const testimonials = [
  { name: "Rajesh K.", gym: "FitZone Gym, Hyderabad", text: "GymFlow Track replaced 3 different apps we were using. Everything is in one place now — payments, attendance, reminders. My staff picked it up in minutes.", rating: 5 },
  { name: "Priya M.", gym: "Iron Paradise, Bangalore", text: "The WhatsApp reminders alone saved us ₹20,000/month in missed renewals. We now have 95% renewal rates.", rating: 5 },
  { name: "Vikram S.", gym: "PowerHouse Fitness, Delhi", text: "Clean, fast, and built for Indian gyms. UPI payments, Indian phone validation, everything just works. No more Excel sheets.", rating: 5 },
];

const faqs = [
  { q: "How long does setup take?", a: "Under 10 minutes. Register, add your gym details, import members via CSV or add manually — and you're live." },
  { q: "Can my staff use it too?", a: "Yes! You can invite staff with specific roles (admin, front desk) so they only see what they need." },
  { q: "Is my data secure?", a: "Absolutely. We use industry-standard encryption, HttpOnly cookies for auth, and your data is never shared with third parties." },
  { q: "Do you support UPI/cash/card payments?", a: "Yes — GymFlow Track records all payment methods including cash, UPI, card, and bank transfers. It’s a recording system, not a payment gateway." },
  { q: "Can I export my data?", a: "Yes. Export members, payments, and attendance as CSV files anytime. Your data is always yours." },
  { q: "Is there a free trial?", a: "Yes! Every new account gets a 30-day free trial with all features unlocked. No credit card required." },
];

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <main className="flex min-h-screen flex-col">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/70 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-6xl 2xl:max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <img src="/icon.png" alt="GymFlow Track" className="h-12 w-auto object-contain" />
          </Link>
          <div className="hidden sm:flex items-center gap-6 text-sm">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
            <a href="#testimonials" className="text-muted-foreground hover:text-foreground transition-colors">Reviews</a>
            <a href="#faq" className="text-muted-foreground hover:text-foreground transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/login">Login</Link>
            </Button>
            <Button size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/register">Start Free Trial</Link>
            </Button>
            {/* Mobile hamburger */}
            <Button
              variant="ghost"
              size="icon"
              className="sm:hidden h-9 w-9"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t sm:hidden bg-background px-4 py-4 space-y-3"
          >
            <a href="#features" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-muted-foreground hover:text-foreground">Features</a>
            <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-muted-foreground hover:text-foreground">Pricing</a>
            <a href="#testimonials" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-muted-foreground hover:text-foreground">Reviews</a>
            <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-muted-foreground hover:text-foreground">FAQ</a>
            <div className="flex gap-2 pt-2 border-t">
              <Button variant="ghost" size="sm" asChild className="flex-1">
                <Link href="/login">Login</Link>
              </Button>
              <Button size="sm" asChild className="flex-1">
                <Link href="/register">Start Free Trial</Link>
              </Button>
            </div>
          </motion.div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Premium multi-layer background */}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(45%_50%_at_50%_35%,hsl(var(--primary)/0.14),transparent)]" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(30%_30%_at_80%_70%,hsl(var(--accent-warm)/0.08),transparent)]" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(25%_40%_at_20%_80%,hsl(262_83%_68%/0.06),transparent)]" />
        {/* Subtle grid pattern for depth */}
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(hsl(var(--border)/0.15)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.15)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black_20%,transparent_100%)]" />
        {/* Floating gradient orbs — GPU composited */}
        <FloatingOrbs />
        <div className="mx-auto max-w-6xl 2xl:max-w-7xl px-4 sm:px-6 py-24 sm:py-32 lg:py-40 text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <Badge variant="secondary" className="mb-6 text-xs px-4 py-1.5 border border-primary/10 shadow-soft">
              <Zap className="mr-1.5 h-3 w-3 text-primary" /> 30-day free trial — no credit card required
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl 2xl:text-7xl font-display">
              Gym Management
              <br />
              <span className="text-gradient">Made Simple</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed sm:text-xl 2xl:text-2xl 2xl:max-w-3xl">
              Members, payments, attendance & WhatsApp reminders — all in one place.
              Built for Indian gym owners who want to spend less time on admin and more time training.
            </p>
            <div className="mt-10 flex flex-wrap gap-4 justify-center">
              <div className="press-scale">
                <Button asChild size="lg" className="text-base px-8 h-12 animate-glow-breathe">
                  <Link href="/register">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
              <div className="press-scale">
                <Button variant="outline" size="lg" asChild className="text-base px-8 h-12">
                  <Link href="/login">Login to Dashboard</Link>
                </Button>
              </div>
            </div>
          </motion.div>

          {/* Floating Hero Stats — social proof counters */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="mt-14 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 max-w-2xl mx-auto"
          >
            {heroStats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 + i * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-3 sm:p-4 shadow-soft hover:shadow-soft-md hover:border-primary/20 transition-all duration-300 group"
              >
                <p className="text-xl sm:text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors duration-300">
                  {stat.value}
                </p>
                <p className="text-[11px] sm:text-xs text-muted-foreground font-medium mt-0.5">{stat.label}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* Product screenshot — premium browser frame */}
          <motion.div
            initial={{ opacity: 0, y: 48, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mt-16 max-w-4xl 2xl:max-w-5xl"
          >
            <div className="relative rounded-2xl border border-primary/15 bg-gradient-to-b from-card to-background shadow-2xl overflow-hidden ring-1 ring-black/[0.03] dark:ring-white/[0.03]">
              {/* Glow behind the card */}
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-primary/10 via-transparent to-transparent -z-10 blur-sm" />
              <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-400/80 shadow-inner" />
                  <div className="h-3 w-3 rounded-full bg-yellow-400/80 shadow-inner" />
                  <div className="h-3 w-3 rounded-full bg-green-400/80 shadow-inner" />
                </div>
                <div className="ml-3 flex-1 rounded-lg bg-background/80 px-3 py-1.5 border border-border/50">
                  <span className="text-xs text-muted-foreground">app.gymflowtrack.in/dashboard</span>
                </div>
              </div>
              <div className="p-4 sm:p-6 lg:p-8 bg-background/50 backdrop-blur-sm">
                <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 mb-5">
                  {[
                    { label: "Active Members", value: 248, prefix: "", suffix: "", trend: "+12%", color: "from-blue-500/10 to-blue-500/5" },
                    { label: "Revenue (May)", value: 345600, prefix: "₹", suffix: "", trend: "+8%", format: (n: number) => n.toLocaleString("en-IN"), color: "from-emerald-500/10 to-emerald-500/5" },
                    { label: "Check-ins Today", value: 67, prefix: "", suffix: "", trend: "+5%", color: "from-violet-500/10 to-violet-500/5" },
                  ].map((stat) => (
                    <div key={stat.label} className={`rounded-xl border border-border/60 bg-gradient-to-br ${stat.color} p-3 sm:p-4 shadow-soft hover:shadow-soft-md transition-all duration-300 group hover:-translate-y-0.5`}>
                      <p className="text-[11px] sm:text-xs text-muted-foreground font-medium">{stat.label}</p>
                      <p className="mt-1 text-xl sm:text-2xl font-bold tracking-tight">
                        <AnimatedCounter
                          value={stat.value}
                          prefix={stat.prefix}
                          suffix={stat.suffix}
                          duration={1400}
                          formatFn={stat.format}
                        />
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <TrendingUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">{stat.trend} vs last month</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="h-36 sm:h-44 rounded-xl border border-border bg-card p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <span className="text-[11px] sm:text-xs font-medium text-muted-foreground">Revenue (Last 6 Months)</span>
                    <span className="text-[11px] sm:text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                      <Activity className="h-3 w-3" /> ↑ 23% overall
                    </span>
                  </div>
                  <div className="flex items-end gap-2 sm:gap-3 h-24 sm:h-28 px-1 sm:px-2 pt-2">
                    {[
                      { month: "Dec", h: 40 },
                      { month: "Jan", h: 55 },
                      { month: "Feb", h: 48 },
                      { month: "Mar", h: 70 },
                      { month: "Apr", h: 82 },
                      { month: "May", h: 100 },
                    ].map((bar, i) => (
                      <div key={bar.month} className="flex-1 flex flex-col items-center justify-end h-full">
                        <div
                          className="w-full rounded-t-md bg-gradient-to-t from-primary to-primary/60 animate-chart-grow shadow-sm"
                          style={{ height: `${bar.h}%`, animationDelay: `${0.5 + i * 0.1}s`, animationFillMode: "backwards" }}
                        />
                        <span className="text-[10px] sm:text-[11px] text-muted-foreground mt-1">{bar.month}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Trust bar */}
      <ScrollReveal>
      <section className="border-y bg-muted/30 py-6 sm:py-8">
        <div className="mx-auto max-w-6xl 2xl:max-w-7xl px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <span>Secure & Encrypted</span>
            </div>
            <div className="flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-primary" />
              <span>Built for India</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <span>Setup in 10 minutes</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span>500+ gyms trust us</span>
            </div>
          </div>
        </div>
      </section>
      </ScrollReveal>

      {/* Features — Bento Grid */}
      <section id="features" className="py-20 sm:py-28 content-auto relative">
        {/* Animated gradient divider at top */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 max-w-xl gradient-divider" />
        <div className="mx-auto max-w-6xl 2xl:max-w-7xl px-4 sm:px-6">
          <ScrollReveal>
            <div className="text-center">
              <Badge variant="secondary" className="mb-4 text-xs px-3 py-1 border border-primary/10">
                <Sparkles className="mr-1.5 h-3 w-3 text-primary" /> All-in-one platform
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl 2xl:text-5xl font-display">
                Everything your gym needs
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                Stop juggling spreadsheets, WhatsApp groups, and paper registers.
                GymFlow Track brings it all together.
              </p>
            </div>
          </ScrollReveal>

          {/* Bento Grid Layout */}
          <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {features.map((f, idx) => (
              <ScrollReveal key={f.title} delay={idx * 0.06}>
                <motion.div
                  whileHover={{ y: -4, transition: { type: "spring", stiffness: 400, damping: 25 } }}
                  className={`h-full ${f.span}`}
                >
                  <Card className={`h-full bento-card group relative overflow-hidden border border-border/60 hover:border-primary/20 ${f.span.includes("row-span-2") ? "min-h-[280px]" : ""}`}>
                    {/* Gradient hover overlay */}
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-accent-warm/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-[inherit]" />
                    {/* Top accent line */}
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <CardContent className={`p-6 relative flex flex-col h-full ${f.span.includes("row-span-2") ? "justify-between" : ""}`}>
                      <div>
                        <div className="rounded-xl bg-primary/8 p-3 w-fit group-hover:bg-primary/12 group-hover:scale-110 transition-all duration-300">
                          <f.icon className="h-5 w-5 text-primary" />
                        </div>
                        <h3 className="mt-4 text-lg font-semibold tracking-tight">{f.title}</h3>
                        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                          {f.desc}
                        </p>
                      </div>
                      {/* Mini sparkline decoration for large cards */}
                      {f.span.includes("col-span-2") && (
                        <div className="mt-4 flex items-end gap-[3px] h-8 opacity-40 group-hover:opacity-70 transition-opacity duration-300">
                          {[35, 50, 40, 65, 55, 80, 70, 90, 75, 95, 85, 100].map((h, i) => (
                            <div
                              key={i}
                              className="flex-1 rounded-sm bg-gradient-to-t from-primary/60 to-primary/30"
                              style={{ height: `${h}%` }}
                            />
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing — Glassmorphism */}
      <section id="pricing" className="border-t bg-muted/30 py-20 sm:py-28 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(40%_40%_at_50%_60%,hsl(var(--primary)/0.04),transparent)]" />
        <div className="mx-auto max-w-6xl 2xl:max-w-7xl px-4 sm:px-6">
          <ScrollReveal>
            <div className="text-center">
              <Badge variant="secondary" className="mb-4 text-xs px-3 py-1 border border-primary/10">
                <IndianRupee className="mr-1.5 h-3 w-3 text-primary" /> Simple pricing
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl 2xl:text-5xl font-display">
                Simple, transparent pricing
              </h2>
              <p className="mt-4 text-muted-foreground">
                Start free. Upgrade when you grow. No hidden fees.
              </p>
            </div>
          </ScrollReveal>

          <div className="mt-16 grid gap-6 sm:grid-cols-3 max-w-5xl mx-auto">
            {plans.map((plan, idx) => (
              <ScrollReveal key={plan.name} delay={idx * 0.1}>
                <motion.div
                  whileHover={{ y: -6, transition: { type: "spring", stiffness: 300, damping: 24 } }}
                  className="h-full"
                >
                  <Card
                    className={`relative flex flex-col h-full transition-all duration-300 backdrop-blur-sm ${plan.popular
                      ? "border-primary/30 shadow-glow ring-1 ring-primary/20 bg-gradient-to-b from-primary/[0.04] to-card scale-[1.03]"
                      : "border-border/60 hover:border-primary/15 hover:shadow-soft-md bg-card/80"
                    }`}
                  >
                    {plan.popular && (
                      <>
                        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                          <Badge className="px-4 py-1 shadow-glow bg-gradient-premium text-white border-0 text-xs">
                            <Star className="mr-1 h-3 w-3 fill-white" /> Most Popular
                          </Badge>
                        </div>
                        {/* Animated border glow */}
                        <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-b from-primary/[0.05] to-transparent pointer-events-none" />
                        <div className="absolute -inset-[1px] rounded-[inherit] bg-gradient-to-br from-primary/20 via-transparent to-accent-warm/10 opacity-60 -z-10 blur-[1px]" />
                      </>
                    )}
                    <CardHeader className="pb-4">
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                      <CardDescription>{plan.description}</CardDescription>
                      <div className="mt-4 flex items-baseline gap-1">
                        <span className="text-4xl font-bold tracking-tight">{plan.price}</span>
                        <span className="text-muted-foreground text-sm">{plan.period}</span>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col">
                      <ul className="space-y-3 flex-1">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-center gap-2.5 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        className={`w-full mt-8 h-11 ${plan.popular ? "animate-glow-breathe" : ""}`}
                        variant={plan.popular ? "default" : "outline"}
                        asChild
                      >
                        <Link href="/register">
                          {plan.popular ? "Start Free Trial" : "Get Started"}
                          {plan.popular && <ArrowRight className="ml-2 h-4 w-4" />}
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials — Animated Cards */}
      <section id="testimonials" className="py-20 sm:py-28 content-auto relative overflow-hidden">
        {/* Subtle background gradient */}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(50%_50%_at_50%_50%,hsl(var(--primary)/0.03),transparent)]" />
        <div className="mx-auto max-w-6xl 2xl:max-w-7xl px-4 sm:px-6">
          <ScrollReveal>
            <div className="text-center">
              <Badge variant="secondary" className="mb-4 text-xs px-3 py-1 border border-primary/10">
                <Star className="mr-1.5 h-3 w-3 text-amber-500 fill-amber-500" /> Trusted by gym owners
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl 2xl:text-5xl font-display">
                Loved by gym owners
              </h2>
              <p className="mt-4 text-muted-foreground">
                Here&apos;s what real gym owners have to say.
              </p>
            </div>
          </ScrollReveal>

          <div className="mt-16 grid gap-5 sm:grid-cols-3">
            {testimonials.map((t, idx) => (
              <ScrollReveal key={t.name} delay={idx * 0.12}>
                <motion.div
                  whileHover={{ y: -6, transition: { type: "spring", stiffness: 300, damping: 24 } }}
                  className="h-full"
                >
                  <Card className="h-full border-border/60 hover:border-primary/15 hover:shadow-soft-lg transition-all duration-300 group relative overflow-hidden">
                    {/* Gradient overlay on hover */}
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-accent-warm/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                    <CardContent className="p-6 relative flex flex-col h-full">
                      {/* Star rating with glow effect */}
                      <div className="flex gap-0.5 mb-4">
                        {Array.from({ length: t.rating }).map((_, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.5 + i * 0.05, type: "spring", stiffness: 400 }}
                          >
                            <Star className="h-4 w-4 fill-amber-400 text-amber-400 drop-shadow-[0_0_3px_rgba(251,191,36,0.4)]" />
                          </motion.div>
                        ))}
                      </div>
                      {/* Quote */}
                      <p className="text-sm leading-relaxed text-muted-foreground flex-1">
                        &ldquo;{t.text}&rdquo;
                      </p>
                      {/* Author — premium avatar */}
                      <div className="mt-5 border-t pt-4 flex items-center gap-3">
                        <div className="relative">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/30 to-accent-warm/30 flex items-center justify-center ring-2 ring-background shadow-soft group-hover:ring-primary/20 transition-all duration-300">
                            <span className="text-sm font-bold text-primary">{t.name[0]}</span>
                          </div>
                          {/* Online dot */}
                          <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-background" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{t.name}</p>
                          <p className="text-xs text-muted-foreground">{t.gym}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t bg-muted/30 py-20 sm:py-28 content-auto">
        <div className="mx-auto max-w-3xl 2xl:max-w-4xl px-4 sm:px-6">
          <ScrollReveal>
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl font-display">
                Frequently asked questions
              </h2>
            </div>
          </ScrollReveal>

          <div className="mt-12 space-y-3">
            {faqs.map((faq, idx) => (
              <ScrollReveal key={faq.q} delay={idx * 0.05}>
                <details className="group rounded-xl border bg-card hover:border-primary/15 hover:shadow-soft transition-all duration-300 ease-spring">
                  <summary className="flex cursor-pointer items-center justify-between p-5 text-sm font-medium select-none">
                    {faq.q}
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-300 ease-spring group-open:rotate-180 group-hover:text-primary" />
                  </summary>
                  <div className="border-t px-5 py-4 text-sm text-muted-foreground leading-relaxed animate-content-show">
                    {faq.a}
                  </div>
                </details>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 sm:py-28 relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(50%_50%_at_50%_50%,hsl(var(--primary)/0.06),transparent)]" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(30%_40%_at_70%_70%,hsl(var(--accent-warm)/0.04),transparent)]" />
        <FloatingOrbs />
        <div className="mx-auto max-w-6xl 2xl:max-w-7xl px-4 sm:px-6 text-center">
          <ScrollReveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl 2xl:text-5xl font-display">
              Ready to streamline your gym?
            </h2>
            <p className="mt-4 text-muted-foreground max-w-lg mx-auto leading-relaxed">
              Join 500+ gym owners who stopped using spreadsheets and started using GymFlow Track.
              Free trial, no credit card required.
            </p>
            <div className="mt-10 flex flex-wrap gap-4 justify-center">
              <Button asChild size="lg" className="text-base px-8 h-12 animate-glow-breathe">
                <Link href="/register">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild className="text-base px-8 h-12">
                <Link href="/login">Login</Link>
              </Button>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-card py-12">
        <div className="mx-auto max-w-6xl 2xl:max-w-7xl px-4 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Link href="/" className="flex items-center gap-2">
                <img src="/icon.png" alt="GymFlow Track" className="h-12 w-auto object-contain" />
              </Link>
              <p className="mt-2 text-sm text-muted-foreground max-w-xs">
                Modern gym management software built for Indian fitness businesses.
                Simple, affordable, and powerful.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a></li>
                <li><a href="#testimonials" className="hover:text-foreground transition-colors">Reviews</a></li>
                <li><a href="#faq" className="hover:text-foreground transition-colors">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Account</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/login" className="hover:text-foreground transition-colors">Login</Link></li>
                <li><Link href="/register" className="hover:text-foreground transition-colors">Register</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} GymFlow Track. All rights reserved.
            </p>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Shield className="h-3 w-3" /> SSL Encrypted
              </span>
              <span className="flex items-center gap-1">
                <IndianRupee className="h-3 w-3" /> Made in India
              </span>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
