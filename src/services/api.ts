const API_BASE_URL = '/api';

// API Response wrapper type
interface ApiResponse<T> {
  data: T;
  message?: string;
}

interface ApiError {
  error: string;
  message?: string;
  details?: any;
}

// Generic API request handler
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);
    
    if (!response.ok) {
      const errorData: ApiError = await response.json();
      throw new Error(errorData.message || errorData.error || 'API request failed');
    }

    const result: ApiResponse<T> = await response.json();
    return result.data;
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error);
    throw error;
  }
}

// Team Members API
export const teamMembersApi = {
  getAll: () => apiRequest<any[]>('/team-members'),
  
  create: (memberData: any) => 
    apiRequest<any>('/team-members', {
      method: 'POST',
      body: JSON.stringify(memberData),
    }),
  
  update: (id: string, memberData: any) =>
    apiRequest<any>(`/team-members/${id}`, {
      method: 'PUT',
      body: JSON.stringify(memberData),
    }),
  
  delete: (id: string) =>
    apiRequest<any>(`/team-members/${id}`, {
      method: 'DELETE',
    }),
  
  addHoliday: (memberId: string, holidayData: any) =>
    apiRequest<any>(`/team-members/${memberId}/holidays`, {
      method: 'POST',
      body: JSON.stringify(holidayData),
    }),
  
  removeHoliday: (memberId: string, holidayId: string) =>
    apiRequest<any>(`/team-members/${memberId}/holidays/${holidayId}`, {
      method: 'DELETE',
    }),
};

