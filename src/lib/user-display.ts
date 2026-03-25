export function getDisplayName(user: { name: string | null | undefined; email?: string | null }): string {
  const trimmedName = user.name?.trim();

  if (trimmedName) {
    return trimmedName;
  }

  if (user.email) {
    return user.email.split("@")[0] || "Unnamed user";
  }

  return "Unnamed user";
}
