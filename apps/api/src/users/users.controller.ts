import { Body, Controller, Get, Patch, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { JwtPayload } from "../auth/dto";
import { CurrentUser, JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { UsersService } from "./users.service";

const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(30).optional(),
  country: z.string().max(2).optional(),
});
type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

@Controller("users/me")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get("profile")
  profile(@CurrentUser() user: JwtPayload) {
    return this.users.getProfile(user.sub);
  }

  @Patch("profile")
  update(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileDto,
  ) {
    return this.users.updateProfile(user.sub, dto);
  }

  @Get("matches")
  matches(@CurrentUser() user: JwtPayload, @Query("limit") limit?: string) {
    const parsed = Math.min(Math.max(Number(limit) || 20, 1), 100);
    return this.users.getMatchHistory(user.sub, parsed);
  }

  @Get("rating-history")
  ratingHistory(@CurrentUser() user: JwtPayload) {
    return this.users.getRatingHistory(user.sub);
  }

  @Get("achievements")
  achievements(@CurrentUser() user: JwtPayload) {
    return this.users.getAchievements(user.sub);
  }
}
