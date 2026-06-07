import Link from "next/link";

export default function WorkflowsPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Workflows
          </h1>
          <p className="mt-2 text-gray-600">
            Manage and execute your Hedera workflows.
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center shadow-sm">
          <p className="text-gray-500">
            No workflows yet. Create your first workflow to get started.
          </p>
          <button className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500">
            Create Workflow
          </button>
        </div>
        {/* Placeholder workflow list for navigation testing */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((id) => (
            <Link
              key={id}
              href={`/workflows/${id}`}
              className="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm hover:border-blue-300 hover:shadow-md transition"
            >
              <h3 className="text-lg font-semibold text-gray-900">
                Workflow #{id}
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                Click to view details and execute this workflow.
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
