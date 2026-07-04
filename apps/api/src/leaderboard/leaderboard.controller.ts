import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { LeaderboardService } from "./leaderboard.service";

@Controller("leaderboard")
@UseGuards(JwtAuthGuard)
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  @Get()
  get(@Query("board") board?: string) {
    return board === "weekly" ? this.leaderboard.weekly() : this.leaderboard.global();
  }
}
