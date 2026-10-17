declare module "*.cjs" {
  export function catalogFromCsv(input: string): unknown;
  export function nearestRoute<
    T extends { location: { latitude: number; longitude: number } | null },
  >(items: T[], origin?: { latitude: number; longitude: number }): T[];
}
