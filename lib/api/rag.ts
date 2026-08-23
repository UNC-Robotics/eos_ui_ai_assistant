/**
 * EOS RAG Service API Client
 *
 * Handles communication with the EOS RAG service.
 */

const RAG_BASE_URL = process.env.RAG_SERVER_URL || 'http://localhost:8071';

export class RagServiceUnavailableError extends Error {
  constructor() {
    super('EOS RAG server is offline or unreachable');
    this.name = 'RagServiceUnavailableError';
  }
}

async function ragFetch(endpoint: string, options: RequestInit = {}): Promise<unknown> {
  const url = `${RAG_BASE_URL}${endpoint}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } catch {
    throw new RagServiceUnavailableError();
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RAG service error (${response.status}): ${errorText}`);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

export async function ragGet(endpoint: string): Promise<unknown> {
  return ragFetch(endpoint, { method: 'GET', cache: 'no-store' });
}

export async function ragPost(endpoint: string, data?: unknown): Promise<unknown> {
  return ragFetch(endpoint, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function ragPut(endpoint: string, data?: unknown): Promise<unknown> {
  return ragFetch(endpoint, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function ragDelete(endpoint: string): Promise<unknown> {
  return ragFetch(endpoint, { method: 'DELETE' });
}
