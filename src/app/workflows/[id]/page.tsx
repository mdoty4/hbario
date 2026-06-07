import Link from "next/link";

interface WorkflowPageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkflowPage({ params }: WorkflowPageProps) {
  const { id } = await params;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <Link
            href="/workflows"
            className="text-sm font-medium text-blue-600 hover:text-blue-500"
          >
            &larr; Back to Workflows
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900">
            Workflow #{id}
          </h1>
          <p className="mt-2 text-gray-600">
            View and manage this workflow.
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Status</h3>
              <p className="mt-1 text-gray-900">Draft</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Description</h3>
              <p className="mt-1 text-gray-900">
                This is a placeholder workflow. Configure steps and triggers to automate your Hedera operations.
              </p>
            </div>
          </div>
          <div className="mt-6 flex gap-4">
            <Link
              href={`/workflows/${id}/execute`}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
            >
              Execute
            </Link>
            <button className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50">
              Edit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
