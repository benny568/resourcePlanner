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
  getQuarter,
  getYear
} from 'date-fns';
import { Sprint, SprintConfig, PublicHoliday, TeamMember, PersonalHoliday, Skill, WorkItem } from '../types';

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
  
  // Track sprint numbers per quarter
  const quarterSprintNumbers: { [key: string]: number } = {};
  
  while (currentSprintStart <= yearEnd) {
    const sprintEnd = addDays(currentSprintStart, config.sprintDurationDays - 1);
    const { quarterString } = getQuarterInfo(currentSprintStart);
    
    // Initialize or increment sprint number for this quarter
    if (!quarterSprintNumbers[quarterString]) {
      quarterSprintNumbers[quarterString] = 1;
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
  // Start with the planned velocity
  let capacity = sprint.plannedVelocity;
  
  // Reduce capacity for public holidays
  const holidaysInSprint = publicHolidays.filter(holiday =>
    isWithinInterval(holiday.date, { start: sprint.startDate, end: sprint.endDate })
  );
  
  const totalPublicHolidayImpact = holidaysInSprint.reduce(
    (total, holiday) => total + (holiday.impactPercentage / 100),
    0
  );
  
  capacity *= (1 - totalPublicHolidayImpact);
  
  // Reduce capacity for personal holidays
  const totalTeamCapacity = teamMembers.reduce((total, member) => total + member.capacity, 0);
  let personalHolidayReduction = 0;
  
  teamMembers.forEach(member => {
    const memberHolidaysInSprint = member.personalHolidays.filter(holiday =>
      isWithinInterval(sprint.startDate, { start: holiday.startDate, end: holiday.endDate }) ||
      isWithinInterval(sprint.endDate, { start: holiday.startDate, end: holiday.endDate }) ||
      isWithinInterval(holiday.startDate, { start: sprint.startDate, end: sprint.endDate })
    );
    
    memberHolidaysInSprint.forEach(holiday => {
      const overlapStart = holiday.startDate > sprint.startDate ? holiday.startDate : sprint.startDate;
      const overlapEnd = holiday.endDate < sprint.endDate ? holiday.endDate : sprint.endDate;
      const overlapDays = differenceInDays(overlapEnd, overlapStart) + 1;
      const sprintDays = differenceInDays(sprint.endDate, sprint.startDate) + 1;
      const memberContribution = member.capacity / 100;
      const memberImpact = (overlapDays / sprintDays) * memberContribution;
      
      personalHolidayReduction += memberImpact;
    });
  });
  
  capacity *= (1 - personalHolidayReduction);
  
  return Math.max(0, capacity);
};

export const calculateSkillSpecificCapacity = (
  sprint: Sprint,
  teamMembers: TeamMember[],
  publicHolidays: PublicHoliday[],
  skill: Skill
): number => {
  // Start with the planned velocity, but scale by skill availability
  const skillMembers = teamMembers.filter(member => member.skills.includes(skill));
  const totalTeamCapacity = teamMembers.reduce((total, member) => total + member.capacity, 0);
  const skillTeamCapacity = skillMembers.reduce((total, member) => total + member.capacity, 0);
  
  if (totalTeamCapacity === 0 || skillTeamCapacity === 0) {
    return 0;
  }
  
  // Scale planned velocity by skill team ratio
  let capacity = sprint.plannedVelocity * (skillTeamCapacity / totalTeamCapacity);
  
  // Reduce capacity for public holidays
  const holidaysInSprint = publicHolidays.filter(holiday =>
    isWithinInterval(holiday.date, { start: sprint.startDate, end: sprint.endDate })
  );
  
  const totalPublicHolidayImpact = holidaysInSprint.reduce(
    (total, holiday) => total + (holiday.impactPercentage / 100),
    0
  );
  
  capacity *= (1 - totalPublicHolidayImpact);
  
  // Reduce capacity for personal holidays of skill-specific team members
  let personalHolidayReduction = 0;
  
  skillMembers.forEach(member => {
    const memberHolidaysInSprint = member.personalHolidays.filter(holiday =>
      isWithinInterval(sprint.startDate, { start: holiday.startDate, end: holiday.endDate }) ||
      isWithinInterval(sprint.endDate, { start: holiday.startDate, end: holiday.endDate }) ||
      isWithinInterval(holiday.startDate, { start: sprint.startDate, end: sprint.endDate })
    );
    
    memberHolidaysInSprint.forEach(holiday => {
      const overlapStart = holiday.startDate > sprint.startDate ? holiday.startDate : sprint.startDate;
      const overlapEnd = holiday.endDate < sprint.endDate ? holiday.endDate : sprint.endDate;
      const overlapDays = differenceInDays(overlapEnd, overlapStart) + 1;
      const sprintDays = differenceInDays(sprint.endDate, sprint.startDate) + 1;
      const memberContribution = member.capacity / 100;
      const memberImpact = (overlapDays / sprintDays) * memberContribution;
      
      personalHolidayReduction += memberImpact;
    });
  });
  
  capacity *= (1 - personalHolidayReduction);
  
  return Math.max(0, capacity);
};

export const calculateSprintSkillCapacities = (
  sprint: Sprint,
  teamMembers: TeamMember[],
  publicHolidays: PublicHoliday[]
): { frontend: number; backend: number; total: number } => {
  return {
    frontend: calculateSkillSpecificCapacity(sprint, teamMembers, publicHolidays, 'frontend'),
    backend: calculateSkillSpecificCapacity(sprint, teamMembers, publicHolidays, 'backend'),
    total: calculateSprintCapacity(sprint, teamMembers, publicHolidays)
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