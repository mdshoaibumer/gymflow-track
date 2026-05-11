import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-muted p-4">
        <FileQuestion className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="max-w-sm space-y-1">
        <h2 className="text-lg font-semibold">Page Not Found</h2>
        <p className="text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/dashboard">Back to Dashboard</Link>
      </Button>
    </div>
  );
}
