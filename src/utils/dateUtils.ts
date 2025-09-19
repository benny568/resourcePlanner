import {
  addDays,
  startOfYear,
  endOfYear,
  format,
  isWithinInterval,
  differenceInDays,
  addWeeks,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isWeekend,
  getQuarter,
  getYear
} from 'date-fns';
import { Sprint, SprintConfig, PublicHoliday, TeamMember, PersonalHoliday, Skill, WorkItem } from '../types';

// Helper function to calculate working days in a sprint (excluding weekends)
const getWorkingDaysInSprint = (startDate: Date, endDate: Date): number => {
  const days = eachDayOfInterval({ start: startDate, end: endDate });
  return days.filter(day => !isWeekend(day)).length;
};

// Calculate total available development days for a sprint
export const calculateAvailableDevelopmentDays = (
  sprint: Sprint,
  teamMembers: TeamMember[],
  publicHolidays: PublicHoliday[]
): number => {
  // Step 1: Calculate base working days (excluding weekends)
  const workingDaysInSprint = getWorkingDaysInSprint(sprint.startDate, sprint.endDate);

  // Step 2: Calculate total team member capacity as person-days
  const totalTeamCapacity = teamMembers.reduce((total, member) => total + (member.capacity / 100), 0);
  const basePersonDays = workingDaysInSprint * totalTeamCapacity;

  // Step 3: Subtract public holidays impact
  const holidaysInSprint = publicHolidays.filter(holiday =>
    isWithinInterval(holiday.date, { start: sprint.startDate, end: sprint.endDate })
  );

  // Each public holiday removes 1 day for all team members
  const publicHolidayDaysLost = holidaysInSprint.length * totalTeamCapacity;

  // Step 4: Subtract personal holidays impact
  let personalHolidayDaysLost = 0;

  teamMembers.forEach(member => {
    const memberHolidaysInSprint = member.personalHolidays.filter(holiday =>
      isWithinInterval(sprint.startDate, { start: holiday.startDate, end: holiday.endDate }) ||
      isWithinInterval(sprint.endDate, { start: holiday.startDate, end: holiday.endDate }) ||
      isWithinInterval(holiday.startDate, { start: sprint.startDate, end: sprint.endDate })
    );

    memberHolidaysInSprint.forEach(holiday => {
      const overlapStart = holiday.startDate > sprint.startDate ? holiday.startDate : sprint.startDate;
      const overlapEnd = holiday.endDate < sprint.endDate ? holiday.endDate : sprint.endDate;

      // Calculate working days lost for this member (excluding weekends)
      const holidayWorkingDays = getWorkingDaysInSprint(overlapStart, overlapEnd);
      const memberContribution = member.capacity / 100;

      personalHolidayDaysLost += holidayWorkingDays * memberContribution;
    });
  });

  // Step 5: Calculate final available development days
  const availableDays = Math.max(0, basePersonDays - publicHolidayDaysLost - personalHolidayDaysLost);

  return Math.round(availableDays * 10) / 10; // Round to 1 decimal place
};

// Quarter utility functions
export const getQuarterInfo = (date: Date) => {
  const quarter = getQuarter(date);
  const year = getYear(date);
  return { quarter, year, quarterString: `Q${quarter} ${year}` };
};

export const groupSprintsByQuarter = (sprints: Sprint[]) => {
  const groups: { [key: string]: Sprint[] } = {};

  sprints.forEach(sprint => {
    const { quarterString } = getQuarterInfo(sprint.startDate);
    if (!groups[quarterString]) {
      groups[quarterString] = [];
    }
    groups[quarterString].push(sprint);
  });

  // Sort quarters chronologically
  const sortedQuarters = Object.keys(groups).sort((a, b) => {
    const [aQ, aY] = a.split(' ');
    const [bQ, bY] = b.split(' ');
    const aYear = parseInt(aY);
    const bYear = parseInt(bY);
    const aQuarter = parseInt(aQ.replace('Q', ''));
    const bQuarter = parseInt(bQ.replace('Q', ''));

    if (aYear !== bYear) return aYear - bYear;
    return aQuarter - bQuarter;
  });

  const result: { quarter: string; sprints: Sprint[] }[] = [];
  sortedQuarters.forEach(quarter => {
    result.push({ quarter, sprints: groups[quarter] });
  });

  return result;
};

