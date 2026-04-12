-- CreateTable
CREATE TABLE "MapDrawingLayer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapDrawingLayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapDrawing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "layerId" TEXT,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "zoneType" TEXT,
    "label" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapDrawing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MapDrawingLayer_userId_idx" ON "MapDrawingLayer"("userId");

-- CreateIndex
CREATE INDEX "MapDrawing_userId_idx" ON "MapDrawing"("userId");

-- CreateIndex
CREATE INDEX "MapDrawing_layerId_idx" ON "MapDrawing"("layerId");

-- AddForeignKey
ALTER TABLE "MapDrawingLayer" ADD CONSTRAINT "MapDrawingLayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapDrawing" ADD CONSTRAINT "MapDrawing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapDrawing" ADD CONSTRAINT "MapDrawing_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "MapDrawingLayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
