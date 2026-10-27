-- Service authorization is supplemented with database-level invariants.
ALTER TABLE "Message" ADD CONSTRAINT "Message_exactly_one_room"
  CHECK (("channelId" IS NOT NULL)::int + ("conversationId" IS NOT NULL)::int = 1);
ALTER TABLE "Message" ADD CONSTRAINT "Message_content_length" CHECK (length(btrim(content)) BETWEEN 1 AND 4000);
ALTER TABLE "Member" ADD CONSTRAINT "Member_role" CHECK (role IN ('owner', 'member'));
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_distinct_users" CHECK ("requesterId" <> "recipientId");
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_status" CHECK (status IN ('pending', 'accepted'));
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_kind" CHECK (kind IN ('text', 'voice'));
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_uses" CHECK (uses >= 0 AND "maxUses" > 0 AND uses <= "maxUses");
