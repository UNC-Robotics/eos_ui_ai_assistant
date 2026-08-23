import { NextResponse } from 'next/server';
import { isZoteroAvailable } from '@/lib/api/zotero';

export async function GET() {
  const available = await isZoteroAvailable();
  return NextResponse.json({ available });
}
