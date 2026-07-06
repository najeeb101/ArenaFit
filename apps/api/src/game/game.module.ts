import { Module } from "@nestjs/common";
import { PresenceModule } from "../presence/presence.module";
import { ProgressionModule } from "../progression/progression.module";
import { GameGateway } from "./game.gateway";
import { MatchEngineService } from "./match-engine.service";

@Module({
  imports: [ProgressionModule, PresenceModule],
  providers: [GameGateway, MatchEngineService],
})
export class GameModule {}
