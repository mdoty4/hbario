import Link from "next/link";

interface WorkflowExecutePageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkflowExecutePage({ params }: WorkflowExecutePageProps) {
  const { id } = await params;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <Link
            href={`/workflows/${id}`}
            className="text-sm font-medium text-blue-600 hover:text-blue-500"
          >
            &larr; Back to Workflow #{id}
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900">
            Execute Workflow #{id}
          </h1>
          <p className="mt-2 text-gray-600">
            Review and execute this workflow on the Hedera network.
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Workflow ID</h3>
              <p className="mt-1 font-mono text-gray-900">#{id}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Network</h3>
              <p className="mt-1 text-gray-900">Hedera Testnet</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Steps</h3>
              <ul className="mt-1 list-inside list-disc text-gray-900">
                <li>Initialize transaction</li>
                <li>Execute smart contract call</li>
                <li>Confirm on Hedera network</li>
              </ul>
            </div>
          </div>
          <div className="mt-6 flex gap-4">
            <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500">
              Run Workflow
            </button>
            <Link
              href={`/workflows/${id}`}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
