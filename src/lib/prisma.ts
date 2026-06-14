import { PrismaClient } from '@prisma/client'
import { PrismaSqlite } from 'prisma-adapter-sqlite'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

const sqliteAdapter = new PrismaSqlite({
  url: process.env.DATABASE_URL || 'file:./dev.db',
})

export const prisma = globalForPrisma.prisma || new PrismaClient({
  adapter: sqliteAdapter,
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma