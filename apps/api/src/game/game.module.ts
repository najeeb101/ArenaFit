import { Module } from "@nestjs/common";
import { ProgressionModule } from "../progression/progression.module";
import { GameGateway } from "./game.gateway";
import { MatchEngineService } from "./match-engine.service";

@Module({
  imports: [ProgressionModule],
  providers: [GameGateway, MatchEngineService],
})
export class GameModule {}
