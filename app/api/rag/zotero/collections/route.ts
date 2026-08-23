import { NextResponse } from 'next/server';
import { isZoteroAvailable, getAllLibraryCollections } from '@/lib/api/zotero';

export async function GET() {
  if (!(await isZoteroAvailable())) {
    return NextResponse.json(
      { error: 'Zotero is not running. Open the Zotero desktop app and try again.' },
      { status: 503 }
    );
  }

  try {
    const collections = await getAllLibraryCollections();
    return NextResponse.json(collections);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to fetch Zotero collections' },
      { status: 500 }
    );
  }
}
