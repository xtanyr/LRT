CREATE TABLE "user_supervisions" (
    "id" SERIAL NOT NULL,
    "supervisorId" INTEGER NOT NULL,
    "leaderId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_supervisions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "user_supervisions_leaderId_idx" ON "user_supervisions"("leaderId");
CREATE UNIQUE INDEX "user_supervisions_supervisorId_leaderId_key" ON "user_supervisions"("supervisorId", "leaderId");
ALTER TABLE "user_supervisions" ADD CONSTRAINT "user_supervisions_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_supervisions" ADD CONSTRAINT "user_supervisions_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
