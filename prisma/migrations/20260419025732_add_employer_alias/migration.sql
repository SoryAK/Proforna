-- CreateTable
CREATE TABLE "EmployerAlias" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployerAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployerAlias_userId_canonicalName_idx" ON "EmployerAlias"("userId", "canonicalName");

-- CreateIndex
CREATE UNIQUE INDEX "EmployerAlias_userId_variantName_key" ON "EmployerAlias"("userId", "variantName");

-- AddForeignKey
ALTER TABLE "EmployerAlias" ADD CONSTRAINT "EmployerAlias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
