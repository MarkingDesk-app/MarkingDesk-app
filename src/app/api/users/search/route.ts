import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, getClientIp, RateLimitError } from "@/lib/rate-limit";
import { getDisplayName } from "@/lib/user-display";

const SEARCH_RESULT_LIMIT = 20;

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json({ users: [] });
  }

  try {
    assertRateLimit({
      key: `user-search:${session.user.id}:${getClientIp(request.headers)}`,
      limit: 60,
      windowMs: 60 * 1000,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    throw error;
  }

  const users = await prisma.user.findMany({
    where: query
      ? {
          OR: [
            {
              name: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              email: {
                contains: query,
                mode: "insensitive",
              },
            },
          ],
        }
      : undefined,
    orderBy: [{ name: "asc" }, { email: "asc" }],
    take: SEARCH_RESULT_LIMIT,
    select: {
      id: true,
      name: true,
      email: true,
      passwordHash: true,
      emailVerified: true,
    },
  });

  return NextResponse.json({
    users: users.map((user) => ({
      id: user.id,
      name: getDisplayName(user),
      email: user.email,
      meta: user.passwordHash && user.emailVerified ? undefined : "Invitation pending",
    })),
  });
}
