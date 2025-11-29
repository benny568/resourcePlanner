// Epic color utility functions

export interface EpicColor {
  background: string;
  border: string;
  text: string;
  label: string;
}

// Predefined color palette for epics
const EPIC_COLOR_PALETTE: EpicColor[] = [
  {
    background: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-800',
    label: 'bg-blue-100 text-blue-800'
  },
  {
    background: 'bg-green-50',
    border: 'border-green-200', 
    text: 'text-green-800',
    label: 'bg-green-100 text-green-800'
  },
  {
    background: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-800', 
    label: 'bg-purple-100 text-purple-800'
  },
  {
    background: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-800',
    label: 'bg-orange-100 text-orange-800'
  },
  {
    background: 'bg-pink-50',
    border: 'border-pink-200',
    text: 'text-pink-800',
    label: 'bg-pink-100 text-pink-800'
  },
  {
    background: 'bg-indigo-50',
    border: 'border-indigo-200',
    text: 'text-indigo-800',
    label: 'bg-indigo-100 text-indigo-800'
  },
  {
    background: 'bg-teal-50',
    border: 'border-teal-200',
    text: 'text-teal-800',
    label: 'bg-teal-100 text-teal-800'
  },
  {
    background: 'bg-cyan-50',
    border: 'border-cyan-200',
    text: 'text-cyan-800',
    label: 'bg-cyan-100 text-cyan-800'
  },
  {
    background: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-800',
    label: 'bg-amber-100 text-amber-800'
  },
  {
    background: 'bg-rose-50',
    border: 'border-rose-200',
    text: 'text-rose-800',
    label: 'bg-rose-100 text-rose-800'
  }
];

// Default color for work items not in an epic
export const DEFAULT_WORK_ITEM_COLOR: EpicColor = {
  background: 'bg-gray-50',
  border: 'border-gray-200',
  text: 'text-gray-800',
  label: 'bg-gray-100 text-gray-800'
};

// Cache for epic ID to color mapping
const epicColorCache = new Map<string, EpicColor>();

/**
 * Get a consistent color for an epic based on its ID
 */
export function getEpicColor(epicId: string): EpicColor {
  if (epicColorCache.has(epicId)) {
    return epicColorCache.get(epicId)!;
  }

  // Generate a hash from the epic ID to get consistent color assignment
  let hash = 0;
  for (let i = 0; i < epicId.length; i++) {
    const char = epicId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Use absolute value of hash to pick color from palette
  const colorIndex = Math.abs(hash) % EPIC_COLOR_PALETTE.length;
  const color = EPIC_COLOR_PALETTE[colorIndex];
  
  epicColorCache.set(epicId, color);
  return color;
}

/**
 * Get color for a work item based on its epic relationship
 */
export function getWorkItemColor(workItem: { epicId?: string; isEpic?: boolean; id?: string; jiraId?: string }): EpicColor {
  // If this is an epic work item, use its jiraId or ID for color
  if (workItem.isEpic) {
    const colorKey = workItem.jiraId || workItem.id;
    if (colorKey) {
      return getEpicColor(colorKey);
    }
  }
  
  // If this work item belongs to an epic, use the epic's color
  if (workItem.epicId) {
    return getEpicColor(workItem.epicId);
  }
  
  // Default color for work items not associated with an epic
  return DEFAULT_WORK_ITEM_COLOR;
}

/**
 * Get the epic title for display purposes
 */
export function getEpicTitle(epicId: string, workItems: any[]): string {
  // First try to find by jiraId (most common case for epic children)
  let epic = workItems.find(item => item.jiraId === epicId && item.isEpic);
  
  // Fallback to finding by internal ID
  if (!epic) {
    epic = workItems.find(item => item.id === epicId && item.isEpic);
  }
  
  if (epic) {
    return epic.jiraId ? `${epic.jiraId}: ${epic.title}` : epic.title;
  }
  return 'Unknown Epic';
}

/**
 * Group work items by their epic
 */
export function groupWorkItemsByEpic(workItems: any[]): { [epicId: string]: any[] } {
  const groups: { [epicId: string]: any[] } = {};
  const noEpicKey = '__no_epic__';
  
  workItems.forEach(item => {
    // Skip epic work items themselves from grouping
    if (item.isEpic) {
      return;
    }
    
    const key = item.epicId || noEpicKey;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
  });
  
  return groups;
}

/**
 * Clear the epic color cache (useful for testing or when epics change significantly)
 */
export function clearEpicColorCache(): void {
  epicColorCache.clear();
}

