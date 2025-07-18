export type Skill = 'frontend' | 'backend';

export interface TeamMember {
  id: string;
  name: string;
  capacity: number; // percentage of full capacity (0-100)
  skills: Skill[]; // can be frontend, backend, or both
  personalHolidays: PersonalHoliday[];
}

export interface PersonalHoliday {
  id: string;
  memberId: string;
  startDate: Date;
  endDate: Date;
  description: string;
}

export interface WorkItem {
  id: string;
  jiraId?: string; // Optional Jira ticket ID (e.g., REF-1234)
  title: string;
  description: string;
  estimateStoryPoints: number;
  requiredCompletionDate: Date;
  requiredSkills: Skill[]; // skills needed to work on this item
  dependencies: string[]; // IDs of work items that must be completed first
  status: 'Not Started' | 'In Progress' | 'Completed';
  jiraStatus?: string; // Original Jira status (e.g., "Ready for Testing", "In Review", etc.)
  assignedSprints: string[];
  epicId?: string; // Optional Epic ID if this work item belongs to an epic
  // Epic work item properties
  isEpic?: boolean; // True if this work item is actually an epic
  children?: WorkItem[]; // Child work items (only for epic work items)
}

export interface Epic {
  id: string;
  jiraId: string; // Jira epic key (e.g., REF-1234)
  title: string;
  description: string;
  status: 'Not Started' | 'In Progress' | 'Completed';
  jiraStatus?: string; // Original Jira status
  children: WorkItem[]; // Child tickets/stories of this epic
  totalStoryPoints: number; // Sum of all children story points
  completedStoryPoints: number; // Sum of completed children story points
}

export interface Sprint {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  plannedVelocity: number;
  actualVelocity?: number;
  workItems: string[];
}

export interface PublicHoliday {
  id: string;
  name: string;
  date: Date;
  impactPercentage: number; // percentage reduction in team capacity
}

export interface SprintConfig {
  firstSprintStartDate: Date;
  sprintDurationDays: number;
  defaultVelocity: number;
}

export interface ResourcePlanningData {
  teamMembers: TeamMember[];
  workItems: WorkItem[];
  epics: Epic[];
  sprints: Sprint[];
  publicHolidays: PublicHoliday[];
  sprintConfig: SprintConfig;
} 