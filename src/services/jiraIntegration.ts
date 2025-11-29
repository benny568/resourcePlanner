import { TeamMember, WorkItem, Skill } from '../types';

// Jira integration service for extracting team members and epics
export class JiraIntegrationService {
  private projectKey: string;

  constructor(projectKey: string = 'CW') {
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

  // Extract regular work items (NOT epics) from Jira
  async extractWorkItems(): Promise<WorkItem[]> {
    try {
      console.log(`🔍 Extracting regular work items (non-epics) from Jira project: ${this.projectKey}`);
      console.log(`📡 Making POST request to: /api/jira/work-items`);
      
      const response = await fetch('/api/jira/work-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectKey: this.projectKey })
      });
      
      console.log(`📡 Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ API Error: ${response.status} ${response.statusText} - ${errorText}`);
        throw new Error(`Failed to extract work items: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const workItems: WorkItem[] = await response.json();
      console.log(`✅ Extracted ${workItems.length} regular work items (excluding epics) from Jira`);
      
      return workItems;
    } catch (error) {
      console.error('❌ Error extracting work items from Jira:', error);
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
    // Map Jira status to our status - updated for new workflow
    const statusMapping: Record<string, WorkItem['status']> = {
      'Draft': 'Not Started',
      'Ready to Start': 'Not Started',
      'Cancelled': 'Not Started',
      'In Progress': 'In Progress',
      'Dev Complete': 'In Progress',
      'Test Complete': 'In Progress', 
      'Pending Approval': 'In Progress',
      'Accepted': 'Completed',
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
      jiraId: jiraEpic.key, // Store the Jira ticket key
      title: jiraEpic.summary, // Use the actual epic summary/title from Jira
      description: jiraEpic.description || '',
      estimateStoryPoints: 8, // Default estimate for epics
      requiredCompletionDate: requiredCompletionDate,
      requiredSkills: skills,
      dependencies: [], // Can be populated from issue links
      status: statusMapping[jiraEpic.status?.name] || 'Not Started',
      assignedSprints: [] // Initially empty
    };
  }

  // Import a single Jira ticket as work item
  async importSingleTicket(ticketKey: string): Promise<WorkItem> {
    try {
      console.log(`🎫 Importing single Jira ticket: ${ticketKey}`);
      console.log(`📡 Making POST request to: /api/jira/ticket`);
      
      const response = await fetch('/api/jira/ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketKey: ticketKey.trim() })
      });
      
      console.log(`📡 Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ API Error: ${response.status} ${response.statusText} - ${errorText}`);
        throw new Error(`Failed to import ticket: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const workItem: WorkItem = await response.json();
      console.log(`✅ Successfully imported ticket ${ticketKey} as work item`);
      
      return workItem;
    } catch (error) {
      console.error('❌ Error importing single ticket from Jira:', error);
      throw error;
    }
  }

  // Import team members and regular work items (NOT epics)
  async importFromJira(): Promise<{
    teamMembers: TeamMember[];
    workItems: WorkItem[];
  }> {
    console.log(`🚀 Starting Jira import from project: ${this.projectKey} (regular work items only, NOT epics)`);
    
    try {
      const [teamMembers, workItems] = await Promise.all([
        this.extractTeamMembers(),
        this.extractWorkItems()
      ]);
      
      console.log(`✅ Jira import completed: ${teamMembers.length} team members, ${workItems.length} regular work items (epics excluded)`);
      
      return { teamMembers, workItems };
    } catch (error) {
      console.error('❌ Jira import failed:', error);
      throw error;
    }
  }
}

export const jiraIntegration = new JiraIntegrationService(); 