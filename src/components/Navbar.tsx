"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function Navbar() {
  const { isLoggedIn, user, loading, logout } = useAuth();

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-blue-600">hbario</span>
          </Link>

          {/* Nav Links */}
          <div className="flex items-center gap-6">
            {loading ? (
              <div className="text-sm text-gray-400">Loading...</div>
            ) : isLoggedIn ? (
              <>
                <span className="text-sm text-gray-500">{user?.email}</span>
                <Link
                  href="/chat"
                  className="text-sm font-medium text-gray-700 hover:text-blue-600"
                >
                  Chat
                </Link>
                <Link
                  href="/workflows"
                  className="text-sm font-medium text-gray-700 hover:text-blue-600"
                >
                  Workflows
                </Link>
                <Link
                  href="/mcp"
                  className="text-sm font-medium text-gray-700 hover:text-blue-600"
                >
                  MCP
                </Link>
                <button
                  onClick={logout}
                  className="text-sm font-medium text-gray-700 hover:text-red-600"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-gray-700 hover:text-blue-600"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
