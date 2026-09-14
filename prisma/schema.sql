-- ============================================================
-- CYBERSECURITY CTF PLATFORM - FULL POSTGRESQL DATABASE SCHEMA
-- Copy and run this entire script in Supabase SQL Editor
-- ============================================================

-- Create Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create Enums
DO $$ BEGIN
    CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD', 'EXPERT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "ChallengeStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "SubmissionResult" AS ENUM ('CORRECT', 'INCORRECT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Member Table
CREATE TABLE IF NOT EXISTS "Member" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "fullName" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Member_score_createdAt_idx" ON "Member"("score" DESC, "createdAt" ASC);

-- 2. Admin Table
CREATE TABLE IF NOT EXISTS "Admin" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "email" TEXT UNIQUE NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Challenge Table
CREATE TABLE IF NOT EXISTS "Challenge" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "title" TEXT NOT NULL,
    "slug" TEXT UNIQUE NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'EASY',
    "points" INTEGER NOT NULL,
    "maxAttempts" INTEGER NOT NULL,
    "flagHash" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Challenge_status_category_idx" ON "Challenge"("status", "category");
CREATE INDEX IF NOT EXISTS "Challenge_slug_idx" ON "Challenge"("slug");

-- 4. ChallengeProgress Table
CREATE TABLE IF NOT EXISTS "ChallengeProgress" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "memberId" TEXT NOT NULL REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "challengeId" TEXT NOT NULL REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "attemptsUsed" INTEGER NOT NULL DEFAULT 0,
    "solved" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "solvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChallengeProgress_memberId_challengeId_key" UNIQUE ("memberId", "challengeId")
);

CREATE INDEX IF NOT EXISTS "ChallengeProgress_memberId_idx" ON "ChallengeProgress"("memberId");
CREATE INDEX IF NOT EXISTS "ChallengeProgress_challengeId_idx" ON "ChallengeProgress"("challengeId");

-- 5. Submission Table
CREATE TABLE IF NOT EXISTS "Submission" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "memberId" TEXT NOT NULL REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "challengeId" TEXT NOT NULL REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "result" "SubmissionResult" NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Submission_memberId_challengeId_idx" ON "Submission"("memberId", "challengeId");
CREATE INDEX IF NOT EXISTS "Submission_submittedAt_idx" ON "Submission"("submittedAt" DESC);

-- 6. ScoreHistory Table
CREATE TABLE IF NOT EXISTS "ScoreHistory" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "memberId" TEXT NOT NULL REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "challengeId" TEXT NOT NULL REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ScoreHistory_memberId_idx" ON "ScoreHistory"("memberId");
CREATE INDEX IF NOT EXISTS "ScoreHistory_challengeId_idx" ON "ScoreHistory"("challengeId");

-- ============================================================
-- INITIAL SEED DATA
-- Default Admin: admin@ctf.local / AdminPass123!
-- ============================================================

INSERT INTO "Admin" ("id", "email", "passwordHash")
VALUES (
    gen_random_uuid()::text,
    'admin@ctf.local',
    '$2a$12$R.S4oH.WbSg8UeH/N/V03.H9V/cTzVlU8H2gO3.7lE/L7Jq/V3gqG'
) ON CONFLICT ("email") DO NOTHING;

-- Initial Seed Members
INSERT INTO "Member" ("id", "fullName", "score") VALUES
(gen_random_uuid()::text, 'Ahmed Magdy Rabie', 450),
(gen_random_uuid()::text, 'Mohamed Ali Hassan', 350),
(gen_random_uuid()::text, 'Youssef Ahmed Ibrahim', 250),
(gen_random_uuid()::text, 'Laila Mahmoud Reda', 100),
(gen_random_uuid()::text, 'Omar Khaled Said', 0)
ON CONFLICT DO NOTHING;

-- Initial Seed Challenges
INSERT INTO "Challenge" ("id", "title", "slug", "description", "category", "difficulty", "points", "maxAttempts", "flagHash", "filePath", "status") VALUES
(
    gen_random_uuid()::text,
    'Linux Basics - Foundational Commands',
    'linux-basics',
    'Welcome to your first CTF challenge! Download the challenge archive, extract its contents, and find the hidden flag inside the system metadata file.',
    'Linux',
    'EASY',
    100,
    5,
    '44db1584ea0dbd8a1f8db11c97a2fb6efd8ea17b88df0a195e26b3fa107e3a98',
    'linux-basics_challenge.zip',
    'PUBLISHED'
),
(
    gen_random_uuid()::text,
    'Linux File Hunting - Hidden Credentials',
    'linux-file-hunting',
    'A rogue process hid credentials in a nested directory structure. Search through the provided filesystem tree for log files ending in .secret.',
    'Linux',
    'MEDIUM',
    200,
    3,
    '8318e8749a21b38e0ee4bfd7bcf0560a80e14a1a0f5a9e3d9aaef7b819f72b22',
    'linux-file-hunting_challenge.zip',
    'PUBLISHED'
),
(
    gen_random_uuid()::text,
    'Linux Permissions & SUID Bits',
    'linux-permissions',
    'Investigate SUID permission misconfigurations on Linux binaries. Determine which binary allows elevated privileges and locate the root flag.',
    'Linux',
    'HARD',
    300,
    3,
    'a92d2ea78eefb20c995e809312981bd6d0fcfae2889dd6f709bc87dfd125208f',
    'linux-permissions_challenge.zip',
    'PUBLISHED'
),
(
    gen_random_uuid()::text,
    'Web Reconnaissance & Comments',
    'web-recon',
    'A web app was archived into this ZIP file. Inspect the static HTML source code comments, header configurations, and developer notes to discover the flag.',
    'Web',
    'EASY',
    150,
    4,
    '1e0b57e79b9087c5fb6e133e387140e062eb1a921d7b30ef31ff248ff8a1a361',
    'web-recon_challenge.zip',
    'PUBLISHED'
),
(
    gen_random_uuid()::text,
    'Basic Base64 Encoding & Cryptography',
    'basic-encoding',
    'The target flag has been multi-encoded using Base64 and Hexadecimal representation. Decode the cipher string provided in cipher.txt.',
    'Cryptography',
    'EASY',
    100,
    5,
    '5d6ff73df267bb8e3f9463c66f7f2bcfdfb6ef72e09b1fbf48a9ffb7fa20320a',
    'basic-encoding_challenge.zip',
    'PUBLISHED'
) ON CONFLICT ("slug") DO NOTHING;
