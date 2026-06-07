export default function ChatPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-gray-50">
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="max-w-2xl w-full text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Chat
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Chat with AI to build and manage your Hedera applications.
          </p>
          <div className="mt-8 rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p className="text-gray-500">
              Chat interface coming soon. Start a conversation to get help with workflows, smart contracts, and more.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
