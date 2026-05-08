export default function MembersPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Members</h1>
          <p className="text-muted-foreground text-sm">
            Manage your gym members
          </p>
        </div>
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
          + Add Member
        </button>
      </div>

      {/* Member list placeholder */}
      <div className="rounded-lg border p-8 text-center text-muted-foreground">
        <p>No members yet. Add your first member to get started.</p>
      </div>
    </div>
  );
}
