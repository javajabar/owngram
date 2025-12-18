export const REACTIONS_LIST = ['❤️', '🍌', '👍', '🔥', '😂', '😮', '😢', '👏'] as const;
export type ReactionEmoji = typeof REACTIONS_LIST[number];

