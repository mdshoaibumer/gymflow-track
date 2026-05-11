import { PageSkeleton } from "@/components/page-skeleton";

export default function MemberDetailLoading() {
  return <PageSkeleton cards={3} table rows={5} />;
}
