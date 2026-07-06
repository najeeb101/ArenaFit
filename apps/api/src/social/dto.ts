import { z } from "zod";

export const sendFriendRequestSchema = z.object({
  username: z.string().min(3).max(20),
});
export type SendFriendRequestDto = z.infer<typeof sendFriendRequestSchema>;
