const API_BASE_URL = 'http://localhost:3001/api';

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
  workItemToApi: (item: any) => ({
    title: item.title,
    description: item.description,
    estimateStoryPoints: item.estimateStoryPoints,
    requiredCompletionDate: item.requiredCompletionDate instanceof Date 
      ? item.requiredCompletionDate.toISOString() 
      : item.requiredCompletionDate,
    requiredSkills: item.requiredSkills,
    dependencies: item.dependencies,
    status: item.status,
  }),
  
  // Convert backend work item to frontend format
  workItemFromApi: (item: any) => ({
    ...item,
    requiredCompletionDate: new Date(item.requiredCompletionDate),
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
  }),
  
  // Convert backend sprint config to frontend format
  sprintConfigFromApi: (config: any) => ({
    ...config,
    firstSprintStartDate: new Date(config.firstSprintStartDate),
  }),
}; 