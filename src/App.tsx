import React, { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { TeamManagement } from './components/TeamManagement';
import { WorkItemManagement } from './components/WorkItemManagement';
import { EpicsManagement } from './components/EpicsManagement';
import { SprintPlanning } from './components/SprintPlanning';
import { HolidayManagement } from './components/HolidayManagement';
import { SprintConfiguration } from './components/SprintConfiguration';
import { JiraImport } from './components/JiraImport';
import { DeliveryForecast } from './components/DeliveryForecast';
import { SprintSync } from './components/SprintSync';
import { EpicRoadmap } from './components/EpicRoadmap';
import { Calendar, Users, Briefcase, Calendar as CalendarIcon, Settings, Download, Wifi, WifiOff, BarChart3, Target, RefreshCw, Map } from 'lucide-react';
import { TeamMember, WorkItem, Epic, Sprint, PublicHoliday, SprintConfig } from './types';
import { generateSprintsForYear } from './utils/dateUtils';
import { teamMembersApi, workItemsApi, sprintsApi, holidaysApi, sprintConfigApi, transformers } from './services/api';
import { detectSkillsFromContent } from './utils/skillDetection';

interface AppData {
  teamMembers: TeamMember[];
  workItems: WorkItem[];
  epics: Epic[];
  sprints: Sprint[];
  publicHolidays: PublicHoliday[];
  sprintConfig: SprintConfig;
}

function App() {
  console.log('🚀 App: Component initialized');
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [targetDeliveryDate, setTargetDeliveryDate] = useState<Date | undefined>(undefined);
  const [data, setData] = useState<AppData>({
    teamMembers: [],
    workItems: [],
    epics: [],
    sprints: [],
    publicHolidays: [],
    sprintConfig: {
      firstSprintStartDate: new Date('2025-01-06'),
      sprintDurationDays: 14,
      defaultVelocity: 20,
      startingQuarterSprintNumber: 1
    }
  });
  const [isApiConnected, setIsApiConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Epic pagination state (global to persist across tab switches)
  const [epicPagination, setEpicPagination] = useState<{ limit: number, startAt: number, total: number, hasMore: boolean } | null>(null);

  // Check API connection
  const checkApiConnection = async () => {
    try {
      const response = await fetch('/api/health');
      setIsApiConnected(response.ok);
      return response.ok;
    } catch (error) {
      setIsApiConnected(false);
      return false;
    }
  };

  // Load data from API
  const loadData = async () => {
    console.log('🔄 Starting loadData...');
    setIsLoading(true);
    const connected = await checkApiConnection();
    console.log('🔗 API connection check result:', connected);
    
    if (connected) {
      try {
        console.log('📡 Making API calls...');
        // Load all data from API
        const [teamMembers, workItems, sprints, holidays, sprintConfig] = await Promise.all([
          teamMembersApi.getAll(),
          workItemsApi.getAll(),
          sprintsApi.getAll(),
          holidaysApi.getAll(),
          sprintConfigApi.get()
        ]);
        console.log('📦 Received data - workItems count:', workItems.length);

                    // Use the enhanced skill detection function

        // Transform work items - ALL items from database should be treated as work items
        const transformedWorkItems = workItems.map(item => {
          const transformed = transformers.workItemFromApi(item);
          // Apply skill detection to all work items
          const detectedSkills = detectSkillsFromContent(transformed);
          return {
            ...transformed,
            requiredSkills: detectedSkills
          };
        });
        console.log('🔄 Transformed work items with skill detection:', transformedWorkItems.length);
        console.log('🔍 Work items details:', transformedWorkItems.map(w => ({id: w.id, title: w.title.substring(0, 30), skills: w.requiredSkills})));
        
        // Epic work items (converted via "Add to Work Items") should stay in Work Items tab
        console.log('🎯 Final work items to store:', transformedWorkItems.length);
        console.log('🎯 Final work items details:', transformedWorkItems.map(w => ({id: w.id, title: w.title, isEpic: w.isEpic, epicId: w.epicId})));
        
        // No epic work items should be moved back to epics - they belong in Work Items tab
        const loadedEpics: any[] = [];

        setData({
          teamMembers: teamMembers.map(transformers.teamMemberFromApi),
          workItems: transformedWorkItems,
          epics: loadedEpics,
          sprints: sprints.map(transformers.sprintFromApi),
          publicHolidays: holidays.map(transformers.holidayFromApi),
          sprintConfig: transformers.sprintConfigFromApi(sprintConfig)
        });

        console.log('✅ Data loaded from API successfully - final state set');
      } catch (error) {
        console.error('❌ Failed to load from API:', error);
        // No fallback - app requires API connection
      }
    } else {
      console.log('🔄 API not available - app requires API connection');
      // No fallback - app requires API connection
    }
    setIsLoading(false);
  };





  // Initial load
  useEffect(() => {
    loadData();
    
    // Set up periodic connection check
    const interval = setInterval(checkApiConnection, 30000);
    return () => clearInterval(interval);
  }, []);



  const updateTeamMembers = async (teamMembers: TeamMember[]) => {
    setData(prev => ({ ...prev, teamMembers }));
  };

  const updateWorkItems = async (workItems: WorkItem[]) => {
    setData(prev => ({ ...prev, workItems }));
  };

  const updateEpics = async (epics: Epic[]) => {
    setData(prev => ({ ...prev, epics }));
  };

  const updateSprints = async (sprints: any[], useBatchOperation: boolean = false, isRegeneration: boolean = false, skipBackendSync: boolean = false) => {
    console.log('🔄 updateSprints called with:', {
      sprintCount: sprints.length,
      isApiConnected,
      useBatchOperation,
      firstSprintId: sprints[0]?.id,
      firstSprintName: sprints[0]?.name
    });
    
    setData(prev => ({ ...prev, sprints }));
    
    // Skip backend sync if explicitly requested (e.g., when data is already synced)
    if (skipBackendSync) {
      console.log('⏭️ Skipping backend sync as requested');
      return;
    }
    
    if (isApiConnected) {
      try {
        if (useBatchOperation) {
          // Use batch endpoint for bulk operations (like config regeneration)
          console.log('📡 Using batch operation for sprint sync...');
          const sprintDataArray = sprints.map(sprint => transformers.sprintToApi(sprint));
          // Pass isRegeneration flag for configuration regeneration to clear existing sprints
          const result = await sprintsApi.batchUpdate(sprintDataArray, isRegeneration);
          console.log('✅ Batch sprint operation completed:', result);
          
          // If this was a regeneration, reload sprint data to get correct database IDs
          if (isRegeneration) {
            console.log('🔄 Regeneration completed, reloading sprint data from database...');
            const freshSprints = await sprintsApi.getAll();
            console.log('✅ Fresh sprint data loaded:', freshSprints.length, 'sprints');
            setData(prev => ({ ...prev, sprints: freshSprints.map(transformers.sprintFromApi) }));
            return; // Skip local state update since we just loaded fresh data
          }
        } else {
          // Use individual operations for single sprint updates
          console.log('📡 Using individual operations for sprint sync...');
          
          // Get current sprints from backend to compare
          console.log('📡 Fetching current backend sprints...');
          const currentBackendSprints = await sprintsApi.getAll();
          console.log('📡 Backend sprints:', {
            count: currentBackendSprints.length,
            ids: currentBackendSprints.map(s => s.id)
          });
          
          // Create a map of existing sprints by ID for quick lookup
          const existingSprintsMap: Record<string, any> = {};
          currentBackendSprints.forEach(sprint => existingSprintsMap[sprint.id] = sprint);
          
          // Process each sprint in the new array
          for (const sprint of sprints) {
            const existingSprint = existingSprintsMap[sprint.id];
            
            console.log(`🔍 Processing sprint ${sprint.id}:`, {
              exists: !!existingSprint,
              sprintData: {
                name: sprint.name,
                startDate: sprint.startDate,
                endDate: sprint.endDate,
                plannedVelocity: sprint.plannedVelocity
              }
            });
            
            if (existingSprint) {
              // Check if sprint needs updating (compare key fields)
              const needsUpdate = 
                existingSprint.name !== sprint.name ||
                existingSprint.plannedVelocity !== sprint.plannedVelocity ||
                new Date(existingSprint.startDate).getTime() !== sprint.startDate.getTime() ||
                new Date(existingSprint.endDate).getTime() !== sprint.endDate.getTime();
              
              if (needsUpdate) {
                console.log(`🔄 Updating sprint: ${sprint.id}`, {
                  changes: {
                    name: existingSprint.name !== sprint.name ? `${existingSprint.name} → ${sprint.name}` : 'unchanged',
                    plannedVelocity: existingSprint.plannedVelocity !== sprint.plannedVelocity ? `${existingSprint.plannedVelocity} → ${sprint.plannedVelocity}` : 'unchanged',
                    startDate: new Date(existingSprint.startDate).getTime() !== sprint.startDate.getTime() ? `${existingSprint.startDate} → ${sprint.startDate}` : 'unchanged',
                    endDate: new Date(existingSprint.endDate).getTime() !== sprint.endDate.getTime() ? `${existingSprint.endDate} → ${sprint.endDate}` : 'unchanged'
                  }
                });
                const result = await sprintsApi.update(sprint.id, transformers.sprintToApi(sprint));
                console.log(`✅ Sprint ${sprint.id} updated successfully:`, result);
              } else {
                console.log(`⏭️ Sprint ${sprint.id} unchanged, skipping update`);
              }
            } else {
              // Create new sprint
              console.log(`➕ Creating new sprint: ${sprint.id}`, {
                apiData: transformers.sprintToApi(sprint)
              });
              try {
                const result = await sprintsApi.create(transformers.sprintToApi(sprint));
                console.log(`✅ Sprint ${sprint.id} created successfully:`, result);
              } catch (createError) {
                console.error(`❌ Failed to create sprint ${sprint.id}:`, createError);
                throw createError;
              }
            }
          }
        }
        
        console.log('✅ Sprints synchronized with backend');
      } catch (error) {
        console.error('❌ Failed to sync sprints to backend:', error);
        // Don't throw to prevent UI from breaking, but log the full error
        if (error instanceof Error) {
          console.error('❌ Error details:', {
            message: error.message,
            stack: error.stack
          });
        }
        alert(`❌ Failed to save sprint configuration to database: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  const updatePublicHolidays = async (publicHolidays: any[]) => {
    setData(prev => ({ ...prev, publicHolidays }));
    
    if (isApiConnected) {
      try {
        // Get current holidays from backend to compare
        const currentBackendHolidays = await holidaysApi.getAll();
        
        // Create a map of existing holidays by ID for quick lookup
        const existingHolidaysMap: Record<string, any> = {};
        currentBackendHolidays.forEach(holiday => existingHolidaysMap[holiday.id] = holiday);
        
        // Create a map of new holidays by ID
        const newHolidaysMap: Record<string, any> = {};
        publicHolidays.forEach(holiday => newHolidaysMap[holiday.id] = holiday);
        
        // Delete holidays that no longer exist in the new array
        for (const existingHoliday of currentBackendHolidays) {
          if (!(existingHoliday.id in newHolidaysMap)) {
            console.log(`🗑️ Deleting holiday: ${existingHoliday.id}`);
            await holidaysApi.delete(existingHoliday.id);
          }
        }
        
        // Process each holiday in the new array
        for (const holiday of publicHolidays) {
          const existingHoliday = existingHolidaysMap[holiday.id];
          
          if (existingHoliday) {
            // Check if holiday needs updating
            const needsUpdate = 
              existingHoliday.name !== holiday.name ||
              existingHoliday.impactPercentage !== holiday.impactPercentage ||
              new Date(existingHoliday.date).getTime() !== holiday.date.getTime();
            
            if (needsUpdate) {
              console.log(`🔄 Updating holiday: ${holiday.id}`);
              await holidaysApi.delete(holiday.id);
              await holidaysApi.create(transformers.holidayToApi(holiday));
            }
          } else {
            // Create new holiday
            console.log(`➕ Creating new holiday: ${holiday.id}`);
            await holidaysApi.create(transformers.holidayToApi(holiday));
          }
        }
        
        console.log('✅ Holidays synchronized with backend');
      } catch (error) {
        console.error('❌ Failed to sync holidays to backend:', error);
      }
    }
  };

  const updateSprintConfig = async (sprintConfig: SprintConfig) => {
    setData(prev => ({ ...prev, sprintConfig }));

    if (isApiConnected) {
      try {
        await sprintConfigApi.update(transformers.sprintConfigToApi(sprintConfig));
        console.log('✅ Sprint config saved to backend');
      } catch (error) {
        console.error('❌ Failed to save sprint config to backend:', error);
        
        // Improved error handling to prevent weird error messages
        let errorMessage = 'Unknown error occurred';
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (error && typeof error === 'object' && 'message' in error) {
          errorMessage = String(error.message);
        } else if (typeof error === 'string') {
          errorMessage = error;
        }
        
        console.error('❌ Detailed error information:', {
          error,
          errorType: typeof error,
          errorConstructor: error?.constructor?.name,
          errorMessage
        });
        
        // Re-throw the error with a clean message for upstream handling
        throw new Error(`Failed to save sprint configuration to database: ${errorMessage}`);
      }
    }

    // NOTE: Sprint regeneration is now handled explicitly by SprintConfiguration component
    // This prevents duplicate sprint creation that was happening due to automatic + manual calls
  };

  // Handle Jira import completion
  const handleJiraImport = async (importedData: { teamMembers: TeamMember[]; workItems: WorkItem[]; epics?: Epic[], isPartialImport?: boolean, pagination?: { limit: number, startAt: number, total: number, hasMore: boolean } }) => {
    try {
      console.log('🔄 Processing Jira import data...');
      console.log(`📊 Importing: ${importedData.teamMembers.length} team members, ${importedData.workItems.length} work items, ${importedData.epics?.length || 0} epics`);
      
      // Check for duplicate team members by name (since Jira IDs are different format)
      const existingTeamMemberNames = new Set(data.teamMembers.map(tm => tm.name.toLowerCase()));
      const newTeamMembers = importedData.teamMembers.filter(tm => !existingTeamMemberNames.has(tm.name.toLowerCase()));
      const duplicateTeamMembers = importedData.teamMembers.filter(tm => existingTeamMemberNames.has(tm.name.toLowerCase()));
      
      // Check for duplicate work items by Jira ID or title
      const existingJiraIds = new Set(data.workItems.map(wi => wi.jiraId).filter(Boolean));
      const existingWorkItemTitles = new Set(data.workItems.map(wi => wi.title.toLowerCase()));
      
      const newWorkItems = importedData.workItems.filter(wi => 
        !wi.jiraId || (!existingJiraIds.has(wi.jiraId) && !existingWorkItemTitles.has(wi.title.toLowerCase()))
      );
      
      const updateWorkItems = importedData.workItems.filter(wi => 
        wi.jiraId && existingJiraIds.has(wi.jiraId)
      );
      
      const duplicateWorkItems = importedData.workItems.filter(wi => 
        !wi.jiraId && existingWorkItemTitles.has(wi.title.toLowerCase())
      );
      
      // Log duplicate information
      if (duplicateTeamMembers.length > 0) {
        console.log(`🔄 Skipped ${duplicateTeamMembers.length} duplicate team members:`, duplicateTeamMembers.map(tm => tm.name));
      }
      if (duplicateWorkItems.length > 0) {
        console.log(`🔄 Skipped ${duplicateWorkItems.length} duplicate work items:`, duplicateWorkItems.map(wi => wi.title));
      }
      if (updateWorkItems.length > 0) {
        console.log(`🔄 Updating ${updateWorkItems.length} existing Jira tickets:`, updateWorkItems.map(wi => wi.jiraId));
      }
      
      // Save new team members to database and get back the database IDs
      const savedTeamMembers: TeamMember[] = [];
      if (isApiConnected) {
        for (const teamMember of newTeamMembers) {
          try {
            console.log(`💾 Saving team member to database: ${teamMember.name}`);
            const savedMember = await teamMembersApi.create(transformers.teamMemberToApi(teamMember));
            savedTeamMembers.push(transformers.teamMemberFromApi(savedMember));
          } catch (error) {
            console.error(`❌ Failed to save team member ${teamMember.name}:`, error);
          }
        }
      }
      
      // Save new work items to database and get back the database IDs
      const savedWorkItems: WorkItem[] = [];
      if (isApiConnected) {
        for (const workItem of newWorkItems) {
          try {
            console.log(`💾 Saving work item to database: ${workItem.title}`);
            console.log('📋 Work item data:', workItem);
            const apiData = transformers.workItemToApi(workItem);
            console.log('📡 Transformed API data:', apiData);
            const savedItem = await workItemsApi.create(apiData);
            console.log('✅ Saved work item response:', savedItem);
            savedWorkItems.push(transformers.workItemFromApi(savedItem));
          } catch (error) {
            console.error(`❌ Failed to save work item ${workItem.title}:`, error);
            console.error('📋 Work item that failed:', workItem);
          }
        }
      } else {
        console.log('⚠️ API not connected, skipping work item database save');
      }
      
      // Note: Epic children are NOT automatically saved to database during import
      // They will only be saved when user manually clicks "Add to Work Items" in EpicsManagement
      console.log(`📋 Epic import completed - epics and children are available for manual conversion to work items`);
      const savedEpicChildren: WorkItem[] = []; // Empty array since we're not auto-saving children
      
      // Update existing work items with fresh Jira data
      const updatedWorkItems: WorkItem[] = [];
      if (isApiConnected) {
        for (const updateItem of updateWorkItems) {
          try {
            console.log(`🔄 Updating existing work item: ${updateItem.jiraId} - ${updateItem.title}`);
            const existingItem = data.workItems.find(wi => wi.jiraId === updateItem.jiraId);
            if (existingItem) {
              // Merge the existing item with updated Jira data, preserving local changes
              const mergedItem = {
                ...existingItem,
                title: updateItem.title, // Update title from Jira
                description: updateItem.description, // Update description from Jira
                estimateStoryPoints: updateItem.estimateStoryPoints, // Update story points from Jira
                jiraStatus: updateItem.jiraStatus, // Update Jira status
                status: updateItem.status // Update simplified status mapping
              };
              
              const apiData = transformers.workItemToApi(mergedItem);
              const savedItem = await workItemsApi.update(existingItem.id, apiData);
              updatedWorkItems.push(transformers.workItemFromApi(savedItem));
              console.log(`✅ Updated work item: ${updateItem.jiraId}`);
            }
          } catch (error) {
            console.error(`❌ Failed to update work item ${updateItem.jiraId}:`, error);
          }
        }
      }
      
      // Merge with existing data using the saved items with database IDs
      const mergedTeamMembers = [...data.teamMembers, ...savedTeamMembers];
      
      // Replace updated items and add new items
      let mergedWorkItems = [...data.workItems];
      
      // Replace updated items
      for (const updatedItem of updatedWorkItems) {
        const index = mergedWorkItems.findIndex(wi => wi.id === updatedItem.id);
        if (index !== -1) {
          mergedWorkItems[index] = updatedItem;
        }
      }
      
      // Add new items and epic children
      mergedWorkItems = [...mergedWorkItems, ...savedWorkItems, ...savedEpicChildren];
      
      // Process epics if provided
      let mergedEpics = [...data.epics];
      if (importedData.epics && importedData.epics.length > 0) {
        // Check for duplicate epics by Jira ID
        const existingEpicJiraIds = new Set(data.epics.map(epic => epic.jiraId));
        const newEpics = importedData.epics.filter(epic => !existingEpicJiraIds.has(epic.jiraId));
        const duplicateEpics = importedData.epics.filter(epic => existingEpicJiraIds.has(epic.jiraId));
        
        console.log(`🔄 Epic processing: +${newEpics.length} new, ~${duplicateEpics.length} duplicates`);
        
        // Simply add new epics (no backend persistence for now)
        mergedEpics = [...data.epics, ...newEpics];
        
        // Update pagination state if provided
        if (importedData.pagination) {
          setEpicPagination(importedData.pagination);
        }
      }
      
      // Update local state with merged data
      setData(prev => ({ 
        ...prev, 
        teamMembers: mergedTeamMembers,
        workItems: mergedWorkItems,
        epics: mergedEpics
      }));
      
      // Switch to appropriate tab to see imported data (only for final imports)
      if (!importedData.isPartialImport) {
        if (importedData.epics && importedData.epics.length > 0) {
          setActiveTab('epics');
        } else {
          setActiveTab('work-items');
        }
      }
      
      const epicCount = importedData.epics?.length || 0;
      console.log(`✅ Jira import processed: +${savedTeamMembers.length} new team members, +${savedWorkItems.length} new work items, +${epicCount} epics, ~${updatedWorkItems.length} updated work items`);
      
      // Show summary alert only for final imports, not partial imports
      if (!importedData.isPartialImport) {
        let alertMessage = `Jira Import Complete!\n\n✅ Added ${savedTeamMembers.length} new team members\n✅ Added ${savedWorkItems.length} new work items`;
        if (epicCount > 0) {
          alertMessage += `\n📁 Imported ${epicCount} epics (displayed only - use "Add to Work Items" to save)`;
        }
        alertMessage += `\n🔄 Updated ${updatedWorkItems.length} existing work items\n🔄 Skipped ${duplicateTeamMembers.length} duplicate team members\n🔄 Skipped ${duplicateWorkItems.length} duplicate work items`;
        alert(alertMessage);
      }
      
      // Auto-refresh data for single ticket imports to ensure UI shows latest values
      const isSingleTicketImport = importedData.workItems.length === 1 && 
                                   importedData.teamMembers.length === 0 && 
                                   (!importedData.epics || importedData.epics.length === 0);
      
      if (isSingleTicketImport && updatedWorkItems.length > 0) {
        console.log('🔄 Single ticket import detected - refreshing data to ensure UI consistency');
        // Small delay to ensure database transaction is committed
        setTimeout(async () => {
          try {
            await loadData();
            console.log('✅ Data refreshed after single ticket import');
          } catch (refreshError) {
            console.error('❌ Failed to refresh data after single ticket import:', refreshError);
          }
        }, 500);
      }
      
    } catch (error) {
      console.error('❌ Failed to process Jira import:', error);
      alert(`Failed to process Jira import: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handle loading more epics (called from EpicsManagement)
  const handleLoadMoreEpics = async () => {
    if (!epicPagination?.hasMore) return;

    try {
      console.log(`📄 Loading more epics: page ${Math.floor(epicPagination.startAt / epicPagination.limit) + 2}`);

      const response = await fetch('/api/jira/epics-with-children', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          projectKey: 'REF', 
          limit: epicPagination.limit, 
          startAt: epicPagination.startAt + epicPagination.limit 
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to load more epics: ${response.status} ${response.statusText}`);
      }

      const responseData = await response.json();
      
      if (responseData.epics && Array.isArray(responseData.epics)) {
        const newEpics = responseData.epics;
        
        // Simple deduplication: Use jiraId as primary identifier for Jira epics
        const existingJiraIds = new Set(data.epics.map((epic: Epic) => epic.jiraId).filter(Boolean));
        
        const uniqueNewEpics = newEpics.filter((epic: Epic) => {
          // If epic has no jiraId, include it (shouldn't happen with Jira epics, but be safe)
          if (!epic.jiraId) return true;
          
          // Only include if jiraId is not already in our existing epics
          return !existingJiraIds.has(epic.jiraId);
        });
        
        const updatedEpics = [...data.epics, ...uniqueNewEpics];
        
        // Update epics and pagination state
        setData(prev => ({ ...prev, epics: updatedEpics }));
        setEpicPagination(responseData.pagination);

        console.log(`✅ Loaded ${newEpics.length} epics, ${uniqueNewEpics.length} were unique. Total: ${updatedEpics.length}/${responseData.pagination.total}`);
        if (newEpics.length !== uniqueNewEpics.length) {
          console.log(`🔄 Filtered out ${newEpics.length - uniqueNewEpics.length} duplicate epics`);
        }
        return updatedEpics.length;
      }
    } catch (error) {
      console.error('❌ Load more epics failed:', error);
      throw error;
    }
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'delivery-forecast', label: 'Delivery Forecast', icon: Target },
    { id: 'epic-roadmap', label: 'Epic Roadmap', icon: Map },
    { id: 'team', label: 'Team', icon: Users },
    { id: 'work-items', label: 'Work Items', icon: Briefcase },
    { id: 'epics', label: 'Epics', icon: Briefcase },
    { id: 'sprints', label: 'Sprint Planning', icon: Calendar },
    { id: 'sprint-sync', label: 'Sprint Sync', icon: RefreshCw },
    { id: 'holidays', label: 'Holidays', icon: CalendarIcon },
    { id: 'config', label: 'Configuration', icon: Settings },
    { id: 'jira-import', label: 'Import from Jira', icon: Download },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading resource planner...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-3">
              <Calendar className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">Resource Planner</h1>
            </div>
            <div className="flex items-center gap-2">
              {isApiConnected ? (
                <div className="flex items-center gap-2 text-green-600">
                  <Wifi className="h-4 w-4" />
                  <span className="text-sm">Database connected</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-yellow-600">
                  <WifiOff className="h-4 w-4" />
                  <span className="text-sm">Offline mode</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    console.log('🚀 App: Tab clicked', tab.id);
                    setActiveTab(tab.id);
                  }}
                  className={`flex items-center gap-2 py-4 px-2 border-b-2 font-medium text-sm whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && (
          <Dashboard data={data} />
        )}
        {activeTab === 'team' && (
          <TeamManagement
            teamMembers={data.teamMembers}
            onUpdateTeamMembers={updateTeamMembers}
          />
        )}
        {activeTab === 'work-items' && (
          <WorkItemManagement
            workItems={data.workItems}
            onUpdateWorkItems={updateWorkItems}
          />
        )}
        {activeTab === 'epics' && (
          <EpicsManagement
            epics={data.epics}
            onUpdateEpics={updateEpics}
            onUpdateWorkItems={(updater) => {
              const updatedWorkItems = updater(data.workItems);
              updateWorkItems(updatedWorkItems);
            }}
            pagination={epicPagination}
            onLoadMoreEpics={handleLoadMoreEpics}
          />
        )}
        {activeTab === 'sprints' && (
          <>
            {console.log('🚀 App: Rendering SprintPlanning component', { 
              workItems: data.workItems.length, 
              sprints: data.sprints.length,
              activeTab 
            })}
            <SprintPlanning
              data={data}
              onUpdateSprints={updateSprints}
              onUpdateWorkItems={updateWorkItems}
            />
          </>
        )}
        {activeTab === 'holidays' && (
          <HolidayManagement
            publicHolidays={data.publicHolidays}
            onUpdatePublicHolidays={updatePublicHolidays}
          />
        )}
        {activeTab === 'config' && (
          <SprintConfiguration
            sprintConfig={data.sprintConfig}
            sprints={data.sprints}
            onUpdateSprintConfig={updateSprintConfig}
            onUpdateSprints={updateSprints}
          />
        )}
        {activeTab === 'jira-import' && (
          <JiraImport
            onImportComplete={handleJiraImport}
          />
        )}
        {activeTab === 'delivery-forecast' && (
          <DeliveryForecast
            data={data}
            targetDeliveryDate={targetDeliveryDate}
            onSetTargetDeliveryDate={setTargetDeliveryDate}
          />
        )}
        {activeTab === 'epic-roadmap' && (
          <EpicRoadmap
            workItems={data.workItems}
            sprints={data.sprints}
          />
        )}
        {activeTab === 'sprint-sync' && (
          <SprintSync
            data={data}
            onSyncComplete={loadData}
          />
        )}
      </main>
    </div>
  );
}

export default App; 