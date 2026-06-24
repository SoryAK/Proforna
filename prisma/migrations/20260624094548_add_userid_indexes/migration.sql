-- CreateIndex
CREATE INDEX "Contact_userId_idx" ON "Contact"("userId");

-- CreateIndex
CREATE INDEX "Residence_userId_idx" ON "Residence"("userId");

-- CreateIndex
CREATE INDEX "WorkHistory_userId_idx" ON "WorkHistory"("userId");

-- RenameIndex
ALTER INDEX "ProcedureLink_from_to_relationship_key" RENAME TO "ProcedureLink_fromProcedureId_toProcedureId_relationship_key";
