export type DashboardProgressInstance = {
  dueAt: Date;
  moderatorUserId: string | null;
  totalScripts: number;
  markedScripts: number;
  myAllocatedScripts: number;
  myMarkedScripts: number;
};

export function buildDashboardProgressSummary(instances: DashboardProgressInstance[], currentUserId: string) {
  const progressInstances = instances.filter((instance) => instance.totalScripts > 0);
  const totalScripts = progressInstances.reduce((sum, instance) => sum + instance.totalScripts, 0);
  const markedScripts = progressInstances.reduce((sum, instance) => sum + instance.markedScripts, 0);
  const myAllocatedScripts = progressInstances.reduce((sum, instance) => sum + instance.myAllocatedScripts, 0);
  const myMarkedScripts = progressInstances.reduce((sum, instance) => sum + instance.myMarkedScripts, 0);
  const nextDeadline =
    instances.map((instance) => instance.dueAt).sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
  const moderatedAssessments = instances.filter((instance) => instance.moderatorUserId === currentUserId).length;

  return {
    totalScripts,
    markedScripts,
    remainingScripts: totalScripts - markedScripts,
    myAllocatedScripts,
    myMarkedScripts,
    nextDeadline,
    progressPercentage: totalScripts === 0 ? 0 : Math.round((markedScripts / totalScripts) * 100),
    moderatedAssessments,
  };
}
