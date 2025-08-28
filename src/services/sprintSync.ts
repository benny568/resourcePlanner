import { ResourcePlanningData } from '../types';

export interface SprintSyncResult {
  sprintName: string;
  sprintId?: string;
  status: 'synced' | 'not_found' | 'error';
  actualVelocity?: number;
  plannedVelocity?: number;
  updatedWorkItems?: number;
  workItemUpdates?: Array<{
    id: string;
    jiraId: string;
    title: string;
    oldStatus: string;
    newStatus: string;
  }>;
  message?: string;
  error?: string;
}

export interface SprintSyncResponse {
  message: string;
  syncResults: SprintSyncResult[];
  timestamp: string;
}

export interface PastSprintTicketSyncResult {
  ticketKey: string;
  status: 'synced' | 'no_sprint_found' | 'error';
  sprintName?: string;
  sprintId?: string;
  workItemId?: string;
  storyPoints?: number;
  message?: string;
  error?: string;
}

export interface SprintVelocityUpdate {
  sprintId: string;
  sprintName: string;
  oldVelocity: number | null;
  newVelocity: number;
  completedItems: number;
}

export interface PastSprintSyncResponse {
  message: string;
  syncResults: PastSprintTicketSyncResult[];
  sprintUpdates: SprintVelocityUpdate[];
  timestamp: string;
  summary: {
    totalTickets: number;
    successfulSyncs: number;
    errors: number;
    sprintUpdates: number;
  };
}

// Sprint sync service for synchronizing completed work from Jira
export class SprintSyncService {
  private projectKey: string;

  constructor(projectKey: string = 'REF') {
    this.projectKey = projectKey;
  }

  // Sync all completed sprints from Jira
  async syncAllSprints(): Promise<SprintSyncResponse> {
    try {
      console.log(`🔄 Starting velocity sync for project: ${this.projectKey}`);
      
      // Use existing working endpoint with velocity flag
      const response = await fetch('/api/jira/work-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          projectKey: this.projectKey,
          includeVelocity: true
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Velocity sync failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result: SprintSyncResponse = await response.json();
      console.log(`✅ Velocity sync completed: ${result.syncResults.length} sprints processed`);
      
      return result;
    } catch (error) {
      console.error('❌ Error syncing velocity:', error);
      throw error;
    }
  }

  // Sync specific sprints by name patterns
  async syncSpecificSprints(sprintNames: string[]): Promise<SprintSyncResponse> {
    try {
      console.log(`🔄 Starting targeted sprint sync for: ${sprintNames.join(', ')}`);
      
      const response = await fetch('/api/jira/sync-sprints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          projectKey: this.projectKey,
          sprintNames 
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Sprint sync failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result: SprintSyncResponse = await response.json();
      console.log(`✅ Targeted sprint sync completed: ${result.syncResults.length} sprints processed`);
      
      return result;
    } catch (error) {
      console.error('❌ Error syncing specific sprints:', error);
      throw error;
    }
  }

  // Get sync recommendations based on current sprint planning
  getSyncRecommendations(data: ResourcePlanningData): {
    recommendedSprints: string[];
    reason: string;
  } {
    const now = new Date();
    const recentSprints = data.sprints.filter(sprint => {
      const endDate = new Date(sprint.endDate);
      const daysSinceEnd = (now.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24);
      
      // Recommend syncing sprints that ended in the last 30 days and don't have actual velocity
      return daysSinceEnd <= 30 && daysSinceEnd > 0 && !sprint.actualVelocity;
    });

    if (recentSprints.length === 0) {
      return {
        recommendedSprints: [],
        reason: 'No recent sprints found that need syncing'
      };
    }

    return {
      recommendedSprints: recentSprints.map(s => s.name),
      reason: `${recentSprints.length} sprint(s) completed recently without actual velocity data`
    };
  }

  // NEW: Sync completed tickets from Jira to past sprints
  async syncPastSprints(dateRange?: { start: string; end: string }): Promise<PastSprintSyncResponse> {
    try {
      console.log(`🔄 Starting past sprint sync`);
      
      const response = await fetch('/api/jira/sync-past-sprints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          projectKey: this.projectKey,
          ...(dateRange && { dateRange })
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Past sprint sync failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result: PastSprintSyncResponse = await response.json();
      console.log(`✅ Past sprint sync completed: ${result.summary.successfulSyncs} tickets synced`);
      
      return result;
    } catch (error) {
      console.error('❌ Error syncing past sprints:', error);
      throw error;
    }
  }

  // Calculate velocity trends from historical data
  calculateVelocityTrends(data: ResourcePlanningData): {
    averageVelocity: number;
    velocityTrend: 'improving' | 'declining' | 'stable';
    confidenceLevel: 'high' | 'medium' | 'low';
    sprintsWithData: number;
  } {
    const sprintsWithVelocity = data.sprints.filter(s => 
      s.actualVelocity !== undefined && s.actualVelocity > 0
    );

    if (sprintsWithVelocity.length === 0) {
      return {
        averageVelocity: 0,
        velocityTrend: 'stable',
        confidenceLevel: 'low',
        sprintsWithData: 0
      };
    }

    const avgVelocity = sprintsWithVelocity.reduce((sum, s) => 
      sum + (s.actualVelocity || 0), 0
    ) / sprintsWithVelocity.length;

    // Calculate trend from last 3 sprints vs previous sprints
    const sortedSprints = sprintsWithVelocity
      .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
    
    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    let confidenceLevel: 'high' | 'medium' | 'low' = 'low';

    if (sortedSprints.length >= 6) {
      const recent3 = sortedSprints.slice(-3);
      const previous3 = sortedSprints.slice(-6, -3);
      
      const recentAvg = recent3.reduce((sum, s) => sum + (s.actualVelocity || 0), 0) / 3;
      const previousAvg = previous3.reduce((sum, s) => sum + (s.actualVelocity || 0), 0) / 3;
      
      const change = (recentAvg - previousAvg) / previousAvg;
      
      if (change > 0.1) trend = 'improving';
      else if (change < -0.1) trend = 'declining';
      else trend = 'stable';
      
      confidenceLevel = 'high';
    } else if (sortedSprints.length >= 3) {
      confidenceLevel = 'medium';
    }

    return {
      averageVelocity: Math.round(avgVelocity * 10) / 10,
      velocityTrend: trend,
      confidenceLevel,
      sprintsWithData: sprintsWithVelocity.length
    };
  }
}

export const sprintSyncService = new SprintSyncService();
