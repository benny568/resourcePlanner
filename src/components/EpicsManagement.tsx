import React, { useState } from 'react';
import { Epic, WorkItem } from '../types';
import { ChevronDown, ChevronRight, Briefcase, CheckCircle, Clock, AlertCircle, ExternalLink, Trash2, Plus } from 'lucide-react';
import { workItemsApi, transformers } from '../services/api';

interface EpicsManagementProps {
  epics: Epic[];
  onUpdateEpics: (epics: Epic[]) => void;
  onUpdateWorkItems?: (updater: (prevWorkItems: WorkItem[]) => WorkItem[]) => void;
}

export const EpicsManagement: React.FC<EpicsManagementProps> = ({
  epics,
  onUpdateEpics,
  onUpdateWorkItems
}) => {
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set());

  const toggleEpicExpansion = (epicId: string) => {
    const newExpanded = new Set(expandedEpics);
    if (newExpanded.has(epicId)) {
      newExpanded.delete(epicId);
    } else {
      newExpanded.add(epicId);
    }
    setExpandedEpics(newExpanded);
  };

  const deleteEpic = async (epicId: string, epicTitle: string) => {
    const confirmed = window.confirm(`Are you sure you want to delete epic "${epicTitle}"?\n\nThis will permanently remove the epic and all its child tickets from both the local list and the database (if it was previously added to Work Items).`);
    
    if (confirmed) {
      try {
        // Check if this epic has been converted to a work item and needs database cleanup
        console.log(`🗑️ Deleting epic: ${epicId} - ${epicTitle}`);
        
        // Try to delete from database in case it was converted to a work item
        // We'll attempt to delete by jiraId since that's more reliable than local ID
        const epic = epics.find(e => e.id === epicId);
        if (epic?.jiraId) {
          try {
            // First check if we can find the work item by calling the API to get all work items
            const allWorkItems = await workItemsApi.getAll();
            const epicWorkItem = allWorkItems.find((item: any) => 
              item.isEpic && (item.jiraId === epic.jiraId || item.id === epicId)
            );
            
            if (epicWorkItem) {
              console.log(`🗑️ Found epic work item in database: ${epicWorkItem.id}, deleting...`);
              await workItemsApi.delete(epicWorkItem.id);
              console.log(`✅ Epic work item deleted from database: ${epicWorkItem.id}`);
              
              // Also need to inform WorkItemManagement to update its state if available
              if (onUpdateWorkItems) {
                onUpdateWorkItems(prevWorkItems => 
                  prevWorkItems.filter(item => 
                    !(item.isEpic && (item.jiraId === epic.jiraId || item.id === epicId))
                  )
                );
              }
            } else {
              console.log(`ℹ️ Epic ${epic.jiraId} not found in database (was not converted to work item)`);
            }
          } catch (dbError) {
            console.log(`ℹ️ Epic ${epic.jiraId} not found in database or failed to delete:`, dbError);
            // Continue with local deletion even if database deletion fails
          }
        }
        
        // Always update local state regardless of database outcome
        const updatedEpics = epics.filter(epic => epic.id !== epicId);
        onUpdateEpics(updatedEpics);
        
        // Also remove from expanded set if it was expanded
        const newExpanded = new Set(expandedEpics);
        newExpanded.delete(epicId);
        setExpandedEpics(newExpanded);
        
        console.log(`✅ Epic deleted successfully: ${epicId} - ${epicTitle}`);
        
      } catch (error) {
        console.error('❌ Error during epic deletion:', error);
        alert(`Failed to delete epic "${epicTitle}". Please try again.`);
      }
    }
  };

  const addEpicToWorkItems = async (epic: Epic) => {
    console.log('🔥 addEpicToWorkItems FUNCTION CALLED with epic:', epic?.title || 'undefined epic');
    
    // CRITICAL SAFEGUARD: This function should ONLY be called by explicit user action
    // If this function is being called automatically, there's a bug in the import flow
    console.log('🛡️ SAFEGUARD CHECK: addEpicToWorkItems should only be called by user button click');
    
    // Add stack trace to debug automatic calls
    console.log('📍 STACK TRACE:', new Error().stack);
    
    // COMPLETE BLOCK: Prevent any automatic execution during import
    // This function should NEVER be called without explicit user confirmation
    if (!window.confirm('DEBUG: Is this a manual user action? Click OK only if you clicked the "Add to Work Items" button.')) {
      console.error('❌ BLOCKED: addEpicToWorkItems called automatically during import - this is NOT allowed');
      alert('Epic children auto-save blocked! Epic children should only be converted manually by clicking "Add to Work Items".');
      return;
    }
    
    if (!onUpdateWorkItems) {
      console.warn('⚠️ onUpdateWorkItems callback not provided');
      return;
    }

    const confirmed = window.confirm(
      `Add epic "${epic.title}" to Work Items?\n\n` +
      `This will:\n` +
      `• Add the epic as an expandable work item\n` +
      `• Keep all ${epic.children.length} child tickets nested within it\n` +
      `• Remove the epic from the Epics list\n` +
      `• Save the epic to the database for persistence\n\n` +
      `You can expand/collapse and manage it in the Work Items tab.`
    );
    
    if (confirmed) {
      console.log('✅ USER CONFIRMED - proceeding with epic conversion');
      try {
        console.log('🚀 STARTING EPIC TO WORK ITEMS CONVERSION...');
        // Convert epic to work item while preserving children structure
        const epicAsWorkItem: WorkItem = {
          id: epic.id,
          jiraId: epic.jiraId,
          title: epic.title, // Keep original title, no [EPIC] prefix
          description: epic.description,
          estimateStoryPoints: epic.totalStoryPoints,
          requiredCompletionDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 180 days from now
          requiredSkills: [], // Epic-level work item doesn't need specific skills
          dependencies: [],
          status: epic.status,
          jiraStatus: epic.jiraStatus,
          assignedSprints: [],
          // Special properties to identify this as an epic work item
          isEpic: true,
          children: epic.children // Preserve the children structure
        };

        console.log('🎯 ABOUT TO START DATABASE SAVES...');
        // Save ONLY the epic work item to database (with children attached, not as separate items)
        console.log(`💾 Saving epic work item to database: ${epic.title}`);
        const apiData = transformers.workItemToApi(epicAsWorkItem);
        const savedEpicWorkItem = await workItemsApi.create(apiData);
        const transformedEpicWorkItem = transformers.workItemFromApi(savedEpicWorkItem);
        
        // Attach the original children to the epic work item for local state
        // Children are NOT saved as separate database records - they remain as part of the epic
        transformedEpicWorkItem.children = epic.children;
        
        console.log(`✅ Epic work item saved to database with ID: ${transformedEpicWorkItem.id}`);
        console.log(`📝 Epic has ${epic.children.length} children attached (not saved as separate work items)`);
        
        // No individual child saving - children remain as part of the epic structure
        
        console.log(`✅ Epic with ${epic.children.length} children saved to database`);

        // Update work items - add only the epic (children are attached to it)
        onUpdateWorkItems((prevWorkItems) => {
          // Check for duplicates by jiraId
          const existingJiraIds = new Set(prevWorkItems.map(item => item.jiraId).filter(Boolean));
          
          // Only add if not duplicate
          if (!existingJiraIds.has(transformedEpicWorkItem.jiraId)) {
            console.log(`📝 Added epic work item with ${epic.children.length} children attached to local state`);
            // Add only the epic work item (children are attached as epic.children property)
            // Do NOT add children as separate work items to avoid duplication
            return [...prevWorkItems, transformedEpicWorkItem];
          } else {
            console.log(`⚠️ Epic ${epic.jiraId} already exists in work items`);
            return prevWorkItems;
          }
        });

        // Remove epic from epics list
        const updatedEpics = epics.filter(e => e.id !== epic.id);
        onUpdateEpics(updatedEpics);
        
        // Remove from expanded set if it was expanded
        const newExpanded = new Set(expandedEpics);
        newExpanded.delete(epic.id);
        setExpandedEpics(newExpanded);
        
        console.log(`✅ Epic "${epic.title}" saved to database and moved to Work Items`);
        
      } catch (error) {
        console.error('❌ Failed to save epic work item to database:', error);
        alert(`Failed to save epic "${epic.title}" to database. Please try again.`);
      }
    } else {
      console.log('❌ USER CANCELLED - epic conversion aborted');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'In Progress':
        return <Clock className="h-4 w-4 text-blue-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completed':
        return 'text-green-600 bg-green-50';
      case 'In Progress':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  if (epics.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md border">
        <div className="flex items-center gap-3 mb-4">
          <Briefcase className="h-6 w-6 text-blue-600" />
          <h2 className="text-xl font-semibold">Epics</h2>
        </div>
        <div className="text-center py-12">
          <Briefcase className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No epics yet</h3>
          <p className="text-gray-500 mb-4">
            Import epics from Jira to see them here with their child tickets.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md border">
      <div className="flex items-center gap-3 mb-6">
        <Briefcase className="h-6 w-6 text-blue-600" />
        <h2 className="text-xl font-semibold">Epics ({epics.length})</h2>
      </div>

      <div className="space-y-4">
        {epics.map((epic) => {
          const isExpanded = expandedEpics.has(epic.id);
          const progressPercentage = epic.totalStoryPoints > 0 
            ? (epic.completedStoryPoints / epic.totalStoryPoints) * 100 
            : 0;

          return (
            <div key={epic.id} className="border rounded-lg bg-gray-50">
              {/* Epic Header */}
              <div 
                className="p-4 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => toggleEpicExpansion(epic.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-gray-600" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-600" />
                      )}
                      {getStatusIcon(epic.jiraStatus || epic.status)}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <a 
                          href={`https://cvs-hcd.atlassian.net/browse/${epic.jiraId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {epic.jiraId}
                        </a>
                        <ExternalLink className="h-3 w-3 text-gray-400" />
                        <span className="font-medium text-gray-900">{epic.title}</span>
                      </div>
                      
                      {epic.description && (
                        <p className="text-sm text-gray-600 mb-2">{epic.description}</p>
                      )}
                      
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>{epic.children.length} tickets</span>
                        <span>{epic.totalStoryPoints} story points</span>
                        <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(epic.jiraStatus || epic.status)}`}>
                          {epic.jiraStatus || epic.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 ml-4">
                    {/* Progress Bar */}
                    <div className="w-24">
                      <div className="bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${progressPercentage}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-500 mt-1 text-center">
                        {Math.round(progressPercentage)}%
                      </div>
                    </div>
                    
                    {/* Add to Work Items Button */}
                    {onUpdateWorkItems && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addEpicToWorkItems(epic);
                        }}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-md transition-colors"
                        title={`Add epic ${epic.jiraId} and ${epic.children.length} children to Work Items`}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                    
                    {/* Delete Button */}
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await deleteEpic(epic.id, epic.title);
                      }}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title={`Delete epic ${epic.jiraId}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Children Tickets */}
              {isExpanded && (
                <div className="border-t bg-white">
                  <div className="p-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">
                      Child Tickets ({epic.children.length})
                    </h4>
                    
                    {epic.children.length === 0 ? (
                      <div className="text-center py-6 text-gray-500">
                        <p>No child tickets found for this epic.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {epic.children.map((child) => (
                          <div key={child.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded border">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(child.jiraStatus || child.status)}
                              {child.jiraId ? (
                                <a 
                                  href={`https://cvs-hcd.atlassian.net/browse/${child.jiraId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800 hover:underline text-sm font-medium"
                                >
                                  {child.jiraId}
                                </a>
                              ) : (
                                <span className="text-sm font-medium text-gray-700">{child.id}</span>
                              )}
                            </div>
                            
                            <div className="flex-1">
                              <span className="text-sm text-gray-900">{child.title}</span>
                            </div>
                            
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                              <span>{child.estimateStoryPoints} pts</span>
                              <span className={`px-2 py-1 rounded-full ${getStatusColor(child.jiraStatus || child.status)}`}>
                                {child.jiraStatus || child.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}; 