export const generateSprintsForYear = (config: SprintConfig, year: number = new Date().getFullYear()): Sprint[] => {
  const sprints: Sprint[] = [];
  const yearStart = startOfYear(new Date(year, 0, 1));
  const yearEnd = endOfYear(new Date(year, 11, 31));

  let currentSprintStart = config.firstSprintStartDate;
  let sprintNumber = 1;

  // Track sprint numbers per quarter, starting from the configured number
  const quarterSprintNumbers: { [key: string]: number } = {};

  // Determine the starting quarter from the first sprint start date
  const { quarterString: startingQuarter } = getQuarterInfo(currentSprintStart);

  while (currentSprintStart <= yearEnd) {
    const sprintEnd = addDays(currentSprintStart, config.sprintDurationDays - 1);
    const { quarterString } = getQuarterInfo(currentSprintStart);

    // Initialize or increment sprint number for this quarter
    if (!quarterSprintNumbers[quarterString]) {
      // For the starting quarter, use the configured starting sprint number
      if (quarterString === startingQuarter) {
        quarterSprintNumbers[quarterString] = config.startingQuarterSprintNumber;
      } else {
        // For subsequent quarters, always start from 1
        quarterSprintNumbers[quarterString] = 1;
      }
    } else {
      quarterSprintNumbers[quarterString]++;
    }

    const quarterSprintNumber = quarterSprintNumbers[quarterString];

    sprints.push({
      id: `sprint-${year}-${sprintNumber}`,
      name: `${quarterString} Sprint ${quarterSprintNumber}`,
      startDate: currentSprintStart,
      endDate: sprintEnd,
      plannedVelocity: config.defaultVelocity,
      workItems: []
    });

    currentSprintStart = addDays(sprintEnd, 1);
    sprintNumber++;
  }

  return sprints;
};

