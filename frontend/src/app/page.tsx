"use client";

import Link from "next/link";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const features = [
  { icon: Users, title: "Member Management", desc: "Add, search, and manage all your gym members. Track plans, status, and history in one place." },
  { icon: CreditCard, title: "Payments & Revenue", desc: "Record cash, UPI, and card payments. Track dues, generate invoices, and export CSV reports." },
  { icon: CalendarCheck, title: "Attendance Tracking", desc: "QR code check-in, manual entry, and live attendance dashboard with daily/weekly trends." },
  { icon: Bell, title: "WhatsApp Reminders", desc: "Automated expiry reminders, renewal notifications, and payment overdue alerts via WhatsApp." },
  { icon: BarChart3, title: "Analytics Dashboard", desc: "Revenue trends, membership distribution, KPIs, and growth metrics — all in real-time." },
  { icon: Wrench, title: "Equipment Management", desc: "Track gym equipment, maintenance schedules, and asset lifecycle from purchase to retirement." },
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
  return (
    <main className="flex min-h-screen flex-col">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-xl font-bold text-primary">
            GymFlow Track
          </Link>
          <div className="hidden sm:flex items-center gap-6 text-sm">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
            <a href="#testimonials" className="text-muted-foreground hover:text-foreground transition-colors">Reviews</a>
            <a href="#faq" className="text-muted-foreground hover:text-foreground transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Login</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">Start Free Trial</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(45%_50%_at_50%_40%,hsl(var(--primary)/0.12),transparent)]" />
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-24 sm:py-32 text-center">
          <div>
            <Badge variant="secondary" className="mb-6 text-xs">
              <Zap className="mr-1 h-3 w-3" /> 30-day free trial — no credit card required
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Gym Management
              <br />
              <span className="text-primary">Made Simple</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              Members, payments, attendance & WhatsApp reminders — all in one place.
              Built for Indian gym owners who want to spend less time on admin and more time training.
            </p>
            <div className="mt-10 flex flex-wrap gap-4 justify-center">
              <Button asChild size="lg" className="text-base px-8">
                <Link href="/register">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild className="text-base px-8">
                <Link href="/login">Login to Dashboard</Link>
              </Button>
            </div>
          </div>

          {/* Product screenshot placeholder */}
          <div className="mx-auto mt-16 max-w-4xl">
            <div className="rounded-xl border-2 border-primary/20 bg-gradient-to-b from-muted to-background shadow-2xl overflow-hidden">
              <div className="flex items-center gap-2 border-b bg-muted px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500" />
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                </div>
                <div className="ml-3 flex-1 rounded-md bg-background/80 px-3 py-1">
                  <span className="text-xs text-muted-foreground">app.gymflowtrack.in/dashboard</span>
                </div>
              </div>
              <div className="p-6 sm:p-8 bg-background/50">
                <div className="grid gap-4 sm:grid-cols-3 mb-6">
                  {[
                    { label: "Active Members", value: "248", trend: "+12%" },
                    { label: "Revenue (May)", value: "₹3,45,600", trend: "+8%" },
                    { label: "Check-ins Today", value: "67", trend: "+5%" },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                      <p className="mt-1 text-2xl font-bold">{stat.value}</p>
                      <p className="text-xs text-green-600 dark:text-green-400">{stat.trend} vs last month</p>
                    </div>
                  ))}
                </div>
                <div className="h-44 rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-muted-foreground">Revenue (Last 6 Months)</span>
                    <span className="text-xs text-green-600 dark:text-green-400">↑ 23% overall</span>
                  </div>
                  <div className="flex items-end gap-3 h-28 px-2 pt-2">
                    {[
                      { month: "Dec", h: 40 },
                      { month: "Jan", h: 55 },
                      { month: "Feb", h: 48 },
                      { month: "Mar", h: 70 },
                      { month: "Apr", h: 82 },
                      { month: "May", h: 100 },
                    ].map((bar) => (
                      <div key={bar.month} className="flex-1 flex flex-col items-center justify-end h-full">
                        <div
                          className="w-full rounded-t-sm bg-primary"
                          style={{ height: `${bar.h}%` }}
                        />
                        <span className="text-[10px] text-muted-foreground mt-1">{bar.month}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-y bg-muted/30 py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
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

      {/* Features */}
      <section id="features" className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything your gym needs
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Stop juggling spreadsheets, WhatsApp groups, and paper registers.
              GymFlow Track brings it all together.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardContent className="p-6">
                    <div className="rounded-lg bg-primary/10 p-2.5 w-fit">
                      <f.icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="mt-4 font-semibold">{f.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                      {f.desc}
                    </p>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t bg-muted/30 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-muted-foreground">
              Start free. Upgrade when you grow. No hidden fees.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-3 max-w-4xl mx-auto">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={`relative flex flex-col ${plan.popular ? "border-primary shadow-lg ring-1 ring-primary" : ""}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="px-3">Most Popular</Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="mt-4">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-2.5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full mt-6"
                    variant={plan.popular ? "default" : "outline"}
                    asChild
                  >
                    <Link href="/register">Get Started</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Loved by gym owners
            </h2>
            <p className="mt-4 text-muted-foreground">
              Here&apos;s what real gym owners have to say.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-3">
            {testimonials.map((t) => (
              <Card key={t.name} className="h-full">
                <CardContent className="p-6">
                  <div className="flex gap-0.5 mb-4">
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    &ldquo;{t.text}&rdquo;
                  </p>
                  <div className="mt-4 border-t pt-4">
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.gym}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t bg-muted/30 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Frequently asked questions
            </h2>
          </div>

          <div className="mt-12 space-y-4">
            {faqs.map((faq) => (
              <details key={faq.q} className="group rounded-lg border bg-card">
                <summary className="flex cursor-pointer items-center justify-between p-4 text-sm font-medium">
                  {faq.q}
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t px-4 py-3 text-sm text-muted-foreground">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 text-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to streamline your gym?
            </h2>
            <p className="mt-4 text-muted-foreground max-w-lg mx-auto">
              Join 500+ gym owners who stopped using spreadsheets and started using GymFlow Track.
              Free trial, no credit card required.
            </p>
            <div className="mt-8 flex flex-wrap gap-4 justify-center">
              <Button asChild size="lg" className="text-base px-8">
                <Link href="/register">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild className="text-base px-8">
                <Link href="/login">Login</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-card py-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Link href="/" className="text-xl font-bold text-primary">
                GymFlow Track
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
