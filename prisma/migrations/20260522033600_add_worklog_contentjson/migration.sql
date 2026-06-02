-- Phase 1a: rich-text source-of-truth column for WorkLog.
-- `contentJson` stores the ProseMirror JSON document used by the Tiptap editor.
-- The existing `content` column is retained as a plain-text projection so legacy
-- search, exports, and AI consumers continue to work unchanged.
ALTER TABLE "WorkLog" ADD COLUMN "contentJson" JSONB;
