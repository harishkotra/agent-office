export type PerfCounts = {
  calls: number
  triangles: number
  geometries: number
  textures: number
}

export type PerfMemory = {
  geometries: number
  textures: number
}

export type PerfReport = {
  grounds: PerfCounts
  home: PerfCounts
  leakStart: PerfMemory
  leakEnd: PerfMemory
  trips: number
}

export const GROUNDS_DRAW_LIMIT = 300
export const HOME_DRAW_LIMIT = 150
export const LEAK_TRIPS = 5

export function leakMatches(start: PerfMemory, end: PerfMemory): boolean {
  return start.geometries === end.geometries && start.textures === end.textures
}

export function budgetIssues(report: Pick<PerfReport, 'grounds' | 'home'>): string[] {
  const issues: string[] = []
  if (report.grounds.calls >= GROUNDS_DRAW_LIMIT) issues.push('grounds draw calls')
  if (report.home.calls >= HOME_DRAW_LIMIT) issues.push('home draw calls')
  return issues
}

export function reportIssues(report: PerfReport): string[] {
  const issues = budgetIssues(report)
  if (report.trips !== LEAK_TRIPS) issues.push('leak trips')
  if (!leakMatches(report.leakStart, report.leakEnd)) issues.push('leak check')
  return issues
}
