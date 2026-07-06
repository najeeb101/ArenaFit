import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { GameModule } from "./game/game.module";
import { LeaderboardModule } from "./leaderboard/leaderboard.module";
import { PresenceModule } from "./presence/presence.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProgressionModule } from "./progression/progression.module";
import { SocialModule } from "./social/social.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    GameModule,
    ProgressionModule,
    LeaderboardModule,
    PresenceModule,
    SocialModule,
  ],
})
export class AppModule {}