export const calculateSprintCapacity = (
  sprint: Sprint,
  teamMembers: TeamMember[],
  publicHolidays: PublicHoliday[]
): number => {
  console.log(`🎯 ═══ CAPACITY CALCULATION START: ${sprint.name} ═══`);
  console.log(`📅 Sprint Period: ${format(sprint.startDate, 'MMM dd')} - ${format(sprint.endDate, 'MMM dd, yyyy')}`);

  // Start with the planned velocity
  let capacity = sprint.plannedVelocity;

  console.log(`📊 STEP 1: Initial Planned Velocity = ${sprint.plannedVelocity} points`);
  console.log(`👥 Team Configuration: ${teamMembers.length} members, ${publicHolidays.length} public holidays configured`);

  // Reduce capacity for public holidays
  const holidaysInSprint = publicHolidays.filter(holiday =>
    isWithinInterval(holiday.date, { start: sprint.startDate, end: sprint.endDate })
  );

  // Calculate actual working days in sprint (excluding weekends)
  const sprintWorkingDays = getWorkingDaysInSprint(sprint.startDate, sprint.endDate);

  console.log(`📅 STEP 2: Sprint Working Days Analysis`);
  console.log(`   • Total calendar days in sprint: ${differenceInDays(sprint.endDate, sprint.startDate) + 1}`);
  console.log(`   • Working days (excluding weekends): ${sprintWorkingDays}`);
  console.log(`   • Public holidays found in sprint: ${holidaysInSprint.length}`);
  if (holidaysInSprint.length > 0) {
    console.log(`   • Holiday details:`, holidaysInSprint.map(h => `"${h.name}" (${format(h.date, 'MMM dd')})`));
  }

  // Calculate realistic holiday impact based on actual working days lost
  const totalPublicHolidayImpact = holidaysInSprint.reduce(
    (total, holiday) => {
      // Each public holiday removes 1 working day
      // Impact = 1 day / total working days in sprint
      const holidayImpact = 1 / sprintWorkingDays;
      console.log(`   📉 "${holiday.name}": -${holidayImpact * 100}% impact (1 day out of ${sprintWorkingDays} working days)`);
      return total + holidayImpact;
    },
    0
  );

  const capacityAfterPublicHolidays = capacity * (1 - totalPublicHolidayImpact);
  console.log(`📊 STEP 3: After Public Holidays`);
  console.log(`   • Total public holiday impact: -${(totalPublicHolidayImpact * 100).toFixed(1)}%`);
  console.log(`   • Capacity: ${capacity} → ${capacityAfterPublicHolidays.toFixed(1)} points`);

  capacity = capacityAfterPublicHolidays;

  // Reduce capacity for personal holidays
  const totalTeamCapacity = teamMembers.reduce((total, member) => total + member.capacity, 0);
  let personalHolidayReduction = 0;

  console.log(`👤 STEP 4: Personal Holidays Analysis`);
  console.log(`   • Total team capacity points: ${totalTeamCapacity}`);
  console.log(`   • Team members: ${teamMembers.map(m => `${m.name}(${m.capacity}pts)`).join(', ')}`);

  teamMembers.forEach(member => {
    const memberHolidaysInSprint = member.personalHolidays.filter(holiday =>
      isWithinInterval(sprint.startDate, { start: holiday.startDate, end: holiday.endDate }) ||
      isWithinInterval(sprint.endDate, { start: holiday.startDate, end: holiday.endDate }) ||
      isWithinInterval(holiday.startDate, { start: sprint.startDate, end: sprint.endDate })
    );

    if (memberHolidaysInSprint.length > 0) {
      console.log(`   👤 ${member.name} has ${memberHolidaysInSprint.length} personal holiday(s):`);
    }

    memberHolidaysInSprint.forEach(holiday => {
      const overlapStart = holiday.startDate > sprint.startDate ? holiday.startDate : sprint.startDate;
      const overlapEnd = holiday.endDate < sprint.endDate ? holiday.endDate : sprint.endDate;
      const overlapDays = differenceInDays(overlapEnd, overlapStart) + 1;
      const sprintDays = differenceInDays(sprint.endDate, sprint.startDate) + 1;
      const memberContribution = member.capacity / 100;
      const memberImpact = (overlapDays / sprintDays) * memberContribution;

      console.log(`      📉 "${holiday.name}": ${overlapDays} days out of ${sprintDays} = -${(memberImpact * 100).toFixed(1)}% impact`);
      personalHolidayReduction += memberImpact;
    });
  });

  const capacityAfterPersonalHolidays = capacity * (1 - personalHolidayReduction);
  console.log(`📊 STEP 5: After Personal Holidays`);
  console.log(`   • Total personal holiday impact: -${(personalHolidayReduction * 100).toFixed(1)}%`);
  console.log(`   • Capacity: ${capacity.toFixed(1)} → ${capacityAfterPersonalHolidays.toFixed(1)} points`);

  capacity = capacityAfterPersonalHolidays;

  const finalCapacity = Math.max(0, capacity);
  console.log(`🎯 ═══ CAPACITY CALCULATION FINAL: ${sprint.name} ═══`);
  console.log(`✅ FINAL AVAILABLE POINTS: ${finalCapacity.toFixed(1)} points`);
  console.log(`📈 Summary:`);
  console.log(`   • Started with: ${sprint.plannedVelocity} points`);
  console.log(`   • After public holidays: ${capacityAfterPublicHolidays.toFixed(1)} points`);
  console.log(`   • After personal holidays: ${capacityAfterPersonalHolidays.toFixed(1)} points`);
  console.log(`   • Final capacity: ${finalCapacity.toFixed(1)} points`);
  console.log(`🎯 ═══════════════════════════════════════════════════`);
  return finalCapacity;
};

