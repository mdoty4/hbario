import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type ChatMessage = {
  role: string;
  content: string;
};

export type ChatRequestBody = {
  messages: ChatMessage[];
  stream?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    // Get token from cookie
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Verify token
    const payload = verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { messages, stream } = body as ChatRequestBody;

    // Validate messages exists and is a non-empty array
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages must be a non-empty array" },
        { status: 400 }
      );
    }

    // Fetch AppConfig from Prisma
    const config = await prisma.appConfig.findUnique({
      where: { id: "global" },
    });

    if (!config) {
      return NextResponse.json(
        { error: "No AI provider is configured on the server." },
        { status: 400 }
      );
    }

    const { provider, apiBase, apiKey, model, maxTokens } = config;

    // Return 400 if no provider is configured (empty apiKey)
    if (!apiKey || apiKey.trim() === "") {
      return NextResponse.json(
        { error: "No AI provider is configured on the server." },
        { status: 400 }
      );
    }

    // Config is valid — proceed with chat logic
    const providerResponse = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        stream: stream || false,
      }),
    });

    if (!providerResponse.ok) {
      const errorBody = await providerResponse.text();
      console.error("Provider API error:", providerResponse.status, errorBody);
      return NextResponse.json(
        { error: `Provider API error: ${providerResponse.status} ${errorBody}` },
        { status: providerResponse.status }
      );
    }

    // If streaming is requested, pipe the provider's SSE stream through
    if (stream) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      const providerStream = providerResponse.body;

      if (!providerStream) {
        return NextResponse.json(
          { error: "Provider did not return a streamable response" },
          { status: 500 }
        );
      }

      // Create a ReadableStream that transforms the provider's SSJSON/SSE
      // response into a Next.js ReadableStream for streaming to the client
      const stream = new ReadableStream({
        async start(controller) {
          const reader = providerStream.getReader();

          try {
            while (true) {
              const { done, value } = await reader.read();

              if (done) {
                controller.close();
                break;
              }

              // Decode the chunk and forward it to the client
              const chunk = decoder.decode(value, { stream: true });
              controller.enqueue(encoder.encode(chunk));
            }
          } catch (error) {
            console.error("Stream error:", error);
            controller.error(error);
          } finally {
            reader.releaseLock();
          }
        },
      });

      return new NextResponse(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const providerData = await providerResponse.json();
    return NextResponse.json(providerData, { status: 200 });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
