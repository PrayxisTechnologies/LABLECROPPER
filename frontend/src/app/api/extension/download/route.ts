import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const backendBase =
      process.env.NEXT_PUBLIC_API_URL ||
      (url.hostname === "localhost" || url.hostname === "127.0.0.1"
        ? "http://localhost:8000/api/v1"
        : `${url.origin}/api/v1`);

    return NextResponse.redirect(`${backendBase}/extension/download`, {
      status: 302,
    });
  } catch (err) {
    return new NextResponse("Failed to initiate extension download", { status: 500 });
  }
}
