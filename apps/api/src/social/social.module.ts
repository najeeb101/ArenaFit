import { Module } from "@nestjs/common";
import { PresenceModule } from "../presence/presence.module";
import { SocialController } from "./social.controller";
import { SocialService } from "./social.service";

@Module({
  imports: [PresenceModule],
  controllers: [SocialController],
  providers: [SocialService],
})
export class SocialModule {}
