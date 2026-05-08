import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="text-center max-w-2xl">
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
          <Link
            href="/register"
            className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
          >
            Start Free Trial
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-border px-6 py-3 text-sm font-semibold hover:bg-accent"
          >
            Login
          </Link>
        </div>
      </div>
    </main>
  );
}
