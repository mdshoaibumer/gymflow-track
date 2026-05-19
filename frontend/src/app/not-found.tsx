import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 p-8 text-center bg-background">
      <div className="rounded-xl bg-muted/60 p-5">
        <FileQuestion className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">404</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>
      <Button asChild size="sm">
        <Link href="/">Go Home</Link>
      </Button>
    </main>
  );
}
