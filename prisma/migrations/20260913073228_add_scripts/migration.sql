-- CreateTable
CREATE TABLE "Script" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "topicId" TEXT,
    "profileId" TEXT,
    "batchId" TEXT NOT NULL,
    "titles" TEXT NOT NULL DEFAULT '[]',
    "hook" TEXT NOT NULL DEFAULT '',
    "outline" TEXT NOT NULL DEFAULT '[]',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "coverCopy" TEXT NOT NULL DEFAULT '',
    "cta" TEXT,
    "platform" TEXT,
    "durationSec" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "model" TEXT,
    "topicSnapshot" TEXT NOT NULL DEFAULT '{}',
    "profileSnapshot" TEXT NOT NULL DEFAULT '{}',
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isDiscarded" BOOLEAN NOT NULL DEFAULT false,
    "editedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Script_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Script_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "TopicIdea" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Script_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CreatorProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Script_userId_createdAt_idx" ON "Script"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Script_userId_topicId_idx" ON "Script"("userId", "topicId");

-- CreateIndex
CREATE INDEX "Script_userId_batchId_idx" ON "Script"("userId", "batchId");
