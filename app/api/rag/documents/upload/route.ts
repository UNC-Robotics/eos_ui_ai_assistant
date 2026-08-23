import { NextRequest, NextResponse } from 'next/server';

const RAG_SERVER_URL = process.env.RAG_SERVER_URL || 'http://localhost:8071';

export async function POST(request: NextRequest) {
  const formData = await request.formData();

  const response = await fetch(`${RAG_SERVER_URL}/documents/upload`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