export const calculateSkillSpecificCapacity = (
  sprint: Sprint,
  teamMembers: TeamMember[],
  publicHolidays: PublicHoliday[],
  skill: Skill
): number => {
  console.log(`🎯 ═══ ${skill.toUpperCase()} CAPACITY CALCULATION: ${sprint.name} ═══`);

  // Start with the planned velocity, but scale by skill availability
  const skillMembers = teamMembers.filter(member => member.skills.includes(skill));
  const totalTeamCapacity = teamMembers.reduce((total, member) => total + member.capacity, 0);
  const skillTeamCapacity = skillMembers.reduce((total, member) => total + member.capacity, 0);

  console.log(`📊 STEP 1: ${skill.charAt(0).toUpperCase() + skill.slice(1)} Team Analysis`);
  console.log(`   • ${skill} team members: ${skillMembers.length} (${skillMembers.map(m => `${m.name}(${m.capacity}pts)`).join(', ')})`);
  console.log(`   • ${skill} team capacity: ${skillTeamCapacity} points`);
  console.log(`   • Total team capacity: ${totalTeamCapacity} points`);

  if (totalTeamCapacity === 0 || skillTeamCapacity === 0) {
    console.log(`❌ No capacity for ${skill} skill: totalTeamCapacity=${totalTeamCapacity}, skillTeamCapacity=${skillTeamCapacity}`);
    console.log(`🎯 ═══ ${skill.toUpperCase()} FINAL: 0 points ═══`);
    return 0;
  }

  // Scale planned velocity by skill team ratio
  const skillPortion = skillTeamCapacity / totalTeamCapacity;
  let capacity = sprint.plannedVelocity * skillPortion;

  console.log(`   • ${skill} portion: ${(skillPortion * 100).toFixed(1)}%`);
  console.log(`   • Initial ${skill} capacity: ${sprint.plannedVelocity} × ${(skillPortion * 100).toFixed(1)}% = ${capacity.toFixed(1)} points`);

  // Reduce capacity for public holidays
  const holidaysInSprint = publicHolidays.filter(holiday =>
    isWithinInterval(holiday.date, { start: sprint.startDate, end: sprint.endDate })
  );

  // Calculate actual working days in sprint (excluding weekends)
  const sprintWorkingDays = getWorkingDaysInSprint(sprint.startDate, sprint.endDate);

  console.log(`📅 STEP 2: Public Holidays Impact on ${skill.charAt(0).toUpperCase() + skill.slice(1)}`);
  console.log(`   • Working days in sprint: ${sprintWorkingDays}`);
  console.log(`   • Public holidays found: ${holidaysInSprint.length}`);

  // Calculate realistic holiday impact based on actual working days lost
  const totalPublicHolidayImpact = holidaysInSprint.reduce(
    (total, holiday) => {
      // Each public holiday removes 1 working day
      // Impact = 1 day / total working days in sprint
      const holidayImpact = 1 / sprintWorkingDays;
      console.log(`   📉 "${holiday.name}": -${(holidayImpact * 100).toFixed(1)}% impact (1 day out of ${sprintWorkingDays} working days)`);
      return total + holidayImpact;
    },
    0
  );

  const capacityAfterPublicHolidays = capacity * (1 - totalPublicHolidayImpact);
  console.log(`📊 STEP 3: After Public Holidays for ${skill.charAt(0).toUpperCase() + skill.slice(1)}`);
  console.log(`   • Total public holiday impact: -${(totalPublicHolidayImpact * 100).toFixed(1)}%`);
  console.log(`   • Capacity: ${capacity.toFixed(1)} → ${capacityAfterPublicHolidays.toFixed(1)} points`);

  capacity = capacityAfterPublicHolidays;

  // Reduce capacity for personal holidays of team members with this specific skill
  let personalHolidayReduction = 0;
  const sprintWorkingDaysTotal = getWorkingDaysInSprint(sprint.startDate, sprint.endDate);

  console.log(`👤 STEP 4: Personal Holidays for ${skill.charAt(0).toUpperCase() + skill.slice(1)} Team Members`);
  console.log(`   • ${skill} team members: ${skillMembers.length}`);
  console.log(`   • Checking personal holidays for: ${skillMembers.map(m => m.name).join(', ')}`);

  skillMembers.forEach(member => {
    const memberHolidaysInSprint = member.personalHolidays.filter(holiday =>
      isWithinInterval(sprint.startDate, { start: holiday.startDate, end: holiday.endDate }) ||
      isWithinInterval(sprint.endDate, { start: holiday.startDate, end: holiday.endDate }) ||
      isWithinInterval(holiday.startDate, { start: sprint.startDate, end: sprint.endDate })
    );

    if (memberHolidaysInSprint.length > 0) {
      console.log(`   👤 ${member.name} has ${memberHolidaysInSprint.length} personal holiday(s) affecting ${skill}:`);
    }

    memberHolidaysInSprint.forEach(holiday => {
      const overlapStart = holiday.startDate > sprint.startDate ? holiday.startDate : sprint.startDate;
      const overlapEnd = holiday.endDate < sprint.endDate ? holiday.endDate : sprint.endDate;

      // Calculate working days lost (excluding weekends)
      const holidayWorkingDays = getWorkingDaysInSprint(overlapStart, overlapEnd);

      // Impact = (working days lost) / (total working days in sprint) * (member's contribution to this skill)
      const memberSkillContribution = member.capacity / skillTeamCapacity; // Member's share of this skill's capacity
      const memberImpact = (holidayWorkingDays / sprintWorkingDaysTotal) * memberSkillContribution;

      console.log(`      📉 "${holiday.name}": ${holidayWorkingDays} working days × ${(memberSkillContribution * 100).toFixed(1)}% contribution = -${(memberImpact * 100).toFixed(1)}% impact`);

      personalHolidayReduction += memberImpact;
    });
  });

  const capacityAfterPersonalHolidays = capacity * (1 - personalHolidayReduction);
  console.log(`📊 STEP 5: After Personal Holidays for ${skill.charAt(0).toUpperCase() + skill.slice(1)}`);
  console.log(`   • Total personal holiday impact: -${(personalHolidayReduction * 100).toFixed(1)}%`);
  console.log(`   • Capacity: ${capacity.toFixed(1)} → ${capacityAfterPersonalHolidays.toFixed(1)} points`);

  capacity = capacityAfterPersonalHolidays;

  const finalCapacity = Math.max(0, capacity);

  console.log(`🎯 ═══ ${skill.toUpperCase()} CAPACITY FINAL: ${sprint.name} ═══`);
  console.log(`✅ FINAL ${skill.toUpperCase()} POINTS: ${finalCapacity.toFixed(1)} points`);
  console.log(`📈 ${skill.charAt(0).toUpperCase() + skill.slice(1)} Summary:`);
  console.log(`   • Started with: ${(sprint.plannedVelocity * (skillTeamCapacity / totalTeamCapacity)).toFixed(1)} points (${((skillTeamCapacity / totalTeamCapacity) * 100).toFixed(1)}% of ${sprint.plannedVelocity})`);
  console.log(`   • After public holidays: ${capacityAfterPublicHolidays.toFixed(1)} points`);
  console.log(`   • After personal holidays: ${capacityAfterPersonalHolidays.toFixed(1)} points`);
  console.log(`   • Final ${skill} capacity: ${finalCapacity.toFixed(1)} points`);
  console.log(`💡 Note: Only ${skill} team members' holidays affected this calculation`);
  console.log(`🎯 ═══════════════════════════════════════════════════`);

  return finalCapacity;
};

