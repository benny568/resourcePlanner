import React, { useState } from 'react';
import { Epic, WorkItem } from '../types';
import { ChevronDown, ChevronRight, Briefcase, CheckCircle, Clock, AlertCircle, ExternalLink, Trash2, Plus } from 'lucide-react';

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

  const deleteEpic = (epicId: string, epicTitle: string) => {
    const confirmed = window.confirm(`Are you sure you want to delete epic "${epicTitle}"?\n\nThis will permanently remove the epic and all its child tickets from the local list.`);
    
    if (confirmed) {
      const updatedEpics = epics.filter(epic => epic.id !== epicId);
      onUpdateEpics(updatedEpics);
      
      // Also remove from expanded set if it was expanded
      const newExpanded = new Set(expandedEpics);
      newExpanded.delete(epicId);
      setExpandedEpics(newExpanded);
      
      console.log(`🗑️ Deleted epic: ${epicId} - ${epicTitle}`);
    }
  };

  const addEpicToWorkItems = (epic: Epic) => {
    if (!onUpdateWorkItems) {
      console.warn('⚠️ onUpdateWorkItems callback not provided');
      return;
    }

    const confirmed = window.confirm(
      `Add epic "${epic.title}" to Work Items?\n\n` +
      `This will:\n` +
      `• Add the epic as an expandable work item\n` +
      `• Keep all ${epic.children.length} child tickets nested within it\n` +
      `• Remove the epic from the Epics list\n\n` +
      `You can expand/collapse and manage it in the Work Items tab.`
    );
    
    if (confirmed) {
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

      // Update work items - add epic with children
      onUpdateWorkItems((prevWorkItems) => {
        // Check for duplicates by jiraId or id
        const existingJiraIds = new Set(prevWorkItems.map(item => item.jiraId).filter(Boolean));
        const existingIds = new Set(prevWorkItems.map(item => item.id));
        
        // Only add if not duplicate
        if (!existingJiraIds.has(epicAsWorkItem.jiraId) && !existingIds.has(epicAsWorkItem.id)) {
          console.log(`📝 Added epic work item with ${epic.children.length} children`);
          return [...prevWorkItems, epicAsWorkItem];
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
      
      console.log(`✅ Moved epic "${epic.title}" with ${epic.children.length} children to Work Items`);
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
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteEpic(epic.id, epic.title);
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