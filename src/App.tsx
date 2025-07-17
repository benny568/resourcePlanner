import React, { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { TeamManagement } from './components/TeamManagement';
import { WorkItemManagement } from './components/WorkItemManagement';
import { SprintPlanning } from './components/SprintPlanning';
import { HolidayManagement } from './components/HolidayManagement';
import { SprintConfiguration } from './components/SprintConfiguration';
import { JiraImport } from './components/JiraImport';
import { Calendar, Users, Briefcase, Calendar as CalendarIcon, Settings, Download, Wifi, WifiOff, BarChart3 } from 'lucide-react';
import { TeamMember, WorkItem, Sprint, PublicHoliday, SprintConfig } from './types';
import { generateSprintsForYear } from './utils/dateUtils';
import { teamMembersApi, workItemsApi, sprintsApi, holidaysApi, sprintConfigApi, transformers } from './services/api';

interface AppData {
  teamMembers: TeamMember[];
  workItems: WorkItem[];
  sprints: Sprint[];
  publicHolidays: PublicHoliday[];
  sprintConfig: SprintConfig;
}

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [data, setData] = useState<AppData>({
    teamMembers: [],
    workItems: [],
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

  // Check API connection
  const checkApiConnection = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/health');
      setIsApiConnected(response.ok);
      return response.ok;
    } catch (error) {
      setIsApiConnected(false);
      return false;
    }
  };

  // Load data from API with localStorage fallback
  const loadData = async () => {
    setIsLoading(true);
    const connected = await checkApiConnection();
    
    if (connected) {
      try {
        // Load all data from API
        const [teamMembers, workItems, sprints, holidays, sprintConfig] = await Promise.all([
          teamMembersApi.getAll(),
          workItemsApi.getAll(),
          sprintsApi.getAll(),
          holidaysApi.getAll(),
          sprintConfigApi.get()
        ]);

        setData({
          teamMembers: teamMembers.map(transformers.teamMemberFromApi),
          workItems: workItems.map(transformers.workItemFromApi),
          sprints: sprints.map(transformers.sprintFromApi),
          publicHolidays: holidays.map(transformers.holidayFromApi),
          sprintConfig: transformers.sprintConfigFromApi(sprintConfig)
        });

        console.log('✅ Data loaded from API successfully');
      } catch (error) {
        console.error('❌ Failed to load from API, falling back to localStorage:', error);
        loadFromLocalStorage();
      }
    } else {
      console.log('🔄 API not available, loading from localStorage');
      loadFromLocalStorage();
    }
    setIsLoading(false);
  };

  // Load data from localStorage
  const loadFromLocalStorage = () => {
    try {
      const storedData = localStorage.getItem('resourcePlannerData');
      if (storedData) {
        const parsed = JSON.parse(storedData);
        setData({
          ...data,
          ...parsed,
          sprintConfig: {
            ...data.sprintConfig,
            ...parsed.sprintConfig,
            firstSprintStartDate: new Date(parsed.sprintConfig?.firstSprintStartDate || '2025-01-06')
          }
        });
        console.log('✅ Data loaded from localStorage');
      }
    } catch (error) {
      console.error('❌ Failed to load from localStorage:', error);
    }
  };

  // Save to localStorage
  const saveToLocalStorage = (newData: AppData) => {
    try {
      localStorage.setItem('resourcePlannerData', JSON.stringify(newData));
    } catch (error) {
      console.error('❌ Failed to save to localStorage:', error);
    }
  };

  // Initial load
  useEffect(() => {
    loadData();
    
    // Set up periodic connection check
    const interval = setInterval(checkApiConnection, 30000);
    return () => clearInterval(interval);
  }, []);

  // Save to localStorage whenever data changes
  useEffect(() => {
    saveToLocalStorage(data);
  }, [data]);

  const updateTeamMembers = async (teamMembers: TeamMember[]) => {
    setData(prev => ({ ...prev, teamMembers }));
  };

  const updateWorkItems = async (workItems: WorkItem[]) => {
    setData(prev => ({ ...prev, workItems }));
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
  const handleJiraImport = async (importedData: { teamMembers: TeamMember[]; workItems: WorkItem[] }) => {
    try {
      console.log('🔄 Processing Jira import data...');
      console.log(`📊 Importing: ${importedData.teamMembers.length} team members, ${importedData.workItems.length} work items`);
      
      // Check for duplicate team members by name (since Jira IDs are different format)
      const existingTeamMemberNames = new Set(data.teamMembers.map(tm => tm.name.toLowerCase()));
      const newTeamMembers = importedData.teamMembers.filter(tm => !existingTeamMemberNames.has(tm.name.toLowerCase()));
      const duplicateTeamMembers = importedData.teamMembers.filter(tm => existingTeamMemberNames.has(tm.name.toLowerCase()));
      
      // Check for duplicate work items by title
      const existingWorkItemTitles = new Set(data.workItems.map(wi => wi.title.toLowerCase()));
      const newWorkItems = importedData.workItems.filter(wi => !existingWorkItemTitles.has(wi.title.toLowerCase()));
      const duplicateWorkItems = importedData.workItems.filter(wi => existingWorkItemTitles.has(wi.title.toLowerCase()));
      
      // Log duplicate information
      if (duplicateTeamMembers.length > 0) {
        console.log(`🔄 Skipped ${duplicateTeamMembers.length} duplicate team members:`, duplicateTeamMembers.map(tm => tm.name));
      }
      if (duplicateWorkItems.length > 0) {
        console.log(`🔄 Skipped ${duplicateWorkItems.length} duplicate work items:`, duplicateWorkItems.map(wi => wi.title));
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
      
      // Merge with existing data using the saved items with database IDs
      const mergedTeamMembers = [...data.teamMembers, ...savedTeamMembers];
      const mergedWorkItems = [...data.workItems, ...savedWorkItems];
      
      // Update local state with merged data
      setData(prev => ({ 
        ...prev, 
        teamMembers: mergedTeamMembers,
        workItems: mergedWorkItems 
      }));
      
      // Switch to work items tab to see imported data
      setActiveTab('work-items');
      
      console.log(`✅ Jira import processed: +${savedTeamMembers.length} new team members, +${savedWorkItems.length} new work items`);
      
      // Show summary alert
      alert(`Jira Import Complete!\n\n✅ Added ${savedTeamMembers.length} new team members\n✅ Added ${savedWorkItems.length} new work items\n🔄 Skipped ${duplicateTeamMembers.length} duplicate team members\n🔄 Skipped ${duplicateWorkItems.length} duplicate work items`);
      
    } catch (error) {
      console.error('❌ Failed to process Jira import:', error);
      alert(`Failed to process Jira import: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'team', label: 'Team', icon: Users },
    { id: 'work-items', label: 'Work Items', icon: Briefcase },
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
                  onClick={() => setActiveTab(tab.id)}
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
        {activeTab === 'sprints' && (
          <SprintPlanning
            data={data}
            onUpdateSprints={updateSprints}
            onUpdateWorkItems={updateWorkItems}
          />
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