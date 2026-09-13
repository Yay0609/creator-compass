-- CreateTable
CREATE TABLE "TopicIdea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "profileId" TEXT,
    "batchId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "angle" TEXT,
    "reason" TEXT NOT NULL,
    "referenceDirection" TEXT NOT NULL,
    "keywords" TEXT NOT NULL DEFAULT '[]',
    "score" INTEGER NOT NULL DEFAULT 0,
    "difficulty" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "model" TEXT,
    "profileSnapshot" TEXT NOT NULL DEFAULT '{}',
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isDiscarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TopicIdea_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TopicIdea_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CreatorProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UsageCounter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UsageCounter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiCallLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "httpStatus" INTEGER,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "promptChars" INTEGER NOT NULL DEFAULT 0,
    "outputChars" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER,
    "errorCode" TEXT,
    "requestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiCallLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TopicIdea_userId_createdAt_idx" ON "TopicIdea"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TopicIdea_userId_batchId_idx" ON "TopicIdea"("userId", "batchId");

-- CreateIndex
CREATE INDEX "UsageCounter_userId_kind_idx" ON "UsageCounter"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "UsageCounter_userId_period_kind_key" ON "UsageCounter"("userId", "period", "kind");

-- CreateIndex
CREATE INDEX "AiCallLog_userId_createdAt_idx" ON "AiCallLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiCallLog_kind_status_createdAt_idx" ON "AiCallLog"("kind", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AiCallLog_requestId_idx" ON "AiCallLog"("requestId");
