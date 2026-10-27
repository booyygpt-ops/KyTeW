export type User = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  status: string;
};
export type Channel = { id: string; name: string; topic: string; kind: string };
export type Community = {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  channels: Channel[];
  _count: { members: number };
};
export type Conversation = { id: string; participants: { user: User }[] };
export type Friend = {
  id: string;
  requesterId: string;
  recipientId: string;
  status: string;
  requester: User;
  recipient: User;
};
export type Message = {
  id: string;
  content: string;
  authorId: string;
  author: User;
  createdAt: string;
  editedAt: string | null;
};
export type Member = { role: string; user: User };