export const calculateSprintSkillCapacities = (
  sprint: Sprint,
  teamMembers: TeamMember[],
  publicHolidays: PublicHoliday[]
): { frontend: number; backend: number; total: number } => {
  const frontend = calculateSkillSpecificCapacity(sprint, teamMembers, publicHolidays, 'frontend');
  const backend = calculateSkillSpecificCapacity(sprint, teamMembers, publicHolidays, 'backend');

  // Total should be the sum of individual skill capacities for consistency
  const total = frontend + backend;

  console.log(`🔍 calculateSprintSkillCapacities FINAL for ${sprint.name}:`, {
    frontend,
    backend,
    total,
    individualSum: frontend + backend
  });

  return {
    frontend,
    backend,
    total
  };
};

export const canWorkItemBeAssignedToSprint = (
  workItem: { requiredSkills: Skill[]; estimateStoryPoints: number },
  skillCapacities: { frontend: number; backend: number }
): boolean => {
  // Check if there's enough capacity for each required skill
  for (const skill of workItem.requiredSkills) {
    const availableCapacity = skill === 'frontend' ? skillCapacities.frontend : skillCapacities.backend;
    if (availableCapacity < workItem.estimateStoryPoints) {
      return false;
    }
  }
  return true;
};

export const formatDateRange = (startDate: Date, endDate: Date): string => {
  return `${format(startDate, 'MMM dd')} - ${format(endDate, 'MMM dd, yyyy')}`;
};

