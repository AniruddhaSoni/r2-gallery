import { NextRequest, NextResponse } from "next/server";
import { objectExists } from "@/server/r2";

// Process in batches to avoid overwhelming the socket pool
async function batchCheck(
  keys: string[],
  batchSize: number = 50
): Promise<Record<string, boolean>> {
  const map: Record<string, boolean> = {};

  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (k: string) => {
        const exists = await objectExists(k);
        return { key: k, exists };
      })
    );
    results.forEach(({ key, exists }) => {
      map[key] = exists;
    });
  }

  return map;
}

export async function POST(request: NextRequest) {
  try {
    const { keys } = (await request.json()) as { keys: string[] };
    if (!Array.isArray(keys)) {
      return NextResponse.json(
        { error: "keys must be an array" },
        { status: 400 }
      );
    }

    const map = await batchCheck(keys, 50); // Check 50 files at a time
    return NextResponse.json({ exists: map });
  } catch (error: any) {
    console.error("exists check failed:", error);
    return NextResponse.json(
      { error: error?.message || "exists check failed" },
      { status: 500 }
    );
  }
}
