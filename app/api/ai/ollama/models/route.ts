import { NextResponse } from 'next/server';
import { DEFAULT_OLLAMA_BASE_URL } from '@/lib/ai/providers';

/**
 * List the models installed on an Ollama server.
 *
 * The browser usually cannot reach Ollama directly (the EOS server is the one
 * that talks to it), so the settings panel asks the server to enumerate them.
 * Returns exact `name:tag` ids straight from Ollama, never a curated list.
 */
export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get('baseUrl')?.trim();
  const baseUrl = requested || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL;

  let modelsUrl: string;
  try {
    modelsUrl = new URL(`${baseUrl.replace(/\/+$/, '')}/models`).toString();
  } catch {
    return NextResponse.json({ error: `Not a valid URL: ${baseUrl}` }, { status: 400 });
  }

  try {
    const response = await fetch(modelsUrl, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      return NextResponse.json({ error: `Ollama returned HTTP ${response.status}` }, { status: 502 });
    }
    const body = (await response.json()) as { data?: Array<{ id?: string }> };
    const models = (body.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
    return NextResponse.json({ models });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Cannot reach Ollama at ${baseUrl}: ${reason}` }, { status: 502 });
  }
}
