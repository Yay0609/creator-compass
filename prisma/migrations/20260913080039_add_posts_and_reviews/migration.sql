-- CreateTable
CREATE TABLE "PostRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "profileId" TEXT,
    "scriptId" TEXT,
    "platform" TEXT,
    "title" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL,
    "impressions" INTEGER,
    "views" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "saves" INTEGER,
    "shares" INTEGER,
    "followsGained" INTEGER,
    "completionRate" REAL,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PostRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PostRecord_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CreatorProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PostRecord_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "profileId" TEXT,
    "batchId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'batch',
    "postIds" TEXT NOT NULL DEFAULT '[]',
    "postSnapshot" TEXT NOT NULL DEFAULT '[]',
    "baselineSnapshot" TEXT NOT NULL DEFAULT '{}',
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "periodStart" DATETIME,
    "periodEnd" DATETIME,
    "summary" TEXT NOT NULL DEFAULT '',
    "diagnostics" TEXT NOT NULL DEFAULT '[]',
    "highlights" TEXT NOT NULL DEFAULT '[]',
    "problems" TEXT NOT NULL DEFAULT '[]',
    "suggestions" TEXT NOT NULL DEFAULT '[]',
    "nextTopics" TEXT NOT NULL DEFAULT '[]',
    "baselineNote" TEXT NOT NULL DEFAULT '',
    "promptVersion" TEXT,
    "model" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isDiscarded" BOOLEAN NOT NULL DEFAULT false,
    "editedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReviewReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewReport_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CreatorProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PostRecord_userId_publishedAt_idx" ON "PostRecord"("userId", "publishedAt");

-- CreateIndex
CREATE INDEX "PostRecord_userId_createdAt_idx" ON "PostRecord"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewReport_userId_createdAt_idx" ON "ReviewReport"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewReport_userId_batchId_idx" ON "ReviewReport"("userId", "batchId");
