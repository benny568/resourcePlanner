import React, { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { TeamManagement } from './components/TeamManagement';
import { WorkItemManagement } from './components/WorkItemManagement';
import { EpicsManagement } from './components/EpicsManagement';
import { SprintPlanning } from './components/SprintPlanning';
import { HolidayManagement } from './components/HolidayManagement';
import { SprintConfiguration } from './components/SprintConfiguration';
import { JiraImport } from './components/JiraImport';
import { Calendar, Users, Briefcase, Calendar as CalendarIcon, Settings, Download, Wifi, WifiOff, BarChart3 } from 'lucide-react';
import { TeamMember, WorkItem, Epic, Sprint, PublicHoliday, SprintConfig } from './types';
import { generateSprintsForYear } from './utils/dateUtils';
import { teamMembersApi, workItemsApi, sprintsApi, holidaysApi, sprintConfigApi, transformers } from './services/api';

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
  const [data, setData] = useState<AppData>({
    teamMembers: [],
    workItems: [],
    epics: [],
    sprints: [],
    publicHolidays: [],
    sprintConfig: {
      firstSprintStartDate: new Date('2025-01-06'),
      sprintDurationDays: 14,
      defaultVelocity: 20
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

                    // Utility function to detect skills from title and description
            const detectSkillsFromContent = (workItem: any) => {
              const title = workItem.title?.toLowerCase() || '';
              const description = workItem.description?.toLowerCase() || '';
              
              // Check for explicit skill indicators in title (more reliable)
              const titleHasBackend = title.includes('be:') || title.includes('backend');
              const titleHasFrontend = title.includes('fe:') || title.includes('frontend');
              
              // Check if title or description contains BE or FE indicators
              const hasBackendIndicator = title.includes('be') || description.includes('be');
              const hasFrontendIndicator = title.includes('fe') || description.includes('fe');
              
              // Apply automatic skill determination - prioritize title over description
              if (titleHasFrontend && !titleHasBackend) {
                // Title explicitly indicates frontend
                return ['frontend'];
              } else if (titleHasBackend && !titleHasFrontend) {
                // Title explicitly indicates backend
                return ['backend'];
              } else if (hasBackendIndicator && !hasFrontendIndicator) {
                // Fall back to description analysis - backend only
                return ['backend'];
              } else if (hasFrontendIndicator && !hasBackendIndicator) {
                // Fall back to description analysis - frontend only
                return ['frontend'];
              } else {
                // Keep existing skills if no clear indicators
                return workItem.requiredSkills;
              }
            };

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

  const updateSprints = async (sprints: any[]) => {
    setData(prev => ({ ...prev, sprints }));
    
    if (isApiConnected) {
      try {
        // Get current sprints from backend to compare
        const currentBackendSprints = await sprintsApi.getAll();
        
        // Create a map of existing sprints by ID for quick lookup
        const existingSprintsMap = new Map(currentBackendSprints.map(sprint => [sprint.id, sprint]));
        
        // Process each sprint in the new array
        for (const sprint of sprints) {
          const existingSprint = existingSprintsMap.get(sprint.id);
          
          if (existingSprint) {
            // Check if sprint needs updating (compare key fields)
            const needsUpdate = 
              existingSprint.name !== sprint.name ||
              existingSprint.plannedVelocity !== sprint.plannedVelocity ||
              new Date(existingSprint.startDate).getTime() !== sprint.startDate.getTime() ||
              new Date(existingSprint.endDate).getTime() !== sprint.endDate.getTime();
            
            if (needsUpdate) {
              console.log(`🔄 Updating sprint: ${sprint.id}`);
              await sprintsApi.update(sprint.id, transformers.sprintToApi(sprint));
            }
          } else {
            // Create new sprint
            console.log(`➕ Creating new sprint: ${sprint.id}`);
            await sprintsApi.create(transformers.sprintToApi(sprint));
          }
        }
        
        console.log('✅ Sprints synchronized with backend');
      } catch (error) {
        console.error('❌ Failed to sync sprints to backend:', error);
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
        const existingHolidaysMap = new Map(currentBackendHolidays.map(holiday => [holiday.id, holiday]));
        
        // Create a map of new holidays by ID
        const newHolidaysMap = new Map(publicHolidays.map(holiday => [holiday.id, holiday]));
        
        // Delete holidays that no longer exist in the new array
        for (const existingHoliday of currentBackendHolidays) {
          if (!newHolidaysMap.has(existingHoliday.id)) {
            console.log(`🗑️ Deleting holiday: ${existingHoliday.id}`);
            await holidaysApi.delete(existingHoliday.id);
          }
        }
        
        // Process each holiday in the new array
        for (const holiday of publicHolidays) {
          const existingHoliday = existingHolidaysMap.get(holiday.id);
          
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
      }
    }

    // Generate new sprints based on the updated config
    const year = sprintConfig.firstSprintStartDate.getFullYear();
    const generatedSprints = generateSprintsForYear(sprintConfig, year);
    updateSprints(generatedSprints);
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
        const updatedEpics = [...data.epics, ...newEpics];
        
        // Update epics and pagination state
        setData(prev => ({ ...prev, epics: updatedEpics }));
        setEpicPagination(responseData.pagination);

        console.log(`✅ Loaded ${newEpics.length} more epics. Total: ${updatedEpics.length}/${responseData.pagination.total}`);
        return updatedEpics.length;
      }
    } catch (error) {
      console.error('❌ Load more epics failed:', error);
      throw error;
    }
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'team', label: 'Team', icon: Users },
    { id: 'work-items', label: 'Work Items', icon: Briefcase },
    { id: 'epics', label: 'Epics', icon: Briefcase },
    { id: 'sprints', label: 'Sprint Planning', icon: Calendar },
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
      </main>
    </div>
  );
}

export default App; 