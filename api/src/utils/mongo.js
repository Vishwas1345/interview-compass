// MongoDB's duplicate-key error: how unique indexes say "already exists".
export const isDuplicateKey = (error) => error?.code === 11000;
