import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-gray-50 px-4">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          Welcome to hbario
        </h1>
        <p className="mt-6 text-lg leading-8 text-gray-600">
          Build and manage decentralized applications on the Hedera network.
          Create workflows, chat with AI, and manage your wallet — all in one place.
        </p>
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <Link
            href="/register"
            className="rounded-md bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="text-sm font-semibold text-gray-900 hover:text-blue-600"
          >
            Sign in <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