// Work Items API
export const workItemsApi = {
  getAll: () => apiRequest<any[]>('/work-items'),
  
  create: (itemData: any) =>
    apiRequest<any>('/work-items', {
      method: 'POST',
      body: JSON.stringify(itemData),
    }),
  
  update: (id: string, itemData: any) =>
    apiRequest<any>(`/work-items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(itemData),
    }),
  
  delete: (id: string) =>
    apiRequest<any>(`/work-items/${id}`, {
      method: 'DELETE',
    }),
  
  assignToSprint: (workItemId: string, sprintId: string) =>
    apiRequest<any>(`/work-items/${workItemId}/assign-sprint`, {
      method: 'POST',
      body: JSON.stringify({ sprintId }),
    }),
  
  removeFromSprint: (workItemId: string, sprintId: string) =>
    apiRequest<any>(`/work-items/${workItemId}/assign-sprint/${sprintId}`, {
      method: 'DELETE',
    }),

  searchByTicketId: (ticketId: string) =>
    apiRequest<any>(`/work-items/search/${encodeURIComponent(ticketId)}`),
};

// Sprints API
export const sprintsApi = {
  getAll: () => apiRequest<any[]>('/sprints'),
  
  create: (sprintData: any) =>
    apiRequest<any>('/sprints', {
      method: 'POST',
      body: JSON.stringify(sprintData),
    }),
  
  update: (id: string, sprintData: any) =>
    apiRequest<any>(`/sprints/${id}`, {
      method: 'PUT',
      body: JSON.stringify(sprintData),
    }),
  
  delete: (id: string) =>
    apiRequest<any>(`/sprints/${id}`, {
      method: 'DELETE',
    }),
  
  batchUpdate: (sprints: any[], isRegeneration?: boolean) =>
    apiRequest<any>('/sprints/batch', {
      method: 'POST',
      body: JSON.stringify({ sprints, isRegeneration }),
    }),
};

// Public Holidays API
export const holidaysApi = {
  getAll: () => apiRequest<any[]>('/holidays'),
  
  create: (holidayData: any) =>
    apiRequest<any>('/holidays', {
      method: 'POST',
      body: JSON.stringify(holidayData),
    }),
  
  delete: (id: string) =>
    apiRequest<any>(`/holidays/${id}`, {
      method: 'DELETE',
    }),
};

// Sprint Configuration API
export const sprintConfigApi = {
  get: () => apiRequest<any>('/sprint-config'),
  
  update: (configData: any) =>
    apiRequest<any>('/sprint-config', {
      method: 'POST',
      body: JSON.stringify(configData),
    }),
};

// Health check
export const healthApi = {
  check: () => apiRequest<any>('/health'),
};

// Helper function to check if API is available
export const checkApiConnection = async (): Promise<boolean> => {
  try {
    await healthApi.check();
    return true;
  } catch (error) {
    console.warn('API connection failed:', error);
    return false;
  }
};

// Transform data for backend compatibility
export const transformers = {
  // Convert frontend team member to backend format
  teamMemberToApi: (member: any) => ({
    name: member.name,
    capacity: member.capacity,
    skills: member.skills,
  }),
  
  // Convert backend team member to frontend format
  teamMemberFromApi: (member: any) => ({
    ...member,
    personalHolidays: member.personalHolidays?.map((holiday: any) => ({
      ...holiday,
      startDate: new Date(holiday.startDate),
      endDate: new Date(holiday.endDate),
    })) || [],
  }),
  
  // Convert frontend work item to backend format
  workItemToApi: (item: any) => {
    // Validate and ensure required fields have proper values
    const title = item.title?.trim() || 'Untitled Work Item';
    const estimateStoryPoints = Math.max(Number(item.estimateStoryPoints) || 1, 0.5);
    const requiredSkills = Array.isArray(item.requiredSkills) && item.requiredSkills.length > 0 
      ? item.requiredSkills 
      : ['frontend', 'backend']; // Default to both skills if none specified
    
    // Ensure requiredCompletionDate is properly set
    let requiredCompletionDate: string;
    if (item.requiredCompletionDate instanceof Date) {
      requiredCompletionDate = item.requiredCompletionDate.toISOString();
    } else if (item.requiredCompletionDate) {
      requiredCompletionDate = new Date(item.requiredCompletionDate).toISOString();
    } else {
      // Default to 90 days from now if no date provided
      requiredCompletionDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    }

        const apiData = {
      title,
      description: item.description || '',
      estimateStoryPoints,
      requiredCompletionDate,
      requiredSkills,
      dependencies: item.dependencies || [],
      status: item.status || 'Not Started',
      jiraId: item.jiraId,
      jiraStatus: item.jiraStatus,
      assignedSprints: item.assignedSprints || [],
      epicId: item.epicId,
      // Epic work item specific properties
      isEpic: item.isEpic || false,
      priority: item.priority || 'Medium',
      children: item.children
    };

    // Log validation fixes for debugging
    if (item.title?.trim() !== title) {
      console.log(`🔧 Fixed empty title: "${item.title}" → "${title}"`);
    }
    if (Number(item.estimateStoryPoints) !== estimateStoryPoints) {
      console.log(`🔧 Fixed story points: ${item.estimateStoryPoints} → ${estimateStoryPoints}`);
    }
    if (!Array.isArray(item.requiredSkills) || item.requiredSkills.length === 0) {
      console.log(`🔧 Fixed empty skills: ${JSON.stringify(item.requiredSkills)} → ${JSON.stringify(requiredSkills)}`);
    }

    return apiData;
  },
  
  // Convert backend work item to frontend format
  workItemFromApi: (item: any) => ({
    ...item,
    requiredCompletionDate: new Date(item.requiredCompletionDate),
    // Ensure epic properties are preserved
    children: item.children || undefined,
    isEpic: item.isEpic || false,
    priority: item.priority || 'Medium'
  }),
  
  // Convert frontend sprint to backend format
  sprintToApi: (sprint: any) => ({
    name: sprint.name,
    startDate: sprint.startDate.toISOString(),
    endDate: sprint.endDate.toISOString(),
    plannedVelocity: sprint.plannedVelocity,
    actualVelocity: sprint.actualVelocity,
  }),
  
  // Convert backend sprint to frontend format
  sprintFromApi: (sprint: any) => ({
    ...sprint,
    startDate: new Date(sprint.startDate),
    endDate: new Date(sprint.endDate),
  }),
  
  // Convert frontend holiday to backend format
  holidayToApi: (holiday: any) => ({
    name: holiday.name,
    date: holiday.date.toISOString(),
    impactPercentage: holiday.impactPercentage,
  }),
  
  // Convert backend holiday to frontend format
  holidayFromApi: (holiday: any) => ({
    ...holiday,
    date: new Date(holiday.date),
  }),
  
  // Convert frontend sprint config to backend format
  sprintConfigToApi: (config: any) => ({
    firstSprintStartDate: config.firstSprintStartDate.toISOString(),
    sprintDurationDays: config.sprintDurationDays,
    defaultVelocity: config.defaultVelocity,
    startingQuarterSprintNumber: config.startingQuarterSprintNumber || 1,
  }),
  
  // Convert backend sprint config to frontend format
  sprintConfigFromApi: (config: any) => ({
    ...config,
    firstSprintStartDate: new Date(config.firstSprintStartDate),
    startingQuarterSprintNumber: config.startingQuarterSprintNumber || 1,
  }),
}; 