-- CreateTable
CREATE TABLE "ScaffoldMeta" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cluster" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "nodesSeeded" INTEGER NOT NULL DEFAULT 0,
    "edgesSeeded" INTEGER NOT NULL DEFAULT 0,
    "seededAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refreshedAt" TIMESTAMP(3),

    CONSTRAINT "ScaffoldMeta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScaffoldMeta_userId_idx" ON "ScaffoldMeta"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ScaffoldMeta_userId_cluster_key" ON "ScaffoldMeta"("userId", "cluster");

-- AddForeignKey
ALTER TABLE "ScaffoldMeta" ADD CONSTRAINT "ScaffoldMeta_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