export const isDateInSprint = (date: Date, sprint: Sprint): boolean => {
  return isWithinInterval(date, { start: sprint.startDate, end: sprint.endDate });
};

// Dependency-related utility functions
export const areAllDependenciesCompleted = (workItem: WorkItem, allWorkItems: WorkItem[]): boolean => {
  return workItem.dependencies.every(depId => {
    const depItem = allWorkItems.find(item => item.id === depId);
    return depItem?.status === 'Completed';
  });
};

export const getWorkItemsReadyForSprint = (
  workItems: WorkItem[],
  sprint: Sprint,
  allWorkItems: WorkItem[]
): WorkItem[] => {
  return workItems.filter(item => {
    // Item must not be completed
    if (item.status === 'Completed') return false;

    // Item must not already be assigned to this sprint
    if (item.assignedSprints.includes(sprint.id)) return false;

    // All dependencies must be completed
    if (!areAllDependenciesCompleted(item, allWorkItems)) return false;

    // Dependencies must be scheduled to complete before this sprint starts
    const dependentItems = item.dependencies.map(depId =>
      allWorkItems.find(w => w.id === depId)
    ).filter(Boolean) as WorkItem[];

    return dependentItems.every(depItem => {
      // If dependency is completed, it's ready
      if (depItem.status === 'Completed') return true;

      // If dependency is assigned to sprints, check if any sprint ends before current sprint starts
      if (depItem.assignedSprints.length > 0) {
        // Find the latest sprint this dependency is assigned to
        // This would require sprint data, so we'll be more conservative here
        return false; // For safety, assume not ready if dependency is still in progress
      }

      // If dependency is not assigned anywhere and not completed, it's not ready
      return false;
    });
  });
};

export const getBlockedWorkItems = (workItems: WorkItem[], allWorkItems: WorkItem[]): WorkItem[] => {
  return workItems.filter(item =>
    item.status !== 'Completed' &&
    !areAllDependenciesCompleted(item, allWorkItems)
  );
};

export const getDependencyChain = (workItem: WorkItem, allWorkItems: WorkItem[]): WorkItem[] => {
  const chain: WorkItem[] = [];
  const visited = new Set<string>();

  const buildChain = (item: WorkItem) => {
    if (visited.has(item.id)) return; // Prevent infinite loops
    visited.add(item.id);

    item.dependencies.forEach(depId => {
      const depItem = allWorkItems.find(w => w.id === depId);
      if (depItem) {
        buildChain(depItem);
        if (!chain.find(c => c.id === depItem.id)) {
          chain.push(depItem);
        }
      }
    });
  };

  buildChain(workItem);
  return chain;
};

export const canWorkItemStartInSprint = (
  workItem: WorkItem,
  sprint: Sprint,
  allWorkItems: WorkItem[],
  allSprints: Sprint[]
): boolean => {
  // Check if all dependencies are either completed or will complete before this sprint
  return workItem.dependencies.every(depId => {
    const depItem = allWorkItems.find(item => item.id === depId);
    if (!depItem) return true; // Missing dependency assumed OK (shouldn't happen)

    if (depItem.status === 'Completed') return true;

    // Check if dependency is assigned to sprints that end before current sprint starts
    const depSprints = depItem.assignedSprints
      .map(sprintId => allSprints.find(s => s.id === sprintId))
      .filter(Boolean) as Sprint[];

    if (depSprints.length === 0) return false; // Dependency not scheduled

    // Find the latest sprint the dependency is assigned to
    const latestDepSprint = depSprints.reduce((latest, current) =>
      current.endDate > latest.endDate ? current : latest
    );

    // Dependency must finish before current sprint starts
    return latestDepSprint.endDate < sprint.startDate;
  });
}; 