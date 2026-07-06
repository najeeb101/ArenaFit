import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtPayload } from "../auth/dto";
import { CurrentUser, JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { sendFriendRequestSchema, SendFriendRequestDto } from "./dto";
import { SocialService } from "./social.service";

@Controller()
@UseGuards(JwtAuthGuard)
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Post("friends/requests")
  sendRequest(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(sendFriendRequestSchema)) dto: SendFriendRequestDto,
  ) {
    return this.social.sendFriendRequest(user.sub, dto.username);
  }

  @Get("friends/requests")
  incomingRequests(@CurrentUser() user: JwtPayload) {
    return this.social.listIncomingRequests(user.sub);
  }

  @Post("friends/requests/:id/accept")
  accept(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.social.acceptRequest(user.sub, id);
  }

  @Post("friends/requests/:id/decline")
  decline(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.social.declineRequest(user.sub, id);
  }

  @Get("friends")
  listFriends(@CurrentUser() user: JwtPayload) {
    return this.social.listFriends(user.sub);
  }

  @Delete("friends/:id")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.social.removeFriend(user.sub, id);
  }
}
