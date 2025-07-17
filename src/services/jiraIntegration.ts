import { TeamMember, WorkItem, Skill } from '../types';

// Jira integration service for extracting team members and epics
export class JiraIntegrationService {
  private projectKey: string;

  constructor(projectKey: string = 'REF') {
    this.projectKey = projectKey;
  }

  // Extract unique team members from Jira project
  async extractTeamMembers(): Promise<TeamMember[]> {
    try {
      console.log(`🔍 Extracting team members from Jira project: ${this.projectKey}`);
      console.log(`📡 Making POST request to: /api/jira/team-members`);
      
      // Get recent issues to extract team members from assignees and reporters
      const response = await fetch('/api/jira/team-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectKey: this.projectKey })
      });
      
      console.log(`📡 Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ API Error: ${response.status} ${response.statusText} - ${errorText}`);
        throw new Error(`Failed to extract team members: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const teamMembers: TeamMember[] = await response.json();
      console.log(`✅ Extracted ${teamMembers.length} team members from Jira`);
      
      return teamMembers;
    } catch (error) {
      console.error('❌ Error extracting team members from Jira:', error);
      throw error;
    }
  }

  // Extract epics and convert them to work items
  async extractEpics(): Promise<WorkItem[]> {
    try {
      console.log(`🔍 Extracting epics from Jira project: ${this.projectKey}`);
      console.log(`📡 Making POST request to: /api/jira/epics`);
      
      const response = await fetch('/api/jira/epics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectKey: this.projectKey })
      });
      
      console.log(`📡 Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ API Error: ${response.status} ${response.statusText} - ${errorText}`);
        throw new Error(`Failed to extract epics: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const workItems: WorkItem[] = await response.json();
      console.log(`✅ Extracted ${workItems.length} epics as work items from Jira`);
      
      return workItems;
    } catch (error) {
      console.error('❌ Error extracting epics from Jira:', error);
      throw error;
    }
  }

  // Transform Jira user to TeamMember format
  static transformJiraUserToTeamMember(jiraUser: any): TeamMember {
    // Infer skills from user's work patterns or default to both
    const skills: Skill[] = ['frontend', 'backend']; // Default to full-stack
    
    return {
      id: jiraUser.account_id,
      name: jiraUser.display_name,
      capacity: 100, // Default full capacity
      skills: skills,
      personalHolidays: [] // Empty initially, can be populated separately
    };
  }

  // Transform Jira epic to WorkItem format
  static transformJiraEpicToWorkItem(jiraEpic: any): WorkItem {
    // Map Jira status to our status
    const statusMapping: Record<string, WorkItem['status']> = {
      'Draft': 'Not Started',
      'Ready': 'Not Started', 
      'In Progress': 'In Progress',
      'Done': 'Completed',
      'Completed': 'Completed'
    };
    
    // Infer skills from labels
    const skills: Skill[] = [];
    if (jiraEpic.labels?.some((label: string) => 
      label.toLowerCase().includes('frontend') || 
      label.toLowerCase().includes('ui') || 
      label.toLowerCase().includes('react')
    )) {
      skills.push('frontend');
    }
    if (jiraEpic.labels?.some((label: string) => 
      label.toLowerCase().includes('backend') || 
      label.toLowerCase().includes('api') || 
      label.toLowerCase().includes('.net')
    )) {
      skills.push('backend');
    }
    
    // Default to both if no specific skills identified
    if (skills.length === 0) {
      skills.push('frontend', 'backend');
    }
    
    // Calculate required completion date
    const createdDate = new Date(jiraEpic.created);
    const defaultDuration = 90 * 24 * 60 * 60 * 1000; // 90 days default
    const requiredCompletionDate = new Date(createdDate.getTime() + defaultDuration);
    
    return {
      id: jiraEpic.key,
      title: jiraEpic.summary,
      description: jiraEpic.description || '',
      estimateStoryPoints: 8, // Default estimate for epics
      requiredCompletionDate: requiredCompletionDate,
      requiredSkills: skills,
      dependencies: [], // Can be populated from issue links
      status: statusMapping[jiraEpic.status?.name] || 'Not Started',
      assignedSprints: [] // Initially empty
    };
  }

  // Import both team members and epics
  async importFromJira(): Promise<{
    teamMembers: TeamMember[];
    workItems: WorkItem[];
  }> {
    console.log(`🚀 Starting Jira import from project: ${this.projectKey}`);
    
    try {
      const [teamMembers, workItems] = await Promise.all([
        this.extractTeamMembers(),
        this.extractEpics()
      ]);
      
      console.log(`✅ Jira import completed: ${teamMembers.length} team members, ${workItems.length} work items`);
      
      return { teamMembers, workItems };
    } catch (error) {
      console.error('❌ Jira import failed:', error);
      throw error;
    }
  }
}

export const jiraIntegration = new JiraIntegrationService(); 