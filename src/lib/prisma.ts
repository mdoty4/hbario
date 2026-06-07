import { PrismaClient } from "@/generated/prisma/client";
import { PrismaSqlite } from "prisma-adapter-sqlite";

const sqlite = new PrismaSqlite({
  url: process.env.DATABASE_URL || "file:./dev.db",
});

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient<any, any, any>;
};

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({ adapter: sqlite }) as PrismaClient<any, any, any>;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

