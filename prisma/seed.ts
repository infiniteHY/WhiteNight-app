/**
 * prisma/seed.ts
 * 数据库种子文件
 * 创建初始管理员账号、邀请码和系统配置
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 开始初始化数据库种子数据...");

  // 1. 创建超级管理员（群主）
  const adminPasswordHash = await bcrypt.hash("admin123456", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@whitenight.com" },
    update: {},
    create: {
      email: "admin@whitenight.com",
      passwordHash: adminPasswordHash,
      nickname: "群主",
      role: "super_admin",
      status: "active",
      jiaguBalance: 0,
    },
  });

  console.log(`✅ 超级管理员创建完成：${admin.nickname} (${admin.email})`);

  // 2. 创建默认邀请码
  const defaultInvite = await prisma.inviteCode.upsert({
    where: { code: "WHITENIGHT2026" },
    update: {},
    create: {
      code: "WHITENIGHT2026",
      createdBy: admin.id,
    },
  });

  console.log(`✅ 默认邀请码创建完成：${defaultInvite.code}`);

  // 3. 创建测试居民账号
  const residentPasswordHash = await bcrypt.hash("resident123", 12);

  const testResident = await prisma.user.upsert({
    where: { email: "resident@whitenight.com" },
    update: {},
    create: {
      email: "resident@whitenight.com",
      passwordHash: residentPasswordHash,
      nickname: "小书虫",
      role: "resident",
      status: "active",
      jiaguBalance: 50, // 初始赠送50甲骨
    },
  });

  console.log(`✅ 测试居民账号创建完成：${testResident.nickname}`);

  // 4. 为测试居民创建欢迎通知
  await prisma.notification.create({
    data: {
      userId: testResident.id,
      type: "system",
      content: "🎉 欢迎加入白夜读书会！初始赠送50甲骨，祝您阅读愉快！",
    },
  });

  // 5. 创建测试书单岗NPC
  const npcPasswordHash = await bcrypt.hash("npc123456", 12);

  const booklistNpc = await prisma.user.upsert({
    where: { email: "booklist@whitenight.com" },
    update: {},
    create: {
      email: "booklist@whitenight.com",
      passwordHash: npcPasswordHash,
      nickname: "书单官",
      role: "booklist_npc",
      status: "active",
      jiaguBalance: 0,
    },
  });

  console.log(`✅ 书单岗NPC创建完成：${booklistNpc.nickname}`);

  // 6. 创建测试书籍数据
  const testBooks = [
    {
      title: "百年孤独",
      author: "加西亚·马尔克斯",
      genre: "魔幻现实主义",
      wordCount: 350000,
      doubanScore: 9.2,
      source: "npc",
    },
    {
      title: "平凡的世界",
      author: "路遥",
      genre: "现实主义",
      wordCount: 1000000,
      doubanScore: 9.0,
      source: "npc",
    },
    {
      title: "活着",
      author: "余华",
      genre: "现实主义",
      wordCount: 130000,
      doubanScore: 9.4,
      source: "npc",
    },
    {
      title: "围城",
      author: "钱钟书",
      genre: "讽刺文学",
      wordCount: 200000,
      doubanScore: 8.9,
      source: "npc",
    },
    {
      title: "三体",
      author: "刘慈欣",
      genre: "科幻",
      wordCount: 900000,
      doubanScore: 9.4,
      source: "npc",
    },
  ];

  for (const book of testBooks) {
    await prisma.book.create({ data: book });
  }

  console.log(`✅ 测试书籍数据创建完成：${testBooks.length}本`);

  // 7. 创建系统配置
  const systemConfigs = [
    { key: "rename_cost", value: "10" },
    { key: "note_min_words", value: "1000" },
    { key: "note_reward", value: "5" },
    { key: "discussion_early_reward", value: "3" },
    { key: "discussion_mid_reward", value: "1" },
    { key: "discussion_late_reward", value: "0" },
    { key: "simple_task_monthly_limit", value: "5" },
    { key: "share_task_monthly_limit", value: "5" },
    { key: "share_task_monthly_max", value: "30" },
    { key: "selection_timeout_penalty", value: "5" },
    { key: "breach_first_penalty", value: "5" },
    { key: "breach_second_penalty", value: "10" },
    { key: "black_box_cost", value: "10" },
    { key: "black_box_receive", value: "8" },
    { key: "dodge_cost", value: "10" },
    { key: "discussion_bye_cost", value: "8" },
  ];

  for (const config of systemConfigs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: { value: config.value },
      create: config,
    });
  }

  console.log(`✅ 系统配置初始化完成：${systemConfigs.length}项`);

  // 8. 创建第一期书单（演示）
  const currentMonth = new Date().toISOString().slice(0, 7);
  const firstBookList = await prisma.bookList.upsert({
    where: { id: "first-booklist" },
    update: {},
    create: {
      id: "first-booklist",
      period: 1,
      month: currentMonth,
      type: "normal",
      status: "draft",
    },
  });

  console.log(`✅ 第一期书单创建完成：${currentMonth}`);

  console.log("\n🎉 数据库种子数据初始化完成！\n");
  console.log("=".repeat(50));
  console.log("管理员账号信息：");
  console.log("  邮箱：admin@whitenight.com");
  console.log("  密码：admin123456");
  console.log("  昵称：群主");
  console.log("");
  console.log("测试居民账号：");
  console.log("  邮箱：resident@whitenight.com");
  console.log("  密码：resident123");
  console.log("");
  console.log("默认邀请码：WHITENIGHT2026");
  console.log("=".repeat(50));
}

main()
  .catch((e) => {
    console.error("❌ 种子数据初始化失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
