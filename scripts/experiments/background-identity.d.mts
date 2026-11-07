export function verifyBackgroundSource(
  profile: string,
  extensionId: string,
  backgroundPath: string,
): Promise<{
  actualHash: string;
  expectedHash: string;
  bytes: number;
  matches: boolean;
}>;
