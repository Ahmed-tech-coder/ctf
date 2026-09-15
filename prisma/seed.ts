import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const FLAG_SALT = process.env.FLAG_SALT || "ctf-platform-flag-salt-2026";

function hashFlag(flag: string): string {
  return crypto
    .createHmac("sha256", FLAG_SALT)
    .update(flag.trim())
    .digest("hex");
}

function createDummyZipBuffer(filename: string, content: string): Buffer {
  const contentHeader = Buffer.from(
    `=== CTF CHALLENGE ARCHIVE ===\nFile: ${filename}\n\nHint: ${content}\n`,
  );
  return contentHeader;
}

async function main() {
  console.log("[SEED] Starting database seeding via Prisma...");

  // 1. Seed Admin
  const adminEmail = "admin@ctf.local";
  const adminPassword = "AdminPass123!";
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.admin.upsert({
    where: { email: adminEmail },
    update: { passwordHash },
    create: {
      email: adminEmail,
      passwordHash,
    },
  });
  console.log(`[SEED] Admin created/updated: ${adminEmail}`);

  // Ensure local upload storage directory exists
  const localUploadDir = path.resolve(__dirname, "../uploads/challenges");
  if (!fs.existsSync(localUploadDir)) {
    fs.mkdirSync(localUploadDir, { recursive: true });
  }

  const storeDummyFile = (slug: string, fileContent: string): string => {
    const filename = `${slug}_challenge.zip`;
    const fullPath = path.join(localUploadDir, filename);
    const buf = createDummyZipBuffer(`${slug}.txt`, fileContent);
    fs.writeFileSync(fullPath, buf);
    return filename;
  };

  // 2. Seed Sample Challenges
  const sampleChallenges = [
    {
      title: "Linux Basics - Foundational Commands",
      slug: "linux-basics",
      description:
        "Welcome to your first CTF challenge! Download the challenge archive, extract its contents, and find the hidden flag inside the system metadata file.",
      category: "Linux",
      points: 100,
      maxAttempts: 5,
      rawFlag: "CTF{l1nux_b4s1cs_m4st3r_2026}",
      status: "PUBLISHED",
      fileContent:
        "Solve: Inspect the file system. Flag is CTF{l1nux_b4s1cs_m4st3r_2026}",
    },
    {
      title: "Linux File Hunting - Hidden Credentials",
      slug: "linux-file-hunting",
      description:
        "A rogue process hid credentials in a nested directory structure. Search through the provided filesystem tree for log files ending in .secret.",
      category: "Linux",
      points: 200,
      maxAttempts: 3,
      rawFlag: "CTF{g3tp_h1dd3n_f1l3s_4291}",
      status: "PUBLISHED",
      fileContent:
        'Hint: grep -rnw "." -e "CTF{" to locate the hidden flag: CTF{g3tp_h1dd3n_f1l3s_4291}',
    },
    {
      title: "Linux Permissions & SUID Bits",
      slug: "linux-permissions",
      description:
        "Investigate SUID permission misconfigurations on Linux binaries. Determine which binary allows elevated privileges and locate the root flag.",
      category: "Linux",
      points: 300,
      maxAttempts: 3,
      rawFlag: "CTF{su1d_pr1v_3sc4l4t10n_9981}",
      status: "PUBLISHED",
      fileContent: "SUID Challenge: CTF{su1d_pr1v_3sc4l4t10n_9981}",
    },
    {
      title: "Web Reconnaissance & Comments",
      slug: "web-recon",
      description:
        "A web app was archived into this ZIP file. Inspect the static HTML source code comments, header configurations, and developer notes to discover the flag.",
      category: "Web",
      points: 150,
      maxAttempts: 4,
      rawFlag: "CTF{h1dd3n_1n_html_c0mm3nts_5512}",
      status: "PUBLISHED",
      fileContent:
        "<!-- Hidden Dev Note: CTF{h1dd3n_1n_html_c0mm3nts_5512} -->",
    },
    {
      title: "Basic Base64 Encoding & Cryptography",
      slug: "basic-encoding",
      description:
        "The target flag has been multi-encoded using Base64 and Hexadecimal representation. Decode the cipher string provided in cipher.txt.",
      category: "Cryptography",
      points: 100,
      maxAttempts: 5,
      rawFlag: "CTF{b4s364_d3c0d3_succ3ss_7719}",
      status: "PUBLISHED",
      fileContent: "Cipher text: Q1RGe2I0czY0X2QzYzBkM19zdWNjM3NzXzc3MTl9",
    },
  ];

  for (const c of sampleChallenges) {
    const filePath = storeDummyFile(c.slug, c.fileContent);
    const flagHash = hashFlag(c.rawFlag);

    await prisma.challenge.upsert({
      where: { slug: c.slug },
      update: {
        title: c.title,
        description: c.description,
        category: c.category,
        points: c.points,
        maxAttempts: c.maxAttempts,
        flagHash,
        filePath,
        status: c.status,
      },
      create: {
        title: c.title,
        slug: c.slug,
        description: c.description,
        category: c.category,
        points: c.points,
        maxAttempts: c.maxAttempts,
        flagHash,
        filePath,
        status: c.status,
      },
    });
  }
  console.log(`[SEED] Seeded ${sampleChallenges.length} sample challenges.`);

  // 3. Seed Sample Members
  const sampleMembers = [
    { fullName: "Ahmed Magdy Rabie", score: 450 },
    { fullName: "Mohamed Ali Hassan", score: 350 },
    { fullName: "Youssef Ahmed Ibrahim", score: 250 },
    { fullName: "Laila Mahmoud Reda", score: 100 },
    { fullName: "Omar Khaled Said", score: 0 },
  ];

  for (const m of sampleMembers) {
    const existing = await prisma.member.findFirst({
      where: { fullName: m.fullName },
    });
    if (!existing) {
      await prisma.member.create({
        data: {
          fullName: m.fullName,
          score: m.score,
        },
      });
    }
  }
  console.log(`[SEED] Seeded ${sampleMembers.length} sample members.`);

  console.log("[SEED] Database seeding complete!");
}

main()
  .catch((e) => {
    console.error("[SEED] Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
