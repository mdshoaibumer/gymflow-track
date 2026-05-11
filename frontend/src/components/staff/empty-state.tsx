"use client";

import { Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  hasFilters: boolean;
  onClearFilters?: () => void;
  onAddStaff?: () => void;
}

export function StaffEmptyState({
  hasFilters,
  onClearFilters,
  onAddStaff,
}: EmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Users className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">
          {hasFilters ? "No results found" : "No staff members yet"}
        </h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm text-center">
          {hasFilters
            ? "Try adjusting your search or filters."
            : "Add your first staff or admin user to delegate gym management tasks."}
        </p>
        {hasFilters && onClearFilters ? (
          <Button variant="outline" className="mt-4" onClick={onClearFilters}>
            Clear Filters
          </Button>
        ) : !hasFilters && onAddStaff ? (
          <Button className="mt-4" onClick={onAddStaff}>
            Add First Staff Member
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
