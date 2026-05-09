"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Users, CreditCard, CalendarCheck, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  { icon: Users, title: "Member Management", desc: "Add, track, and manage all your gym members in one place." },
  { icon: CreditCard, title: "Payments & Revenue", desc: "Record payments, track dues, and view revenue analytics." },
  { icon: CalendarCheck, title: "Attendance Tracking", desc: "QR check-in, manual attendance, and daily reports." },
  { icon: Bell, title: "WhatsApp Reminders", desc: "Automated expiry reminders and renewal notifications." },
];

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col">
      {/* Hero */}
      <section className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl"
        >
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            <span className="text-primary">GymFlow</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Gym software that works in 10 minutes.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Member management, payments, attendance & WhatsApp reminders — all in one place.
          </p>
          <div className="mt-8 flex gap-4 justify-center">
            <Button asChild size="lg">
              <Link href="/register">
                Start Free Trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/login">Login</Link>
            </Button>
          </div>
        </motion.div>

        {/* Features grid */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-20 grid max-w-4xl gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 + i * 0.1 }}
              className="rounded-lg border bg-card p-6 text-left shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="rounded-md bg-primary/10 p-2 w-fit">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>
    </main>
  );
}
