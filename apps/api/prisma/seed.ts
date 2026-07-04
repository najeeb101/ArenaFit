import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { tierForRating, xpForLevel } from "@arenafit/shared";
import { ACHIEVEMENTS } from "../src/progression/achievements";

const prisma = new PrismaClient();

const SEED_PLAYERS = [
  ["AtlasPrime", "US", 1985], ["KaiStorm", "KR", 1890], ["VeraBlaze", "BR", 1810],
  ["MaxPulse", "DE", 1755], ["LunaGrit", "JP", 1700], ["RexIron", "GB", 1655],
  ["ZaraSwift", "FR", 1610], ["OmarFlex", "TR", 1570], ["NikoCharge", "SE", 1530],
  ["IvyRush", "US", 1495], ["DiegoVolt", "MX", 1460], ["SanaPeak", "IN", 1430],
  ["LeoBoulder", "ES", 1400], ["MiraDash", "JP", 1370], ["TomStride", "GB", 1345],
  ["AriaForce", "DE", 1320], ["FinnRapid", "SE", 1295], ["NoraSpark", "FR", 1270],
  ["EliTank", "US", 1250], ["YukiBlitz", "JP", 1230], ["CruzHammer", "MX", 1210],
  ["LiaSurge", "BR", 1190], ["DevPower", "IN", 1170], ["AmaraJet", "US", 1150],
  ["OttoCrush", "DE", 1130], ["RinFlash", "JP", 1110], ["SamRocket", "GB", 1090],
  ["EnzoBolt", "BR", 1070], ["TaraFierce", "US", 1050], ["JinRally", "KR", 1030],
  ["PolaSprint", "SE", 1010], ["MoeSteady", "TR", 990], ["ChloePace", "FR", 970],
  ["ArloDrive", "US", 950], ["MinaPush", "KR", 930], ["GusGrind", "MX", 910],
  ["EmberRise", "GB", 890], ["KoaClimb", "US", 870], ["SofiVigor", "ES", 850],
  ["RudyStart", "DE", 820],
] as const;

async function main() {
  // Achievement catalog (idempotent upserts).
  for (const [i, a] of ACHIEVEMENTS.entries()) {
    await prisma.achievement.upsert({
      where: { id: a.id },
      update: {
        name: a.name,
        description: a.description,
        icon: a.icon,
        xpReward: a.xpReward,
        coinReward: a.coinReward,
        sortOrder: i,
      },
      create: {
        id: a.id,
        name: a.name,
        description: a.description,
        icon: a.icon,
        xpReward: a.xpReward,
        coinReward: a.coinReward,
        sortOrder: i,
      },
    });
  }

  // Ranked ladder population so leaderboards aren't empty on first run.
  const passwordHash = await bcrypt.hash("arenafit-seed", 10);
  for (const [username, country, rating] of SEED_PLAYERS) {
    const wins = Math.max(1, Math.round((rating - 800) / 25) + Math.floor(Math.random() * 8));
    const losses = Math.max(1, Math.round(wins * (0.6 + Math.random() * 0.5)));
    const level = Math.max(1, Math.min(40, Math.round((rating - 850) / 30)));
    await prisma.user.upsert({
      where: { username },
      update: {},
      create: {
        email: `${username.toLowerCase()}@seed.arenafit.local`,
        username,
        passwordHash,
        profile: {
          create: {
            displayName: username,
            country,
            rating,
            tier: tierForRating(rating).id,
            level,
            xp: xpForLevel(level),
            coins: Math.round(rating / 4),
            wins,
            losses,
            totalReps: wins * 22 + losses * 15,
          },
        },
      },
    });
  }

  console.log(`Seeded ${ACHIEVEMENTS.length} achievements and ${SEED_PLAYERS.length} players.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
