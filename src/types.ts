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
  title: string;
  description: string;
  estimateStoryPoints: number;
  requiredCompletionDate: Date;
  requiredSkills: Skill[]; // skills needed to work on this item
  dependencies: string[]; // IDs of work items that must be completed first
  status: 'Not Started' | 'In Progress' | 'Completed';
  assignedSprints: string[];
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
  sprints: Sprint[];
  publicHolidays: PublicHoliday[];
  sprintConfig: SprintConfig;
} 