import { PageSkeleton } from "@/components/page-skeleton";

export default function AttendanceLoading() {
  return <PageSkeleton cards={3} table rows={6} />;
}
